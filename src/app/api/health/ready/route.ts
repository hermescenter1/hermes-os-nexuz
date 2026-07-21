/**
 * PHASE 90 — public READINESS probe.
 *
 * Answers "should this instance receive traffic?" — the question a load-balancer
 * member check or a deployment gate asks, and the one /api/health used to
 * answer by mistake (see that file for why conflating the two caused restart
 * storms).
 *
 * Required dependency: PostgreSQL. Redis is deliberately NOT required — the
 * platform's rate limiter and caches already degrade to an in-process fallback
 * when Redis is unavailable (see the "[auth-rate-limiter] Redis unavailable —
 * in-process fallback active" path), so a Redis outage must not remove a
 * serving instance from the pool. Its state is reported for visibility only.
 *
 * DISCLOSURE: the body carries booleans and a status string only — never a
 * connection string, host, credential or driver error text. Failures are
 * recorded in the structured log stream (with the request's correlation id),
 * which is the operator-facing channel; the public response stays opaque.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { resolveRequestId } from "@/lib/logger/correlation";
import { logInfraFailure } from "@/lib/logger/security-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function databaseReady(reqId: string): Promise<boolean> {
  try {
    const prisma = await getPrisma();
    if (!prisma) {
      logInfraFailure("database", "health.ready", new Error("prisma client unavailable"), reqId);
      return false;
    }
    await (prisma as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> })
      .$queryRawUnsafe("SELECT 1");
    return true;
  } catch (err) {
    logInfraFailure("database", "health.ready", err, reqId);
    return false;
  }
}

export async function GET(req: NextRequest) {
  const reqId = resolveRequestId(req);
  const database = await databaseReady(reqId);

  return NextResponse.json(
    { status: database ? "ready" : "not_ready", database },
    {
      status: database ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Request-ID": reqId },
    },
  );
}
