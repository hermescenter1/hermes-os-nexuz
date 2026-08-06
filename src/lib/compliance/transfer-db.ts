/**
 * Phase 97 Part I — subprocessor & transfer persistence (tenant scoped).
 *
 * Every read/write predicate carries BOTH id AND the authoritative organizationId —
 * never a bare id — so a foreign-tenant record is never matched, disclosed or
 * written. Approval/activation runs in one interactive transaction under a REAL
 * SELECT ... FOR UPDATE row lock (hardened export/erasure precedent): the record is
 * re-read and every gate (positive reviews + the read-only Phase 95 provider-policy
 * gate + the same-org linked-subprocessor gate) is evaluated on the LOCKED row.
 * Nothing here contacts any provider.
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type { DbSubprocessor, DbDataTransfer } from "./types";
import {
  canApproveSubprocessor, canApproveTransfer, isEditableLifecycle,
  type ApprovalBlocker, type ProviderPolicyGate,
} from "./transfer-governance";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>) => Promise<T> };

const TABLES = { subprocessor: "Subprocessor", dataTransfer: "DataTransfer" } as const;
type Register = keyof typeof TABLES;

async function xm() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    subprocessor: d.subprocessor as AnyModel,
    dataTransfer: d.dataTransfer as AnyModel,
    processingActivity: d.processingActivity as AnyModel,
  };
}

/** REAL PostgreSQL row lock on the governed record for the rest of the surrounding
 *  interactive transaction. Identifiers are BOUND ($1/$2) — never interpolated. */
async function lockGovernanceRow(tx: TxRaw, register: Register, id: string, organizationId: string): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "${TABLES[register]}" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
    id,
    organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

// ── Reads (always org-predicated) ─────────────────────────────────────────────

export async function listSubprocessorsForOrg(organizationId: string, take = 200): Promise<DbSubprocessor[]> {
  const db = await xm();
  if (!db) return [];
  try {
    return (await db.subprocessor.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take } as unknown)) as DbSubprocessor[];
  } catch { return []; }
}
export async function getSubprocessorForOrg(id: string, organizationId: string): Promise<DbSubprocessor | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.subprocessor.findFirst({ where: { id, organizationId } } as unknown)) as DbSubprocessor | null;
  } catch { return null; }
}
export async function listDataTransfersForOrg(organizationId: string, take = 200): Promise<DbDataTransfer[]> {
  const db = await xm();
  if (!db) return [];
  try {
    return (await db.dataTransfer.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take } as unknown)) as DbDataTransfer[];
  } catch { return []; }
}
export async function getDataTransferForOrg(id: string, organizationId: string): Promise<DbDataTransfer | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.dataTransfer.findFirst({ where: { id, organizationId } } as unknown)) as DbDataTransfer | null;
  } catch { return null; }
}

/** Same-org relation validation: the referenced record must exist WITHIN the
 *  caller's organization (a valid foreign-tenant id yields null → uniform 404). */
export async function getProcessingActivityIdForOrg(id: string, organizationId: string): Promise<string | null> {
  const db = await xm();
  if (!db) return null;
  try {
    const row = (await db.processingActivity.findFirst({ where: { id, organizationId }, select: { id: true } } as unknown)) as { id: string } | null;
    return row?.id ?? null;
  } catch { return null; }
}

// ── Creates (server-derived scope + fail-closed defaults) ─────────────────────

export async function createSubprocessorForOrg(params: {
  organizationId: string; actorId: string; data: Record<string, unknown>;
}): Promise<DbSubprocessor | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.subprocessor.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId, // authoritative — never client input
        lifecycle: "DRAFT",
        // Explicit fail-closed quarantine defaults (mirror the DB defaults).
        serviceCategory: "REVIEW_REQUIRED",
        contractReviewStatus: "REVIEW_REQUIRED",
        privacyReviewStatus: "REVIEW_REQUIRED",
        securityReviewStatus: "REVIEW_REQUIRED",
        ...params.data,
        createdBy: params.actorId,
        updatedBy: params.actorId,
        updatedAt: new Date(),
      },
    } as unknown)) as DbSubprocessor;
  } catch { return null; }
}

