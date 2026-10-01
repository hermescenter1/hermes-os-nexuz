import { NextRequest, NextResponse } from "next/server";
import { processDocument } from "@/lib/documents/processing";
import { documentRepositoryForOrganization } from "@/lib/documents/document-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor, orgActorRefusalCode } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";
import { requireTrustedOrigin } from "@/lib/security/request-guards";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * POST /api/documents/[id]/process (Phase 16C; F-2 tenant ownership).
 *
 * Synchronously runs extraction + chunking for one document (see
 * `src/lib/documents/processing.ts`) — no background worker/queue exists
 * yet, so this call blocks for the duration of the pipeline. Requires
 * `manage_documents` in the caller's active organization.
 *
 * F-2: ownership is proven through the organization-scoped repository BEFORE
 * `processDocument` runs. A foreign or unassigned (NULL `tenantId`) document
 * answers 404 and is never extracted, chunked or embedded.
 *
 * Always returns 200 once the document is found — both a successful
 * "chunked" outcome and a documented "failed" outcome (unsupported file
 * type, missing file, extraction error) are valid, non-exceptional
 * results of "the process request was handled"; the response body's
 * `document.status`/`document.error` carry the real outcome. Only 404
 * (document not found) and 500 (a genuinely unexpected exception escaping
 * `processDocument`'s own try/catch — should not normally happen) differ.
 */

export const dynamic = "force-dynamic";

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return refuse(auth.status, auth.code);
  const originGate = requireTrustedOrigin(req, auth.ctx.authMethod);
  if (!originGate.ok) return refuse(403, "forbidden");
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return refuse(member.status, orgActorRefusalCode(member.status));
  const perm = requirePermission(member.ctx.role, "manage_documents");
  if (!perm.ok) return refuse(perm.status, "forbidden");
  const orgId = member.ctx.orgId;

  const { id } = await params;

  try {
    const owned = await documentRepositoryForOrganization(orgId).get(id);
    if (!owned) return refuse(404, "not_found");

    const result = await processDocument(owned.id);
    if (!result) return refuse(404, "not_found");

    await recordAuditEvent({
      userId: member.ctx.userId,
      organizationId: orgId,
      action: result.ok ? AUDIT_ACTIONS.DOCUMENT_PROCESSED : AUDIT_ACTIONS.DOCUMENT_PROCESS_FAILED,
      entityType: "document",
      entityId: owned.id,
      metadata: { status: result.document.status, chunkCount: result.chunkCount },
    });

    return NextResponse.json({
      storageMode: getStorageMode(),
      ok: result.ok,
      document: result.document,
      chunkCount: result.chunkCount,
    });
  } catch {
    // processDocument() already catches everything internally — this is a
    // defense-in-depth backstop only, never expected to fire in practice.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
