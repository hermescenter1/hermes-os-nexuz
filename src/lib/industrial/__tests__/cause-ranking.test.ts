import { describe, it, expect } from "vitest";
import { runPipeline } from "../pipeline";
import { caseSimilarity, SIMILARITY_THRESHOLD } from "../cause-ranking";

describe("Cause Ranking Engine (case-memory-bias fix)", () => {
  it("headline example: switch replacement query does NOT get the CPU-replacement case cause", () => {
    const p = runPipeline(
      "Siemens S7-1500 loses PROFINET communication with WinCC after replacing an industrial switch",
      "en"
    );
    expect(p.rootCause).toBeDefined();
    // the old (biased) primary must be gone
    expect(p.rootCause!.primary).not.toMatch(/CPU|device name/i);
    // a switch-related cause must lead
    expect(p.rootCause!.primary).toMatch(/switch/i);
    // the stored case survives only as a low-confidence hint
    if (p.caseMatches.length > 0) {
      expect(p.rootCause!.relatedCase?.lowConfidence).toBe(true);
      expect(p.rootCause!.relatedCase!.similarity).toBeLessThan(SIMILARITY_THRESHOLD);
    }
  });

  it("Test 1 (spec): 'Switch replaced during maintenance' ranks switch config above CPU replacement", () => {
    const p = runPipeline("Switch replaced during maintenance on the line network", "en");
    expect(p.rootCause).toBeDefined();
    const ranking = p.rootCause!.ranking!;
    const switchIdx = ranking.findIndex((r) => /switch/i.test(r.label));
    const cpuIdx = ranking.findIndex((r) => /CPU/i.test(r.label));
    expect(switchIdx).toBeGreaterThanOrEqual(0);
    if (cpuIdx >= 0) expect(switchIdx).toBeLessThan(cpuIdx);
    expect(p.rootCause!.primary).toMatch(/switch/i);
  });

  it("Test 2 (spec): 'CPU swapped and devices offline' ranks device name/IP high", () => {
    const p = runPipeline("PLC CPU swapped and devices offline", "en");
    expect(p.rootCause).toBeDefined();
    expect(p.rootCause!.primary).toMatch(/device name|IP/i);
  });

  it("Test 3 (spec): intermittent communication fault yields MULTIPLE ranked candidates", () => {
    const p = runPipeline("Unknown intermittent communication fault on the network", "en");
    expect(p.rootCause).toBeDefined();
    const total =
      1 +
      p.rootCause!.secondary.length +
      (p.rootCause!.alternative?.length ?? 0);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(p.rootCause!.ranking!.length).toBeGreaterThanOrEqual(2);
  });

  it("evidence validation: case causes without query keywords are never primary/secondary", () => {
    const p = runPipeline(
      "Siemens S7-1500 loses PROFINET communication with WinCC after replacing an industrial switch",
      "en"
    );
    const shown = [p.rootCause!.primary, ...p.rootCause!.secondary].join(" ");
    expect(shown).not.toMatch(/replacement CPU/i);
  });

  it("similarity threshold: the exact stored-case scenario IS still promoted (>= 70)", () => {
    // regression guard: the bias fix must not break legitimate case promotion
    const p = runPipeline("ABB ACS580 fault 2310 during acceleration", "en");
    expect(p.rootCause!.primary).toBe("Acceleration ramp too short");
    expect(p.rootCause!.correctiveActions).toContain("Increase ramp time");
  });

  it("caseSimilarity measures keyword coverage with partial-token credit", () => {
    const kws = ["acs580", "2310", "overcurrent", "acceleration"];
    expect(caseSimilarity(kws, "ABB ACS580 fault 2310 during acceleration")).toBeGreaterThanOrEqual(70);
    expect(caseSimilarity(kws, "switch replaced during maintenance")).toBe(0);
  });

  it("output always offers more than one cause when candidates exist", () => {
    const p = runPipeline("motor running hot with phase imbalance on the feeder", "en");
    expect(p.rootCause).toBeDefined();
    expect(
      p.rootCause!.secondary.length + (p.rootCause!.alternative?.length ?? 0)
    ).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic", () => {
    const q = "Siemens S7-1500 loses PROFINET communication after replacing an industrial switch";
    const a = runPipeline(q, "en");
    const b = runPipeline(q, "en");
    expect(a.rootCause).toEqual(b.rootCause);
  });

  it("localizes ranked output to Persian", () => {
    const p = runPipeline("سوییچ صنعتی تعویض شده و ارتباط شبکه قطع و وصل می‌شود", "fa");
    expect(p.rootCause).toBeDefined();
    expect(p.rootCause!.primary).toMatch(/سوییچ/);
  });
});
