import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { correlationOf } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { getAtsAnalytics } from "@/lib/ats/dashboard";

/**
 * ATS analytics — REAL, tenant-scoped.
 *
 * Counts, stage distribution, top skills, sources and score distribution are
 * computed only from this organization's live applications (see
 * `@/lib/ats/dashboard`). A zero denominator yields an empty distribution, not
 * a fabricated percentage, trend, velocity or score. No fixture is imported; a
 * store fault is a controlled 503 with a correlation id and no fallback.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;

  const correlationId = correlationOf(req);
  const analytics = await getAtsAnalytics(actor.ctx.orgId);
  if (analytics === null) {
    return NextResponse.json(
      { error: "Recruitment data is temporarily unavailable.", code: "STORE_UNAVAILABLE", correlationId },
      { status: 503, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
    );
  }
  return NextResponse.json(analytics, { headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } });
}
