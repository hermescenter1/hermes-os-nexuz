import { describe, it, expect } from "vitest";
import { runRetrieval } from "../retrieval-engine";
import { scoreCase } from "../evidence-score";
import { bandFor, deriveConfidence } from "../evidence-ranker";
import { CASES } from "@/lib/industrial/cases";

describe("Hybrid Retrieval Engine (Phase 10)", () => {
  it("Test 1: ABB ACS580 overcurrent during acceleration -> ACS580 case, drives knowledge, High", () => {
    // With drives detected exactly (as the classifier does for explicit drive
    // vocabulary), the vendor-matched case + drive knowledge reach High.
    const r = runRetrieval({
      text: "ABB ACS580 drive overcurrent during acceleration ramp of the mixer",
      domains: ["drives", "electrical"],
      vendors: ["abb"],
    });
    expect(r.topCases[0].id).toBe("case-abb-acs580-oc");
    expect(r.topKnowledge.some((k) => k.domain === "drives" || k.id === "vfd")).toBe(true);
    expect(r.confidenceBand).toBe("high");
    expect(r.ranking.length).toBeGreaterThan(0);
  });

  it("Test 2: Siemens S7-1500 loses PROFINET after switch replacement -> Siemens case + protocols knowledge, High", () => {
    const r = runRetrieval({
      text: "Siemens S7-1500 loses PROFINET communication after switch replacement",
      domains: ["otNetwork", "plc"],
      vendors: ["siemens"],
    });
    expect(r.topCases[0].vendor).toBe("siemens");
    expect(r.topKnowledge.length).toBeGreaterThan(0);
    expect(r.confidenceBand).toBe("high");
  });

  it("Test 3: WinCC alarms update but process values frozen -> SCADA case + SCADA knowledge, Medium/High", () => {
    const r = runRetrieval({
      text: "WinCC alarms update but process values frozen",
      domains: ["scada"],
      vendors: [],
    });
    expect(r.topKnowledge.length).toBeGreaterThan(0);
    expect(["medium", "high"]).toContain(r.confidenceBand);
  });

  it("case scoring follows the documented model (domain+vendor+kw+rootcause, max 100)", () => {
    const acs = CASES.find((c) => c.id === "case-abb-acs580-oc")!;
    const s = scoreCase(acs, "ACS580 overcurrent acceleration ramp", ["drives"], ["abb"]);
    const sum = s.breakdown.reduce((a, b) => a + b.points, 0);
    expect(s.score).toBe(Math.min(sum, 100));
    expect(s.breakdown.find((b) => b.label === "domain")!.points).toBe(30);
    expect(s.breakdown.find((b) => b.label === "vendor")!.points).toBe(30);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it("confidence is non-fixed and banded correctly", () => {
    expect(bandFor(0.7)).toBe("high");
    expect(bandFor(0.69)).toBe("medium");
    expect(bandFor(0.4)).toBe("medium");
    expect(bandFor(0.39)).toBe("low");
    const hi = deriveConfidence([{ kind: "case", id: "x", vendor: "abb", domain: "drives", score: 90, breakdown: [] }], [{ kind: "knowledge", id: "vfd", domain: "drives", score: 80, breakdown: [] }], 1);
    const lo = deriveConfidence([], [], 0);
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it("returns at most top 3 of each kind", () => {
    const r = runRetrieval({ text: "drive overcurrent motor protection plc scada network", domains: ["drives", "motors", "electrical", "plc", "scada", "otNetwork"], vendors: ["abb"] });
    expect(r.topCases.length).toBeLessThanOrEqual(3);
    expect(r.topKnowledge.length).toBeLessThanOrEqual(3);
  });

  it("is deterministic", () => {
    const input = { text: "ABB ACS580 overcurrent during acceleration", domains: ["drives" as const], vendors: ["abb"] };
    expect(runRetrieval(input)).toEqual(runRetrieval(input));
  });

  it("ranking is sorted highest-evidence-first", () => {
    const r = runRetrieval({ text: "ABB ACS580 overcurrent during acceleration", domains: ["drives"], vendors: ["abb"] });
    for (let i = 1; i < r.ranking.length; i++) {
      expect(r.ranking[i - 1].score).toBeGreaterThanOrEqual(r.ranking[i].score);
    }
  });

  describe("Phase 14B — vector-search seam (pass-through only, no fusion yet)", () => {
    it("reports strategy 'keyword' and omits vectorMatches when none are supplied", () => {
      const r = runRetrieval({ text: "ABB ACS580 overcurrent during acceleration", domains: ["drives"], vendors: ["abb"] });
      expect(r.strategy).toBe("keyword");
      expect(r.vectorMatches).toBeUndefined();
    });

    it("reports strategy 'hybrid' and passes vectorMatches through unchanged when supplied", () => {
      const vectorMatches = [
        { chunk: { id: "c1", documentId: "d1", sourceType: "knowledge", text: "x", position: 0 }, score: 0.9 },
      ];
      const r = runRetrieval({
        text: "ABB ACS580 overcurrent during acceleration",
        domains: ["drives"],
        vendors: ["abb"],
        vectorMatches,
      });
      expect(r.strategy).toBe("hybrid");
      expect(r.vectorMatches).toEqual(vectorMatches);
      // the keyword scoring/ranking is completely unaffected by their presence
      expect(r.topCases[0]?.id).toBe("case-abb-acs580-oc");
    });

    it("treats an empty vectorMatches array the same as omitted (strategy stays 'keyword')", () => {
      const r = runRetrieval({
        text: "ABB ACS580 overcurrent during acceleration",
        domains: ["drives"],
        vendors: ["abb"],
        vectorMatches: [],
      });
      expect(r.strategy).toBe("keyword");
      expect(r.vectorMatches).toBeUndefined();
    });
  });
});
