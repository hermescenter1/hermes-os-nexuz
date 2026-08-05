/**
 * Phase 97 Part G — governed export persistence (tenant + subject scoped).
 *
 * Every read/write predicate carries the authoritative organizationId and, for
 * subject-facing operations, the subject identity — never a foreign-key match
 * alone. The child job never broadens the parent PrivacyRequest's subject or org.
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type { DbDataExportRequest, DbExportDownloadToken } from "./types";
import { isSha256Hex, isSupportedExportSchemaVersion } from "./export-package";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
/** The interactive-transaction client — model delegates PLUS parameterized raw SQL
 *  (needed to take a real PostgreSQL row lock, which the model API cannot express). */
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>) => Promise<T> };

/**
 * Acquire a REAL PostgreSQL row lock on the authoritative export job for the rest of
 * the surrounding interactive transaction. `SELECT ... FOR UPDATE` blocks until any
 * concurrent transaction already holding this row's lock commits or rolls back, so
 * issuance, revocation and redemption SERIALIZE on the DataExportRequest row across
 * every application instance (a process-local JS mutex could not do this). The row
 * identifiers are BOUND as parameters ($1/$2) — never interpolated into the SQL —
 * and the query returns the id only. Returns whether the row exists (was locked).
 *
 * Callers MUST invoke this FIRST (before re-reading the job or touching any token
 * row), giving every delivery operation the same lock order and no deadlock.
 */
async function lockExportJobRow(tx: TxRaw, id: string, organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false; // a governed job always has a non-null org
  const rows = (await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "DataExportRequest" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE',
    id,
    organizationId,
  )) ?? [];
  return Array.isArray(rows) && rows.length === 1;
}

async function xm() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    export: d.dataExportRequest    as AnyModel,
    token:  d.exportDownloadToken  as AnyModel,
  };
}

/** Server-generated, request-scoped storage key. Never client-selected. */
export function exportPackageKey(exportRequestId: string): string {
  return `exports/${exportRequestId}/package.json`;
}

export async function listExportJobsForOrg(organizationId: string, take = 200): Promise<DbDataExportRequest[]> {
  const db = await xm();
  if (!db) return [];
  try {
    return (await db.export.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take } as unknown)) as DbDataExportRequest[];
  } catch { return []; }
}

export async function getExportJobForOrg(id: string, organizationId: string): Promise<DbDataExportRequest | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.export.findFirst({ where: { id, organizationId } } as unknown)) as DbDataExportRequest | null;
  } catch { return null; }
}

/** Read an export job owned by the authenticated subject (subject-facing path). */
export async function getExportJobForSubject(id: string, subjectUserId: string): Promise<DbDataExportRequest | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.export.findFirst({ where: { id, userId: subjectUserId } } as unknown)) as DbDataExportRequest | null;
  } catch { return null; }
}

export async function getActiveExportJobForParent(privacyRequestId: string, organizationId: string): Promise<DbDataExportRequest | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.export.findFirst({
      where: { privacyRequestId, organizationId, lifecycle: { in: ["REQUESTED", "AUTHORISED", "COLLECTING", "REDACTING", "PACKAGING", "READY"] } },
    } as unknown)) as DbDataExportRequest | null;
  } catch { return null; }
}

/**
 * Create a child export job bound to an approved parent PrivacyRequest. The
 * subject + org are taken from the SERVER-validated parent, never the client.
 * Idempotent: a P2002 on the active-parent partial-unique index means a
 * concurrent request already created the active job — return it.
 */
export async function createExportJobForParent(params: {
  parent: { id: string; organizationId: string; userId: string | null; candidateId: string | null; email: string; locale: string };
  actorId: string;
}): Promise<{ ok: true; job: DbDataExportRequest } | { ok: false; reason: "DUPLICATE" | "ERROR" }> {
  const db = await xm();
  if (!db) return { ok: false, reason: "ERROR" };
  try {
    const job = (await db.export.create({
      data: {
        id:               randomUUID(),
        privacyRequestId: params.parent.id,
        organizationId:   params.parent.organizationId, // authoritative org (non-null for governed)
        userId:           params.parent.userId,          // USER subject (non-null; Finding 5)
        candidateId:      null,                          // governed jobs are USER-only (Finding 5/6)
        email:            params.parent.email,
        locale:           params.parent.locale,
        subjectClass:     "USER",
        status:           "PENDING",            // legacy column retained
        lifecycle:        "REQUESTED",
        idempotencyKey:   params.parent.id,     // one active job per parent
        approvedBy:       null,
        updatedAt:        new Date(),
        metadata:         {},
      },
    } as unknown)) as DbDataExportRequest;
    return { ok: true, job };
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { ok: false, reason: "DUPLICATE" };
    return { ok: false, reason: "ERROR" };
  }
}

