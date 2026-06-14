import { describe, it, expect } from "vitest";
import {
  computeConfidence,
  classify,
  vendorCertainty,
  type ConfidenceInput,
} from "../confidence";

describe("Confidence Engine (Step 8C, deterministic)", () => {
  it("classifies at the exact spec band boundaries", () => {
    expect(classify(100)).toBe("expert");
    expect(classify(90)).toBe("expert");
    expect(classify(89)).toBe("high");
    expect(classify(70)).toBe("high");
    expect(classify(69)).toBe("medium");
    expect(classify(50)).toBe("medium");
    expect(classify(49)).toBe("low");
    expect(classify(0)).toBe("low");
  });

  it("is deterministic: identical input, identical output", () => {
    const input: ConfidenceInput = {
      domainConfidence: 0.84,
      vendorConfidence: 1,
      caseMatches: 2,
      evidenceCount: 5,
    };
    expect(computeConfidence(input)).toEqual(computeConfidence(input));
  });

  it("computes the documented weighted sum", () => {
    // 0.8*50 + 1*15 + 2*8 + 4*2 = 40+15+16+8 = 79 -> high
    const r = computeConfidence({
      domainConfidence: 0.8,
      vendorConfidence: 1,
      caseMatches: 2,
      evidenceCount: 4,
    });
    expect(r.score).toBe(79);
    expect(r.classification).toBe("high");
  });

  it("can reach every band with realistic inputs", () => {
    // expert: strong domain + vendor + 3 cases + rich evidence
    expect(
      computeConfidence({ domainConfidence: 0.9, vendorConfidence: 1, caseMatches: 3, evidenceCount: 6 }).classification
    ).toBe("expert"); // 45+15+24+12 = 96
    // high
    expect(
      computeConfidence({ domainConfidence: 0.85, vendorConfidence: 1, caseMatches: 1, evidenceCount: 4 }).classification
    ).toBe("high"); // 42.5+15+8+8 = 74
    // medium: domain-only with some evidence
    expect(
      computeConfidence({ domainConfidence: 0.85, vendorConfidence: 0, caseMatches: 0, evidenceCount: 4 }).classification
    ).toBe("medium"); // 42.5+8 = 51
    // low: weak fallback signal
    expect(
      computeConfidence({ domainConfidence: 0.3, vendorConfidence: 0, caseMatches: 0, evidenceCount: 1 }).classification
    ).toBe("low"); // 15+2 = 17
  });

  it("clamps to 100 and never exceeds it", () => {
    const r = computeConfidence({
      domainConfidence: 1,
      vendorConfidence: 1,
      caseMatches: 10,
      evidenceCount: 50,
    });
    expect(r.score).toBe(100);
    expect(r.classification).toBe("expert");
  });

  it("caps case and evidence contributions (no runaway stacking)", () => {
    const base = { domainConfidence: 0.5, vendorConfidence: 0 };
    const at3 = computeConfidence({ ...base, caseMatches: 3, evidenceCount: 6 });
    const at9 = computeConfidence({ ...base, caseMatches: 9, evidenceCount: 18 });
    expect(at9.score).toBe(at3.score);
  });

  it("is monotonic: more corroboration never lowers the score", () => {
    const base: ConfidenceInput = {
      domainConfidence: 0.6,
      vendorConfidence: 0.7,
      caseMatches: 0,
      evidenceCount: 2,
    };
    const s0 = computeConfidence(base).score;
    const s1 = computeConfidence({ ...base, caseMatches: 1 }).score;
    const s2 = computeConfidence({ ...base, caseMatches: 2, evidenceCount: 4 }).score;
    expect(s1).toBeGreaterThanOrEqual(s0);
    expect(s2).toBeGreaterThanOrEqual(s1);
  });

  it("treats multiple competing vendors as ambiguity, not strength", () => {
    expect(vendorCertainty(0)).toBe(0);
    expect(vendorCertainty(1)).toBe(1);
    expect(vendorCertainty(2)).toBeLessThan(vendorCertainty(1));
    expect(vendorCertainty(5)).toBeLessThanOrEqual(vendorCertainty(2));
  });

  it("handles out-of-range inputs safely", () => {
    const r = computeConfidence({
      domainConfidence: -0.5,
      vendorConfidence: 2,
      caseMatches: -3,
      evidenceCount: -1,
    });
    expect(r.score).toBe(15); // 0 + 15 + 0 + 0
    expect(r.classification).toBe("low");
  });
});
