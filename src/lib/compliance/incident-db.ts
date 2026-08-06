/**
 * Phase 97 — compliance-incident persistence + governed LegalHold mutation
 * linearization (tenant scoped, evidence-integrity hardened).
 *
 * Every read/write predicate carries BOTH id AND the authoritative organizationId, so
 * a foreign-tenant record is never matched, disclosed or written. Every state change
 * runs in ONE interactive transaction under a REAL SELECT ... FOR UPDATE lock on the
 * incident, re-reads the authoritative row, validates the transition + required
 * evidence, appends EXACTLY ONE append-only timeline event AND updates the incident,
 * and commits both atomically. AuditLog is written by the route only after commit.
 *
 * Global lock order (never reversed):
 *   ComplianceIncident → OrganizationMember → LegalHold → ComplianceIncidentAction.
 *
 * The authoritative evidence TIME for a state change is `clock_timestamp()` captured
 * AFTER every lock required by that operation is held (clockNow), used consistently for
 * the incident state, the action/hold and the timeline event — never a route-created
 * Date, so evidence time can never predate the lock wait.
 *
 * Nothing here contacts a customer, regulator, provider, email or webhook, and no
 * legal deadline / notification duty is ever computed. Parameterized SQL only.
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type { DbComplianceIncident, DbComplianceIncidentEvent, DbComplianceIncidentAction } from "./types";
import {
  canTransitionIncident, canTransitionAssessment, isAssessmentDecisionState,
  isEditableIncidentLifecycle, canResolveOrCloseIncident, lifecycleEventCode,
  isValidDecisionEvidence, nextDecisionVersion, HIGH_PRIORITY_ACTIONS,
  type IncidentAction, type AssessmentAction, type IncidentEventCode, type IncidentBlocker,
} from "./incident-governance";
import {
  classifyLegalHoldEdit, classifyLegalHoldTransition, validateLegalHoldScope,
  type LegalHoldScopeInput,
} from "./legal-hold";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>) => Promise<T> };

export type IncReason =
  | "NOT_FOUND" | "IMMUTABLE_LIFECYCLE" | "INVALID_TRANSITION" | "INVALID_ASSESSMENT"
  | "DECISION_EVIDENCE_REQUIRED" | "INVALID_MEMBERSHIP" | "ACTION_EVIDENCE_REQUIRED"
  | "NOT_CLOSABLE" | "INVALID_RELATION" | "CONFLICT";

class IncError extends Error {
  constructor(public reason: IncReason, public blockers: IncidentBlocker[] = []) { super(reason); this.name = "IncError"; }
}

function errCode(err: unknown): string { return String((err as { code?: string })?.code ?? ""); }
function errMsg(err: unknown): string { return String((err as { message?: string })?.message ?? ""); }
function isUniqueViolation(err: unknown): boolean { return errCode(err) === "P2002" || /unique constraint|duplicate key/i.test(errMsg(err)); }
function isFkViolation(err: unknown): boolean { return errCode(err) === "P2003" || /foreign key/i.test(errMsg(err)); }

const ACTOR_MEMBER = "ORGANIZATION_MEMBER";

async function xm() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    complianceIncident:       d.complianceIncident as AnyModel,
    complianceIncidentEvent:  d.complianceIncidentEvent as AnyModel,
    complianceIncidentAction: d.complianceIncidentAction as AnyModel,
  };
}

// ── Locks + authoritative post-lock time (parameterized; global lock order) ────

async function lockIncident(tx: TxRaw, id: string, organizationId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ComplianceIncident" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    id, organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

/** Authoritative evidence time captured AFTER the required locks are held.
 *  clock_timestamp() advances during the transaction (unlike now()/transaction_timestamp
 *  fixed at BEGIN), so persisted evidence time can never predate the lock wait
 *  (INCIDENT/ACTION/LEGAL_HOLD_EVIDENCE_TIME_BEFORE_LOCK=0). */
async function clockNow(tx: TxRaw): Promise<Date> {
  const rows = (await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS "now"`)) ?? [];
  const t = rows[0]?.now;
  return t instanceof Date ? t : new Date(t as unknown as string | number);
}

async function lockMembershipStatus(tx: TxRaw, organizationId: string, userId: string): Promise<string | null> {
  const rows = (await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 FOR SHARE`,
    organizationId, userId,
  )) ?? [];
  return rows[0]?.status ?? null;
}

async function lockActiveLegalHold(tx: TxRaw, organizationId: string, incidentId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "LegalHold" WHERE "organizationId" = $1 AND "scopeType" = 'INCIDENT' AND "incidentId" = $2 FOR SHARE`,
    organizationId, incidentId,
  )) ?? [];
  return Array.isArray(rows) && rows.some((r) => r.status === "ACTIVE");
}

async function openActionCount(tx: TxRaw, organizationId: string, incidentId: string): Promise<number> {
  const rows = (await tx.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT count(*)::int AS c FROM "ComplianceIncidentAction" WHERE "organizationId" = $1 AND "complianceIncidentId" = $2 AND "status" = 'OPEN'`,
    organizationId, incidentId,
  )) ?? [];
  return Number(rows[0]?.c ?? 0);
}

