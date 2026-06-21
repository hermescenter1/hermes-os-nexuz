/**
 * Public liveness probe (Phase 45).
 *
 * Returns ONLY { "status": "ok" } or { "status": "down" } with 503.
 * No internal state is exposed — this endpoint is safe for public load-balancer
 * health checks and uptime monitoring services.
 *
 * Full diagnostic readiness is available at /api/admin/system (admin-only).
 */

import { NextResponse } from "next/server";
import { getPrisma }    from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    const prisma = await getPrisma();
    if (!prisma) return false;
    await (prisma as unknown as { $queryRawUnsafe: (q: string) => Promise<unknown> })
      .$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const ok = await isDatabaseReachable();
  return NextResponse.json(
    { status: ok ? "ok" : "down" },
    { status: ok ? 200 : 503 },
  );
}
