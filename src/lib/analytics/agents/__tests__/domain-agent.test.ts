import { describe, it, expect } from "vitest";
import { computeDomainAgent } from "../domain-agent";
import type { StoredMemory } from "@/lib/storage/types";

// ── Factory ────────────────────────────────────────────────────────────────

function mem(id: string, opts: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id, query: `q-${id}`, domain: "drives", analysisSummary: `s-${id}`,
    confidence: 70, relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId: undefined,
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
    ...opts,
  };
}

const NOW = new Date("2026-06-18T00:00:00.000Z");

// ── Empty corpus ───────────────────────────────────────────────────────────

describe("computeDomainAgent — empty corpus", () => {
  it("returns agentId domain and score 0", () => {
    const r = computeDomainAgent([], NOW);
    expect(r.agentId).toBe("domain");
    expect(r.score).toBe(0);
  });

  it("returns no-memories finding", () => {
    const { findings } = computeDomainAgent([], NOW);
    expect(findings).toContain("No memories to analyze domain expertise");
  });

  it("all data fields are zero / empty", () => {
    const { data } = computeDomainAgent([], NOW);
    expect(data.totalDomains).toBe(0);
    expect(data.expertiseBreadth).toBe(0);
    expect(data.expertiseDepth).toBe(0);
    expect(data.emergingDomains).toEqual([]);
    expect(data.criticalGaps).toEqual([]);
  });
});

// ── Expertise breadth ──────────────────────────────────────────────────────

describe("computeDomainAgent — expertise breadth", () => {
  it("breadth 100% when single domain has >= 3 memories", () => {
    const mems = [
      mem("m1", { domain: "drives" }), mem("m2", { domain: "drives" }), mem("m3", { domain: "drives" }),
    ];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.expertiseBreadth).toBe(100);
  });

  it("breadth 50% when 1 of 2 domains has >= 3 memories", () => {
    const mems = [
      mem("m1", { domain: "drives" }), mem("m2", { domain: "drives" }), mem("m3", { domain: "drives" }),
      mem("m4", { domain: "plc" }),
    ];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.expertiseBreadth).toBe(50);
  });

  it("breadth 0% when no domain has 3 memories", () => {
    const mems = [mem("m1", { domain: "drives" }), mem("m2", { domain: "plc" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.expertiseBreadth).toBe(0);
  });

  it("narrow coverage triggers finding", () => {
    const mems = [mem("m1", { domain: "drives" })];
    const { findings } = computeDomainAgent(mems, NOW);
    expect(findings).toContain("Domain coverage is narrow");
  });

  it("strong breadth triggers finding", () => {
    const mems: StoredMemory[] = [];
    for (let i = 0; i < 9; i++) {
      const d = ["drives", "plc", "scada"][i % 3];
      mems.push(mem(`m${i}`, { domain: d }));
    }
    const { findings } = computeDomainAgent(mems, NOW);
    expect(findings).toContain("Strong domain coverage breadth");
  });
});

// ── Expertise depth ────────────────────────────────────────────────────────

describe("computeDomainAgent — expertise depth", () => {
  it("expertiseDepth is avg confidence across all memories", () => {
    const mems = [mem("m1", { confidence: 80 }), mem("m2", { confidence: 60 })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.expertiseDepth).toBe(70);
  });

  it("high depth triggers finding", () => {
    const mems = [mem("m1", { confidence: 85 }), mem("m2", { confidence: 80 })];
    const { findings } = computeDomainAgent(mems, NOW);
    expect(findings).toContain("Deep expertise across domains");
  });

  it("low depth triggers finding", () => {
    const mems = [mem("m1", { confidence: 30 }), mem("m2", { confidence: 25 })];
    const { findings } = computeDomainAgent(mems, NOW);
    expect(findings).toContain("Low expertise depth — build confidence");
  });
});

// ── Critical gaps ──────────────────────────────────────────────────────────

describe("computeDomainAgent — critical gaps", () => {
  it("domain with 1 memory is a critical gap", () => {
    const mems = [mem("m1", { domain: "plc" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.criticalGaps).toContain("plc");
  });

  it("domain with 2 memories is NOT a critical gap", () => {
    const mems = [mem("m1", { domain: "plc" }), mem("m2", { domain: "plc" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.criticalGaps).not.toContain("plc");
  });

  it("criticalGaps is sorted ascending", () => {
    const mems = [mem("m1", { domain: "scada" }), mem("m2", { domain: "drives" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.criticalGaps).toEqual(["drives", "scada"]);
  });

  it("critical gaps count triggers finding", () => {
    const mems = [mem("m1", { domain: "plc" })];
    const { findings } = computeDomainAgent(mems, NOW);
    expect(findings.some(f => f.includes("minimal coverage"))).toBe(true);
  });
});

// ── Emerging domains ───────────────────────────────────────────────────────

describe("computeDomainAgent — emerging domains", () => {
  it("domain with recent memory is emerging", () => {
    const mems = [mem("m1", { domain: "plc", createdAt: "2026-06-15T00:00:00.000Z" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.emergingDomains).toContain("plc");
  });

  it("domain with only old memories is not emerging", () => {
    const mems = [mem("m1", { domain: "plc", createdAt: "2025-01-01T00:00:00.000Z" })];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.emergingDomains).not.toContain("plc");
  });

  it("emergingDomains is sorted ascending", () => {
    const mems = [
      mem("m1", { domain: "scada", createdAt: "2026-06-15T00:00:00.000Z" }),
      mem("m2", { domain: "drives", createdAt: "2026-06-15T00:00:00.000Z" }),
    ];
    const { data } = computeDomainAgent(mems, NOW);
    expect(data.emergingDomains).toEqual(["drives", "scada"]);
  });
});

// ── Score bounds ───────────────────────────────────────────────────────────

describe("computeDomainAgent — score bounds", () => {
  it("score is always 0-100", () => {
    const mems = Array.from({ length: 10 }, (_, i) => mem(`m${i}`, { confidence: 100, domain: "drives" }));
    const { score } = computeDomainAgent(mems, NOW);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── Determinism ────────────────────────────────────────────────────────────

describe("computeDomainAgent — determinism", () => {
  it("same input produces identical output", () => {
    const mems = [mem("m1", { domain: "plc" }), mem("m2", { domain: "drives" })];
    const r1 = computeDomainAgent(mems, NOW);
    const r2 = computeDomainAgent(mems, NOW);
    expect(r1).toEqual(r2);
  });
});
