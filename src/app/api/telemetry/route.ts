import { NextResponse } from "next/server";
import { simulateSnapshot } from "@/lib/industrial/simulator";

export const dynamic = "force-dynamic";

/**
 * V1 BFF endpoint: simulated telemetry only — no device communication.
 * Phase 2: this route is retired and TelemetryService points at the
 * FastAPI Historian / telemetry engine instead.
 */
export async function GET() {
  return NextResponse.json(simulateSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
