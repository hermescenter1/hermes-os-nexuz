/**
 * Executive Management Center — measurement contract.
 *
 * These tests pin the three rules the surface rests on, and each one is written
 * so that the OLD, wrong behaviour fails it:
 *
 *   · a zero baseline must not become a percentage (the `Infinity%` / `+400%`
 *     defect), and an unfinished baseline window must not be compared at all;
 *   · a source that has never reported must not classify as fresh, and a
 *     future-dated timestamp must not classify as the newest reading;
 *   · a section that is refused, broken or unimplemented must not carry data,
 *     and must always state why.
 */
import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  computeDelta,
  DEFAULT_FRESHNESS,
  emptySection,
  isTrustworthy,
  LOW_BASELINE_FLOOR,
  NON_DATA_STATUSES,
  operationalSection,
  refusedSection,
  sectionIsConsistent,
  type SectionStatus,
} from "../contract";

const COMPLETE = { baselineComplete: true };

describe("computeDelta — a percentage is only reported when one exists", () => {
  it("reports signed absolute and percent for an ordinary comparison", () => {
    expect(computeDelta({ current: 120, previous: 100, ...COMPLETE })).toEqual({
      kind: "CHANGE",
      absolute: 20,
      percent: 20,
      lowBaseline: false,
    });
    expect(computeDelta({ current: 80, previous: 100, ...COMPLETE })).toEqual({
      kind: "CHANGE",
      absolute: -20,
      percent: -20,
      lowBaseline: false,
    });
  });

  it("NEVER divides by a zero baseline — 0 to 4 is FROM_ZERO, not +400%", () => {
    const delta = computeDelta({ current: 4, previous: 0, ...COMPLETE });
    expect(delta).toEqual({ kind: "FROM_ZERO", absolute: 4 });
    // The defect this replaces: any `percent` field at all on a zero baseline.
    expect(delta).not.toHaveProperty("percent");
  });

  it("treats 0 to 0 as NO_CHANGE rather than a zero-denominator case", () => {
    expect(computeDelta({ current: 0, previous: 0, ...COMPLETE })).toEqual({ kind: "NO_CHANGE" });
  });

  it("refuses to compare against an unfinished baseline window", () => {
    expect(computeDelta({ current: 50, previous: 10, baselineComplete: false })).toEqual({
      kind: "INCOMPARABLE",
      reason: "PARTIAL_PERIOD",
    });
  });

  it("distinguishes a missing baseline from a missing current value", () => {
    expect(computeDelta({ current: 7, previous: null, ...COMPLETE })).toEqual({
      kind: "INCOMPARABLE",
      reason: "NO_BASELINE",
    });
    expect(computeDelta({ current: null, previous: 7, ...COMPLETE })).toEqual({
      kind: "INCOMPARABLE",
      reason: "NO_CURRENT",
    });
  });

  it("does not let a caller smuggle a value in as zero", () => {
    // null and 0 are different inputs and must produce different outcomes.
    const absent = computeDelta({ current: null, previous: 10, ...COMPLETE });
    const zero = computeDelta({ current: 0, previous: 10, ...COMPLETE });
    expect(absent).not.toEqual(zero);
    expect(zero).toEqual({ kind: "CHANGE", absolute: -10, percent: -100, lowBaseline: false });
  });

  it("flags a low baseline so the UI can lead with the absolute", () => {
    const delta = computeDelta({ current: 3, previous: 1, ...COMPLETE });
    expect(delta).toMatchObject({ kind: "CHANGE", absolute: 2, percent: 200, lowBaseline: true });

    const atFloor = computeDelta({ current: 6, previous: LOW_BASELINE_FLOOR, ...COMPLETE });
    expect(atFloor).toMatchObject({ lowBaseline: false });
  });

  it("rounds to one decimal and never emits -0", () => {
    const delta = computeDelta({ current: 1000, previous: 777, ...COMPLETE });
    // 223/777 = 28.6999...%
    expect(delta).toMatchObject({ percent: 28.7 });

    // A change too small to round to 0.1% must read as 0, not "-0".
    const tiny = computeDelta({ current: 1_000_000, previous: 1_000_001, ...COMPLETE });
    expect(tiny).toMatchObject({ kind: "CHANGE", percent: 0 });
    expect(Object.is((tiny as { percent: number }).percent, -0)).toBe(false);
  });

  it("rejects non-finite inputs instead of propagating Infinity or NaN", () => {
    expect(computeDelta({ current: Number.POSITIVE_INFINITY, previous: 10, ...COMPLETE })).toEqual({
      kind: "INCOMPARABLE",
      reason: "NO_CURRENT",
    });
    expect(computeDelta({ current: 10, previous: Number.NaN, ...COMPLETE })).toEqual({
      kind: "INCOMPARABLE",
      reason: "NO_BASELINE",
    });
  });
});

