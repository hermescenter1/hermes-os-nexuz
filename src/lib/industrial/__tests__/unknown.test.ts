import { describe, it, expect } from "vitest";
import { runPipeline } from "../pipeline";
import { DOMAIN_THRESHOLD } from "../brain-core";

describe("Unknown / Fallback Classification Layer", () => {
  it("Test 1 (spec): 'The machine behaves strangely' -> Unknown", () => {
    const p = runPipeline("The machine behaves strangely", "en");
    expect(p.unknown).toBe(true);
    expect(p.domains).toEqual([]);
    expect(p.libraries).toEqual([]); // retrieval disabled
    expect(p.riskLevel).toBe("unknown");
  });

  it("Test 2 (spec): 'Unexpected issue' -> Unknown", () => {
    const p = runPipeline("Unexpected issue", "en");
    expect(p.unknown).toBe(true);
    expect(p.domains).toEqual([]);
  });

  it("Test 3 (spec): 'Motor winding smells burned' -> Motors", () => {
    const p = runPipeline("Motor winding smells burned", "en");
    expect(p.unknown).toBe(false);
    expect(p.domains[0].id).toBe("motors");
  });

  it("Test 4 (spec): 'WinCC alarms updating but values frozen' -> SCADA", () => {
    const p = runPipeline("WinCC alarms updating but values frozen", "en");
    expect(p.unknown).toBe(false);
    expect(p.domains[0].id).toBe("scada");
  });

  it("Test 5 (spec): '415V MCC feeder trips after breaker close' -> Electrical", () => {
    const p = runPipeline("415V MCC feeder trips after breaker close", "en");
    expect(p.unknown).toBe(false);
    expect(p.domains[0].id).toBe("electrical");
  });

  it("false positive guard: 'The machine feels weird' is NOT Motors", () => {
    const p = runPipeline("The machine feels weird", "en");
    expect(p.unknown).toBe(true);
    expect(p.domains.map((d) => d.id)).not.toContain("motors");
  });

  it("false positive guard: 'Something changed after maintenance' is NOT Maintenance", () => {
    const p = runPipeline("Something changed after maintenance", "en");
    expect(p.unknown).toBe(true);
    expect(p.domains.map((d) => d.id)).not.toContain("maintenance");
  });

  it("Persian vague query -> Unknown", () => {
    const p = runPipeline("یک مشکلی پیش آمده و دستگاه درست کار نمی‌کند", "fa");
    expect(p.unknown).toBe(true);
  });

  it("Unknown confidence is always Low (<= 0.39)", () => {
    for (const q of ["Something is wrong", "Production is unstable", "Unexpected issue after maintenance"]) {
      const p = runPipeline(q, "en");
      expect(p.unknown).toBe(true);
      expect(p.confidence).toBeLessThanOrEqual(0.39);
    }
  });

  it("case rescue: weak keywords but exact case signature stays Known", () => {
    // 'fault' alone is a weak term; the ACS580+2310 case signature rescues it
    const p = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    expect(p.unknown).toBe(false);
    expect(p.domains[0].id).toBe("drives");
    expect(p.caseMatches.length).toBeGreaterThan(0);
    expect(p.confidence).toBeLessThanOrEqual(0.9);
  });

  it("threshold is exported and enforced", () => {
    expect(DOMAIN_THRESHOLD).toBeGreaterThanOrEqual(2);
  });

  it("unknown result disables case matching and evidence", () => {
    const p = runPipeline("The machine behaves strangely", "en");
    expect(p.caseMatches).toEqual([]);
    expect(p.evidenceScore).toBe(0);
  });
});
