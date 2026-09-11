/**
 * POST /api/industrial/metering/deliver
 *
 * PHASE 109-C-UI.2-R8 — the worker entrypoint.
 *
 * R7 built a durable metering outbox and proved delivery exactly-once, but
 * nothing ran the delivery: events accumulated as PENDING and no `UsageRecord`
 * was ever written. This is what runs it.
 *
 * ONE BOUNDED PASS PER CALL, on purpose. The alternative — an endpoint that
 * drains the whole backlog — would hold the lease for as long as the backlog
 * takes and make "the worker is stuck" indistinguishable from "the worker is
 * busy". A short pass is observable: the caller polls, and every call returns
 * what it did.
 *
 * SAFE TO CALL CONCURRENTLY, from any number of replicas. Two guarantees stack:
 * the worker lease means only one caller sweeps at a time, and the conditional
 * status transition on each outbox row means that even without the lease no
 * event is delivered twice. Calling this fifty times in parallel bills nothing
 * twice; it just returns `acquired: false` forty-nine times.
 *
 * Access is the `/api/metrics` shape — an env-configured bearer token compared
 * in constant time, or a platform admin session. It never falls open.
 */

import { NextResponse, type NextRequest } from "next/server";
import { runMeteringDeliveryPass } from "@/lib/industrial/metering-worker";
import { authorizeWorkerRequest } from "@/lib/industrial/metering-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bounded by the caller, and bounded again here. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function POST(req: NextRequest) {
  const auth = await authorizeWorkerRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = req.nextUrl.searchParams.get("limit");
  const parsed = raw === null ? DEFAULT_LIMIT : Number(raw);
  // A malformed limit is refused rather than coerced: silently treating
  // `?limit=abc` as the default hides a broken caller.
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return NextResponse.json({ error: "INVALID_LIMIT" }, { status: 400 });
  }

  try {
    const result = await runMeteringDeliveryPass({ limit: parsed });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    /*
      The pass threw. The lease was already released in its `finally`, and every
      event it touched is in PENDING, RETRYING or DEAD_LETTER — none is lost, and
      the next pass picks them up. The response says so with a code rather than a
      driver message, which would leak table and column names to the caller.
    */
    return NextResponse.json({ error: "METERING_PASS_FAILED" }, { status: 500 });
  }
}