export async function createDataTransferForOrg(params: {
  organizationId: string; actorId: string; data: Record<string, unknown>;
}): Promise<DbDataTransfer | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.dataTransfer.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        lifecycle: "DRAFT",
        // Explicit fail-closed quarantine defaults (mirror the DB defaults) — no
        // adequacy or coverage is ever inferred at creation time.
        sourceJurisdiction: "CONFIGURATION_REQUIRED",
        destinationJurisdiction: "CONFIGURATION_REQUIRED",
        transferCategory: "REVIEW_REQUIRED",
        transferMechanismStatus: "LEGAL_REVIEW_REQUIRED",
        legalReviewStatus: "REVIEW_REQUIRED",
        riskReviewStatus: "REVIEW_REQUIRED",
        ...params.data,
        createdBy: params.actorId,
        updatedBy: params.actorId,
        updatedAt: new Date(),
      },
    } as unknown)) as DbDataTransfer;
  } catch { return null; }
}

// ── Material/review updates (editable lifecycles only, locked) ────────────────

class GovError extends Error { constructor(public reason: GovReason, public blockers: ApprovalBlocker[] = []) { super(reason); this.name = "GovError"; } }
type GovReason = "NOT_FOUND" | "IMMUTABLE_LIFECYCLE" | "INVALID_RELATION" | "NOT_APPROVABLE" | "INVALID_TRANSITION" | "CONFLICT";

/**
 * Update material fields / review statuses. Locks the row, requires an EDITABLE
 * lifecycle (DRAFT/UNDER_REVIEW) — APPROVED/ACTIVE evidence is immutable except via
 * the explicit supersession transition. Review attribution is stamped server-side
 * whenever a review status changes.
 */
export async function updateGovernanceRecordForOrg(params: {
  register: Register; id: string; organizationId: string; actorId: string;
  data: Record<string, unknown>; reviewTouched: boolean; now: Date;
}): Promise<{ ok: true; row: DbSubprocessor | DbDataTransfer } | { ok: false; reason: GovReason }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx[params.register] as AnyModel;
      if (!(await lockGovernanceRow(tx, params.register, params.id, params.organizationId))) throw new GovError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as { lifecycle: string } | null;
      if (!row) throw new GovError("NOT_FOUND");
      if (!isEditableLifecycle(row.lifecycle)) throw new GovError("IMMUTABLE_LIFECYCLE");
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: row.lifecycle },
        data: {
          ...params.data,
          ...(params.reviewTouched ? { reviewedBy: params.actorId, reviewedAt: params.now } : {}),
          updatedBy: params.actorId,
          updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new GovError("CONFLICT");
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbSubprocessor | DbDataTransfer;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof GovError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Transitions (locked; approval gates evaluated on the locked row) ──────────

/**
 * Non-approval lifecycle transition with an expected-from predicate. Entering
 * UNDER_REVIEW from APPROVED/SUSPENDED (supersession / re-review) CLEARS the
 * approval attribution so stale approval evidence never survives a re-review.
 */
export async function transitionGovernanceRecordForOrg(params: {
  register: Register; id: string; organizationId: string; actorId: string; from: string; to: string; now: Date;
}): Promise<{ affected: number }> {
  const client = await getPrisma();
  if (!client) return { affected: 0 };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx[params.register] as AnyModel;
      if (!(await lockGovernanceRow(tx, params.register, params.id, params.organizationId))) return { affected: 0 };
      const data: Record<string, unknown> = { lifecycle: params.to, updatedBy: params.actorId, updatedAt: params.now };
      if (params.to === "UNDER_REVIEW" || params.to === "DRAFT") { data.approvedBy = null; data.approvedAt = null; }
      const r = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data,
      })) as { count?: number };
      return { affected: typeof r?.count === "number" ? r.count : 0 };
    });
  } catch { return { affected: 0 }; }
}

