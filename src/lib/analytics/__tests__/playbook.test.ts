/**
 * Phase 26 — Pure playbook engine tests.
 * All inputs are in-memory fixtures; no I/O.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computePlaybooks } from "../playbook";
import type { StoredMemory } from "@/lib/storage/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_TS = "2026-01-01T00:00:00.000Z";

let mIdx = 0;
beforeEach(() => { mIdx = 0; });

function mem(
  id: string,
  opts: {
    domain?:         string;
    outcome?:        "unknown" | "success" | "partial" | "failed";
    confidence?:     number;
    analysisSummary?: string;
    relatedCaseIds?: string[];
  } = {}
): StoredMemory {
  mIdx++;
  return {
    id,
    query:            `query ${mIdx}`,
    domain:           opts.domain ?? "drives",
    analysisSummary:  opts.analysisSummary ?? `resolution step for ${id}`,
    confidence:       opts.confidence ?? 80,
    relatedCaseIds:   opts.relatedCaseIds ?? [],
    relatedDocumentIds: [],
    outcome:          opts.outcome ?? "success",
    createdAt:        BASE_TS,
    updatedAt:        BASE_TS,
  };
}

// ── Empty / insufficient data ──────────────────────────────────────────────

describe("computePlaybooks — empty / insufficient", () => {
  it("returns empty result for no memories", () => {
    const r = computePlaybooks([]);
    expect(r.totalCount).toBe(0);
    expect(r.playbooks).toHaveLength(0);
  });

  it("returns empty when no success memories", () => {
    const r = computePlaybooks([
      mem("m1", { outcome: "failed" }),
      mem("m2", { outcome: "unknown" }),
    ]);
    expect(r.totalCount).toBe(0);
  });

  it("returns empty when domain has only 1 high-confidence success memory", () => {
    const r = computePlaybooks([mem("m1", { confidence: 80, outcome: "success" })]);
    expect(r.totalCount).toBe(0);
  });

  it("returns empty when success memories have confidence < 70", () => {
    const r = computePlaybooks([
      mem("m1", { confidence: 60, outcome: "success" }),
      mem("m2", { confidence: 65, outcome: "success" }),
    ]);
    expect(r.totalCount).toBe(0);
  });

  it("exactly at confidence boundary: 70 qualifies, 69 does not", () => {
    // One at 70 and one at 69 — only one qualifies → no playbook (< 2 qualifying)
    const mems = [
      mem("m1", { confidence: 70, outcome: "success" }),
      mem("m2", { confidence: 69, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.totalCount).toBe(0);
  });
});

// ── Basic creation ─────────────────────────────────────────────────────────

describe("computePlaybooks — basic creation", () => {
  it("creates playbook when domain has >=2 high-confidence success memories", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 75, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.totalCount).toBe(1);
    expect(r.playbooks[0].domain).toBe("drives");
  });

  it("playbook id is playbook:{domain}", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].id).toBe("playbook:drives");
  });

  it("title is '{domain} resolution playbook'", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].title).toBe("drives resolution playbook");
  });

  it("memoryCount reflects qualifying memories only", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success"  }),
      mem("m2", { confidence: 80, outcome: "success"  }),
      mem("m3", { confidence: 60, outcome: "success"  }),  // excluded: conf < 70
      mem("m4", { confidence: 80, outcome: "failed"   }),  // excluded: not success
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].memoryCount).toBe(2);
  });

  it("avgConfidence averaged from qualifying memories", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 90, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].avgConfidence).toBe(85);
  });
});

// ── Steps ──────────────────────────────────────────────────────────────────

describe("computePlaybooks — steps", () => {
  it("step count matches qualifying memories", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 75, outcome: "success" }),
      mem("m3", { confidence: 70, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].steps).toHaveLength(3);
  });

  it("steps ordered by confidence DESC", () => {
    const mems = [
      mem("m1", { confidence: 75, outcome: "success" }),
      mem("m2", { confidence: 90, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].steps[0].sourceId).toBe("m2");
    expect(r.playbooks[0].steps[1].sourceId).toBe("m1");
  });

  it("step order is 1-based sequential", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 70, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].steps[0].order).toBe(1);
    expect(r.playbooks[0].steps[1].order).toBe(2);
  });

  it("step description = memory analysisSummary", () => {
    const mems = [
      mem("m1", { confidence: 90, outcome: "success", analysisSummary: "Check the drive controller" }),
      mem("m2", { confidence: 80, outcome: "success", analysisSummary: "Inspect brake circuit" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].steps[0].description).toBe("Check the drive controller");
    expect(r.playbooks[0].steps[1].description).toBe("Inspect brake circuit");
  });

  it("step.source is 'memory'", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    for (const step of r.playbooks[0].steps) {
      expect(step.source).toBe("memory");
    }
  });

  it("confidence ties broken by memoryId ASC", () => {
    const mems = [
      mem("mZ", { confidence: 80, outcome: "success" }),
      mem("mA", { confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].steps[0].sourceId).toBe("mA");
    expect(r.playbooks[0].steps[1].sourceId).toBe("mZ");
  });
});

// ── caseIds ────────────────────────────────────────────────────────────────

describe("computePlaybooks — caseIds", () => {
  it("caseIds is empty when no qualifying memories have cases", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success", relatedCaseIds: [] }),
      mem("m2", { confidence: 80, outcome: "success", relatedCaseIds: [] }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].caseIds).toHaveLength(0);
  });

  it("caseIds unions all qualifying memories' case IDs", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success", relatedCaseIds: ["C1", "C2"] }),
      mem("m2", { confidence: 80, outcome: "success", relatedCaseIds: ["C2", "C3"] }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].caseIds).toEqual(["C1", "C2", "C3"]);
  });

  it("caseIds sorted ASC", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success", relatedCaseIds: ["ZZZ"] }),
      mem("m2", { confidence: 80, outcome: "success", relatedCaseIds: ["AAA"] }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].caseIds).toEqual(["AAA", "ZZZ"]);
  });

  it("no duplicate case IDs", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success", relatedCaseIds: ["C1"] }),
      mem("m2", { confidence: 80, outcome: "success", relatedCaseIds: ["C1"] }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].caseIds).toEqual(["C1"]);
  });
});

// ── Sorting ────────────────────────────────────────────────────────────────

describe("computePlaybooks — sorting", () => {
  it("sorted by memoryCount DESC", () => {
    const mems = [
      // "drives" — 2 qualifying
      mem("m1", { domain: "drives",     confidence: 80, outcome: "success" }),
      mem("m2", { domain: "drives",     confidence: 80, outcome: "success" }),
      // "hydraulics" — 3 qualifying
      mem("m3", { domain: "hydraulics", confidence: 80, outcome: "success" }),
      mem("m4", { domain: "hydraulics", confidence: 80, outcome: "success" }),
      mem("m5", { domain: "hydraulics", confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].domain).toBe("hydraulics");
    expect(r.playbooks[1].domain).toBe("drives");
  });

  it("ties in memoryCount broken by domain ASC", () => {
    const mems = [
      mem("m1", { domain: "zzz", confidence: 80, outcome: "success" }),
      mem("m2", { domain: "zzz", confidence: 80, outcome: "success" }),
      mem("m3", { domain: "aaa", confidence: 80, outcome: "success" }),
      mem("m4", { domain: "aaa", confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.playbooks[0].domain).toBe("aaa");
    expect(r.playbooks[1].domain).toBe("zzz");
  });

  it("domains without enough qualifying memories excluded", () => {
    // "drives": 2 qualifying → included
    // "hydraulics": 1 qualifying → excluded
    const mems = [
      mem("m1", { domain: "drives",     confidence: 80, outcome: "success" }),
      mem("m2", { domain: "drives",     confidence: 80, outcome: "success" }),
      mem("m3", { domain: "hydraulics", confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.totalCount).toBe(1);
    expect(r.playbooks[0].domain).toBe("drives");
  });

  it("independent playbooks per domain", () => {
    const mems = [
      mem("m1", { domain: "drives",     confidence: 80, outcome: "success" }),
      mem("m2", { domain: "drives",     confidence: 80, outcome: "success" }),
      mem("m3", { domain: "hydraulics", confidence: 80, outcome: "success" }),
      mem("m4", { domain: "hydraulics", confidence: 80, outcome: "success" }),
    ];
    const r = computePlaybooks(mems);
    expect(r.totalCount).toBe(2);
  });
});
