import { NextResponse } from "next/server";
import { getPrisma }   from "@/lib/db/prisma";
import { getRedis }    from "@/lib/redis/client";
import { isRateLimiterDegraded } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbStatus = { status: "ok" | "degraded"; latencyMs?: number };

async function checkDatabase(): Promise<DbStatus> {
  try {
    const prisma = await getPrisma();
    if (!prisma) return { status: "degraded" };

    const start = Date.now();
    // Lightweight connectivity probe — never throws to the caller
    await (prisma as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> })
      .$queryRawUnsafe("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch {
    return { status: "degraded" };
  }
}

async function checkRedis(): Promise<{ status: "ok" | "degraded"; note?: string }> {
  try {
    const redis = await getRedis();
    if (!redis) return { status: "degraded", note: "REDIS_URL not configured — rate-limiter using in-process fallback (no cross-instance limits)" };
    await redis.ping();
    return { status: "ok" };
  } catch {
    return { status: "degraded", note: "Redis ping failed — rate-limiter using in-process fallback (no cross-instance limits)" };
  }
}

export async function GET() {
  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const rateLimiter = isRateLimiterDegraded()
    ? { status: "degraded" as const, note: "in-process fallback active — cross-instance rate limits not enforced" }
    : { status: redis.status };

  const overall = db.status === "ok" ? (redis.status === "ok" ? "ok" : "degraded") : "degraded";

  return NextResponse.json(
    {
      status:      overall,
      timestamp:   new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      database:    db,
      redis,
      rateLimiter,
    },
    { status: overall === "ok" ? 200 : 503 },
  );
}
