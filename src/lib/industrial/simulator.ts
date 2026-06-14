import type {
  DashboardSnapshot,
  MetricSeries,
  Severity,
} from "@/lib/services/types";

/**
 * Simulated industrial telemetry — V1 only.
 *
 * Values are smooth functions of wall-clock time (sine layers + deterministic
 * jitter), so consecutive polls look like a real plant trending, not random
 * noise. NO real device communication happens here. Phase 2 replaces this
 * module with the Historian + gateway services behind the same
 * TelemetryService interface.
 */

const HISTORY_LEN = 24;
const STEP_MS = 5_000;

// Deterministic pseudo-noise: same (seed, t) -> same value.
function noise(seed: number, t: number): number {
  const x = Math.sin(seed * 374761.393 + t * 668265.263) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

function wave(t: number, periodMs: number, phase = 0): number {
  return Math.sin((t / periodMs) * 2 * Math.PI + phase); // -1..1
}

function channel(
  t: number,
  seed: number,
  base: number,
  amp: number,
  periodMs: number
): number {
  return (
    base +
    amp * wave(t, periodMs, seed) +
    amp * 0.25 * wave(t, periodMs / 3.7, seed * 2) +
    amp * 0.12 * (noise(seed, Math.floor(t / STEP_MS)) - 0.5)
  );
}

function series(
  t: number,
  seed: number,
  tag: string,
  unit: string,
  base: number,
  amp: number,
  periodMs: number,
  digits = 1
): MetricSeries {
  const history: number[] = [];
  for (let i = HISTORY_LEN - 1; i >= 0; i--) {
    history.push(
      round(channel(t - i * STEP_MS, seed, base, amp, periodMs), digits)
    );
  }
  const value = history[history.length - 1];
  return {
    tag,
    value,
    unit,
    min: round(Math.min(...history), digits),
    max: round(Math.max(...history), digits),
    history,
  };
}

function round(n: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function simulateSnapshot(now = Date.now()): DashboardSnapshot {
  const t = now;

  // --- production lines (4) ---
  // Line 3 idles on a slow duty cycle; others run. Line 2 runs warm (ties
  // into the alarm + AI recommendation narrative).
  const line3Idle = wave(t, 40 * 60_000) > 0.55;
  const lines = [
    { id: "L1", status: "running" as const, seed: 11, target: 420 },
    { id: "L2", status: "running" as const, seed: 12, target: 380 },
    {
      id: "L3",
      status: (line3Idle ? "idle" : "running") as "idle" | "running",
      seed: 13,
      target: 300,
    },
    { id: "L4", status: "running" as const, seed: 14, target: 450 },
  ].map((l) => ({
    id: l.id,
    status: l.status,
    throughput:
      l.status === "idle"
        ? 0
        : Math.round(channel(t, l.seed, l.target * 0.93, l.target * 0.06, 18 * 60_000)),
    target: l.target,
  }));

  const activeLines = lines.filter((l) => l.status === "running").length;

  // --- overview / OEE ---
  const availability = round(channel(t, 21, 94.5, 1.8, 50 * 60_000), 1);
  const performance = round(channel(t, 22, 91.0, 2.5, 35 * 60_000), 1);
  const quality = round(channel(t, 23, 98.6, 0.6, 60 * 60_000), 1);
  const oee = round((availability * performance * quality) / 10000, 1);

  // --- PLC fleet (6) ---
  const plcModels = ["S7-1500", "S7-1200", "AC500", "M580", "S7-1500", "AXC F"];
  const plc = plcModels.map((model, i) => {
    const drift = i === 3 ? channel(t, 31 + i, 9, 4, 22 * 60_000) : 0; // PLC-04 drifts
    return {
      id: `PLC-0${i + 1}`,
      model,
      status: "online" as const,
      cycleMs: round(channel(t, 31 + i, 12 + i * 2, 1.2, 15 * 60_000) + drift, 1),
    };
  });

  // --- SCADA ---
  const scada = {
    servers: [
      { id: "SCD-A", status: "online" as const, latencyMs: Math.round(channel(t, 41, 18, 6, 9 * 60_000)) },
      { id: "SCD-B", status: "online" as const, latencyMs: Math.round(channel(t, 42, 24, 8, 11 * 60_000)) },
    ],
    tagsPolled: 4862,
    updateRateMs: 500,
  };

  // --- OT network ---
  const blockedEvents = Math.max(
    0,
    Math.round(channel(t, 51, 3, 3, 45 * 60_000))
  );
  const network = {
    devices: 148,
    online: 148 - (noise(52, Math.floor(t / (10 * 60_000))) > 0.8 ? 2 : 0),
    blockedEvents,
    ids: (blockedEvents >= 5 ? "warning" : "ok") as "warning" | "ok",
  };

  // --- alarms ---
  const warm = channel(t, 61, 0, 1, 30 * 60_000) > 0.4; // Line 2 hot phase
  const counts: Record<Severity, number> = {
    critical: 0,
    high: warm ? 2 : 1,
    medium: 2 + Math.round(noise(62, Math.floor(t / (5 * 60_000))) * 2),
    low: 4 + Math.round(noise(63, Math.floor(t / (5 * 60_000))) * 3),
  };
  const recent = [
    { id: "A1", severity: "high" as const, msgKey: "m1", ts: t - 4 * 60_000 },
    { id: "A2", severity: "medium" as const, msgKey: "m2", ts: t - 11 * 60_000 },
    { id: "A3", severity: "medium" as const, msgKey: "m3", ts: t - 26 * 60_000 },
    { id: "A4", severity: "low" as const, msgKey: "m4", ts: t - 41 * 60_000 },
    { id: "A5", severity: "low" as const, msgKey: "m5", ts: t - 63 * 60_000 },
  ];

  // --- process metrics ---
  const temperature = [
    series(t, 71, "TT-101", "°C", 68, 4, 25 * 60_000),
    series(t, 72, "TT-204", "°C", warm ? 84 : 78, 5, 18 * 60_000), // Line 2 motor
    series(t, 73, "TT-310", "°C", 41, 2, 40 * 60_000),
  ];
  const pressure = [
    series(t, 81, "PT-118", "bar", 6.2, 0.5, 22 * 60_000, 2),
    series(t, 82, "PT-205", "bar", 8.4, 0.7, 16 * 60_000, 2), // Tank B
    series(t, 83, "PT-307", "bar", 3.1, 0.2, 30 * 60_000, 2),
  ];
  const flow = [
    series(t, 91, "FT-120", "m³/h", 42, 5, 20 * 60_000),
    series(t, 92, "FT-216", "m³/h", 18, 3, 26 * 60_000), // cooling loop
    series(t, 93, "FT-311", "m³/h", 64, 6, 33 * 60_000),
  ];

  // --- energy ---
  const energyHistory: number[] = [];
  for (let i = HISTORY_LEN - 1; i >= 0; i--) {
    energyHistory.push(
      Math.round(channel(t - i * STEP_MS, 95, 1240, 180, 28 * 60_000))
    );
  }
  const hourOfDay = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const energy = {
    nowKw: energyHistory[energyHistory.length - 1],
    todayKwh: Math.round(1240 * Math.max(hourOfDay, 0.1)),
    peakKw: Math.max(...energyHistory) + 95,
    history: energyHistory,
  };

  // --- AI recommendations (simulated; keys -> messages/aiP.recs) ---
  const ai = [
    { id: "R1", recKey: "r1", confidence: round(channel(t, 101, 0.86, 0.03, 60 * 60_000), 2) },
    { id: "R2", recKey: "r2", confidence: round(channel(t, 102, 0.78, 0.04, 60 * 60_000), 2) },
    { id: "R3", recKey: "r3", confidence: round(channel(t, 103, 0.71, 0.05, 60 * 60_000), 2) },
  ];

  // --- maintenance priority ---
  const maintenance = [
    { id: "M1", assetKey: "a1", priority: 1, dueDays: 3, severity: "high" as const },
    { id: "M2", assetKey: "a2", priority: 2, dueDays: 7, severity: "medium" as const },
    { id: "M3", assetKey: "a3", priority: 3, dueDays: 12, severity: "medium" as const },
    { id: "M4", assetKey: "a4", priority: 4, dueDays: 21, severity: "low" as const },
  ];

  // --- system risk score (0-100, lower better) ---
  const factors = [
    { key: "f1", weight: round(channel(t, 111, 0.34, 0.06, 30 * 60_000), 2) },
    { key: "f2", weight: round(channel(t, 112, 0.27, 0.05, 24 * 60_000), 2) },
    { key: "f3", weight: round(channel(t, 113, 0.22, 0.05, 45 * 60_000), 2) },
    { key: "f4", weight: round(channel(t, 114, 0.17, 0.03, 60 * 60_000), 2) },
  ];
  const score = Math.round(
    24 + factors.reduce((s, f) => s + f.weight * 30, 0) + (warm ? 6 : 0)
  );
  const prevScore = Math.round(
    24 +
      factors.reduce((s, f) => s + f.weight * 30, 0) +
      (channel(t - 10 * 60_000, 61, 0, 1, 30 * 60_000) > 0.4 ? 6 : 0)
  );
  const risk = {
    score,
    trend: (score > prevScore ? "up" : score < prevScore ? "down" : "flat") as
      | "up"
      | "down"
      | "flat",
    factors,
  };

  return {
    ts: t,
    overview: { oee, availability, performance, quality, activeLines, totalLines: lines.length },
    lines,
    plc,
    scada,
    network,
    alarms: { counts, recent },
    temperature,
    pressure,
    flow,
    energy,
    ai,
    maintenance,
    risk,
  };
}
