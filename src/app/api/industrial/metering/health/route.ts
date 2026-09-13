/**
 * GET /api/industrial/metering/health
 *
 * PHASE 109-C-UI.2-R8 — the operational view of the metering outbox.
 *
 * The same numbers the Prometheus catalogue carries, as JSON, for an operator or
 * a runbook that wants one readable answer rather than a scrape. It is
 * READ-ONLY: it never delivers, never takes the lease, and never mutates a row,
 * so it is safe to poll from a monitor.
 *
 * `oldestPendingAgeMs` is the field that actually answers "is the worker
 * running". Counts can look healthy while nothing has moved for hours; an age
 * that only grows is the signature of a stopped worker, and it is the number a
 * page-worthy alert should watch.
 *
 * The payload carries counts and a lease holder — no organisation id, no site,
 * no actor. Those live on the outbox rows and stay there.
 */

import { NextResponse, type NextRequest } from "next/server";
import { meteringHealth } from "@/lib/industrial/metering-worker";
import { authorizeWorkerRequest } from "@/lib/industrial/metering-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authorizeWorkerRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const health = await meteringHealth();

  /*
    `healthy` is a judgement, and the endpoint states its rule rather than
    leaving the caller to invent one: nothing abandoned, and nothing waiting
    longer than fifteen minutes. A backlog that is moving is not unhealthy; a
    small backlog that is not moving is.
  */
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const healthy = health.counts.DEAD_LETTER === 0 && health.oldestPendingAgeMs < STALE_AFTER_MS;

  return NextResponse.json(
    { healthy, staleAfterMs: STALE_AFTER_MS, ...health },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
