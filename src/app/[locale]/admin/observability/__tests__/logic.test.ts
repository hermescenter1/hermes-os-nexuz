import { describe, it, expect } from "vitest";
import { severityTone, sortBySeverityDesc, summaryRows, shortTime } from "../logic";

describe("Phase 92 — observability page logic", () => {
  it("validates severity tone with a safe fallback", () => {
    expect(severityTone("critical")).toBe("critical");
    expect(severityTone("nonsense")).toBe("info");
  });

  it("orders items most-severe first", () => {
    const items = [{ s: "info" }, { s: "critical" }, { s: "warning" }, { s: "error" }];
    expect(sortBySeverityDesc(items, (i) => i.s).map((i) => i.s)).toEqual([
      "critical", "error", "warning", "info",
    ]);
  });

  it("summarizes counts by count desc then event asc", () => {
    expect(summaryRows({ b: 2, a: 2, c: 5 })).toEqual([
      { event: "c", count: 5 },
      { event: "a", count: 2 },
      { event: "b", count: 2 },
    ]);
  });

  it("renders a compact timestamp and tolerates garbage", () => {
    expect(shortTime("2026-08-01T09:41:06.942Z")).toBe("2026-08-01 09:41:06Z");
    expect(shortTime("not-a-date")).toBe("—");
  });
});
