import { describe, it, expect } from "vitest";
import {
  buildCommandModel,
  deriveAttention,
  deriveEvidence,
  deriveReadiness,
} from "../command-logic";
import { posture } from "../severity";
import type { DashboardSnapshot } from "@/lib/services/types";

/**
 * PHASE 87F — the command surface is derived PURELY from real snapshot fields.
 * These tests pin that traceability: no fabricated values, correct
 * prioritization, and honest posture/readiness/evidence mapping.
 */

function snap(over: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    ts: 1_700_000_000_000,
    overview: { oee: 82, availability: 90, performance: 88, quality: 95, activeLines: 5, totalLines: 6 },
    lines: [],
    plc: [
      { id: "PLC-1", model: "S7", status: "online", cycleMs: 10 },
      { id: "PLC-2", model: "S7", status: "online", cycleMs: 12 },
    ],
    scada: { servers: [{ id: "SC-1", status: "online", latencyMs: 5 }], tagsPolled: 100, updateRateMs: 500 },
    network: { devices: 10, online: 10, blockedEvents: 0, ids: "ok" },
    alarms: {
      counts: { critical: 0, high: 0, medium: 0, low: 0 },
      recent: [],
    },
    temperature: [], pressure: [], flow: [],
    energy: { nowKw: 100, todayKwh: 1000, peakKw: 150, history: [1, 2, 3] },
    ai: [],
    maintenance: [],
    risk: { score: 20, trend: "flat", factors: [{ key: "a", weight: 0.2 }] },
    ...over,
  };
}

describe("posture — from real severity counts", () => {
  it("critical count wins, then high, else operational", () => {
    expect(posture(1, 3)).toBe("critical");
    expect(posture(0, 2)).toBe("elevated");
    expect(posture(0, 0)).toBe("operational");
  });
});

describe("deriveAttention — only decision-relevant items, prioritized", () => {
  it("surfaces only critical/high alarms and assets, sorted by severity", () => {
    const s = snap({
      alarms: {
        counts: { critical: 1, high: 1, medium: 5, low: 9 },
        recent: [
          { id: "a1", severity: "low", msgKey: "k1", ts: 5 },
          { id: "a2", severity: "critical", msgKey: "k2", ts: 10 },
          { id: "a3", severity: "high", msgKey: "k3", ts: 8 },
          { id: "a4", severity: "medium", msgKey: "k4", ts: 9 },
        ],
      },
      maintenance: [
        { id: "m1", assetKey: "asset1", priority: 1, dueDays: 3, severity: "high" },
        { id: "m2", assetKey: "asset2", priority: 2, dueDays: 1, severity: "low" },
      ],
    });
    const items = deriveAttention(s);
    // low/medium excluded; critical first
    expect(items.map((i) => i.severity)).toEqual(["critical", "high", "high"]);
    expect(items[0].kind).toBe("criticalAlarm");
    expect(items.every((i) => i.severity === "critical" || i.severity === "high")).toBe(true);
    // destinations are real dashboard routes
    expect(items[0].href).toBe("/dashboard/operations");
    expect(items.find((i) => i.id.startsWith("asset-"))?.href).toBe("/dashboard/predictive");
  });

  it("returns an empty list when nothing is critical/high (drives the calm empty state)", () => {
    expect(deriveAttention(snap())).toEqual([]);
  });

  it("caps the list so the panel stays scannable", () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, severity: "critical" as const, msgKey: "k", ts: i }));
    const items = deriveAttention(snap({ alarms: { counts: { critical: 12, high: 0, medium: 0, low: 0 }, recent } }), 6);
    expect(items.length).toBe(6);
  });
});

describe("deriveEvidence — transparent mapping from real signals", () => {
  it("counts healthy signals as supported and offline devices as missing", () => {
    const e = deriveEvidence(snap());
    // 2 online PLC + 1 online SCADA + ids ok(1) + no-critical(1) = 5 supported
    expect(e.supported).toBe(5);
    expect(e.watch).toBe(0);
    expect(e.missing).toBe(0);
  });

  it("moves offline devices / degraded IDS into missing, warnings into watch", () => {
    const e = deriveEvidence(
      snap({
        network: { devices: 10, online: 8, blockedEvents: 0, ids: "degraded" },
        plc: [{ id: "P1", model: "S7", status: "fault", cycleMs: 0 }],
        alarms: { counts: { critical: 0, high: 2, medium: 1, low: 0 }, recent: [] },
      }),
    );
    expect(e.missing).toBe(2 + 1 + 1); // 2 offline devices + 1 offline plc + degraded ids
    expect(e.watch).toBe(2 + 1); // high + medium alarms
  });
});

describe("deriveReadiness — honest discrete band", () => {
  it("hold on any critical or very high risk; guarded mid; ready when clear", () => {
    expect(deriveReadiness(10, 1)).toBe("hold");
    expect(deriveReadiness(80, 0)).toBe("hold");
    expect(deriveReadiness(60, 0)).toBe("guarded");
    expect(deriveReadiness(20, 0)).toBe("ready");
  });
});

describe("buildCommandModel — every field traces to the snapshot", () => {
  it("passes through the real risk object and ts unchanged", () => {
    const s = snap({ risk: { score: 42, trend: "down", factors: [{ key: "x", weight: 0.5 }] } });
    const m = buildCommandModel(s);
    expect(m.risk).toEqual(s.risk); // not recomputed / fabricated
    expect(m.ts).toBe(s.ts);
    expect(m.activeLines).toBe(s.overview.activeLines);
    expect(m.totalLines).toBe(s.overview.totalLines);
    expect(m.posture).toBe("operational");
    expect(m.readiness).toBe("ready");
  });
});
