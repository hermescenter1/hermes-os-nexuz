import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex } from "../corpus";
import { diagnose, startChainFor, isNotable } from "../diagnostics";
import type { KnowledgeNode } from "../types";

const index = corpusIndex();
const tia01 = CORPUS.find((s) => s.id === "TIA-01")!;
const scenario = (id: string) => tia01.scenarios.find((s) => s.id === id)!;

describe("PHASE 101 — structural diagnostic engine", () => {
  it("never cites a node the corpus does not contain", () => {
    for (const system of CORPUS) {
      for (const s of system.scenarios) {
        const result = diagnose(index, { observations: s.observations });
        for (const citation of result.citations) {
          expect(index.nodes.has(citation)).toBe(true);
        }
      }
    }
  });

  it("reports an unknown observation instead of quietly dropping it", () => {
    const result = diagnose(index, {
      observations: [
        { nodeId: "TIA-01:TAG:DOES_NOT_EXIST", state: "ABNORMAL" },
        ...scenario("TIA-01-FS-02").observations,
      ],
    });

    expect(result.unresolvedObservations).toEqual(["TIA-01:TAG:DOES_NOT_EXIST"]);
    expect(result.citations).not.toContain("TIA-01:TAG:DOES_NOT_EXIST");
    // The rest of the evidence still produces an answer — one bad reference
    // must not discard a whole evidence set.
    expect(result.hypotheses.length).toBeGreaterThan(0);
  });

  it("names missing evidence rather than assuming a value for it", () => {
    const result = diagnose(index, { observations: scenario("TIA-01-FS-01").observations });
    const missingIds = result.missingEvidence.map((c) => c.nodeId);

    expect(missingIds.length).toBeGreaterThan(0);
    // Nothing reported as missing may also be reported as supporting.
    const supportingIds = new Set(result.supportingEvidence.map((c) => c.nodeId));
    for (const id of missingIds) expect(supportingIds.has(id)).toBe(false);
  });

  it("counts a healthy declared signal as contradicting, not as support", () => {
    // FS-02: the motor temperature is NORMAL, which argues against a cooling
    // fault even though the same alarm chain would otherwise reach it.
    const result = diagnose(index, { observations: scenario("TIA-01-FS-02").observations });
    const cooling = result.hypotheses.find(
      (h) => h.faultModeId === "TIA-01:FAULT_MODE:FM_MOTOR_COOLING_OBSTRUCTED",
    );
    if (cooling) {
      expect(cooling.contradicting.length).toBeGreaterThan(0);
      expect(cooling.confidence).toBeLessThan(0.5);
    }
  });

  it("prefers the cause over its consequence", () => {
    // The sequence timed out BECAUSE the coiler was unavailable. The timeout is
    // real and observed, but it is the symptom.
    const result = diagnose(index, { observations: scenario("TIA-01-FS-05").observations });
    expect(result.hypotheses[0].faultModeId).toBe(
      "TIA-01:FAULT_MODE:FM_DOWNSTREAM_COILER_BLOCKED",
    );
  });

  it("provides an auditable edge chain for every ranked hypothesis", () => {
    const result = diagnose(index, { observations: scenario("TIA-01-FS-04").observations });
    const edgeIds = new Set(index.edges.map((e) => e.id));

    for (const hypothesis of result.hypotheses) {
      for (const chain of hypothesis.chains) {
        expect(index.nodes.has(chain.nodeId)).toBe(true);
        for (const edgeId of chain.edgeIds) expect(edgeIds.has(edgeId)).toBe(true);
      }
    }
  });

  it("recommends only SAFE_ACTION nodes, and flags the review-only ones", () => {
    for (const s of tia01.scenarios) {
      const result = diagnose(index, { observations: s.observations });
      for (const action of result.safeVerificationActions) {
        const node = index.nodes.get(action.nodeId) as KnowledgeNode;
        expect(node.kind).toBe("SAFE_ACTION");
        if (node.provenance.safetyClass !== "NON_SAFETY") {
          expect(action.reviewOnly).toBe(true);
        }
      }
    }
  });

  it("raises an escalation condition when a safety-classified object is involved", () => {
    const result = diagnose(index, { observations: scenario("TIA-01-FS-06").observations });
    expect(result.escalationConditions.length).toBeGreaterThan(0);
  });

  it("returns no hypothesis, and says why, when nothing notable was observed", () => {
    const result = diagnose(index, {
      observations: [{ nodeId: "TIA-01:TAG:PROD_COUNT_COILS", state: "NORMAL" }],
    });
    expect(result.hypotheses).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.escalationConditions.join(" ")).toContain("No corpus fault mode");
  });

  it("is deterministic", () => {
    const once = diagnose(index, { observations: scenario("TIA-01-FS-03").observations });
    const twice = diagnose(index, { observations: scenario("TIA-01-FS-03").observations });
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it("localises labels without changing the reasoning", () => {
    const en = diagnose(index, { observations: scenario("TIA-01-FS-02").observations, locale: "en" });
    const fa = diagnose(index, { observations: scenario("TIA-01-FS-02").observations, locale: "fa" });

    expect(fa.hypotheses.map((h) => h.faultModeId)).toEqual(en.hypotheses.map((h) => h.faultModeId));
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
  });

  it("treats only diagnostically meaningful states as entry points", () => {
    const alarm = index.nodes.get("TIA-01:ALARM:ALM_DRIVE1_FAULT")!;
    const permissive = index.nodes.get("TIA-01:PERMISSIVE:PRM_HYD_PRESSURE")!;
    const counter = index.nodes.get("TIA-01:TAG:PROD_COUNT_COILS")!;

    expect(isNotable(alarm, "TRUE")).toBe(true);
    expect(isNotable(alarm, "FALSE")).toBe(false);
    expect(isNotable(permissive, "FALSE")).toBe(true);
    expect(isNotable(counter, "NORMAL")).toBe(false);
    expect(isNotable(counter, "STALE")).toBe(true);
  });

  it("assembles the cross-layer start chain for a piece of equipment", () => {
    const chain = startChainFor(index, "TIA-01:EQUIPMENT:MILL_STAND1");
    const kinds = new Set(chain.map((n) => n.kind));

    expect(chain.length).toBeGreaterThan(0);
    // The chain must reach beyond the equipment itself into the logic that
    // governs it — that is the whole point of cross-layer tracing.
    expect(kinds.has("INTERLOCK") || kinds.has("PERMISSIVE") || kinds.has("TAG")).toBe(true);
  });

  it("returns an empty chain for unknown equipment instead of throwing", () => {
    expect(startChainFor(index, "NOPE:EQUIPMENT:NOTHING")).toEqual([]);
  });
});
