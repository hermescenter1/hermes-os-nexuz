import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { correlationOf } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { getAtsOverview } from "@/lib/ats/dashboard";

/**
 * ATS overview — REAL, tenant-scoped.
 *
 * Every figure is this organization's own PostgreSQL data (see
 * `@/lib/ats/dashboard`). No fixture is imported. A fresh organization with no
 * applications gets zeroed counts and empty lists — the honest empty state,
 * not invented people or velocity. A store fault is a controlled 503 with a
 * correlation id; it never falls back to sample data.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;

  const correlationId = correlationOf(req);
  const overview = await getAtsOverview(actor.ctx.orgId);
  if (overview === null) {
    return NextResponse.json(
      { error: "Recruitment data is temporarily unavailable.", code: "STORE_UNAVAILABLE", correlationId },
      { status: 503, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
    );
  }
  return NextResponse.json(overview, { headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } });
}
