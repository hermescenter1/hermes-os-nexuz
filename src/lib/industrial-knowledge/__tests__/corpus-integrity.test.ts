import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, corpusStats, verifySourceAgreement } from "../corpus";
import { checksumOfSystem, validateAuthoredSystem } from "../provenance";
import { isReviewOnly } from "../types";
import { TIA_01_STEEL_ROLLING } from "../reference/tia-01-steel-rolling";

describe("PHASE 101 — corpus integrity", () => {
  it("seals every reference system without a structural defect", () => {
    expect(CORPUS.length).toBeGreaterThan(0);
    for (const system of CORPUS) {
      expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    }
  });

  it("stamps complete provenance onto every node", () => {
    for (const system of CORPUS) {
      for (const node of system.nodes) {
        expect(node.provenance.projectId).toBe(system.id);
        expect(node.provenance.checksum).toBe(system.checksum);
        expect(node.provenance.version).toBe(system.version);
        expect(node.provenance.revision).toBe(system.revision);
        expect(node.provenance.sourceId.length).toBeGreaterThan(0);
        expect(node.provenance.subsystem.length).toBeGreaterThan(0);
      }
    }
  });

  it("stamps provenance and a content checksum onto every source artefact", () => {
    for (const system of CORPUS) {
      for (const artifact of system.artifacts) {
        expect(artifact.id).toBe(`${system.id}:SRC:${artifact.local}`);
        expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
        expect(artifact.lineCount).toBeGreaterThan(0);
        expect(artifact.provenance.projectId).toBe(system.id);
        // A CRLF checkout must not change an artefact's identity.
        expect(artifact.content).not.toContain("\r");
      }
    }
  });

  it("keeps the checksum stable for identical content", () => {
    expect(checksumOfSystem(TIA_01_STEEL_ROLLING)).toBe(checksumOfSystem(TIA_01_STEEL_ROLLING));
  });

  it("changes the checksum when engineering content changes", () => {
    const mutated = {
      ...TIA_01_STEEL_ROLLING,
      nodes: TIA_01_STEEL_ROLLING.nodes.map((n, i) =>
        i === 0 ? { ...n, label: { en: "changed", fa: "تغییر‌یافته" } } : n,
      ),
    };
    expect(checksumOfSystem(mutated)).not.toBe(checksumOfSystem(TIA_01_STEEL_ROLLING));
  });

  it("rejects an artefact that declares a node the corpus does not have", () => {
    const broken = {
      ...TIA_01_STEEL_ROLLING,
      artifacts: [
        {
          local: "GHOST",
          language: "SCL" as const,
          layer: "PLC_LOGIC" as const,
          fileName: "ghost.scl",
          declares: ["TIA-01:TAG:DOES_NOT_EXIST"],
          content: "FUNCTION \"X\" : Void\nBEGIN\nEND_FUNCTION\n",
          provenance: {
            subsystem: "ROLL_LINE_A",
            sourceId: "GHOST",
            domain: "CONTROL_LOGIC" as const,
            safetyClass: "NON_SAFETY" as const,
          },
        },
      ],
    };
    const issues = validateAuthoredSystem(broken);
    expect(issues.map((i) => i.code)).toContain("ARTIFACT_DECLARES_UNKNOWN_NODE");
  });

  it("builds a corpus index with unique node ids", () => {
    const index = corpusIndex();
    const total = CORPUS.reduce((sum, s) => sum + s.nodes.length, 0);
    expect(index.nodes.size).toBe(total);
  });

  it("agrees with its own engineering source — every SCL relation is in the graph", () => {
    for (const system of CORPUS) {
      expect(verifySourceAgreement(system)).toEqual([]);
    }
  });

  it("declares every fault scenario against a real fault mode and safe actions", () => {
    const index = corpusIndex();
    for (const system of CORPUS) {
      for (const scenario of system.scenarios) {
        const faultMode = index.nodes.get(scenario.groundTruth.faultModeId);
        expect(faultMode?.kind).toBe("FAULT_MODE");
        expect(scenario.groundTruth.expectedSafeActionIds.length).toBeGreaterThan(0);
        for (const id of scenario.groundTruth.expectedSafeActionIds) {
          expect(index.nodes.get(id)?.kind).toBe("SAFE_ACTION");
        }
      }
    }
  });

  it("treats every safety-classified object as review-only", () => {
    for (const system of CORPUS) {
      const safetyNodes = system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY");
      expect(safetyNodes.length).toBeGreaterThan(0);
      for (const node of safetyNodes) {
        expect(isReviewOnly(node.provenance.safetyClass)).toBe(true);
      }
    }
  });

  it("reports corpus statistics", () => {
    const stats = corpusStats();
    expect(stats.systems).toBe(CORPUS.length);
    expect(stats.nodes).toBeGreaterThan(0);
    expect(stats.sourceLines).toBeGreaterThan(0);
  });
});
