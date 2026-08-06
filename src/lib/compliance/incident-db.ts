/**
 * Phase 97 — compliance-incident persistence (tenant scoped, evidence-integrity hardened).
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

// ── Locks (parameterized; global lock order) ──────────────────────────────────

async function lockIncident(tx: TxRaw, id: string, organizationId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ComplianceIncident" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    id, organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

/** Lock the authoritative membership row (FOR SHARE) and return its status, or null if
 *  no same-org membership exists. Serialises against a concurrent deactivation that
 *  takes a conflicting lock. */
async function lockMembershipStatus(tx: TxRaw, organizationId: string, userId: string): Promise<string | null> {
  const rows = (await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 FOR SHARE`,
    organizationId, userId,
  )) ?? [];
  return rows[0]?.status ?? null;
}

/** Lock all same-org INCIDENT-scoped holds for the incident (FOR SHARE) and report
 *  whether any is currently ACTIVE. */
async function lockActiveLegalHold(tx: TxRaw, organizationId: string, incidentId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT "status" FROM "LegalHold" WHERE "organizationId" = $1 AND "scopeType" = 'INCIDENT' AND "incidentId" = $2 FOR SHARE`,
    organizationId, incidentId,
  )) ?? [];
  return Array.isArray(rows) && rows.some((r) => r.status === "ACTIVE");
}

/** Authoritative count of OPEN actions for the incident (read under the incident lock). */
async function openActionCount(tx: TxRaw, organizationId: string, incidentId: string): Promise<number> {
  const rows = (await tx.$queryRawUnsafe<Array<{ c: number }>>(
    `SELECT count(*)::int AS c FROM "ComplianceIncidentAction" WHERE "organizationId" = $1 AND "complianceIncidentId" = $2 AND "status" = 'OPEN'`,
    organizationId, incidentId,
  )) ?? [];
  return Number(rows[0]?.c ?? 0);
}