async function lockAction(tx: TxRaw, id: string, organizationId: string, complianceIncidentId: string): Promise<{ id: string; status: string; priority: string } | null> {
  // Predicated on the incident too: an action of a different incident is not lockable here.
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string; status: string; priority: string }>>(
    `SELECT "id", "status", "priority" FROM "ComplianceIncidentAction" WHERE "id" = $1 AND "organizationId" = $2 AND "complianceIncidentId" = $3 FOR UPDATE`,
    id, organizationId, complianceIncidentId,
  )) ?? [];
  return rows[0] ?? null;
}

/** Append ONE immutable timeline event with a per-incident monotonic sequence, under
 *  the surrounding incident lock. actorId is mandatory + server-derived (a same-org
 *  member); actorClass is the only currently-enforced class, ORGANIZATION_MEMBER. */
async function appendTimelineEvent(tx: TxRaw, params: {
  incidentId: string; organizationId: string; eventCode: IncidentEventCode; actorId: string; now: Date;
  fromLifecycle?: string | null; toLifecycle?: string | null; fromAssessment?: string | null; toAssessment?: string | null;
  evidenceHash?: string | null; decisionVersion?: number | null; decisionOutcome?: string | null;
  actionId?: string | null; correlationId?: string | null;
}): Promise<void> {
  const rows = (await tx.$queryRawUnsafe<Array<{ next: number }>>(
    `SELECT COALESCE(MAX("sequence"), 0) + 1 AS next FROM "ComplianceIncidentEvent" WHERE "complianceIncidentId" = $1`,
    params.incidentId,
  )) ?? [];
  const sequence = Number(rows[0]?.next ?? 1);
  await (tx.complianceIncidentEvent as AnyModel).create({
    data: {
      id: randomUUID(),
      organizationId: params.organizationId,
      complianceIncidentId: params.incidentId,
      sequence,
      eventCode: params.eventCode,
      actorId: params.actorId,
      actorClass: ACTOR_MEMBER,
      fromLifecycle: params.fromLifecycle ?? null,
      toLifecycle: params.toLifecycle ?? null,
      fromAssessment: params.fromAssessment ?? null,
      toAssessment: params.toAssessment ?? null,
      evidenceHash: params.evidenceHash ?? null,
      decisionVersion: params.decisionVersion ?? null,
      decisionOutcome: params.decisionOutcome ?? null,
      actionId: params.actionId ?? null,
      correlationId: params.correlationId ?? null,
      createdAt: params.now,
    },
  });
}

// ── Reads (always org-predicated) ─────────────────────────────────────────────

export async function listIncidentsForOrg(organizationId: string, take = 200): Promise<DbComplianceIncident[]> {
  const db = await xm(); if (!db) return [];
  try { return (await db.complianceIncident.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take } as unknown)) as DbComplianceIncident[]; }
  catch { return []; }
}
export async function getIncidentForOrg(id: string, organizationId: string): Promise<DbComplianceIncident | null> {
  const db = await xm(); if (!db) return null;
  try { return (await db.complianceIncident.findFirst({ where: { id, organizationId } } as unknown)) as DbComplianceIncident | null; }
  catch { return null; }
}
async function getIncidentByIdemKey(organizationId: string, idempotencyKey: string): Promise<DbComplianceIncident | null> {
  const db = await xm(); if (!db) return null;
  try { return (await db.complianceIncident.findFirst({ where: { organizationId, idempotencyKey } } as unknown)) as DbComplianceIncident | null; }
  catch { return null; }
}
export async function getIncidentTimelineForOrg(id: string, organizationId: string, take = 500): Promise<DbComplianceIncidentEvent[]> {
  const db = await xm(); if (!db) return [];
  try { return (await db.complianceIncidentEvent.findMany({ where: { complianceIncidentId: id, organizationId }, orderBy: { sequence: "asc" }, take } as unknown)) as DbComplianceIncidentEvent[]; }
  catch { return []; }
}
export async function listIncidentActionsForOrg(incidentId: string, organizationId: string, take = 500): Promise<DbComplianceIncidentAction[]> {
  const db = await xm(); if (!db) return [];
  try { return (await db.complianceIncidentAction.findMany({ where: { complianceIncidentId: incidentId, organizationId }, orderBy: { createdAt: "asc" }, take } as unknown)) as DbComplianceIncidentAction[]; }
  catch { return []; }
}

// ── Create (idempotent; server-derived scope + fail-closed defaults) ──────────

