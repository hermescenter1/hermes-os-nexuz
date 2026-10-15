import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { correlationOf } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { getAtsPipeline } from "@/lib/ats/dashboard";

/**
 * Recruitment pipeline board — REAL, tenant-scoped.
 *
 * The columns and the candidate cards in them come only from this
 * organization's live applications (see `@/lib/ats/dashboard`), with erased,
 * anonymised and soft-deleted rows excluded. A fresh organization gets empty
 * columns with zero counts. No fixture is imported; a store fault is a
 * controlled 503 with a correlation id and no fallback.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;

  const correlationId = correlationOf(req);
  const columns = await getAtsPipeline(actor.ctx.orgId);
  if (columns === null) {
    return NextResponse.json(
      { error: "Recruitment data is temporarily unavailable.", code: "STORE_UNAVAILABLE", correlationId },
      { status: 503, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const filtered = jobId
    ? columns.map((col) => {
        const candidates = col.candidates.filter((c) => c.jobId === jobId);
        return { ...col, candidates, count: candidates.length };
      })
    : columns;
  const total = filtered.reduce((sum, col) => sum + col.count, 0);

  return NextResponse.json({ columns: filtered, total }, { headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } });
}
