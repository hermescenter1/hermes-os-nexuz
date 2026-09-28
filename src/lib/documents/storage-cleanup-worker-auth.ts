import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

/**
 * F-2 FU-F2-R4-1 — the guard for POST /api/documents/storage-cleanup.
 *
 * Same two-key shape as the metering (`authorizeWorkerRequest`) and ATS review
 * (`authorizeReviewWorker`) worker guards: a bearer token that exists ONLY in
 * the environment, compared in constant time, OR a signed-in platform admin.
 * With neither: 401 (403 for a signed-in non-admin).
 *
 * WHY A DEDICATED TOKEN, NOT THE METERING ONE. `authorizeWorkerRequest` accepts
 * METERING_WORKER_TOKEN and falls back to METRICS_TOKEN — the credential the
 * monitoring stack uses to SCRAPE /api/metrics. Reusing it here would let a
 * metrics scraper, or the metering container, trigger document-storage
 * deletions, and rotating one secret would silently change two capabilities.
 * The ATS review worker set the precedent (ATS_REVIEW_WORKER_TOKEN, no
 * fallback); this guard follows it: DOCUMENT_CLEANUP_WORKER_TOKEN only. No
 * fallback to any other variable, and an unset or empty variable never matches.
 */
export const DOCUMENT_CLEANUP_WORKER_TOKEN_ENV = "DOCUMENT_CLEANUP_WORKER_TOKEN";

function tokenMatches(req: NextRequest): boolean {
  const expected = process.env.DOCUMENT_CLEANUP_WORKER_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type DocumentCleanupWorkerAuth = { ok: true } | { ok: false; status: 401 | 403; error: string };

export async function authorizeDocumentCleanupWorker(req: NextRequest): Promise<DocumentCleanupWorkerAuth> {
  if (tokenMatches(req)) return { ok: true };
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}
