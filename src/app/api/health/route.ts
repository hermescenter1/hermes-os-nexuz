import { NextResponse } from "next/server";
import { getPrisma }   from "@/lib/db/prisma";

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

export async function GET() {
  const db = await checkDatabase();
  const overall = db.status === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status:      overall,
      timestamp:   new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      database:    db,
    },
    { status: overall === "ok" ? 200 : 503 },
  );
}
