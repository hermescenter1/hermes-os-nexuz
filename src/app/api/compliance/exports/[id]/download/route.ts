import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { isPayloadSessionActive }     from "@/lib/auth/session-store";
import { getExportJobForSubject, consumeDownloadToken } from "@/lib/compliance/export-db";
import { getDocumentObjectStorage }   from "@/lib/documents/object-storage";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { hashExportToken, looksLikeExportToken } from "@/lib/compliance/export-token";

/**
 * Redeem a download token for the authenticated subject.
 *
 * SECURITY — no anonymous route. The token is bound to the export request AND the
 * subject: the job must belong to the caller, be READY, unexpired and unrevoked,
 * and the token is consumed ATOMICALLY (single-use) before access is granted. A
 * failed, replayed, foreign-subject or foreign-tenant token yields a UNIFORM 404
 * with no oracle. The plaintext token is never stored or logged.
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

  // The job must belong to this subject (cross-subject / cross-tenant → 404).
  const job = await getExportJobForSubject(id, payload.sub);
  if (!job || job.lifecycle !== "READY" || job.revokedAt || !job.packageKey) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  if (!job.expiresAt || new Date(job.expiresAt as unknown as string).getTime() <= Date.now()) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Atomic single-use consumption — only the first valid redemption wins.
  const { consumed } = await consumeDownloadToken({
    exportRequestId: id,
    tokenHash:       hashExportToken(body!.token as string),
    subjectUserId:   payload.sub,
    now:             new Date(),
  });
  if (!consumed) {
    await recordAuditEvent({
      userId: payload.sub,
      action: COMPLIANCE_AUDIT.EXPORT_TOKEN_REPLAY_DENIED,
      entityType: "DataExportRequest",
      entityId: id,
      organizationId: job.organizationId,
      outcome: "DENIED",
      metadata: { exportRequestId: id },
    });
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const bytes = await getDocumentObjectStorage().get(job.packageKey);
  if (!bytes) return NextResponse.json(NOT_FOUND, { status: 404 });

  await recordAuditEvent({
    userId: payload.sub,
    action: COMPLIANCE_AUDIT.EXPORT_DOWNLOADED,
    entityType: "DataExportRequest",
    entityId: id,
    organizationId: job.organizationId,
    outcome: "SUCCESS",
    // Identifiers + integrity only — never the package contents/token/URL.
    metadata: { exportRequestId: id, contentHash: job.contentHash },
  });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="export-${id}.json"`,
      "cache-control": "no-store",
    },
  });
}
