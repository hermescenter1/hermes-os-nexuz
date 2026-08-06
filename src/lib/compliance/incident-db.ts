/**
 * Phase 97 — compliance-incident persistence (tenant scoped).
 *
 * Every read/write predicate carries BOTH id AND the authoritative organizationId, so
 * a foreign-tenant record is never matched, disclosed or written. Every state change
 * runs in ONE interactive transaction under a REAL SELECT ... FOR UPDATE lock on the
 * incident: the row is re-read, the transition + required evidence are validated, the
 * append-only timeline event is written AND the incident is updated, and the two
 * writes COMMIT ATOMICALLY (INCIDENT_TIMELINE_WITHOUT_STATE_COMMIT=0 /
 * INCIDENT_STATE_WITHOUT_TIMELINE_COMMIT=0). AuditLog is written by the route only
 * after commit. Nothing here contacts a customer, regulator, provider, email or
 * webhook, and no legal deadline / notification duty is ever computed.
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type { DbComplianceIncident, DbComplianceIncidentEvent } from "./types";
import {
  canTransitionIncident, canTransitionAssessment, isAssessmentDecisionState,
  isEditableIncidentLifecycle, canResolveOrCloseIncident, lifecycleEventCode,
  type IncidentAction, type AssessmentAction, type IncidentEventCode, type IncidentBlocker,
} from "./incident-governance";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>) => Promise<T> };

export type IncReason =
  | "NOT_FOUND" | "IMMUTABLE_LIFECYCLE" | "INVALID_TRANSITION" | "INVALID_ASSESSMENT"
  | "NOT_CLOSABLE" | "INVALID_RELATION" | "CONFLICT";

class IncError extends Error {
  constructor(public reason: IncReason, public blockers: IncidentBlocker[] = []) { super(reason); this.name = "IncError"; }
}

function errCode(err: unknown): string { return String((err as { code?: string })?.code ?? ""); }
function errMsg(err: unknown): string { return String((err as { message?: string })?.message ?? ""); }
function isUniqueViolation(err: unknown): boolean { return errCode(err) === "P2002" || /unique constraint|duplicate key/i.test(errMsg(err)); }
function isFkViolation(err: unknown): boolean { return errCode(err) === "P2003" || /foreign key/i.test(errMsg(err)); }

async function xm() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    complianceIncident:      d.complianceIncident as AnyModel,
    complianceIncidentEvent: d.complianceIncidentEvent as AnyModel,
  };
}

/** REAL PostgreSQL row lock on the incident for the rest of the transaction. */
async function lockIncident(tx: TxRaw, id: string, organizationId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ComplianceIncident" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    id, organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

/** Is there a committed ACTIVE LegalHold, scoped to THIS incident in THIS org, that
 *  requires continued preservation? Read-only; the incident FOR UPDATE lock serialises
 *  closure attempts. */
async function activeLegalHoldForIncident(tx: TxRaw, organizationId: string, incidentId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ one: number }>>(
    `SELECT 1 AS one FROM "LegalHold" WHERE "organizationId" = $1 AND "status" = 'ACTIVE' AND "scopeType" = 'INCIDENT' AND "incidentId" = $2 LIMIT 1`,
    organizationId, incidentId,
  )) ?? [];
  return Array.isArray(rows) && rows.length > 0;
}

/** Append ONE immutable timeline event with a per-incident monotonic sequence. The
 *  surrounding incident FOR UPDATE lock serialises appends, so MAX(sequence)+1 is
 *  race-free; the unique (incident, sequence) index is the backstop. */
