/**
 * GET /api/metrics — Prometheus text exposition (Phase 92).
 *
 * Emits the in-process operational metrics registry (metric-names.ts) in the
 * standard Prometheus text format. The registry holds only metric names,
 * low-cardinality labels and numbers — no secrets, connection strings or tenant
 * identifiers by construction — but the endpoint is still ACCESS-CONTROLLED so
 * internal operational shape is not public:
 *
 *   - An admin session (getCurrentUser + admin role) may read it, OR
 *   - a scraper may present `Authorization: Bearer <METRICS_TOKEN>` where the
 *     token is configured in the environment ONLY (never derived from a request)
 *     and compared in constant time.
 *
 * If neither METRICS_TOKEN is configured nor an admin session is present, the
 * endpoint answers 401/403 — it never falls open.
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { renderProm } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time bearer-token check against the env-configured METRICS_TOKEN. */
function scraperAuthorized(req: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const provided = m[1];
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!scraperAuthorized(req)) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = renderProm();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