/**
 * Approve (UNDER_REVIEW→APPROVED) or activate (APPROVED→ACTIVE) a SUBPROCESSOR.
 * Gates run on the LOCKED row: all three reviews positively complete AND — when the
 * record links a Phase 95 provider — the injected read-only provider-policy gate.
 * A Phase 95 denial always wins and CONFIGURATION_REQUIRED (missing policy) blocks.
 */
export async function approveSubprocessorForOrg(params: {
  id: string; organizationId: string; actorId: string; from: "UNDER_REVIEW" | "APPROVED"; to: "APPROVED" | "ACTIVE";
  providerGate: (row: DbSubprocessor) => ProviderPolicyGate; now: Date;
}): Promise<{ ok: true; row: DbSubprocessor } | { ok: false; reason: GovReason; blockers?: ApprovalBlocker[] }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.subprocessor as AnyModel;
      if (!(await lockGovernanceRow(tx, "subprocessor", params.id, params.organizationId))) throw new GovError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbSubprocessor | null;
      if (!row) throw new GovError("NOT_FOUND");
      if (row.lifecycle !== params.from) throw new GovError("INVALID_TRANSITION");
      const gate = canApproveSubprocessor(row, params.providerGate(row));
      if (!gate.ok) throw new GovError("NOT_APPROVABLE", gate.blockers);
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data: {
          lifecycle: params.to,
          // Attribution is server-derived; activation preserves the original approval.
          ...(params.to === "APPROVED" ? { approvedBy: params.actorId, approvedAt: params.now } : {}),
          updatedBy: params.actorId, updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new GovError("CONFLICT");
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbSubprocessor;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof GovError) return { ok: false, reason: err.reason, blockers: err.blockers };
    return { ok: false, reason: "CONFLICT" };
  }
}

/**
 * Approve (UNDER_REVIEW→APPROVED) or activate (APPROVED→ACTIVE) a DATA TRANSFER.
 * Gates on the LOCKED row: mechanism CONFIGURED + legal/risk reviews APPROVED, and a
 * linked subprocessor must be an APPROVED/ACTIVE record of the SAME organization
 * (re-read inside the transaction with the org predicate).
 */
export async function approveDataTransferForOrg(params: {
  id: string; organizationId: string; actorId: string; from: "UNDER_REVIEW" | "APPROVED"; to: "APPROVED" | "ACTIVE"; now: Date;
}): Promise<{ ok: true; row: DbDataTransfer } | { ok: false; reason: GovReason; blockers?: ApprovalBlocker[] }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const model = tx.dataTransfer as AnyModel;
      if (!(await lockGovernanceRow(tx, "dataTransfer", params.id, params.organizationId))) throw new GovError("NOT_FOUND");
      const row = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataTransfer | null;
      if (!row) throw new GovError("NOT_FOUND");
      if (row.lifecycle !== params.from) throw new GovError("INVALID_TRANSITION");
      let linkedLifecycle: string | null = null;
      if (row.subprocessorId) {
        const sp = (await (tx.subprocessor as AnyModel).findFirst({
          where: { id: row.subprocessorId, organizationId: params.organizationId }, select: { lifecycle: true },
        })) as { lifecycle: string } | null;
        // A foreign-tenant or missing subprocessor can never support an approval.
        linkedLifecycle = sp?.lifecycle ?? "NOT_FOUND";
      }
      const gate = canApproveTransfer(row, linkedLifecycle);
      if (!gate.ok) throw new GovError("NOT_APPROVABLE", gate.blockers);
      const upd = (await model.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
        data: {
          lifecycle: params.to,
          ...(params.to === "APPROVED" ? { approvedBy: params.actorId, approvedAt: params.now } : {}),
          updatedBy: params.actorId, updatedAt: params.now,
        },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new GovError("CONFLICT");
      const fresh = (await model.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataTransfer;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (err instanceof GovError) return { ok: false, reason: err.reason, blockers: err.blockers };
    return { ok: false, reason: "CONFLICT" };
  }
}