async function appendTimelineEvent(tx: TxRaw, params: {
  incidentId: string; organizationId: string; eventCode: IncidentEventCode; actorId: string; now: Date;
  fromLifecycle?: string | null; toLifecycle?: string | null; fromAssessment?: string | null; toAssessment?: string | null;
  evidenceHash?: string | null; correlationId?: string | null;
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
      fromLifecycle: params.fromLifecycle ?? null,
      toLifecycle: params.toLifecycle ?? null,
      fromAssessment: params.fromAssessment ?? null,
      toAssessment: params.toAssessment ?? null,
      actorId: params.actorId,
      evidenceHash: params.evidenceHash ?? null,
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
      // Idempotent: an existing (org, idempotencyKey) row is returned unchanged.
      const existing = (await model.findFirst({ where: { organizationId: params.organizationId, idempotencyKey: params.idempotencyKey } })) as DbComplianceIncident | null;
      if (existing) return { ok: true as const, row: existing, created: false };
      const id = randomUUID();
      await model.create({
        data: {
          id,
          organizationId: params.organizationId, // authoritative — never client input
          // fail-closed quarantine defaults (mirror the DB defaults)
          incidentType: "REVIEW_REQUIRED", severity: "REVIEW_REQUIRED", lifecycle: "OPEN",
          assessmentStatus: "REVIEW_REQUIRED", sourceClass: "REVIEW_REQUIRED", openBlockerCount: 0,
          ...params.data, // validated classifications / refs / summary / ownership only
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
      // Concurrent create with the same idempotency key — return the committed winner.
      const row = await getIncidentByIdemKey(params.organizationId, params.idempotencyKey);
      if (row) return { ok: true, row, created: false };
    }
    if (isFkViolation(err)) return { ok: false, reason: "INVALID_RELATION" }; // foreign-tenant / unknown reference
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
      const ownershipTouched = "ownerId" in params.data || "assignedToId" in params.data;
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId,
        eventCode: ownershipTouched ? "OWNERSHIP_ASSIGNED" : "UPDATED",
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

// ── Lifecycle transition (locked; closure gate on the locked row) ─────────────

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
      // RESOLVED and CLOSED are fail-closed while any closure blocker stands.
      if (params.action === "resolve" || params.action === "close") {
        const activeLegalHold = await activeLegalHoldForIncident(tx, params.organizationId, params.id);
        const gate = canResolveOrCloseIncident({
          assessmentStatus: row.assessmentStatus, ownerId: row.ownerId, assignedToId: row.assignedToId,
          openBlockerCount: row.openBlockerCount, activeLegalHold,
        });
        if (!gate.ok) throw new IncError("NOT_CLOSABLE", gate.blockers);
      }
      if (params.to === "RESOLVED") { data.resolvedBy = params.actorId; data.resolvedAt = params.now; }
      if (params.to === "CLOSED") { data.closedBy = params.actorId; data.closedAt = params.now; } // resolvedBy/At retained
      if (params.action === "reopen") {
        // Explicit reopen from RESOLVED/CLOSED clears resolution/closure evidence.
        data.reopenedBy = params.actorId; data.reopenedAt = params.now;
        data.resolvedBy = null; data.resolvedAt = null; data.closedBy = null; data.closedAt = null;
      }
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId, eventCode: lifecycleEventCode(params.action),
        fromLifecycle: params.from, toLifecycle: params.to, actorId: params.actorId, correlationId: row.correlationId, now: params.now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason, blockers: err.blockers };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Assessment progression / decision recording (locked, atomic) ──────────────

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
      // Assessment (incl. a recorded decision) is mutable ONLY in an active working
      // state — a RESOLVED/CLOSED/CANCELLED incident's assessment is frozen except via
      // the explicit reopen (CLOSED_INCIDENT_SILENT_MUTATION=0).
      if (!isEditableIncidentLifecycle(row.lifecycle)) throw new IncError("IMMUTABLE_LIFECYCLE");
      if (!canTransitionAssessment(row.assessmentStatus, params.to)) throw new IncError("INVALID_ASSESSMENT");
      const decision = isAssessmentDecisionState(params.to);
      const data: Record<string, unknown> = {
        assessmentStatus: params.to, reviewedBy: params.actorId, reviewedAt: params.now,
        updatedBy: params.actorId, updatedAt: params.now,
        ...(decision ? { decisionBy: params.actorId, decisionAt: params.now } : {}),
      };
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, assessmentStatus: row.assessmentStatus },
        data,
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId,
        eventCode: decision ? "DECISION_RECORDED" : "ASSESSMENT_TRANSITIONED",
        fromAssessment: row.assessmentStatus, toAssessment: params.to, actorId: params.actorId,
        evidenceHash: params.evidenceHash ?? null, correlationId: row.correlationId, now: params.now,
      });
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceIncident;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof IncError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Blocker adjustment (locked, atomic) ───────────────────────────────────────

export async function adjustBlockerForOrg(params: {
  id: string; organizationId: string; actorId: string; action: "RAISE" | "CLEAR"; now: Date;
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
      const next = params.action === "RAISE" ? row.openBlockerCount + 1 : Math.max(0, row.openBlockerCount - 1);
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, openBlockerCount: row.openBlockerCount, lifecycle: row.lifecycle },
        data: { openBlockerCount: next, updatedBy: params.actorId, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new IncError("CONFLICT");
      await appendTimelineEvent(tx, {
        incidentId: params.id, organizationId: params.organizationId,
        eventCode: params.action === "RAISE" ? "BLOCKER_RAISED" : "BLOCKER_CLEARED",
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