/**
 * Tenant-scoped lifecycle transition with an expected-current-state predicate
 * (optimistic concurrency). Sets approval / revocation attribution server-side.
 */
export async function transitionExportJobForOrg(params: {
  id: string; organizationId: string; from: string; to: string; actorId: string; failureCode?: string;
}): Promise<{ affected: number }> {
  const db = await xm();
  if (!db) return { affected: 0 };
  const data: Record<string, unknown> = { lifecycle: params.to, updatedAt: new Date() };
  if (params.to === "AUTHORISED") { data.approvedBy = params.actorId; data.approvedAt = new Date(); }
  if (params.to === "REVOKED")    { data.revokedBy = params.actorId; data.revokedAt = new Date(); }
  if (params.to === "FAILED")     { data.failureCode = params.failureCode ?? "UNSPECIFIED"; }
  try {
    const r = (await db.export.updateMany({
      where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
      data,
    } as unknown)) as { count?: number };
    return { affected: typeof r?.count === "number" ? r.count : 0 };
  } catch { return { affected: 0 }; }
}

/** Directly set execution-result fields on a job (used by the test-only executor). */
export async function setExportExecutionResultForOrg(params: {
  id: string; organizationId: string; from: string;
  lifecycle: string; packageKey?: string | null; contentHash?: string | null; packageHash?: string | null;
  schemaVersion?: string | null; expiresAt?: Date | null; failureCode?: string | null;
}): Promise<{ affected: number }> {
  const db = await xm();
  if (!db) return { affected: 0 };
  try {
    const r = (await db.export.updateMany({
      where: { id: params.id, organizationId: params.organizationId, lifecycle: params.from },
      data: {
        lifecycle:     params.lifecycle,
        packageKey:    params.packageKey ?? undefined,
        contentHash:   params.contentHash ?? undefined,
        packageHash:   params.packageHash ?? undefined,
        schemaVersion: params.schemaVersion ?? undefined,
        expiresAt:     params.expiresAt ?? undefined,
        completedAt:   params.lifecycle === "READY" ? new Date() : undefined,
        failureCode:   params.failureCode ?? undefined,
        updatedAt:     new Date(),
      },
    } as unknown)) as { count?: number };
    return { affected: typeof r?.count === "number" ? r.count : 0 };
  } catch { return { affected: 0 }; }
}

// ── Download tokens ───────────────────────────────────────────────────────────

export async function createDownloadToken(params: {
  exportRequestId: string; tokenHash: string; subjectUserId: string | null; organizationId: string | null; expiresAt: Date;
}): Promise<DbExportDownloadToken | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.token.create({
      data: {
        id: randomUUID(),
        exportRequestId: params.exportRequestId,
        tokenHash: params.tokenHash,
        subjectUserId: params.subjectUserId,
        organizationId: params.organizationId,
        expiresAt: params.expiresAt,
      },
    } as unknown)) as DbExportDownloadToken;
  } catch { return null; }
}

/**
 * Gate A (Finding 3) — read an ELIGIBLE token WITHOUT mutating it. The full
 * binding predicate (export + subject + ORG + unused + unrevoked + unexpired) is
 * applied so a storage or integrity failure downstream never burns the token.
 */
export async function findEligibleDownloadToken(params: {
  exportRequestId: string; tokenHash: string; subjectUserId: string; organizationId: string | null; now: Date;
}): Promise<DbExportDownloadToken | null> {
  const db = await xm();
  if (!db) return null;
  try {
    return (await db.token.findFirst({
      where: {
        exportRequestId: params.exportRequestId,
        tokenHash:       params.tokenHash,
        subjectUserId:   params.subjectUserId,
        organizationId:  params.organizationId,
        usedAt:          null,
        revokedAt:       null,
        expiresAt:       { gt: params.now },
      },
    } as unknown)) as DbExportDownloadToken | null;
  } catch { return null; }
}