describe("classifyFreshness — silence is never freshness", () => {
  const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

  it("classifies a source that has never reported as NEVER, not DISCONNECTED", () => {
    const verdict = classifyFreshness({ lastSignalMs: null, nowMs: NOW });
    expect(verdict).toEqual({ freshness: "NEVER", ageMs: null, lastSignalIso: null });
    // The distinction is the point: a new install and a dead gateway differ.
    expect(verdict.freshness).not.toBe("DISCONNECTED");
  });

  it("walks FRESH -> STALE -> DISCONNECTED across the thresholds", () => {
    const at = (ageMs: number) => classifyFreshness({ lastSignalMs: NOW - ageMs, nowMs: NOW }).freshness;

    expect(at(0)).toBe("FRESH");
    expect(at(DEFAULT_FRESHNESS.freshMs)).toBe("FRESH");
    expect(at(DEFAULT_FRESHNESS.freshMs + 1)).toBe("STALE");
    expect(at(DEFAULT_FRESHNESS.disconnectedMs)).toBe("STALE");
    expect(at(DEFAULT_FRESHNESS.disconnectedMs + 1)).toBe("DISCONNECTED");
  });

  it("calls a future-dated signal INVALID rather than the newest reading", () => {
    const skewed = classifyFreshness({
      lastSignalMs: NOW + DEFAULT_FRESHNESS.clockToleranceMs + 1,
      nowMs: NOW,
    });
    expect(skewed.freshness).toBe("INVALID");
    expect(skewed.ageMs).toBeLessThan(0);
  });

  it("absorbs sub-tolerance clock jitter as FRESH with a clamped, non-negative age", () => {
    const jitter = classifyFreshness({ lastSignalMs: NOW + 5_000, nowMs: NOW });
    expect(jitter.freshness).toBe("FRESH");
    expect(jitter.ageMs).toBe(0);
  });

  it("marks NEVER, DISCONNECTED and INVALID as untrustworthy, STALE as presentable", () => {
    expect(isTrustworthy("FRESH")).toBe(true);
    expect(isTrustworthy("STALE")).toBe(true);
    expect(isTrustworthy("DISCONNECTED")).toBe(false);
    expect(isTrustworthy("NEVER")).toBe(false);
    expect(isTrustworthy("INVALID")).toBe(false);
  });

  it("honours caller-supplied thresholds", () => {
    const tight = { freshMs: 1_000, disconnectedMs: 2_000, clockToleranceMs: 0 };
    expect(classifyFreshness({ lastSignalMs: NOW - 1_500, nowMs: NOW, thresholds: tight }).freshness).toBe("STALE");
    expect(classifyFreshness({ lastSignalMs: NOW - 2_500, nowMs: NOW, thresholds: tight }).freshness).toBe("DISCONNECTED");
  });
});

describe("ExecutiveSection — only OPERATIONAL carries data, and a refusal always says why", () => {
  it("accepts an operational section with data", () => {
    const section = operationalSection({ overdueTasks: 4 });
    expect(section).toEqual({ status: "OPERATIONAL", data: { overdueTasks: 4 }, reasonKey: null });
    expect(sectionIsConsistent(section)).toBe(true);
  });

  it("carries no data for FORBIDDEN, UNAVAILABLE or NO_SOURCE, and always a reason", () => {
    for (const status of NON_DATA_STATUSES) {
      const section = refusedSection<{ x: number }>(
        status as Extract<SectionStatus, "FORBIDDEN" | "UNAVAILABLE" | "NO_SOURCE">,
        `executive.reasons.${status}`,
      );
      expect(section.data).toBeNull();
      expect(section.reasonKey).toBe(`executive.reasons.${status}`);
      expect(sectionIsConsistent(section)).toBe(true);
    }
  });

  it("keeps EMPTY distinct from NO_SOURCE", () => {
    const empty = emptySection<{ x: number }>("executive.reasons.noRowsYet");
    const missing = refusedSection<{ x: number }>("NO_SOURCE", "executive.reasons.notImplemented");
    expect(empty.status).toBe("EMPTY");
    expect(missing.status).toBe("NO_SOURCE");
    expect(empty.status).not.toBe(missing.status);
  });

  it("rejects an OPERATIONAL section with no data — the plausible-empty-panel bug", () => {
    expect(sectionIsConsistent({ status: "OPERATIONAL", data: null, reasonKey: null })).toBe(false);
  });

  it("rejects a refusal that smuggles data or omits its reason", () => {
    expect(sectionIsConsistent({ status: "FORBIDDEN", data: { x: 1 }, reasonKey: "r" })).toBe(false);
    expect(sectionIsConsistent({ status: "UNAVAILABLE", data: null, reasonKey: null })).toBe(false);
    expect(sectionIsConsistent({ status: "NO_SOURCE", data: null, reasonKey: "" })).toBe(false);
  });
});
