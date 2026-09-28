import { NextRequest, NextResponse } from "next/server";
import { documentRepositoryForOrganization } from "@/lib/documents/document-repository";
import {
  runDocumentStorageCleanup,
  runDocumentStorageCleanupPass,
} from "@/lib/documents/storage-cleanup";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor, orgActorRefusalCode } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";
import { requireTrustedOrigin } from "@/lib/security/request-guards";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * /api/documents/[id] (Phase 16B; Phase 16C adds chunk cleanup on delete;
 * F-2 tenant ownership).
 *
 * GET: document detail — `view_documents` in the caller's active organization.
 * DELETE: `manage_documents`. In ONE database transaction it removes the
 * document's `DocumentTextChunk` rows and its `Document` row and records a
 * `DocumentStorageCleanup` outbox row (FU-F2-R2-3). The stored files — the
 * original and the extracted text — are removed AFTER the commit from that row;
 * object storage is not transactional and is not presented as such. If the
 * removal fails the response still reports the document deleted, with
 * `storageCleanup: "pending"`, and the row is retried (inline on later deletes
 * of this organization, and by POST /api/documents/storage-cleanup).
 *
 * F-2: the document is looked up ONLY through the organization-scoped
 * repository. A document owned by another organization, or by none (NULL
 * `tenantId`), answers the same 404 as an id that does not exist, and nothing
 * is touched — no storage delete, no chunk delete, no audit row.
 */

export const dynamic = "force-dynamic";

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return refuse(auth.status, auth.code);
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return refuse(member.status, orgActorRefusalCode(member.status));
  const perm = requirePermission(member.ctx.role, "view_documents");
  if (!perm.ok) return refuse(perm.status, "forbidden");

  const { id } = await params;
  try {
    const document = await documentRepositoryForOrganization(member.ctx.orgId).get(id);
    if (!document) return refuse(404, "not_found");
    return NextResponse.json({ storageMode: getStorageMode(), document });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const repo = documentRepositoryForOrganization(orgId);

  try {
    // Ownership is proven HERE, before any side effect. Everything below
    // acts on an id this organization is known to own.
    const document = await repo.get(id);
    if (!document) return refuse(404, "not_found");

    // Atomic: chunks + Document row + cleanup outbox row. Throws → 500, and
    // nothing was deleted.
    const deletion = await repo.deleteWithStorageCleanup(id);
    if (!deletion.deleted) return refuse(404, "not_found"); // a concurrent delete won

    // After the commit: remove the stored files now if possible. A failure is
    // recorded on the outbox row and retried — never reported as removed.
    let storageCleanup: "done" | "pending" = "pending";
    try {
      storageCleanup = (await runDocumentStorageCleanup(deletion.cleanupId)) === "done" ? "done" : "pending";
    } catch {
      storageCleanup = "pending";
    }
    // Opportunistic, bounded retry of this organization's earlier failures only.
    try {
      await runDocumentStorageCleanupPass({ organizationId: orgId, limit: 5 });
    } catch {
      /* the rows stay PENDING; the worker endpoint retries them */
    }

    await recordAuditEvent({
      userId: member.ctx.userId,
      organizationId: orgId,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      entityType: "document",
      entityId: id,
      metadata: { title: document.title, storageCleanup, skippedKeys: deletion.skippedKeys },
    });
    return NextResponse.json({ storageMode: getStorageMode(), deleted: true, storageCleanup });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
