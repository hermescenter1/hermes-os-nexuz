import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { isPayloadSessionActive }     from "@/lib/auth/session-store";
import { getExportJobForSubject, findEligibleDownloadToken, consumeDownloadTokenLinearized } from "@/lib/compliance/export-db";
import { getDocumentObjectStorage }   from "@/lib/documents/object-storage";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { hashExportToken, looksLikeExportToken } from "@/lib/compliance/export-token";
import { parseAndValidateExportPackage } from "@/lib/compliance/export-package";

/**
 * Redeem a download token — TWO-GATE, integrity-verified, single-use.
 *
 * Gate A reads an ELIGIBLE token WITHOUT mutating it (token+export+subject+ORG+
 * unused+unrevoked+unexpired). The package is then fetched and STRICTLY validated
 * (structure, binding against the authoritative job, and content hash recomputed
 * and compared against package/manifest AND the PostgreSQL job.contentHash) — any
 * failure returns before Gate B, so a storage or integrity failure never burns the
 * token (Finding 3). Gate B atomically consumes the token; only the request whose
 * consume affects exactly one row returns the verified bytes already in memory.
 * A failed/replayed/foreign token yields a uniform 404. No anonymous route.
 */
const NOT_FOUND = { error: "Not found", code: "NOT_FOUND" };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = at ? await verifyAccessToken(at) : null;
  if (!payload?.sub || !(await isPayloadSessionActive(payload))) {
    return NextResponse.json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null) as { token?: string } | null;
  if (!looksLikeExportToken(body?.token)) return NextResponse.json(NOT_FOUND, { status: 404 });

  const job = await getExportJobForSubject(id, payload.sub);
  if (!job || job.lifecycle !== "READY" || job.revokedAt || !job.packageKey
    || !job.expiresAt || new Date(job.expiresAt as unknown as string).getTime() <= Date.now()) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const tokenHash = hashExportToken(body!.token as string);
  const now = new Date();

  // Gate A — eligibility read (no mutation).
  const eligible = await findEligibleDownloadToken({ exportRequestId: id, tokenHash, subjectUserId: payload.sub, organizationId: job.organizationId, now });
  if (!eligible) {
    await recordAuditEvent({ userId: payload.sub, action: COMPLIANCE_AUDIT.EXPORT_TOKEN_REPLAY_DENIED, entityType: "DataExportRequest", entityId: id, organizationId: job.organizationId, outcome: "DENIED", metadata: { exportRequestId: id } });
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Fetch + strictly validate the package BEFORE consuming the token.
  let bytes: Buffer | null;
  try {
    bytes = await getDocumentObjectStorage().get(job.packageKey);
  } catch {
    // Transient storage failure — the token is NOT consumed; the caller may retry.
    return NextResponse.json({ error: "Package retrieval failed", code: "PACKAGE_RETRIEVAL_FAILED" }, { status: 502 });
  }
  const validation = parseAndValidateExportPackage(bytes, {
    exportRequestId:   job.id,
    privacyRequestId:  job.privacyRequestId,
    organizationScope: job.organizationId,
    subjectUserId:     job.userId,
    subjectClass:      job.subjectClass ?? "USER",
    schemaVersion:     job.schemaVersion,
    jobContentHash:    job.contentHash,
    jobPackageHash:    job.packageHash,
    expiresAt:         job.expiresAt,
  });
  if (!validation.ok) {
    const status = validation.code === "PACKAGE_NOT_FOUND" ? 404 : validation.code === "PACKAGE_INVALID" ? 500 : 409;
    return NextResponse.json({ error: "Package integrity check failed", code: validation.code }, { status });
  }

  // Gate B — linearized atomic single-use consumption AFTER integrity is proven.
  // The job (READY/unrevoked/unexpired/org+subject) is revalidated in the same
  // transaction, so a committed revocation denies the consume.
  const { consumed } = await consumeDownloadTokenLinearized({ exportRequestId: id, tokenHash, subjectUserId: payload.sub, organizationId: job.organizationId, now: new Date() });
  if (!consumed) {
    await recordAuditEvent({ userId: payload.sub, action: COMPLIANCE_AUDIT.EXPORT_TOKEN_REPLAY_DENIED, entityType: "DataExportRequest", entityId: id, organizationId: job.organizationId, outcome: "DENIED", metadata: { exportRequestId: id } });
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  await recordAuditEvent({
    userId: payload.sub,
    action: COMPLIANCE_AUDIT.EXPORT_DOWNLOADED,
    entityType: "DataExportRequest",
    entityId: id,
    organizationId: job.organizationId,
    outcome: "SUCCESS",
    metadata: { exportRequestId: id, contentHash: job.contentHash },
  });

  // Return the EXACT verified bytes already held in memory.
  return new NextResponse(new Uint8Array(bytes as Buffer), {
    status: 200,
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="export-${id}.json"`, "cache-control": "no-store" },
  });
}