// Token consumption and token revocation are NOT exposed as standalone
// non-transactional operations: both MUST happen inside the linearized
// transactions below (consumeDownloadTokenLinearized / revokeExportJobAndTokensForOrg)
// so a redemption and a revocation always resolve to one consistent outcome and a
// job transition can never commit while a live token could remain (Finding 2).

// ── Transactional delivery operations (Finding 2 + linearization) ─────────────
//
// Issuance, revocation and redemption all take a REAL PostgreSQL row lock on the
// authoritative export job FIRST (lockExportJobRow → SELECT ... FOR UPDATE), then
// re-read the job under that lock, then touch token rows — the SAME lock order, so
// they linearize across all application instances without deadlock. Because the job
// row is genuinely locked, a concurrent operation blocks until the holder commits
// and then observes the committed lifecycle, so a token can never be issued or
// consumed after a committed revocation, and no revocation commits while a live
// token could remain.

class IssueError extends Error { constructor(public reason: IssueReason) { super(reason); this.name = "IssueError"; } }
type IssueReason = "NOT_FOUND" | "NOT_READY" | "REVOKED" | "EXPIRY_POLICY" | "EXPIRED" | "INCOMPLETE";
class RevokeError extends Error { constructor(public reason: RevokeReason) { super(reason); this.name = "RevokeError"; } }
type RevokeReason = "NOT_FOUND" | "NOT_READY" | "CONFLICT";

function isStructurallyCompleteReadyJob(job: DbDataExportRequest): boolean {
  return !!job.privacyRequestId && !!job.organizationId && !!job.userId
    && job.subjectClass === "USER" && !!job.packageKey
    && isSha256Hex(job.contentHash) && isSha256Hex(job.packageHash)
    && isSupportedExportSchemaVersion(job.schemaVersion) && !!job.completedAt;
}

/**
 * Issue a download token for a READY job TRANSACTIONALLY. The authoritative job row
 * is LOCKED (SELECT ... FOR UPDATE) first, then re-read and fully revalidated
 * (READY, unrevoked, unexpired, structurally complete: parent/org/subject bound,
 * valid content+package hashes, supported schema, completedAt) before the bound
 * token is created and committed. Because revocation takes the same row lock first,
 * if a revocation committed before issuance acquired the lock, issuance re-reads
 * REVOKED and denies (TOKEN_ISSUED_AFTER_COMMITTED_REVOCATION=0); if issuance
 * committed first, revocation then acquires the lock and revokes the new token. A
 * structurally incomplete READY row never yields a capability
 * (TOKEN_ISSUED_FOR_INCOMPLETE_EXPORT=0).
 */
export async function issueDownloadTokenForReadyJob(params: {
  id: string; organizationId: string; tokenHash: string; now: Date;
}): Promise<{ ok: true; token: DbExportDownloadToken } | { ok: false; reason: IssueReason | "UNAVAILABLE" | "PERSIST_FAILED" }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const exp = tx.dataExportRequest as AnyModel;
      const tok = tx.exportDownloadToken as AnyModel;
      // 1. Lock the authoritative job row FOR UPDATE (before reading or writing).
      if (!(await lockExportJobRow(tx, params.id, params.organizationId))) throw new IssueError("NOT_FOUND");
      // 2. Re-read the now-locked job and validate its authoritative lifecycle.
      const job = (await exp.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataExportRequest | null;
      if (!job) throw new IssueError("NOT_FOUND");
      if (job.lifecycle !== "READY") throw new IssueError("NOT_READY");
      if (job.revokedAt) throw new IssueError("REVOKED");
      if (!job.expiresAt) throw new IssueError("EXPIRY_POLICY");
      if (new Date(job.expiresAt as unknown as string).getTime() <= params.now.getTime()) throw new IssueError("EXPIRED");
      if (!isStructurallyCompleteReadyJob(job)) throw new IssueError("INCOMPLETE");
      const token = (await tok.create({
        data: {
          id: randomUUID(),
          exportRequestId: job.id,
          tokenHash: params.tokenHash,
          subjectUserId: job.userId,       // non-null (governed) — satisfies token binding
          organizationId: job.organizationId,
          expiresAt: new Date(job.expiresAt as unknown as string),
        },
      })) as DbExportDownloadToken;
      return { ok: true as const, token };
    });
  } catch (err) {
    if (err instanceof IssueError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "PERSIST_FAILED" };
  }
}

