import { NextResponse, type NextRequest } from "next/server";
import { authorizeDocumentCleanupWorker } from "@/lib/documents/storage-cleanup-worker-auth";
import { runDocumentStorageCleanupPass, CLEANUP_PASS_MAX } from "@/lib/documents/storage-cleanup";

/**
 * POST /api/documents/storage-cleanup (F-2 FU-F2-R2-3 / FU-F2-R4-1) — retry
 * pending removals of deleted documents' stored files.
 *
 * A PLATFORM maintenance endpoint, not a tenant one: it only ever removes
 * objects under `documents/<id>/` for documents that are ALREADY deleted (the
 * outbox rows written by DELETE /api/documents/[id]). It reads no document,
 * returns counts only — never ids, keys or organization names — and is
 * idempotent; concurrent calls are safe (each row is claimed atomically).
 *
 * Guard: its OWN worker bearer token, DOCUMENT_CLEANUP_WORKER_TOKEN, with no
 * fallback to the metering or metrics tokens (see storage-cleanup-worker-auth.ts),
 * or a platform-admin session. Scheduled by the hermes-document-cleanup-worker
 * compose service, a thin trigger (scripts/documents/storage-cleanup-worker.mjs).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;

export async function POST(req: NextRequest) {
  const auth = await authorizeDocumentCleanupWorker(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = req.nextUrl.searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > CLEANUP_PASS_MAX) {
    return NextResponse.json({ error: "INVALID_LIMIT" }, { status: 400 });
  }

  try {
    const result = await runDocumentStorageCleanupPass({ limit });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    // Every row it touched is still PENDING or DONE; the next pass continues.
    return NextResponse.json({ error: "STORAGE_CLEANUP_PASS_FAILED" }, { status: 500 });
  }
}
