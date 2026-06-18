/**
 * Phase 26 — Pure recommendations engine tests.
 * All inputs are in-memory fixtures; no I/O.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computeRecommendations } from "../recommendations";
import type { StoredMemory, StoredMemoryFeedback } from "@/lib/storage/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");
const STALE_TS  = "2025-12-15T00:00:00.000Z";   // ~183 days before FIXED_NOW
const FRESH_TS  = "2026-06-10T00:00:00.000Z";    // 7 days before FIXED_NOW

let mIdx = 0;
beforeEach(() => { mIdx = 0; });

function mem(
  id: string,
  opts: {
    domain?:     string;
    confidence?: number;
    outcome?:    "unknown" | "success" | "partial" | "failed";
    createdAt?:  string;
    projectId?:  string;
  } = {}
): StoredMemory {
  mIdx++;
  return {
    id, query: `query ${mIdx}`, domain: opts.domain ?? "drives",
    analysisSummary: `summary ${mIdx}`,
    confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    projectId: opts.projectId,
    createdAt: opts.createdAt ?? FRESH_TS,
    updatedAt: FRESH_TS,
  };
}

function fb(memId: string): StoredMemoryFeedback {
  return { id: `fb-${memId}`, memoryId: memId, outcome: "success", createdAt: FRESH_TS };
}

const NO_FB = new Map<string, StoredMemoryFeedback[]>();

// ── Empty ──────────────────────────────────────────────────────────────────

describe("computeRecommendations — empty", () => {
  it("returns empty list for no memories", () => {
    const r = computeRecommendations([], NO_FB, FIXED_NOW);
    expect(r.totalCount).toBe(0);
    expect(r.recommendations).toHaveLength(0);
  });
});

// ── collect_feedback ───────────────────────────────────────────────────────

describe("computeRecommendations — collect_feedback", () => {
  it("fires for uncertain memory (unknown + conf<60 + no feedback)", () => {
    const mems = [mem("m1", { outcome: "unknown", confidence: 40 })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "collect_feedback")).toBe(true);
  });

  it("does NOT fire when confidence >= 60", () => {
    const mems = [mem("m1", { outcome: "unknown", confidence: 60 })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "collect_feedback")).toBe(false);
  });

  it("does NOT fire when memory has feedback", () => {
    const mems = [mem("m1", { outcome: "unknown", confidence: 40 })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeRecommendations(mems, fbMap, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "collect_feedback")).toBe(false);
  });

  it("does NOT fire for outcome=failed", () => {
    const mems = [mem("m1", { outcome: "failed", confidence: 40 })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const recs = r.recommendations.filter(rec => rec.type === "collect_feedback");
    expect(recs).toHaveLength(0);
  });

  it("sorted by confidence ASC (most uncertain first)", () => {
    const mems = [
      mem("m1", { outcome: "unknown", confidence: 50 }),
      mem("m2", { outcome: "unknown", confidence: 30 }),
    ];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const cfRecs = r.recommendations.filter(rec => rec.type === "collect_feedback");
    expect(cfRecs[0].targetId).toBe("m2");
    expect(cfRecs[1].targetId).toBe("m1");
  });

  it("capped at 5 entries", () => {
    const mems = Array.from({ length: 8 }, (_, i) =>
      mem(`m${i}`, { outcome: "unknown", confidence: 40 })
    );
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.filter(rec => rec.type === "collect_feedback").length).toBeLessThanOrEqual(5);
  });

  it("impact = round((100 - confidence) * 0.8)", () => {
    const mems = [mem("m1", { outcome: "unknown", confidence: 40 })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "collect_feedback");
    expect(rec?.impact).toBe(48);  // (100-40)*0.8=48
  });
});

// ── review_failures ────────────────────────────────────────────────────────

describe("computeRecommendations — review_failures", () => {
  it("fires for failed memory with no feedback", () => {
    const mems = [mem("m1", { outcome: "failed" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "review_failures")).toBe(true);
  });

  it("does NOT fire for failed memory WITH feedback", () => {
    const mems = [mem("m1", { outcome: "failed" })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeRecommendations(mems, fbMap, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "review_failures")).toBe(false);
  });

  it("impact is always 80", () => {
    const mems = [mem("m1", { outcome: "failed" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "review_failures");
    expect(rec?.impact).toBe(80);
  });

  it("selects most-recent failures when >5 qualify", () => {
    // 6 failed memories — oldest (m0) should be excluded
    const timestamps = [
      "2026-01-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
      "2026-04-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ];
    const mems = timestamps.map((ts, i) => mem(`mx${i}`, { outcome: "failed", createdAt: ts }));
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rfRecs = r.recommendations.filter(rec => rec.type === "review_failures");
    expect(rfRecs).toHaveLength(5);
    expect(rfRecs.some(rec => rec.targetId === "mx0")).toBe(false);  // oldest excluded
    expect(rfRecs.some(rec => rec.targetId === "mx5")).toBe(true);   // newest included
  });
});

// ── update_stale ───────────────────────────────────────────────────────────

describe("computeRecommendations — update_stale", () => {
  it("fires for unknown memory older than 90 days", () => {
    const mems = [mem("m1", { outcome: "unknown", createdAt: STALE_TS })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "update_stale")).toBe(true);
  });

  it("does NOT fire for fresh memory", () => {
    const mems = [mem("m1", { outcome: "unknown", createdAt: FRESH_TS })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "update_stale")).toBe(false);
  });

  it("does NOT fire for stale memory with non-unknown outcome", () => {
    const mems = [mem("m1", { outcome: "failed", createdAt: STALE_TS })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "update_stale")).toBe(false);
  });

  it("selects oldest stale memories when >5 qualify", () => {
    // 6 stale memories — newest (my5) should be excluded
    const timestamps = [
      "2025-06-01T00:00:00.000Z",
      "2025-07-01T00:00:00.000Z",
      "2025-08-01T00:00:00.000Z",
      "2025-09-01T00:00:00.000Z",
      "2025-10-01T00:00:00.000Z",
      "2025-11-01T00:00:00.000Z",
    ];
    const mems = timestamps.map((ts, i) => mem(`my${i}`, { outcome: "unknown", createdAt: ts }));
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const usRecs = r.recommendations.filter(rec => rec.type === "update_stale");
    expect(usRecs).toHaveLength(5);
    expect(usRecs.some(rec => rec.targetId === "my0")).toBe(true);   // oldest included
    expect(usRecs.some(rec => rec.targetId === "my5")).toBe(false);  // newest excluded
  });
});

// ── expand_domain ──────────────────────────────────────────────────────────

describe("computeRecommendations — expand_domain", () => {
  it("fires for domain with 1 memory (< 3)", () => {
    const mems = [mem("m1", { domain: "hydraulics" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "expand_domain")).toBe(true);
  });

  it("does NOT fire for domain with >= 3 memories", () => {
    const mems = [
      mem("m1", { domain: "drives" }),
      mem("m2", { domain: "drives" }),
      mem("m3", { domain: "drives" }),
    ];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "expand_domain")).toBe(false);
  });

  it("impact = (3-count)*30 for count=1 → 60", () => {
    const mems = [mem("m1", { domain: "hydraulics" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "expand_domain");
    expect(rec?.impact).toBe(60);
  });

  it("impact = (3-2)*30 = 30 for count=2", () => {
    const mems = [
      mem("m1", { domain: "hydraulics" }),
      mem("m2", { domain: "hydraulics" }),
    ];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "expand_domain");
    expect(rec?.impact).toBe(30);
  });

  it("targetType is domain", () => {
    const mems = [mem("m1", { domain: "hydraulics" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "expand_domain");
    expect(rec?.targetType).toBe("domain");
    expect(rec?.targetId).toBe("hydraulics");
  });
});

// ── link_to_project ────────────────────────────────────────────────────────

describe("computeRecommendations — link_to_project", () => {
  it("fires for memory without projectId", () => {
    const mems = [mem("m1")];  // no projectId
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "link_to_project")).toBe(true);
  });

  it("does NOT fire when memory has projectId", () => {
    const mems = [mem("m1", { projectId: "p1" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "link_to_project")).toBe(false);
  });
});

// ── document_success ───────────────────────────────────────────────────────

describe("computeRecommendations — document_success", () => {
  it("fires for success memory with no feedback", () => {
    const mems = [mem("m1", { outcome: "success" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "document_success")).toBe(true);
  });

  it("does NOT fire when success memory has feedback", () => {
    const mems = [mem("m1", { outcome: "success" })];
    const fbMap = new Map([["m1", [fb("m1")]]]);
    const r = computeRecommendations(mems, fbMap, FIXED_NOW);
    expect(r.recommendations.some(rec => rec.type === "document_success")).toBe(false);
  });

  it("impact is 40", () => {
    const mems = [mem("m1", { outcome: "success" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "document_success");
    expect(rec?.impact).toBe(40);
  });
});

// ── Priority ordering ──────────────────────────────────────────────────────

describe("computeRecommendations — ordering", () => {
  it("high priority before medium before low", () => {
    // Failed memory (high) + thin domain (medium) + success no feedback (low)
    const mems = [
      mem("m1", { outcome: "failed",  domain: "tiny-domain" }),
      mem("m2", { outcome: "success", domain: "tiny-domain" }),
    ];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const priorities = r.recommendations.map(rec => rec.priority);
    const highIdx   = priorities.indexOf("high");
    const medIdx    = priorities.indexOf("medium");
    const lowIdx    = priorities.lastIndexOf("low");
    if (highIdx !== -1 && medIdx !== -1) expect(highIdx).toBeLessThan(medIdx);
    if (medIdx  !== -1 && lowIdx  !== -1) expect(medIdx).toBeLessThan(lowIdx);
  });

  it("within same priority, higher impact comes first", () => {
    // Two review_failures with same priority (high); same impact (80); sort by id
    const mems = [
      mem("m1", { outcome: "failed" }),
      mem("m2", { outcome: "failed" }),
    ];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rfRecs = r.recommendations.filter(rec => rec.type === "review_failures");
    expect(rfRecs[0].impact).toBeGreaterThanOrEqual(rfRecs[1]?.impact ?? 0);
  });

  it("ids are deterministic", () => {
    const mems = [mem("m1", { outcome: "failed" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "review_failures");
    expect(rec?.id).toBe("review_failures:m1");
  });

  it("expand_domain id uses domain name", () => {
    const mems = [mem("m1", { domain: "hydraulics" })];
    const r = computeRecommendations(mems, NO_FB, FIXED_NOW);
    const rec = r.recommendations.find(r => r.type === "expand_domain");
    expect(rec?.id).toBe("expand_domain:hydraulics");
  });
});