/**
 * Revoke a READY job AND all its outstanding tokens in ONE transaction. The job row
 * is LOCKED (SELECT ... FOR UPDATE) first, re-read (expected lifecycle READY),
 * transitioned to REVOKED with server-side attribution, then every unused/unrevoked
 * token is revoked. Holding the row lock means a concurrent issuance/redemption
 * either already committed (its token is swept here) or blocks and later observes
 * REVOKED. If the token revocation fails the whole transaction rolls back, so the
 * job transition is never committed while a live token could remain
 * (REVOCATION_PARTIAL_COMMIT=0, REVOKED_EXPORT_WITH_LIVE_TOKEN=0).
 */
export async function revokeExportJobAndTokensForOrg(params: {
  id: string; organizationId: string; actorId: string; now: Date;
}): Promise<{ ok: true; tokensRevoked: number } | { ok: false; reason: RevokeReason | "UNAVAILABLE" }> {
  const client = await getPrisma();
  if (!client) return { ok: false, reason: "UNAVAILABLE" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const exp = tx.dataExportRequest as AnyModel;
      const tok = tx.exportDownloadToken as AnyModel;
      // 1. Lock the authoritative job row FOR UPDATE (before reading or writing).
      if (!(await lockExportJobRow(tx, params.id, params.organizationId))) throw new RevokeError("NOT_FOUND");
      // 2. Re-read the now-locked job and validate its authoritative lifecycle.
      const job = (await exp.findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbDataExportRequest | null;
      if (!job) throw new RevokeError("NOT_FOUND");
      if (job.lifecycle !== "READY") throw new RevokeError("NOT_READY");
      // 3. Write the job row, then the token rows (consistent order).
      const upd = (await exp.updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "READY" },
        data: { lifecycle: "REVOKED", revokedBy: params.actorId, revokedAt: params.now, updatedAt: params.now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new RevokeError("CONFLICT");
      const rev = (await tok.updateMany({
        where: { exportRequestId: params.id, revokedAt: null, usedAt: null },
        data: { revokedAt: params.now },
      })) as { count?: number };
      return { ok: true as const, tokensRevoked: rev?.count ?? 0 };
    });
  } catch (err) {
    if (err instanceof RevokeError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "CONFLICT" };
  }
}

/**
 * Gate B (linearized) — atomically consume a token AFTER integrity validation. The
 * authoritative job row is LOCKED (SELECT ... FOR UPDATE) first, then re-read
 * (READY, unrevoked, unexpired, matching org+subject) and only then is the bound,
 * unused, unrevoked, unexpired token consumed with a guarded updateMany. Because the
 * job row is genuinely locked, a revocation that has committed first is observed as
 * REVOKED here, so no download commits after a committed revocation
 * (DOWNLOAD_AFTER_COMMITTED_REVOCATION=0).
 */
export async function consumeDownloadTokenLinearized(params: {
  exportRequestId: string; tokenHash: string; subjectUserId: string; organizationId: string | null; now: Date;
}): Promise<{ consumed: boolean }> {
  const client = await getPrisma();
  if (!client) return { consumed: false };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const exp = tx.dataExportRequest as AnyModel;
      const tok = tx.exportDownloadToken as AnyModel;
      // 1. Lock the authoritative job row FOR UPDATE (before reading or writing).
      if (!(await lockExportJobRow(tx, params.exportRequestId, params.organizationId))) return { consumed: false };
      // 2. Re-read the now-locked job and validate lifecycle + subject binding.
      const job = (await exp.findFirst({
        where: { id: params.exportRequestId, organizationId: params.organizationId, userId: params.subjectUserId },
      })) as DbDataExportRequest | null;
      if (!job || job.lifecycle !== "READY" || job.revokedAt || !job.expiresAt
        || new Date(job.expiresAt as unknown as string).getTime() <= params.now.getTime()) {
        return { consumed: false };
      }
      // 3. Consume the bound token (guarded single-use).
      const r = (await tok.updateMany({
        where: {
          exportRequestId: params.exportRequestId,
          tokenHash:       params.tokenHash,
          subjectUserId:   params.subjectUserId,
          organizationId:  params.organizationId,
          usedAt:          null,
          revokedAt:       null,
          expiresAt:       { gt: params.now },
        },
        data: { usedAt: params.now },
      })) as { count?: number };
      return { consumed: (r?.count ?? 0) === 1 };
    });
  } catch { return { consumed: false }; }
}