async function lockAction(tx: TxRaw, id: string, organizationId: string): Promise<{ id: string; status: string; priority: string } | null> {
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string; status: string; priority: string }>>(
    `SELECT "id", "status", "priority" FROM "ComplianceIncidentAction" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    id, organizationId,
  )) ?? [];
  return rows[0] ?? null;
}

/** Append ONE immutable timeline event with a per-incident monotonic sequence, under
 *  the surrounding incident lock. actorId + actorClass are mandatory + server-derived. */
async function appendTimelineEvent(tx: TxRaw, params: {
  incidentId: string; organizationId: string; eventCode: IncidentEventCode; actorId: string; now: Date;
  actorClass?: string;
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
      actorClass: params.actorClass ?? ACTOR_MEMBER,
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
  organizationId: string; actorId: string; idempotencyKey: string; data: Record<string, unknown>; now: Date;
}): Promise<{ ok: true; row: DbComplianceIncident; created: boolean } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.complianceIncident as AnyModel;
      const existing = (await model.findFirst({ where: { organizationId: params.organizationId, idempotencyKey: params.idempotencyKey } })) as DbComplianceIncident | null;
      if (existing) return { ok: true as const, row: existing, created: false };
      const id = randomUUID();
      await model.create({
        data: {
          id,
          organizationId: params.organizationId,
          incidentType: "REVIEW_REQUIRED", severity: "REVIEW_REQUIRED", lifecycle: "OPEN",
          assessmentStatus: "REVIEW_REQUIRED", sourceClass: "REVIEW_REQUIRED", openBlockerCount: 0, decisionVersion: 0,
          ...params.data,
          idempotencyKey: params.idempotencyKey,
          detectedAt: params.now,
          createdBy: params.actorId, updatedBy: params.actorId, updatedAt: params.now,
        },
      });
      await appendTimelineEvent(tx, {
        incidentId: id, organizationId: params.organizationId, eventCode: "CREATED", actorId: params.actorId,
        toLifecycle: "OPEN", correlationId: (params.data.correlationId as string | undefined) ?? null, now: params.now,
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
  id: string; organizationId: string; actorId: string; data: Record<string, unknown>; now: Date;
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
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: row.lifecycle },
        data: { ...params.data, updatedBy: params.actorId, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "UPDATED",
        actorId: params.actorId, correlationId: row.correlationId, now: params.now,
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
  id: string; organizationId: string; actorId: string; ownerId: string; now: Date;
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
      // Resolve the assignee through the authoritative same-org membership (locked).
      const status = await lockMembershipStatus(tx, params.organizationId, params.ownerId);
      if (status !== "ACTIVE") throw new IncError("INVALID_MEMBERSHIP"); // foreign / inactive / invited / missing
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: row.lifecycle },
        data: { ownerId: params.ownerId, updatedBy: params.actorId, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "OWNERSHIP_ASSIGNED",
        actorId: params.actorId, correlationId: row.correlationId, now: params.now,
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
  id: string; organizationId: string; actorId: string; from: string; to: string; action: IncidentAction; now: Date;
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

      const data: Record<string, unknown> = { lifecycle: params.to, updatedBy: params.actorId, updatedAt: params.now };
      let fromAssessment: string | null = null;
      let toAssessment: string | null = null;
      let decisionOutcome: string | null = null;
      let decisionVersionEv: number | null = null;

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
      if (params.to === "RESOLVED") { data.resolvedBy = params.actorId; data.resolvedAt = params.now; }
      if (params.to === "CLOSED") { data.closedBy = params.actorId; data.closedAt = params.now; }
      if (params.action === "reopen") {
        // Explicit reopen invalidates resolution, closure AND the current decision: the
        // incident must earn a completely new decision before RESOLVED/CLOSED again.
        data.reopenedBy = params.actorId; data.reopenedAt = params.now;
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
        decisionOutcome, decisionVersion: decisionVersionEv, actorId: params.actorId, correlationId: row.correlationId, now: params.now,
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
  id: string; organizationId: string; actorId: string; to: string; action: AssessmentAction; evidenceHash?: string | null; now: Date;
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
      const data: Record<string, unknown> = {
        assessmentStatus: params.to, reviewedBy: params.actorId, reviewedAt: params.now,
        updatedBy: params.actorId, updatedAt: params.now,
      };
      let eventCode: IncidentEventCode = "ASSESSMENT_TRANSITIONED";
      let evHash: string | null = null;
      let decisionVersionEv: number | null = null;
      let decisionOutcome: string | null = null;

      if (enteringDecision) {
        // Entering a high-authority decision state REQUIRES fresh evidence + a new
        // monotonic version; the timeline event and incident snapshot agree exactly.
        if (!isValidDecisionEvidence(params.evidenceHash ?? null, 1)) throw new IncError("DECISION_EVIDENCE_REQUIRED");
        const version = nextDecisionVersion(row.decisionVersion);
        data.decisionBy = params.actorId; data.decisionAt = params.now;
        data.decisionEvidenceHash = params.evidenceHash; data.decisionVersion = version;
        data.decisionAssessmentStatus = params.to;
        eventCode = "DECISION_RECORDED"; evHash = params.evidenceHash ?? null; decisionVersionEv = version; decisionOutcome = "RECORDED";
      } else {
        // Non-decision state must not retain current decision evidence.
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
        actorId: params.actorId, correlationId: row.correlationId, now: params.now,
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
  id: string; organizationId: string; actorId: string; priority: string; actionCode: string; now: Date;
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
      const actionId = randomUUID();
      await (tx.complianceIncidentAction as AnyModel).create({
        data: {
          id: actionId, organizationId: params.organizationId, complianceIncidentId: params.id,
          priority: params.priority, status: "OPEN", actionCode: params.actionCode,
          createdBy: params.actorId, updatedBy: params.actorId, updatedAt: params.now,
        },
      });
      await reconcileBlockerCache(tx, params.organizationId, params.id, params.actorId, params.now);
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: "ACTION_CREATED",
        actionId, actorId: params.actorId, correlationId: inc.correlationId, now: params.now,
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
  incidentId: string; organizationId: string; actorId: string; actionId: string; terminal: "RESOLVED" | "CANCELLED"; evidenceHash?: string | null; now: Date;
}): Promise<{ ok: true; row: DbComplianceIncidentAction } | { ok: false; reason: IncReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      // Lock order: Incident → ComplianceIncidentAction.
      if (!(await lockIncident(tx, params.incidentId, params.organizationId))) throw new IncError("NOT_FOUND");
      const inc = (await (tx.complianceIncident as AnyModel).findFirst({ where: { id: params.incidentId, organizationId: params.organizationId } })) as DbComplianceIncident | null;
      if (!inc) throw new IncError("NOT_FOUND");
      const action = await lockAction(tx, params.actionId, params.organizationId);
      // Foreign / missing / already-terminal actions are rejected UNIFORMLY as not-found,
      // and an action of a different incident is not this incident's action.
      if (!action || action.status !== "OPEN") throw new IncError("NOT_FOUND");
      const actionRow = (await (tx.complianceIncidentAction as AnyModel).findFirst({ where: { id: params.actionId, organizationId: params.organizationId } })) as DbComplianceIncidentAction | null;
      if (!actionRow || actionRow.complianceIncidentId !== params.incidentId) throw new IncError("NOT_FOUND");
      if (params.terminal === "RESOLVED" && HIGH_PRIORITY_ACTIONS.includes(action.priority as never) && !isValidDecisionEvidence(params.evidenceHash ?? null, 1)) {
        throw new IncError("ACTION_EVIDENCE_REQUIRED");
      }
      const upd = (await (tx.complianceIncidentAction as AnyModel).updateMany({
        where: { id: params.actionId, organizationId: params.organizationId, status: "OPEN" },
        data: {
          status: params.terminal, resolvedBy: params.actorId, resolvedAt: params.now,
          ...(params.terminal === "RESOLVED" ? { resolutionEvidenceHash: params.evidenceHash ?? null } : {}),
          updatedBy: params.actorId, updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("NOT_FOUND");
      await reconcileBlockerCache(tx, params.organizationId, params.incidentId, params.actorId, params.now);
      await appendTimelineEvent(tx, {
        incidentId: params.incidentId, organizationId: params.organizationId,
        eventCode: params.terminal === "RESOLVED" ? "ACTION_RESOLVED" : "ACTION_CANCELLED",
        actionId: params.actionId, evidenceHash: params.terminal === "RESOLVED" ? (params.evidenceHash ?? null) : null,
        actorId: params.actorId, correlationId: inc.correlationId, now: params.now,
      });
      const fresh = (await (tx.complianceIncidentAction as AnyModel).findFirst({ where: { id: params.actionId, organizationId: params.organizationId } })) as DbComplianceIncidentAction;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

export function resolveIncidentActionForOrg(params: { incidentId: string; organizationId: string; actorId: string; actionId: string; evidenceHash?: string | null; now: Date; }) {
  return terminateAction({ ...params, terminal: "RESOLVED" });
}
export function cancelIncidentActionForOrg(params: { incidentId: string; organizationId: string; actorId: string; actionId: string; now: Date; }) {
  return terminateAction({ ...params, terminal: "CANCELLED" });
}

// ── Incident-scoped LegalHold activation / release (Incident → LegalHold order) ─
//
// Called by the legal-hold route ONLY for an INCIDENT-scoped hold changing to ACTIVE
// or RELEASED. Locking the parent incident FIRST (then the hold) gives the single
// global lock order shared with incident closure, so activation and closure linearise
// and the impossible state (incident CLOSED with an ACTIVE hold) can never persist:
// activation is refused when the incident is no longer in an active working state.
export type HoldTransitionResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "INCIDENT_NOT_ACTIVE" | "CONFLICT" };
export async function applyIncidentScopedHoldTransition(params: {
  holdId: string; organizationId: string; incidentId: string; fromStatus: string; toStatus: "ACTIVE" | "RELEASED"; data: Record<string, unknown>; now: Date;
}): Promise<HoldTransitionResult> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      // 1. Lock the parent incident FIRST.
      const incRows = (await tx.$queryRawUnsafe<Array<{ lifecycle: string }>>(
        `SELECT "lifecycle" FROM "ComplianceIncident" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        params.incidentId, params.organizationId,
      )) ?? [];
      const lifecycle = incRows[0]?.lifecycle;
      if (!lifecycle) return { ok: false as const, reason: "NOT_FOUND" };
      // 2. Activation requires an incident still in an active working state — never a
      //    RESOLVED / CLOSED / CANCELLED incident (fail-closed; reopen first).
      if (params.toStatus === "ACTIVE" && !isEditableIncidentLifecycle(lifecycle)) {
        return { ok: false as const, reason: "INCIDENT_NOT_ACTIVE" };
      }
      // 3. Lock the hold SECOND and re-read its authoritative status (concurrency guard).
      const holdRows = (await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "LegalHold" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        params.holdId, params.organizationId,
      )) ?? [];
      const hold = holdRows[0];
      if (!hold) return { ok: false as const, reason: "NOT_FOUND" };
      if (hold.status !== params.fromStatus) return { ok: false as const, reason: "CONFLICT" };
      // The post-update incidentId (params.data may set it) is bound to the locked
      // incident; the LegalHold(incidentId, organizationId) FK enforces its validity.
      const upd = (await (tx.legalHold as AnyModel).updateMany({
        where: { id: params.holdId, organizationId: params.organizationId, status: params.fromStatus },
        data: { ...params.data, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) return { ok: false as const, reason: "CONFLICT" };
      return { ok: true as const };
    });
  } catch { return { ok: false, reason: "CONFLICT" }; }
}
