import type { DashboardSnapshot, TelemetryService } from "./types";

/**
 * V1 implementation: fetches the BFF route, which serves SIMULATED data.
 * Phase 2: same interface, re-pointed at the FastAPI Historian/telemetry
 * engine. The dashboard never knows the difference.
 */
export const telemetryService: TelemetryService = {
  async snapshot() {
    try {
      const res = await fetch("/api/telemetry", { cache: "no-store" });
      if (!res.ok) return { ok: false, error: `telemetry: HTTP ${res.status}` };
      const data = (await res.json()) as DashboardSnapshot;
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "telemetry: network error" };
    }
  },
};
