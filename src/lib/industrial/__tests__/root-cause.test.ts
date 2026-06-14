import { describe, it, expect } from "vitest";
import { buildRootCause } from "../root-cause";
import { runPipeline } from "../pipeline";
import { matchCases } from "../cases";

describe("Case-Driven Root Cause Engine (Step 8)", () => {
  it("Test 1 (spec): ABB ACS580 fault 2310 — vendor, case, root cause", () => {
    const pipe = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    expect(pipe.vendors).toContain("abb");
    expect(pipe.caseMatches.length).toBeGreaterThan(0);
    expect(pipe.caseMatches[0].case.id).toBe("case-abb-acs580-oc");
    expect(pipe.rootCause).toBeDefined();
    expect(pipe.rootCause!.primary).toBe("Acceleration ramp too short");
    expect(pipe.rootCause!.secondary).toContain("Incorrect motor data");
    expect(pipe.rootCause!.secondary).toContain("Excessive load inertia");
    expect(pipe.rootCause!.verification).toContain("Trend motor current");
    expect(pipe.rootCause!.correctiveActions).toContain("Increase ramp time");
    expect(pipe.steps.map((s) => s.id)).toContain("rootCauseAnalysis");
  });

  it("Test 2 (spec): Siemens S7-1500 watchdog from SCL loop", () => {
    const pipe = runPipeline(
      "Siemens S7-1500 cycle watchdog timeout caused by SCL loop overrun",
      "en"
    );
    expect(pipe.vendors).toContain("siemens");
    expect(pipe.caseMatches[0]?.case.id).toBe("case-siemens-1500-scan");
    expect(pipe.rootCause?.primary).toMatch(/Unbounded SCL loop/);
  });

  it("Test 3 (spec): unknown intermittent issue — no case, behavior preserved", () => {
    const pipe = runPipeline("Unknown intermittent PLC issue on line 3", "en");
    expect(pipe.caseMatches.length).toBe(0);
    expect(pipe.rootCause).toBeUndefined();
    expect(pipe.causeSource.kind).toBe("library");
  });

  it("localizes root cause output to Persian", () => {
    const pipe = runPipeline("درایو ACS580 هنگام شتاب‌گیری خطای ۲۳۱۰ اضافه‌جریان می‌دهد", "fa");
    // Ranking spec: FA case-keyword coverage stays below the promotion
    // threshold, so the catalog supplies the (same) ramp diagnosis.
    expect(pipe.rootCause?.primary).toMatch(/رمپ شتاب/);
    expect(pipe.rootCause?.verification.join(" ")).toMatch(/جریان موتور/);
  });

  it("deduplicates and excludes the primary from secondary causes", () => {
    const matches = matchCases("acs580 overcurrent acceleration ramp", ["drives"], ["abb"]);
    const rc = buildRootCause(matches, "en")!;
    expect(rc.secondary).not.toContain(rc.primary);
    expect(new Set(rc.secondary).size).toBe(rc.secondary.length);
  });

  it("confidence gains +0.05 vendor∧case bonus, still capped at 0.90", () => {
    const withBoth = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    expect(withBoth.vendors.length).toBeGreaterThan(0);
    expect(withBoth.caseMatches.length).toBeGreaterThan(0);
    expect(withBoth.confidence).toBeLessThanOrEqual(0.9);
    // same fault signature without the vendor/case pairing scores lower
    const without = runPipeline("drive overcurrent during acceleration", "en");
    expect(withBoth.confidence).toBeGreaterThan(without.confidence);
  });

  it("is deterministic", () => {
    const a = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    const b = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    expect(a.rootCause).toEqual(b.rootCause);
    expect(a.confidence).toBe(b.confidence);
  });
});
