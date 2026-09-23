import { NextResponse, type NextRequest } from "next/server";
import { runAiReviewPass, DEFAULT_REVIEW_BATCH, MAX_REVIEW_BATCH } from "@/lib/ats/review/worker";
import { authorizeReviewWorker } from "@/lib/ats/review/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ATS-S1 — one bounded AI-review delivery pass.
 *
 * Triggered by the scheduled runner (scripts/ats/ai-review-worker.mjs) with
 * the worker bearer token, or by a platform administrator. The pass itself
 * is the only code that moves an application AI_REVIEW_PENDING →
 * PENDING_HUMAN_APPROVAL, and it does so per row under a conditional update.
 * The response is counts only — never a candidate field.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeReviewWorker(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw === null ? DEFAULT_REVIEW_BATCH : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_REVIEW_BATCH) {
    return NextResponse.json({ error: "INVALID_LIMIT" }, { status: 400 });
  }

  try {
    const result = await runAiReviewPass({ limit: parsed });
    const status = result.storeUnavailable ? 503 : 200;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    // Every row the pass touched is PENDING, RETRYING, DEAD_LETTER or
    // DELIVERED; nothing is lost. A code, never a driver message.
    return NextResponse.json({ error: "REVIEW_PASS_FAILED" }, { status: 500 });
  }
}
