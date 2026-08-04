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

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;

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
  const subjectClass = params.parent.userId ? "USER" : "CANDIDATE";
  try {
    const job = (await db.export.create({
      data: {
        id:               randomUUID(),
        privacyRequestId: params.parent.id,
        organizationId:   params.parent.organizationId,
        userId:           params.parent.userId,
        candidateId:      params.parent.candidateId,
        email:            params.parent.email,
        locale:           params.parent.locale,
        subjectClass,
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
  lifecycle: string; packageKey?: string | null; contentHash?: string | null;
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
 * Atomically consume a download token. The single updateMany with a rich
 * predicate is the atomic single-use gate: only an unused, unrevoked, unexpired
 * token bound to this export + subject is consumed, and only the first concurrent
 * redemption sets usedAt (affected === 1). Returns whether it was consumed.
 */
export async function consumeDownloadToken(params: {
  exportRequestId: string; tokenHash: string; subjectUserId: string; now: Date;
}): Promise<{ consumed: boolean }> {
  const db = await xm();
  if (!db) return { consumed: false };
  try {
    const r = (await db.token.updateMany({
      where: {
        exportRequestId: params.exportRequestId,
        tokenHash:       params.tokenHash,
        subjectUserId:   params.subjectUserId,
        usedAt:          null,
        revokedAt:       null,
        expiresAt:       { gt: params.now },
      },
      data: { usedAt: params.now },
    } as unknown)) as { count?: number };
    return { consumed: (r?.count ?? 0) === 1 };
  } catch { return { consumed: false }; }
}

/** Revoke every outstanding (unused, unrevoked) token for an export request. */
export async function revokeTokensForExport(exportRequestId: string): Promise<{ affected: number }> {
  const db = await xm();
  if (!db) return { affected: 0 };
  try {
    const r = (await db.token.updateMany({
      where: { exportRequestId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    } as unknown)) as { count?: number };
    return { affected: typeof r?.count === "number" ? r.count : 0 };
  } catch { return { affected: 0 }; }
}