export async function createIncidentForOrg(params: {
  organizationId: string; actorId: string; idempotencyKey: string; data: Record<string, unknown>;
}): Promise<{ ok: true; row: DbComplianceIncident; created: boolean } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      const existing = (await model.findFirst({ where: { organizationId: params.organizationId, idempotencyKey: params.idempotencyKey } })) as DbComplianceIncident | null;
      if (existing) return { ok: true as const, row: existing, created: false };
      const now = await clockNow(tx);
      const id = randomUUID();
      await model.create({
        data: {
          id,
          organizationId: params.organizationId,
          incidentType: "REVIEW_REQUIRED", severity: "REVIEW_REQUIRED", lifecycle: "OPEN",
          assessmentStatus: "REVIEW_REQUIRED", sourceClass: "REVIEW_REQUIRED", openBlockerCount: 0, decisionVersion: 0,
          ...params.data,
          idempotencyKey: params.idempotencyKey,
          detectedAt: now,
          createdBy: params.actorId, updatedBy: params.actorId, updatedAt: now,
        },
      });
      await appendTimelineEvent(tx, {
        incidentId: id, organizationId: params.organizationId, eventCode: "CREATED", actorId: params.actorId,
        toLifecycle: "OPEN", correlationId: (params.data.correlationId as string | undefined) ?? null, now,
      });
      const fresh = (await model.findFirst({ where: { id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh, created: true };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const row = await getIncidentByIdemKey(params.organizationId, params.idempotencyKey);
      if (row) return { ok: true, row, created: false };
    }
    if (isFkViolation(err)) return { ok: false, reason: "INVALID_RELATION" };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Material update (editable lifecycles only, locked, atomic timeline) ───────

export async function updateIncidentForOrg(params: {
  id: string; organizationId: string; actorId: string; data: Record<string, unknown>;
}): Promise<{ ok: true; row: DbComplianceIncident } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      if (!(await lockIncident(tx, params.id, params.organizationId))) throw new IncError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!row) throw new IncError("NOT_FOUND");
      if (!isEditableIncidentLifecycle(row.lifecycle)) throw new IncError("IMMUTABLE_LIFECYCLE");
      const now = await clockNow(tx);
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: row.lifecycle },
        data: { ...params.data, updatedBy: params.actorId, updatedAt: now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "UPDATED",
        actorId: params.actorId, correlationId: row.correlationId, now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    if (isFkViolation(err)) return { ok: false, reason: "INVALID_RELATION" };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Membership-bound ownership assignment (Incident → OrganizationMember) ─────

export async function assignIncidentOwnerForOrg(params: {
  id: string; organizationId: string; actorId: string; ownerId: string;
}): Promise<{ ok: true; row: DbComplianceIncident } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      if (!(await lockIncident(tx, params.id, params.organizationId))) throw new IncError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!row) throw new IncError("NOT_FOUND");
      if (!isEditableIncidentLifecycle(row.lifecycle)) throw new IncError("IMMUTABLE_LIFECYCLE");
      const status = await lockMembershipStatus(tx, params.organizationId, params.ownerId);
      if (status !== "ACTIVE") throw new IncError("INVALID_MEMBERSHIP"); // foreign / inactive / invited / missing
      const now = await clockNow(tx);
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: row.lifecycle },
        data: { ownerId: params.ownerId, updatedBy: params.actorId, updatedAt: now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "OWNERSHIP_ASSIGNED",
        actorId: params.actorId, correlationId: row.correlationId, now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    if (isFkViolation(err)) return { ok: false, reason: "INVALID_MEMBERSHIP" };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Lifecycle transition (locked; evidence-aware closure gate; reopen invalidation) ─

export async function transitionIncidentForOrg(params: {
  id: string; organizationId: string; actorId: string; from: string; to: string; action: IncidentAction;
}): Promise<{ ok: true; row: DbComplianceIncident } | { ok: false; reason: IncReason; blockers?: IncidentBlocker[] }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      if (!(await lockIncident(tx, params.id, params.organizationId))) throw new IncError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!row) throw new IncError("NOT_FOUND");
      if (row.lifecycle !== params.from || !canTransitionIncident(params.from, params.to)) throw new IncError("INVALID_TRANSITION");

      // RESOLVED / CLOSED — fail-closed while ANY closure blocker stands. Lock order
      // Incident → OrganizationMember → LegalHold → ComplianceIncidentAction.
      if (params.action === "resolve" || params.action === "close") {
        const ownerMembershipActive = row.ownerId ? (await lockMembershipStatus(tx, params.organizationId, row.ownerId)) === "ACTIVE" : false;
        const activeLegalHold = await lockActiveLegalHold(tx, params.organizationId, params.id);
        const openActions = await openActionCount(tx, params.organizationId, params.id);
        const gate = canResolveOrCloseIncident({
          assessmentStatus: row.assessmentStatus, decisionEvidenceHash: row.decisionEvidenceHash, decisionVersion: row.decisionVersion,
          ownerId: row.ownerId, ownerMembershipActive, openActionCount: openActions, activeLegalHold,
        });
        if (!gate.ok) throw new IncError("NOT_CLOSABLE", gate.blockers);
      }
      // Authoritative evidence time captured AFTER every lock this operation acquires.
      const now = await clockNow(tx);
      const data: Record<string, unknown> = { lifecycle: params.to, updatedBy: params.actorId, updatedAt: now };
      let fromAssessment: string | null = null, toAssessment: string | null = null;
      let decisionOutcome: string | null = null, decisionVersionEv: number | null = null;
      if (params.to === "RESOLVED") { data.resolvedBy = params.actorId; data.resolvedAt = now; }
      if (params.to === "CLOSED") { data.closedBy = params.actorId; data.closedAt = now; }
      if (params.action === "reopen") {
        // Explicit reopen invalidates resolution, closure AND the current decision.
        data.reopenedBy = params.actorId; data.reopenedAt = now;
        data.resolvedBy = null; data.resolvedAt = null; data.closedBy = null; data.closedAt = null;
        data.assessmentStatus = "IN_ASSESSMENT";
        data.decisionBy = null; data.decisionAt = null; data.decisionEvidenceHash = null; // decisionVersion preserved as lineage
        fromAssessment = row.assessmentStatus; toAssessment = "IN_ASSESSMENT";
        decisionOutcome = "INVALIDATED"; decisionVersionEv = row.decisionVersion;
      }
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: lifecycleEventCode(params.action),
        fromLifecycle: params.from, toLifecycle: params.to, fromAssessment, toAssessment,
        decisionOutcome, decisionVersion: decisionVersionEv, actorId: params.actorId, correlationId: row.correlationId, now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason, blockers: err.blockers };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Assessment progression / decision recording (evidence-bound) ──────────────

