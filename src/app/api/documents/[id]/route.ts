import { NextResponse } from "next/server";
import { documentRepository } from "@/lib/documents/document-repository";
import { documentTextChunkRepository } from "@/lib/documents/chunk-repository";
import { getDocumentObjectStorage } from "@/lib/documents/object-storage";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can } from "@/lib/auth/roles";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * /api/documents/[id] (Phase 16B; Phase 16C adds chunk cleanup on delete).
 *
 * GET: document detail — admin-only.
 * DELETE: removes the object-storage file (best-effort), any
 * `DocumentTextChunk` rows (Phase 16C — there is no foreign key enforcing
 * this, so the application does it explicitly), and the metadata row —
 * admin-only. See route.ts (the collection route) for why all of this is
 * admin-gated server-side, not just page-wrapper-gated.
 */

async function requireAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; status: number; error: string }
> {
  if (!isAuthConfigured()) {
    return { ok: false, status: 403, error: "auth not configured" };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  try {
    const document = await documentRepository().get(id);
    if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ storageMode: getStorageMode(), document });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const repo = documentRepository();

  try {
    const document = await repo.get(id);
    if (!document) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (document.storageKey) {
      try {
        await getDocumentObjectStorage().delete(document.storageKey);
      } catch {
        // Best-effort: an orphaned blob is a smaller problem than a
        // metadata row the operator can no longer remove. Never blocks
        // the response.
      }
    }

    try {
      await documentTextChunkRepository().deleteByDocumentId(id);
    } catch {
      // Best-effort, same rationale as the storage delete above.
    }

    const deleted = await repo.delete(id);
    await recordAuditEvent({
      userId: auth.userId,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      entityType: "document",
      entityId: id,
      metadata: { title: document.title },
    });
    return NextResponse.json({ storageMode: getStorageMode(), deleted });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
