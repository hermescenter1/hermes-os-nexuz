/**
 * Phase 24 — Pure domain intelligence engine tests.
 * All inputs are in-memory fixtures; no I/O.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeDomainList,
  computeDomainDetail,
} from "../domain-intelligence";
import type {
  DomainListResult,
  DomainDetail,
} from "../domain-intelligence";
import type { StoredMemory, StoredProject, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_NOW   = new Date("2026-06-17T12:00:00.000Z");
const OLD_TS      = "2026-05-08T00:00:00.000Z";   // 40 days before FIXED_NOW
const RECENT_TS   = "2026-06-12T00:00:00.000Z";   // 5 days before FIXED_NOW

let mIdx = 0;
beforeEach(() => { mIdx = 0; });

function mem(
  id: string,
  opts: {
    domain?:             string;
    confidence?:         number;
    outcome?:            "unknown" | "success" | "partial" | "failed";
    createdAt?:          string;
    projectId?:          string;
    relatedCaseIds?:     string[];
    relatedDocumentIds?: string[];
  } = {}
): StoredMemory {
  mIdx++;
  return {
    id,
    query:            `query ${mIdx}`,
    domain:           opts.domain            ?? "drives",
    analysisSummary:  `summary ${mIdx}`,
    confidence:       opts.confidence        ?? 70,
    relatedCaseIds:   opts.relatedCaseIds    ?? [],
    relatedDocumentIds: opts.relatedDocumentIds ?? [],
    outcome:          opts.outcome           ?? "unknown",
    projectId:        opts.projectId,
    createdAt:        opts.createdAt         ?? OLD_TS,
    updatedAt:        OLD_TS,
  };
}

function proj(id: string, name?: string): StoredProject {
  return {
    id, name: name ?? `Project ${id}`,
    description: "", status: "active",
    createdAt: OLD_TS, updatedAt: OLD_TS,
  };
}

function fb(memId: string): StoredMemoryFeedback {
  return { id: `fb-${memId}`, memoryId: memId, outcome: "success", createdAt: OLD_TS };
}

const NO_FB = new Map<string, StoredMemoryFeedback[]>();
const NO_PROJ: StoredProject[] = [];

// ── computeDomainList ──────────────────────────────────────────────────────

describe("computeDomainList — empty / minimal", () => {
  it("returns totalDomains=0 for empty memories", () => {
    const r: DomainListResult = computeDomainList([], [], NO_FB);
    expect(r.totalDomains).toBe(0);
    expect(r.domains).toHaveLength(0);
  });

  it("returns one domain for single-domain input", () => {
    const r = computeDomainList(NO_PROJ, [mem("m1")], NO_FB);
    expect(r.totalDomains).toBe(1);
    expect(r.domains[0].name).toBe("drives");
  });

  it("memoryCount reflects domain count", () => {
    const mems = [mem("m1"), mem("m2"), mem("m3")];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].memoryCount).toBe(3);
  });
});

describe("computeDomainList — stats", () => {
  it("avgConfidence rounds to integer", () => {
    const mems = [
      mem("m1", { confidence: 60 }),
      mem("m2", { confidence: 70 }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].avgConfidence).toBe(65);
  });

  it("successRate reflects outcome=success fraction", () => {
    const mems = [
      mem("m1", { outcome: "success" }),
      mem("m2", { outcome: "failed" }),
      mem("m3", { outcome: "failed" }),
      mem("m4", { outcome: "failed" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].successRate).toBe(25);
  });

  it("failureRate reflects outcome=failed fraction", () => {
    const mems = [
      mem("m1", { outcome: "failed" }),
      mem("m2", { outcome: "success" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].failureRate).toBe(50);
  });

  it("feedbackRate = fraction of memories with at least one feedback entry", () => {
    const mems = [mem("m1"), mem("m2"), mem("m3")];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeDomainList(NO_PROJ, mems, fbMap);
    expect(r.domains[0].feedbackRate).toBe(33);
  });

  it("feedbackRate = 0 when no feedback", () => {
    const r = computeDomainList(NO_PROJ, [mem("m1")], NO_FB);
    expect(r.domains[0].feedbackRate).toBe(0);
  });

  it("healthScore = round((avgConf + successRate) / 2)", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success" }),
      mem("m2", { confidence: 60, outcome: "unknown" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    // avgConf = 70, successRate = 50 → healthScore = round((70+50)/2) = 60
    expect(r.domains[0].healthScore).toBe(60);
  });
});

describe("computeDomainList — sorting", () => {
  it("sorts by healthScore DESC", () => {
    const mems = [
      // "hydraulics" — all success/high confidence → high healthScore
      mem("m1", { domain: "hydraulics", confidence: 90, outcome: "success" }),
      // "drives" — all failed/low confidence → low healthScore
      mem("m2", { domain: "drives",     confidence: 30, outcome: "failed" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].name).toBe("hydraulics");
    expect(r.domains[1].name).toBe("drives");
  });

  it("ties in healthScore broken by name ASC", () => {
    // Both have confidence=70, outcome=unknown → healthScore=35
    const mems = [
      mem("m1", { domain: "zzz", confidence: 70, outcome: "unknown" }),
      mem("m2", { domain: "aaa", confidence: 70, outcome: "unknown" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.domains[0].name).toBe("aaa");
    expect(r.domains[1].name).toBe("zzz");
  });

  it("multiple domains counted separately", () => {
    const mems = [
      mem("m1", { domain: "drives"     }),
      mem("m2", { domain: "hydraulics" }),
      mem("m3", { domain: "electrical" }),
    ];
    const r = computeDomainList(NO_PROJ, mems, NO_FB);
    expect(r.totalDomains).toBe(3);
    expect(r.domains).toHaveLength(3);
  });
});

// ── computeDomainDetail ────────────────────────────────────────────────────

describe("computeDomainDetail — null for missing domain", () => {
  it("returns null when domain not in memories", () => {
    const r = computeDomainDetail("nonexistent", NO_PROJ, [], NO_FB, FIXED_NOW);
    expect(r).toBeNull();
  });

  it("returns null for empty memory set", () => {
    const r = computeDomainDetail("drives", NO_PROJ, [], NO_FB, FIXED_NOW);
    expect(r).toBeNull();
  });
});

describe("computeDomainDetail — basic stats", () => {
  it("includes all DomainSummary fields plus detail fields", () => {
    const mems = [mem("m1", { createdAt: OLD_TS })];
    const r: DomainDetail | null = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r).toHaveProperty("name");
    expect(r).toHaveProperty("memoryCount");
    expect(r).toHaveProperty("avgConfidence");
    expect(r).toHaveProperty("successRate");
    expect(r).toHaveProperty("failureRate");
    expect(r).toHaveProperty("partialRate");
    expect(r).toHaveProperty("feedbackRate");
    expect(r).toHaveProperty("healthScore");
    expect(r).toHaveProperty("trend");
    expect(r).toHaveProperty("topCases");
    expect(r).toHaveProperty("topProjects");
    expect(r).toHaveProperty("relatedDomains");
  });

  it("partialRate reflects outcome=partial fraction", () => {
    const mems = [
      mem("m1", { outcome: "partial" }),
      mem("m2", { outcome: "partial" }),
      mem("m3", { outcome: "unknown" }),
      mem("m4", { outcome: "unknown" }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.partialRate).toBe(50);
  });

  it("feedbackRate for detail only counts domain memories with feedback", () => {
    const mems = [
      mem("m1", { domain: "drives"     }),
      mem("m2", { domain: "drives"     }),
      mem("m3", { domain: "hydraulics" }),
    ];
    const fbMap = new Map([["m1", [fb("m1")]], ["m3", [fb("m3")]]]);
    const r = computeDomainDetail("drives", NO_PROJ, mems, fbMap, FIXED_NOW);
    // 2 drives memories; 1 has feedback → 50%
    expect(r?.feedbackRate).toBe(50);
  });
});

describe("computeDomainDetail — trend", () => {
  it("trend=improving when recent avg confidence > older by ≥5", () => {
    const mems = [
      mem("m1", { confidence: 50, createdAt: OLD_TS    }),
      mem("m2", { confidence: 80, createdAt: RECENT_TS }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.trend.direction).toBe("improving");
    expect(r?.trend.baselineAvgConf).toBe(50);
    expect(r?.trend.recentAvgConf).toBe(80);
  });

  it("trend=declining when recent avg confidence < older by ≥5", () => {
    const mems = [
      mem("m1", { confidence: 80, createdAt: OLD_TS    }),
      mem("m2", { confidence: 50, createdAt: RECENT_TS }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.trend.direction).toBe("declining");
  });

  it("trend=stable when difference < threshold", () => {
    const mems = [
      mem("m1", { confidence: 70, createdAt: OLD_TS    }),
      mem("m2", { confidence: 73, createdAt: RECENT_TS }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.trend.direction).toBe("stable");
  });

  it("trend=stable when no older memories", () => {
    const mems = [mem("m1", { confidence: 80, createdAt: RECENT_TS })];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.trend.direction).toBe("stable");
  });

  it("trend=stable when no recent memories", () => {
    const mems = [mem("m1", { confidence: 80, createdAt: OLD_TS })];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.trend.direction).toBe("stable");
  });
});

describe("computeDomainDetail — topCases", () => {
  it("returns empty array when no cases referenced", () => {
    const r = computeDomainDetail("drives", NO_PROJ, [mem("m1")], NO_FB, FIXED_NOW);
    expect(r?.topCases).toHaveLength(0);
  });

  it("counts case frequency across memories", () => {
    const mems = [
      mem("m1", { relatedCaseIds: ["C1", "C2"] }),
      mem("m2", { relatedCaseIds: ["C1"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    const top = r?.topCases ?? [];
    expect(top[0]).toMatchObject({ caseId: "C1", memoryCount: 2 });
    expect(top[1]).toMatchObject({ caseId: "C2", memoryCount: 1 });
  });

  it("sorts by memoryCount DESC then caseId ASC", () => {
    const mems = [
      mem("m1", { relatedCaseIds: ["ZZZ", "AAA"] }),
      mem("m2", { relatedCaseIds: ["ZZZ", "AAA"] }),
      mem("m3", { relatedCaseIds: ["MMM"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    const ids = (r?.topCases ?? []).map(c => c.caseId);
    // ZZZ and AAA both have 2 → sorted alpha: AAA, ZZZ; then MMM with 1
    expect(ids).toEqual(["AAA", "ZZZ", "MMM"]);
  });

  it("caps at 5 top cases", () => {
    const mems = [
      mem("m1", { relatedCaseIds: ["C1","C2","C3","C4","C5","C6"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.topCases).toHaveLength(5);
  });
});

describe("computeDomainDetail — topProjects", () => {
  it("returns empty array when no memories have projectId", () => {
    const r = computeDomainDetail("drives", NO_PROJ, [mem("m1")], NO_FB, FIXED_NOW);
    expect(r?.topProjects).toHaveLength(0);
  });

  it("groups memories by projectId", () => {
    const projects = [proj("p1", "Alpha"), proj("p2", "Beta")];
    const mems = [
      mem("m1", { projectId: "p1" }),
      mem("m2", { projectId: "p1" }),
      mem("m3", { projectId: "p2" }),
    ];
    const r = computeDomainDetail("drives", projects, mems, NO_FB, FIXED_NOW);
    const top = r?.topProjects ?? [];
    expect(top[0]).toMatchObject({ projectId: "p1", projectName: "Alpha", memoryCount: 2 });
    expect(top[1]).toMatchObject({ projectId: "p2", projectName: "Beta",  memoryCount: 1 });
  });

  it("falls back to projectId as name when project not in list", () => {
    const mems = [mem("m1", { projectId: "unknown-proj" })];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.topProjects[0].projectName).toBe("unknown-proj");
  });

  it("sorts by memoryCount DESC then projectId ASC for ties", () => {
    const projects = [proj("pA"), proj("pB")];
    const mems = [
      mem("m1", { projectId: "pB" }),
      mem("m2", { projectId: "pA" }),
    ];
    // both have 1 memory → sort by projectId ASC → pA first
    const r = computeDomainDetail("drives", projects, mems, NO_FB, FIXED_NOW);
    expect(r?.topProjects[0].projectId).toBe("pA");
    expect(r?.topProjects[1].projectId).toBe("pB");
  });

  it("caps at 5 top projects", () => {
    const projects = Array.from({ length: 6 }, (_, i) => proj(`p${i}`));
    const mems     = Array.from({ length: 6 }, (_, i) => mem(`m${i}`, { projectId: `p${i}` }));
    const r = computeDomainDetail("drives", projects, mems, NO_FB, FIXED_NOW);
    expect(r?.topProjects).toHaveLength(5);
  });
});

describe("computeDomainDetail — relatedDomains", () => {
  it("returns empty array when domain has no relatedCaseIds", () => {
    const mems = [
      mem("m1", { domain: "drives"     }),
      mem("m2", { domain: "hydraulics" }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.relatedDomains).toHaveLength(0);
  });

  it("finds domains sharing at least one case", () => {
    const mems = [
      mem("m1", { domain: "drives",     relatedCaseIds: ["C1"] }),
      mem("m2", { domain: "hydraulics", relatedCaseIds: ["C1"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.relatedDomains).toContain("hydraulics");
  });

  it("does not include the target domain itself", () => {
    const mems = [
      mem("m1", { domain: "drives", relatedCaseIds: ["C1"] }),
      mem("m2", { domain: "drives", relatedCaseIds: ["C1"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.relatedDomains).not.toContain("drives");
  });

  it("each related domain appears at most once even with multiple shared cases", () => {
    const mems = [
      mem("m1", { domain: "drives",     relatedCaseIds: ["C1", "C2"] }),
      mem("m2", { domain: "hydraulics", relatedCaseIds: ["C1", "C2"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    const count = (r?.relatedDomains ?? []).filter(d => d === "hydraulics").length;
    expect(count).toBe(1);
  });

  it("sorts related domains alphabetically", () => {
    const mems = [
      mem("m1", { domain: "drives",     relatedCaseIds: ["C1"] }),
      mem("m2", { domain: "zzz",        relatedCaseIds: ["C1"] }),
      mem("m3", { domain: "aaa",        relatedCaseIds: ["C1"] }),
    ];
    const r = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(r?.relatedDomains).toEqual(["aaa", "zzz"]);
  });
});

describe("computeDomainDetail — determinism", () => {
  it("produces identical output on repeated calls with same input", () => {
    const mems = [
      mem("m1", { confidence: 80, outcome: "success", relatedCaseIds: ["C1"], createdAt: OLD_TS }),
      mem("m2", { confidence: 60, outcome: "partial", relatedCaseIds: ["C2"], createdAt: RECENT_TS }),
    ];
    const r1 = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    const r2 = computeDomainDetail("drives", NO_PROJ, mems, NO_FB, FIXED_NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