export async function recordAssessmentForOrg(params: {
  id: string; organizationId: string; actorId: string; to: string; action: AssessmentAction; evidenceHash?: string | null;
}): Promise<{ ok: true; row: DbComplianceIncident } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      if (!(await lockIncident(tx, params.id, params.organizationId))) throw new IncError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!row) throw new IncError("NOT_FOUND");
      if (!isEditableIncidentLifecycle(row.lifecycle)) throw new IncError("IMMUTABLE_LIFECYCLE");
      if (!canTransitionAssessment(row.assessmentStatus, params.to)) throw new IncError("INVALID_ASSESSMENT");

      const enteringDecision = isAssessmentDecisionState(params.to);
      const leavingDecision = isAssessmentDecisionState(row.assessmentStatus) && !enteringDecision;
      const now = await clockNow(tx);
      const data: Record<string, unknown> = {
        assessmentStatus: params.to, reviewedBy: params.actorId, reviewedAt: now, updatedBy: params.actorId, updatedAt: now,
      };
      let eventCode: IncidentEventCode = "ASSESSMENT_TRANSITIONED";
      let evHash: string | null = null, decisionVersionEv: number | null = null, decisionOutcome: string | null = null;

      if (enteringDecision) {
        if (!isValidDecisionEvidence(params.evidenceHash ?? null, 1)) throw new IncError("DECISION_EVIDENCE_REQUIRED");
        const version = nextDecisionVersion(row.decisionVersion);
        data.decisionBy = params.actorId; data.decisionAt = now;
        data.decisionEvidenceHash = params.evidenceHash; data.decisionVersion = version; data.decisionAssessmentStatus = params.to;
        eventCode = "DECISION_RECORDED"; evHash = params.evidenceHash ?? null; decisionVersionEv = version; decisionOutcome = "RECORDED";
      } else {
        data.decisionEvidenceHash = null; data.decisionBy = null; data.decisionAt = null;
        if (leavingDecision) { decisionOutcome = "INVALIDATED"; decisionVersionEv = row.decisionVersion; }
      }
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, assessmentStatus: row.assessmentStatus },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode,
        fromAssessment: row.assessmentStatus, toAssessment: params.to,
        evidenceHash: evHash, decisionVersion: decisionVersionEv, decisionOutcome,
        actorId: params.actorId, correlationId: row.correlationId, now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Governed incident actions (authoritative blockers) ────────────────────────

async function reconcileBlockerCache(tx: TxRaw, organizationId: string, incidentId: string, actorId: string, now: Date): Promise<void> {
  const count = await openActionCount(tx, organizationId, incidentId);
  await (tx.complianceIncident as AnyModel).updateMany({
    where: { id: incidentId, organizationId },
    data: { openBlockerCount: count, updatedBy: actorId, updatedAt: now },
  });
}

