import { describe, it, expect } from "vitest";
import {
  counterSeries,
  counterTotal,
  histogramStat,
  seriesMax,
  barPercent,
  dependencyTone,
  latencyTone,
  backupTone,
  limiterTone,
  worstTone,
  formatUptime,
  formatBytes,
  formatAgeHours,
  auditOutcomeDistribution,
} from "../logic";

/**
 * PHASE 93 — Control-Room presentation logic. Proves every shaping helper is
 * DERIVED from real collected data and NEVER invents a value: an unrecorded
 * metric yields an empty series (not a zero-filled placeholder), and tone
 * mapping is faithful to the real thresholds.
 */

describe("counterSeries / counterTotal", () => {
  const snapshot = {
    errors_total: [
      { labels: { severity: "error" }, value: 3 },
      { labels: { severity: "critical" }, value: 1 },
      { labels: { severity: "warning" }, value: 5 },
    ],
  };

  it("builds one real bar per label, sorted by value desc, with severity tone", () => {
    const s = counterSeries(snapshot, "errors_total", "severity", { toneByLabel: true });
    expect(s.map((p) => [p.label, p.value])).toEqual([
      ["warning", 5],
      ["error", 3],
      ["critical", 1],
    ]);
    expect(s.find((p) => p.label === "critical")?.tone).toBe("danger");
    expect(s.find((p) => p.label === "warning")?.tone).toBe("warning");
  });

  it("returns an EMPTY series for an unrecorded metric (no fabricated zero bar)", () => {
    expect(counterSeries(snapshot, "http_requests_total", "status")).toEqual([]);
    expect(counterTotal(snapshot, "http_requests_total")).toBe(0);
  });

  it("labels an overflow-folded series as 'overflow'", () => {
    const s = counterSeries({ m: [{ labels: { overflow: "true" }, value: 9 }] }, "m", "status");
    expect(s[0]).toEqual({ label: "overflow", value: 9 });
  });

  it("sums all sample values", () => {
    expect(counterTotal(snapshot, "errors_total")).toBe(9);
  });
});

describe("histogramStat", () => {
  const snapshot = {
    dependency_latency_ms: [
      { labels: { dependency: "database" }, count: 10, sum: 250, avgMs: 25 },
    ],
  };
  it("returns the matching dependency's real stat", () => {
    expect(histogramStat(snapshot, "dependency_latency_ms", "dependency", "database")).toEqual({
      count: 10,
      sum: 250,
      avgMs: 25,
    });
  });
  it("returns null when the dependency has no probe sample (not a zero)", () => {
    expect(histogramStat(snapshot, "dependency_latency_ms", "dependency", "redis")).toBeNull();
    expect(histogramStat({}, "dependency_latency_ms", "dependency", "database")).toBeNull();
  });
});

describe("bar scaling", () => {
  it("seriesMax + barPercent scale against the real max, guarding zero", () => {
    const pts = [{ label: "a", value: 2 }, { label: "b", value: 8 }];
    const max = seriesMax(pts);
    expect(max).toBe(8);
    expect(barPercent(8, max)).toBe(100);
    expect(barPercent(2, max)).toBe(25);
    expect(barPercent(5, 0)).toBe(0); // no divide-by-zero
  });
});

describe("tone mapping", () => {
  it("dependencyTone: null=neutral (not probed), true=success, false=danger", () => {
    expect(dependencyTone(null)).toBe("neutral");
    expect(dependencyTone(true)).toBe("success");
    expect(dependencyTone(false)).toBe("danger");
  });
  it("latencyTone respects warn/critical thresholds; null=neutral", () => {
    expect(latencyTone(null, 800, 2000)).toBe("neutral");
    expect(latencyTone(10, 800, 2000)).toBe("success");
    expect(latencyTone(900, 800, 2000)).toBe("warning");
    expect(latencyTone(2500, 800, 2000)).toBe("danger");
  });
  it("backupTone: no backup=danger, stale=warning, unverified=warning, fresh+verified=success", () => {
    expect(backupTone(null, null)).toBe("danger");
    expect(backupTone(30, true)).toBe("warning");
    expect(backupTone(2, null)).toBe("warning");
    expect(backupTone(2, false)).toBe("danger");
    expect(backupTone(2, true)).toBe("success");
  });
  it("limiterTone: degraded=warning (fallback active), else success", () => {
    expect(limiterTone(true)).toBe("warning");
    expect(limiterTone(false)).toBe("success");
  });
  it("worstTone bubbles up the most severe tone", () => {
    expect(worstTone(["success", "warning", "success"])).toBe("warning");
    expect(worstTone(["success", "danger", "warning"])).toBe("danger");
    expect(worstTone([])).toBe("neutral");
  });
});

describe("formatters", () => {
  it("formatUptime", () => {
    expect(formatUptime(90)).toBe("1m");
    expect(formatUptime(3720)).toBe("1h 02m");
    expect(formatUptime(273120)).toBe("3d 03h 52m");
    expect(formatUptime(-1)).toBe("—");
  });
  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(null)).toBe("—");
  });
  it("formatAgeHours", () => {
    expect(formatAgeHours(0.5)).toBe("30m");
    expect(formatAgeHours(5)).toBe("5h");
    expect(formatAgeHours(72)).toBe("3d");
    expect(formatAgeHours(null)).toBe("—");
  });
});

describe("auditOutcomeDistribution", () => {
  it("counts real outcomes with faithful tones, unspecified for blanks", () => {
    const dist = auditOutcomeDistribution([
      { outcome: "success" }, { outcome: "success" }, { outcome: "failed" }, { outcome: null }, {},
    ]);
    expect(dist.find((d) => d.label === "success")).toEqual({ label: "success", value: 2, tone: "success" });
    expect(dist.find((d) => d.label === "failed")).toEqual({ label: "failed", value: 1, tone: "danger" });
    expect(dist.find((d) => d.label === "unspecified")?.value).toBe(2);
  });
  it("returns [] for no events", () => {
    expect(auditOutcomeDistribution([])).toEqual([]);
  });
});
