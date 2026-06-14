import { describe, it, expect } from "vitest";
import { runReasoning, type ReasoningInput } from "../reasoning";

const base: Omit<ReasoningInput, "text"> = {
  domains: [],
  vendors: [],
  caseIds: [],
  libraries: [],
  baseRisk: "low",
};

describe("Engineering Reasoning Engine (deterministic, no LLM)", () => {
  it("fires the Siemens PROFINET rule per the Step 8A specification example", () => {
    const r = runReasoning(
      {
        ...base,
        text: "PROFINET communication loss to remote IO after maintenance",
        domains: ["plc", "otNetwork"],
        vendors: ["siemens"],
        libraries: ["s7comm", "protocols", "plcBasics"],
        caseIds: ["case-siemens-1200-bf"],
      },
      "en"
    );
    expect(r.probableCauses).toContain(
      "PROFINET device name mismatch after hardware replacement"
    );
    expect(r.probableCauses.join(" ")).toMatch(/Duplicate IP/);
    expect(r.probableCauses.join(" ")).toMatch(/Switch buffering/);
    expect(r.probableCauses.join(" ")).toMatch(/IRT timing/);
    expect(r.recommendedActions.join(" ")).toMatch(/Verify topology/);
    expect(r.recommendedActions.join(" ")).toMatch(/diagnostics buffer/);
    expect(r.evidence.join(" ")).toMatch(/Siemens communication libraries/);
    expect(r.evidence).toContain("Knowledge library: s7comm");
    expect(r.evidence).toContain("Engineering case: case-siemens-1200-bf");
    expect(r.riskLevel).toBe("medium");
  });

  it("is fully deterministic: identical input yields identical output", () => {
    const input: ReasoningInput = {
      ...base,
      text: "VFD overcurrent during acceleration of the mixer",
      domains: ["drives"],
      libraries: ["vfd", "motors"],
    };
    const a = runReasoning(input, "en");
    const b = runReasoning(input, "en");
    expect(a).toEqual(b);
  });

  it("matches Persian keywords and returns Persian output", () => {
    const r = runReasoning(
      {
        ...base,
        text: "درایو هنگام شتاب‌گیری اضافه‌جریان می‌دهد",
        domains: ["drives"],
        libraries: ["vfd"],
      },
      "fa"
    );
    expect(r.riskLevel).toBe("high");
    expect(r.probableCauses.join(" ")).toMatch(/رمپ شتاب/);
    expect(r.recommendedActions.join(" ")).toMatch(/تاریخچهٔ کامل خطای درایو/);
    expect(r.evidence).toContain("کتابخانهٔ دانش: vfd");
  });

  it("falls back to structured triage when no rule fires", () => {
    const r = runReasoning(
      { ...base, text: "something is generally not right today", domains: ["maintenance"] },
      "en"
    );
    expect(r.probableCauses.length).toBeGreaterThan(0);
    expect(r.recommendedActions.join(" ")).toMatch(/Half-split/);
    expect(r.riskLevel).toBe("low"); // baseRisk passthrough
  });

  it("never lowers risk below the pipeline's base risk", () => {
    const r = runReasoning(
      {
        ...base,
        text: "modbus timeout on the meter", // low-risk rule
        domains: ["otNetwork"],
        baseRisk: "high",
      },
      "en"
    );
    expect(r.riskLevel).toBe("high");
  });

  it("escalates risk to the highest fired rule", () => {
    const r = runReasoning(
      {
        ...base,
        text: "motor is running hot and smells of burning",
        domains: ["motors"],
        baseRisk: "low",
      },
      "en"
    );
    expect(r.riskLevel).toBe("high");
  });

  it("requires every keyword group to match (AND of ORs)", () => {
    // 'modbus' present but no timeout/slow keyword -> rule must NOT fire
    const r = runReasoning(
      { ...base, text: "modbus register map question", domains: ["otNetwork"] },
      "en"
    );
    expect(r.recommendedActions.join(" ")).not.toMatch(/Batch contiguous registers/);
  });

  it("respects vendor conditions", () => {
    // PROFINET comm loss WITHOUT siemens vendor -> siemens rule must not fire
    const r = runReasoning(
      {
        ...base,
        text: "profinet communication loss on the line",
        domains: ["otNetwork"],
        vendors: [],
      },
      "en"
    );
    expect(r.probableCauses.join(" ")).not.toMatch(/IRT timing/);
  });

  it("e-stop guidance never suggests bypassing or defeating the safety loop", () => {
    const r = runReasoning(
      {
        ...base,
        text: "emergency stop released but reset has no effect, machine stays stopped",
        domains: ["plc"],
      },
      "en"
    );
    expect(r.riskLevel).toBe("high");
    // Forbidden verbs may appear ONLY inside an explicit prohibition
    // ("never ...", "do not ..."), never as a suggestion.
    const sentences = [...r.probableCauses, ...r.recommendedActions]
      .flatMap((s) => s.split(/[.;—]/))
      .map((s) => s.toLowerCase());
    for (const s of sentences) {
      if (/\b(bypass|jumper|defeat|bridge)\b/.test(s)) {
        expect(s).toMatch(/never|not|prohibited/);
      }
    }
    expect(r.recommendedActions.join(" ")).toMatch(/never bridge or defeat/i);
  });

  it("caps and deduplicates output lists", () => {
    const r = runReasoning(
      {
        ...base,
        text: "siemens profinet communication loss, motor hot burning smell, vfd overcurrent at start",
        domains: ["plc", "motors", "drives"],
        vendors: ["siemens"],
        libraries: ["s7comm", "motors", "vfd", "protection"],
      },
      "en"
    );
    expect(r.probableCauses.length).toBeLessThanOrEqual(6);
    expect(r.recommendedActions.length).toBeLessThanOrEqual(6);
    expect(r.evidence.length).toBeLessThanOrEqual(8);
    expect(new Set(r.probableCauses).size).toBe(r.probableCauses.length);
  });
});

import { summarizeEvidence } from "../reasoning";

describe("Industrial Copilot Report (Step 8B)", () => {
  it("synthesizes a localized evidence summary", () => {
    const r = runReasoning(
      {
        text: "siemens profinet communication loss",
        domains: ["plc"],
        vendors: ["siemens"],
        caseIds: ["case-siemens-1200-bf"],
        libraries: ["s7comm"],
        baseRisk: "low",
      },
      "en"
    );
    const en = summarizeEvidence(r, "en");
    expect(en).toMatch(/^Evidence basis: /);
    expect(en).toContain("Knowledge library: s7comm");
    const fa = summarizeEvidence(r, "fa");
    expect(fa).toMatch(/^مبنای شواهد: /);
  });
});