export async function createIncidentActionForOrg(params: {
  id: string; organizationId: string; actorId: string; priority: string; actionCode: string;
}): Promise<{ ok: true; row: DbComplianceIncidentAction } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      if (!(await lockIncident(tx, params.id, params.organizationId))) throw new IncError("NOT_FOUND");
      const inc = (await (tx.complianceIncident as AnyModel).findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!inc) throw new IncError("NOT_FOUND");
      if (!isEditableIncidentLifecycle(inc.lifecycle)) throw new IncError("IMMUTABLE_LIFECYCLE");
      const now = await clockNow(tx);
      const actionId = randomUUID();
      await (tx.complianceIncidentAction as AnyModel).create({
        data: {
          id: actionId, organizationId: params.organizationId, complianceIncidentId: params.id,
          priority: params.priority, status: "OPEN", actionCode: params.actionCode,
          createdBy: params.actorId, createdAt: now, updatedBy: params.actorId, updatedAt: now,
        },
      });
      await reconcileBlockerCache(tx, params.organizationId, params.id, params.actorId, now);
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "ACTION_CREATED",
        actionId, actorId: params.actorId, correlationId: inc.correlationId, now,
      });
      const fresh = (await (tx.complianceIncidentAction as AnyModel).findFirst({ where: { id: actionId, organizationId: params.organizationId } })) as DbComplianceIncidentAction;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

