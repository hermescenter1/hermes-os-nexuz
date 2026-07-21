/**
 * Public LIVENESS probe (Phase 45; semantics corrected in Phase 90).
 *
 * Returns ONLY { "status": "ok" } — no internal state — so it stays safe for
 * public load balancers and uptime monitors.
 *
 * PHASE 90 — liveness vs readiness.
 * This endpoint previously ran `SELECT 1` and answered 503 whenever the
 * database was unreachable. It is wired as the CONTAINER healthcheck
 * (docker-compose.prod.yml: `wget -qO- http://127.0.0.1:3000/api/health`), so
 * that conflation meant a transient database outage marked every web container
 * unhealthy and had the orchestrator kill and restart processes that were
 * perfectly alive — converting a recoverable dependency blip into an
 * application-wide restart storm, and taking down the public pages that do not
 * touch the database at all.
 *
 * Liveness now answers exactly one question: "is this process up and serving?"
 * Dependency state moved to /api/health/ready, which is what a TRAFFIC gate
 * (load-balancer member check, deployment readiness) should consult. Full
 * diagnostics remain admin-only at /api/admin/system.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Reaching this line proves the process is up and the router is serving.
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
