import { NextResponse } from "next/server";
import { processDocument } from "@/lib/documents/processing";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can } from "@/lib/auth/roles";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * POST /api/documents/[id]/process (Phase 16C).
 *
 * Synchronously runs extraction + chunking for one document (see
 * `src/lib/documents/processing.ts`) — no background worker/queue exists
 * yet, so this call blocks for the duration of the pipeline. Admin-only,
 * same server-side enforcement as every other /api/documents* route.
 *
 * Always returns 200 once the document is found — both a successful
 * "chunked" outcome and a documented "failed" outcome (unsupported file
 * type, missing file, extraction error) are valid, non-exceptional
 * results of "the process request was handled"; the response body's
 * `document.status`/`document.error` carry the real outcome. Only 404
 * (document not found) and 500 (a genuinely unexpected exception escaping
 * `processDocument`'s own try/catch — should not normally happen) differ.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "auth not configured" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const result = await processDocument(id);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    await recordAuditEvent({
      userId: user.id,
      action: result.ok ? AUDIT_ACTIONS.DOCUMENT_PROCESSED : AUDIT_ACTIONS.DOCUMENT_PROCESS_FAILED,
      entityType: "document",
      entityId: id,
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