async function terminateAction(params: {
  incidentId: string; organizationId: string; actorId: string; actionId: string; terminal: "RESOLVED" | "CANCELLED"; evidenceHash?: string | null;
}): Promise<{ ok: true; row: DbComplianceIncidentAction } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      // Lock order: Incident → ComplianceIncidentAction (action locked WITHIN this incident).
      if (!(await lockIncident(tx, params.incidentId, params.organizationId))) throw new IncError("NOT_FOUND");
      const inc = (await (tx.complianceIncident as AnyModel).findFirst({ where: { id: params.incidentId, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!inc) throw new IncError("NOT_FOUND");
      const action = await lockAction(tx, params.actionId, params.organizationId, params.incidentId);
      // Foreign / different-incident / missing / already-terminal actions → UNIFORM not-found.
      if (!action || action.status !== "OPEN") throw new IncError("NOT_FOUND");
      if (params.terminal === "RESOLVED" && HIGH_PRIORITY_ACTIONS.includes(action.priority as never) && !isValidDecisionEvidence(params.evidenceHash ?? null, 1)) {
        throw new IncError("ACTION_EVIDENCE_REQUIRED");
      }
      const now = await clockNow(tx);
      const upd = (await (tx.complianceIncidentAction as AnyModel).updateMany({
        where: { id: params.actionId, organizationId: params.organizationId, complianceIncidentId: params.incidentId, status: "OPEN" },
        data: {
          status: params.terminal, resolvedBy: params.actorId, resolvedAt: now,
          ...(params.terminal === "RESOLVED" ? { resolutionEvidenceHash: params.evidenceHash ?? null } : {}),
          updatedBy: params.actorId, updatedAt: now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("NOT_FOUND");
      await reconcileBlockerCache(tx, params.organizationId, params.incidentId, params.actorId, now);
      await appendTimelineEvent(tx, {
        incidentId: params.incidentId, organizationId: params.organizationId,
        eventCode: params.terminal === "RESOLVED" ? "ACTION_RESOLVED" : "ACTION_CANCELLED",
        actionId: params.actionId, evidenceHash: params.terminal === "RESOLVED" ? (params.evidenceHash ?? null) : null,
        actorId: params.actorId, correlationId: inc.correlationId, now,
      });
      const fresh = (await (tx.complianceIncidentAction as AnyModel).findFirst({ where: { id: params.actionId, organizationId: params.organizationId } })) as DbComplianceIncidentAction;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

export function resolveIncidentActionForOrg(params: { incidentId: string; organizationId: string; actorId: string; actionId: string; evidenceHash?: string | null; }) {
  return terminateAction({ ...params, terminal: "RESOLVED" });
}
export function cancelIncidentActionForOrg(params: { incidentId: string; organizationId: string; actorId: string; actionId: string; }) {
  return terminateAction({ ...params, terminal: "CANCELLED" });
}

// ── Incident-scoped LegalHold activation / release (Incident → LegalHold order) ─
//
// The caller pre-reads the hold ONLY to discover the candidate parent + the expected
// snapshot; the authoritative decision is made under lock. Inside one transaction the
// candidate incident is locked FIRST, then the hold, then the FULL hold is re-read and
// must EXACTLY match the expected {status, scopeType, incidentId, updatedAt} — otherwise
// the parent binding changed under us (HOLD_BINDING_CHANGED) and we roll back for a fresh
// retry WITHOUT locking a second incident. Only allow-listed fields are written, with a
// post-lock clock_timestamp. Same global lock order as closure ⇒ an incident CLOSED with
// an ACTIVE hold can never persist; activation is refused unless the incident is active.
export type HoldTransitionResult =
  | { ok: true; status: string; fieldsWritten: string[] }
  | { ok: false; reason: "NOT_FOUND" | "INCIDENT_NOT_ACTIVE" | "HOLD_BINDING_CHANGED" | "INVALID_HOLD_TRANSITION" | "CONFLICT" };
export async function applyIncidentScopedHoldTransition(params: {
  holdId: string; organizationId: string; actorId: string; toStatus: "ACTIVE" | "RELEASED";
  expected: { status: string; scopeType: string; incidentId: string; updatedAt: Date };
}): Promise<HoldTransitionResult> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  const expected = params.expected;
  try {
    return await c.$transaction(async (tx) => {
      // 1. Lock the CANDIDATE parent incident first (the parent from the pre-read).
      const incRows = (await tx.$queryRawUnsafe<Array<{ lifecycle: string }>>(
        `SELECT "lifecycle" FROM "ComplianceIncident" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        expected.incidentId, params.organizationId,
      )) ?? [];
      const lifecycle = incRows[0]?.lifecycle;
      if (!lifecycle) return { ok: false as const, reason: "NOT_FOUND" };
      if (params.toStatus === "ACTIVE" && !isEditableIncidentLifecycle(lifecycle)) {
        return { ok: false as const, reason: "INCIDENT_NOT_ACTIVE" };
      }
      // 2. Lock the hold second and RE-READ its full authoritative binding.
      const holdRows = (await tx.$queryRawUnsafe<Array<{ status: string; scopeType: string; incidentId: string | null; updatedAt: Date; startDate: Date | null }>>(
        `SELECT "status", "scopeType", "incidentId", "updatedAt", "startDate" FROM "LegalHold" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        params.holdId, params.organizationId,
      )) ?? [];
      const hold = holdRows[0];
      if (!hold) return { ok: false as const, reason: "NOT_FOUND" };
      // 3. The locked snapshot must EXACTLY match the pre-read expectation; ANY change
      //    (status / scopeType / parent incident / updatedAt) → the binding moved.
      const holdUpdatedMs = hold.updatedAt instanceof Date ? hold.updatedAt.getTime() : new Date(hold.updatedAt as unknown as string).getTime();
      const expectedMs = expected.updatedAt instanceof Date ? expected.updatedAt.getTime() : new Date(expected.updatedAt as unknown as string).getTime();
      if (hold.status !== expected.status || hold.scopeType !== expected.scopeType
        || hold.incidentId !== expected.incidentId || holdUpdatedMs !== expectedMs) {
        return { ok: false as const, reason: "HOLD_BINDING_CHANGED" };
      }
      // 4. Final binding must be INCIDENT-scoped to the incident we already locked.
      if (hold.scopeType !== "INCIDENT" || hold.incidentId !== expected.incidentId) {
        return { ok: false as const, reason: "HOLD_BINDING_CHANGED" };
      }
      // 5. Validate the EXACT lifecycle transition on the LOCKED status — do not trust
      //    the route's validation alone. Only PROPOSED→ACTIVE and ACTIVE→RELEASED.
      if ((params.toStatus === "ACTIVE" && hold.status !== "PROPOSED")
        || (params.toStatus === "RELEASED" && hold.status !== "ACTIVE")) {
        return { ok: false as const, reason: "INVALID_HOLD_TRANSITION" };
      }
      // 6. Explicit allow-listed update (never a generic spread) + post-lock time.
      const now = await clockNow(tx);
      const data: Record<string, unknown> = { status: params.toStatus, updatedBy: params.actorId, updatedAt: now };
      if (params.toStatus === "ACTIVE") {
        data.approvedBy = params.actorId; data.approvedAt = now;
        if (hold.startDate === null) data.startDate = now;
      } else {
        data.releaseApprovedBy = params.actorId; data.releasedAt = now;
      }
      const upd = (await (tx.legalHold as AnyModel).updateMany({
        where: { id: params.holdId, organizationId: params.organizationId, status: expected.status, incidentId: expected.incidentId },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) return { ok: false as const, reason: "CONFLICT" };
      // Return the COMMITTED status + ONLY the fields actually written, so the route
      // audits the authoritative result rather than a fallible post-commit re-read.
      return { ok: true as const, status: params.toStatus, fieldsWritten: Object.keys(data).sort() };
    });
  } catch { return { ok: false, reason: "CONFLICT" }; }
}

// ── Governed LegalHold mutation linearization (LegalHold lock; no route authority) ─
//
// Every material/review edit AND every non-incident lifecycle transition runs in ONE
// interactive transaction: the hold is locked with SELECT ... FOR UPDATE, the FULL
// authoritative row is re-read, the pre-read snapshot ({status, scopeType, incidentId,
// updatedAt}) is revalidated under lock (else HOLD_CHANGED_RETRY, so no stale-snapshot
// write / lost update), mutability and transitions are decided from the LOCKED status
// (never from the route pre-read), any changed scope is revalidated, the authoritative
// time comes from clock_timestamp() AFTER the lock, exactly the allow-listed fields are
// written under an exact status predicate, and the exact fieldsWritten are returned for
// an accurate after-commit audit. INCIDENT-scoped ACTIVE/RELEASE stays with the
// incident-ordered applyIncidentScopedHoldTransition; this generic path never touches an
// incident lock (lock order is LegalHold only).

export type HoldExpectedSnapshot = { status: string; scopeType: string; incidentId: string | null; updatedAt: Date };

type LockedHold = {
  status: string; scopeType: string; subjectId: string | null; resourceType: string | null;
  resourceId: string | null; processingActivityId: string | null; incidentId: string | null;
  rangeStart: Date | null; rangeEnd: Date | null; reasonClass: string | null; name: string | null;
  startDate: Date | null; reviewDate: Date | null; updatedAt: Date;
};

const HOLD_SCOPE_EDIT_FIELDS = ["scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId", "rangeStart", "rangeEnd"] as const;

/** Epoch ms for an updatedAt value; null/undefined/invalid → NaN (matches only itself). */
function instantMs(v: Date | string | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/** The LOCKED row must EXACTLY match the pre-read snapshot on the binding-identifying
 *  columns; any drift means the row moved under us (optimistic revalidation). */
function holdSnapshotMatches(hold: LockedHold, expected: HoldExpectedSnapshot): boolean {
  const a = instantMs(hold.updatedAt), b = instantMs(expected.updatedAt);
  const updatedMatch = (Number.isNaN(a) && Number.isNaN(b)) || a === b;
  return hold.status === expected.status
    && hold.scopeType === expected.scopeType
    && (hold.incidentId ?? null) === (expected.incidentId ?? null)
    && updatedMatch;
}

async function lockHoldRow(tx: TxRaw, holdId: string, organizationId: string): Promise<LockedHold | null> {
  const rows = (await tx.$queryRawUnsafe<LockedHold[]>(
    `SELECT "status", "scopeType", "subjectId", "resourceType", "resourceId", "processingActivityId",
            "incidentId", "rangeStart", "rangeEnd", "reasonClass", "name", "startDate", "reviewDate", "updatedAt"
       FROM "LegalHold" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    holdId, organizationId,
  )) ?? [];
  return rows[0] ?? null;
}

export type HoldEditResult =
  | { ok: true; status: string; fieldsWritten: string[] }
  | { ok: false; reason: "NOT_FOUND" | "HOLD_CHANGED_RETRY" | "HOLD_IMMUTABLE" | "ACTIVE_HOLD_IMMUTABLE" | "INVALID_SCOPE" | "CONFLICT"; scopeReason?: string };

/** Governed pure material / review edit (LegalHold lock only). */
export async function editLegalHoldForOrg(params: {
  holdId: string; organizationId: string; actorId: string;
  expected: HoldExpectedSnapshot;
  edit: Partial<Record<
    "name" | "reasonClass" | "scopeType" | "subjectId" | "resourceType" | "resourceId"
    | "processingActivityId" | "incidentId" | "rangeStart" | "rangeEnd" | "startDate" | "reviewDate", unknown>>;
}): Promise<HoldEditResult> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  const e = params.edit;
  const editKeys = Object.keys(e).filter((k) => e[k as keyof typeof e] !== undefined);
  try {
    return await c.$transaction(async (tx) => {
      const hold = await lockHoldRow(tx, params.holdId, params.organizationId);
      if (!hold) return { ok: false as const, reason: "NOT_FOUND" };
      if (!holdSnapshotMatches(hold, params.expected)) return { ok: false as const, reason: "HOLD_CHANGED_RETRY" };

      // Mutability from the LOCKED status — never from the route pre-read.
      const policy = classifyLegalHoldEdit(hold.status, editKeys);
      if (!policy.ok) return { ok: false as const, reason: policy.reason };

      const data: Record<string, unknown> = {};
      if (policy.scope === "MATERIAL") {
        const scopeTouched = HOLD_SCOPE_EDIT_FIELDS.some((k) => editKeys.includes(k));
        if (scopeTouched) {
          // Candidate scope = locked row overlaid with the edits; revalidated fail-closed.
          const candidate: LegalHoldScopeInput = {
            scopeType:            (e.scopeType as string | undefined) ?? hold.scopeType,
            subjectId:            e.subjectId !== undefined ? (e.subjectId as string | null) : hold.subjectId,
            resourceType:         e.resourceType !== undefined ? (e.resourceType as string | null) : hold.resourceType,
            resourceId:           e.resourceId !== undefined ? (e.resourceId as string | null) : hold.resourceId,
            processingActivityId: e.processingActivityId !== undefined ? (e.processingActivityId as string | null) : hold.processingActivityId,
            incidentId:           e.incidentId !== undefined ? (e.incidentId as string | null) : hold.incidentId,
            rangeStart:           e.rangeStart !== undefined ? (e.rangeStart as Date | null) : hold.rangeStart,
            rangeEnd:             e.rangeEnd !== undefined ? (e.rangeEnd as Date | null) : hold.rangeEnd,
          };
          const v = validateLegalHoldScope(candidate);
          if (!v.ok) return { ok: false as const, reason: "INVALID_SCOPE", scopeReason: v.reason };
          data.scopeType            = v.normalized.scopeType;
          data.subjectId            = v.normalized.subjectId;
          data.resourceType         = v.normalized.resourceType;
          data.resourceId           = v.normalized.resourceId;
          data.processingActivityId = v.normalized.processingActivityId;
          data.incidentId           = v.normalized.incidentId;
          data.rangeStart           = v.normalized.rangeStart;
          data.rangeEnd             = v.normalized.rangeEnd;
        }
        if (e.name !== undefined)        data.name = e.name;
        if (e.reasonClass !== undefined) data.reasonClass = e.reasonClass;
        if (e.startDate !== undefined)   data.startDate = e.startDate as Date | null;
        if (e.reviewDate !== undefined)  data.reviewDate = e.reviewDate as Date | null;
      } else {
        // REVIEW_ONLY — only reviewDate may change on an ACTIVE hold.
        if (e.reviewDate !== undefined)  data.reviewDate = e.reviewDate as Date | null;
      }
      if (Object.keys(data).length === 0) return { ok: false as const, reason: "CONFLICT" }; // no effective field (route guards)

      const now = await clockNow(tx);
      data.updatedBy = params.actorId; data.updatedAt = now;
      const upd = (await (tx.legalHold as AnyModel).updateMany({
        where: { id: params.holdId, organizationId: params.organizationId, status: hold.status },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) return { ok: false as const, reason: "CONFLICT" };
      // An edit never changes status; the committed status is the locked one.
      return { ok: true as const, status: hold.status, fieldsWritten: Object.keys(data).sort() };
    });
  } catch { return { ok: false, reason: "CONFLICT" }; }
}

export type HoldGenericTransitionResult =
  | { ok: true; status: string; fieldsWritten: string[] }
  | { ok: false; reason: "NOT_FOUND" | "HOLD_CHANGED_RETRY" | "INVALID_HOLD_TRANSITION" | "INVALID_LEGAL_HOLD_ACTIVATION" | "CONFLICT"; scopeReason?: string };

/** Governed non-incident lifecycle transition (LegalHold lock only): PROPOSED→ACTIVE,
 *  ACTIVE→RELEASED and PROPOSED→CANCELLED. INCIDENT-scoped ACTIVE/RELEASE is refused
 *  here (routed to applyIncidentScopedHoldTransition); CANCEL is allowed for any scope. */
export async function transitionLegalHoldForOrg(params: {
  holdId: string; organizationId: string; actorId: string;
  toStatus: "ACTIVE" | "RELEASED" | "CANCELLED";
  expected: HoldExpectedSnapshot;
}): Promise<HoldGenericTransitionResult> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const hold = await lockHoldRow(tx, params.holdId, params.organizationId);
      if (!hold) return { ok: false as const, reason: "NOT_FOUND" };
      if (!holdSnapshotMatches(hold, params.expected)) return { ok: false as const, reason: "HOLD_CHANGED_RETRY" };

      // Validate the EXACT edge on the LOCKED status.
      const cls = classifyLegalHoldTransition(hold.status, params.toStatus);
      if (!cls.ok) return { ok: false as const, reason: "INVALID_HOLD_TRANSITION" };
      // This generic path must never activate/release an INCIDENT-scoped hold — that is
      // exclusively the incident-ordered path (defence in depth behind the route routing).
      if ((cls.kind === "ACTIVATE" || cls.kind === "RELEASE") && hold.scopeType === "INCIDENT") {
        return { ok: false as const, reason: "INVALID_HOLD_TRANSITION" };
      }
      // ACTIVATE requires the COMPLETE locked scope to be semantically valid.
      if (cls.kind === "ACTIVATE") {
        const v = validateLegalHoldScope({
          scopeType: hold.scopeType, subjectId: hold.subjectId, resourceType: hold.resourceType,
          resourceId: hold.resourceId, processingActivityId: hold.processingActivityId,
          incidentId: hold.incidentId, rangeStart: hold.rangeStart, rangeEnd: hold.rangeEnd,
        });
        if (!v.ok) return { ok: false as const, reason: "INVALID_LEGAL_HOLD_ACTIVATION", scopeReason: v.reason };
      }

      const now = await clockNow(tx);
      const data: Record<string, unknown> = { updatedBy: params.actorId, updatedAt: now };
      if (cls.kind === "ACTIVATE") {
        data.status = "ACTIVE"; data.approvedBy = params.actorId; data.approvedAt = now;
        if (hold.startDate == null) data.startDate = now;
      } else if (cls.kind === "RELEASE") {
        data.status = "RELEASED"; data.releaseApprovedBy = params.actorId; data.releasedAt = now;
      } else {
        data.status = "CANCELLED"; data.cancelledBy = params.actorId; data.cancelledAt = now;
      }
      const upd = (await (tx.legalHold as AnyModel).updateMany({
        where: { id: params.holdId, organizationId: params.organizationId, status: hold.status },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) return { ok: false as const, reason: "CONFLICT" };
      return { ok: true as const, status: data.status as string, fieldsWritten: Object.keys(data).sort() };
    });
  } catch { return { ok: false, reason: "CONFLICT" }; }
}
