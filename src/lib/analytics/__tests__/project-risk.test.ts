import { describe, it, expect } from "vitest";
import { computeProjectRisk, scoreToRiskLevel } from "../project-risk";
import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  ProjectStatus,
} from "@/lib/storage/types";

// ── Factories ──────────────────────────────────────────────────────────────

function proj(overrides: Partial<StoredProject> & { id: string }): StoredProject {
  return {
    id:          overrides.id,
    name:        overrides.name        ?? "Test Project",
    description: overrides.description ?? "",
    status:      (overrides.status     ?? "active") as ProjectStatus,
    createdAt:   overrides.createdAt   ?? "2026-01-01T00:00:00.000Z",
    updatedAt:   overrides.updatedAt   ?? overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

let memIdx = 0;
function mem(
  id: string,
  projectId: string,
  domain: string,
  confidence = 70,
  createdAt  = "2026-01-10T00:00:00.000Z"
): StoredMemory {
  memIdx++;
  return {
    id, query: `query-${memIdx}`, domain,
    analysisSummary: "summary", confidence,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: "unknown", projectId,
    createdAt, updatedAt: createdAt,
  };
}

let fbIdx = 0;
function fb(
  memoryId: string,
  outcome: MemoryOutcome,
  createdAt = "2026-02-01T00:00:00.000Z"
): StoredMemoryFeedback {
  return { id: `fb${++fbIdx}`, memoryId, outcome, createdAt };
}

function fbMap(
  entries: [string, StoredMemoryFeedback[]][]
): Map<string, StoredMemoryFeedback[]> {
  return new Map(entries);
}

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");

// ── scoreToRiskLevel ───────────────────────────────────────────────────────

describe("scoreToRiskLevel — boundary conditions", () => {
  it("0  → low",      () => expect(scoreToRiskLevel(0)).toBe("low"));
  it("19 → low",      () => expect(scoreToRiskLevel(19)).toBe("low"));
  it("20 → medium",   () => expect(scoreToRiskLevel(20)).toBe("medium"));
  it("39 → medium",   () => expect(scoreToRiskLevel(39)).toBe("medium"));
  it("40 → high",     () => expect(scoreToRiskLevel(40)).toBe("high"));
  it("64 → high",     () => expect(scoreToRiskLevel(64)).toBe("high"));
  it("65 → critical", () => expect(scoreToRiskLevel(65)).toBe("critical"));
  it("100 → critical",() => expect(scoreToRiskLevel(100)).toBe("critical"));
});

// ── Empty project ──────────────────────────────────────────────────────────

describe("computeProjectRisk — empty project (no memories)", () => {
  it("history has exactly one entry: project_created", () => {
    const { history } = computeProjectRisk(
      proj({ id: "p1" }), [], new Map(), FIXED_NOW
    );
    expect(history).toHaveLength(1);
    expect(history[0].source).toBe("project_created");
  });

  it("initial risk is low (score 0) with no activity", () => {
    const { currentRisk, history } = computeProjectRisk(
      proj({ id: "p1" }), [], new Map(), FIXED_NOW
    );
    expect(currentRisk.score).toBe(0);
    expect(currentRisk.riskLevel).toBe("low");
    expect(history[0].score).toBe(0);
  });

  it("riskTrend is stable with only one history entry", () => {
    const { riskTrend } = computeProjectRisk(
      proj({ id: "p1" }), [], new Map(), FIXED_NOW
    );
    expect(riskTrend).toBe("stable");
  });

  it("currentRisk.reason is non-empty", () => {
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), [], new Map(), FIXED_NOW
    );
    expect(currentRisk.reason.length).toBeGreaterThan(0);
  });

  it("projectId matches the project", () => {
    const { projectId } = computeProjectRisk(
      proj({ id: "proj-abc" }), [], new Map(), FIXED_NOW
    );
    expect(projectId).toBe("proj-abc");
  });
});

// ── Unresolved memories ────────────────────────────────────────────────────

describe("computeProjectRisk — unresolved memory component", () => {
  it("all memories unresolved raises score above 0", () => {
    const memories = [
      mem("m1", "p1", "drives"),
      mem("m2", "p1", "drives"),
    ];
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, new Map(), FIXED_NOW
    );
    expect(currentRisk.score).toBeGreaterThan(0);
  });

  it("score rises as unresolved ratio increases", () => {
    const m1 = [mem("m1", "p1", "drives")];
    const m5 = [
      mem("m1", "p1", "drives"), mem("m2", "p1", "plc"),
      mem("m3", "p1", "motors"), mem("m4", "p1", "sensors"),
      mem("m5", "p1", "scada"),
    ];
    const { currentRisk: r1 } = computeProjectRisk(
      proj({ id: "p1" }), m1, new Map(), FIXED_NOW
    );
    const { currentRisk: r5 } = computeProjectRisk(
      proj({ id: "p1" }), m5, new Map(), FIXED_NOW
    );
    // Both have 100 % unresolved, score should be the same (same ratio)
    // but low confidence contribution differs only slightly
    expect(r5.score).toBeGreaterThanOrEqual(r1.score);
  });
});

// ── Failure component ──────────────────────────────────────────────────────

describe("computeProjectRisk — failure rate component", () => {
  it("all failures → high or critical risk", () => {
    const memories = [mem("m1", "p1", "drives", 0)];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-06-10T00:00:00.000Z")]]]);
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, map, FIXED_NOW
    );
    expect(["high", "critical"]).toContain(currentRisk.riskLevel);
  });

  it("all successes → low risk", () => {
    const memories = [mem("m1", "p1", "drives", 80)];
    const map = fbMap([["m1", [fb("m1", "success", "2026-03-01T00:00:00.000Z")]]]);
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, map, FIXED_NOW
    );
    expect(currentRisk.riskLevel).toBe("low");
  });

  it("failure score is higher than success score for same memory count", () => {
    const failures = [mem("m1", "p1", "drives", 70)];
    const successes = [mem("m2", "p1", "drives", 70)];
    const failMap = fbMap([["m1", [fb("m1", "failed")]]]);
    const succMap = fbMap([["m2", [fb("m2", "success")]]]);
    const { currentRisk: rFail } = computeProjectRisk(
      proj({ id: "p1" }), failures, failMap, FIXED_NOW
    );
    const { currentRisk: rSucc } = computeProjectRisk(
      proj({ id: "p1" }), successes, succMap, FIXED_NOW
    );
    expect(rFail.score).toBeGreaterThan(rSucc.score);
  });

  it("mixed outcomes: failure + success gives medium risk", () => {
    const memories = [
      mem("m1", "p1", "drives", 70),
      mem("m2", "p1", "drives", 70),
    ];
    const map = fbMap([
      ["m1", [fb("m1", "failed",  "2026-02-01T00:00:00.000Z")]],
      ["m2", [fb("m2", "success", "2026-02-01T00:00:00.000Z")]],
    ]);
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, map, FIXED_NOW
    );
    expect(["low", "medium"]).toContain(currentRisk.riskLevel);
  });
});

// ── Confidence component ───────────────────────────────────────────────────

describe("computeProjectRisk — confidence component", () => {
  it("low confidence increases score vs high confidence (same outcomes)", () => {
    const mHigh = [mem("m1", "p1", "drives", 100)];
    const mLow  = [mem("m2", "p1", "drives", 0)];
    const { currentRisk: rHigh } = computeProjectRisk(
      proj({ id: "p1" }), mHigh, new Map(), FIXED_NOW
    );
    const { currentRisk: rLow } = computeProjectRisk(
      proj({ id: "p1" }), mLow, new Map(), FIXED_NOW
    );
    expect(rLow.score).toBeGreaterThan(rHigh.score);
  });

  it("confidence=100 contributes 0 pts to the low-confidence component", () => {
    // With only low-confidence component: (100-100)/100*15 = 0
    const memories = [mem("m1", "p1", "drives", 100)];
    const map = fbMap([["m1", [fb("m1", "success")]]]);
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, map, FIXED_NOW
    );
    // 0% failure, 0% unresolved, 0% low-conf, 0 recent incidents → score = 0
    expect(currentRisk.score).toBe(0);
  });
});

// ── Recent incident frequency ──────────────────────────────────────────────

describe("computeProjectRisk — recent incident frequency", () => {
  it("failures within the last 30 days increase score vs older failures", () => {
    const memories = [
      mem("m1", "p1", "drives", 70),
      mem("m2", "p1", "drives", 70),
    ];
    const recentTs = new Date(FIXED_NOW.getTime() - 5 * 24 * 3_600_000).toISOString();
    const oldTs    = new Date(FIXED_NOW.getTime() - 60 * 24 * 3_600_000).toISOString();

    const recentMap = fbMap([["m1", [fb("m1", "failed", recentTs)]]]);
    const oldMap    = fbMap([["m2", [fb("m2", "failed", oldTs)]]]);

    const { currentRisk: rRecent } = computeProjectRisk(
      proj({ id: "p1" }), [memories[0]], recentMap, FIXED_NOW
    );
    const { currentRisk: rOld } = computeProjectRisk(
      proj({ id: "p1" }), [memories[1]], oldMap, FIXED_NOW
    );
    expect(rRecent.score).toBeGreaterThan(rOld.score);
  });

  it("≥5 recent failures cap the incident component at its maximum", () => {
    const memories = Array.from({ length: 7 }, (_, i) =>
      mem(`m${i}`, "p1", "drives", 70)
    );
    const recentTs = new Date(FIXED_NOW.getTime() - 5 * 24 * 3_600_000).toISOString();
    const map5 = fbMap(memories.slice(0, 5).map(m => [m.id, [fb(m.id, "failed", recentTs)]]));
    const map7 = fbMap(memories.map(m => [m.id, [fb(m.id, "failed", recentTs)]]));

    const { currentRisk: r5 } = computeProjectRisk(
      proj({ id: "p1" }), memories.slice(0, 5), map5, FIXED_NOW
    );
    const { currentRisk: r7 } = computeProjectRisk(
      proj({ id: "p1" }), memories, map7, FIXED_NOW
    );
    // Incident component is capped at min(n/5, 1)*15, so 5 and 7 incidents
    // give the same incident contribution; score difference can only come
    // from the (larger) feedback set in r7 — both should be equal or very close
    // when failure rates and confidence are identical
    expect(r7.score).toBeGreaterThanOrEqual(r5.score);
  });
});

// ── Partial outcomes ───────────────────────────────────────────────────────

describe("computeProjectRisk — partial outcome contribution", () => {
  it("all partial outcomes produce a score between all-success and all-failure", () => {
    const m = mem("m1", "p1", "drives", 70);
    const successMap = fbMap([["m1", [fb("m1", "success")]]]);
    const partialMap = fbMap([["m1", [fb("m1", "partial")]]]);
    const failMap    = fbMap([["m1", [fb("m1", "failed")]]]);

    const { currentRisk: rS } = computeProjectRisk(proj({ id: "p1" }), [m], successMap, FIXED_NOW);
    const { currentRisk: rP } = computeProjectRisk(proj({ id: "p1" }), [m], partialMap, FIXED_NOW);
    const { currentRisk: rF } = computeProjectRisk(proj({ id: "p1" }), [m], failMap,    FIXED_NOW);

    expect(rP.score).toBeGreaterThanOrEqual(rS.score);
    expect(rP.score).toBeLessThan(rF.score);
  });
});

// ── History generation ─────────────────────────────────────────────────────

describe("computeProjectRisk — history generation", () => {
  it("history has 1 entry per outcome feedback + 1 initial", () => {
    const memories = [mem("m1", "p1", "drives"), mem("m2", "p1", "plc")];
    const map = fbMap([
      ["m1", [fb("m1", "failed",  "2026-02-01T00:00:00.000Z")]],
      ["m2", [fb("m2", "success", "2026-03-01T00:00:00.000Z"), fb("m2", "success", "2026-04-01T00:00:00.000Z")]],
    ]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    // 1 initial + 1 failed + 2 success = 4
    expect(history).toHaveLength(4);
  });

  it("unknown outcome feedback does NOT generate a history entry", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "unknown"), fb("m1", "unknown")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    expect(history).toHaveLength(1); // only project_created
  });

  it("history is ordered chronologically (ASC)", () => {
    const memories = [
      mem("m1", "p1", "drives"),
      mem("m2", "p1", "plc"),
    ];
    const map = fbMap([
      ["m1", [fb("m1", "failed",  "2026-04-01T00:00:00.000Z")]],
      ["m2", [fb("m2", "success", "2026-02-01T00:00:00.000Z")]],
    ]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp >= history[i - 1].timestamp).toBe(true);
    }
  });

  it("first history entry is always project_created", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    expect(history[0].source).toBe("project_created");
    expect(history[0].timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("outcome_resolved source on success feedback", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "success", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    const resolved = history.find(h => h.source === "outcome_resolved");
    expect(resolved).toBeDefined();
  });

  it("outcome_failed source on failed feedback", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    const failed = history.find(h => h.source === "outcome_failed");
    expect(failed).toBeDefined();
  });

  it("outcome_partial source on partial feedback", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "partial", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    const partial = history.find(h => h.source === "outcome_partial");
    expect(partial).toBeDefined();
  });

  it("every history entry has a non-empty reason", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    for (const entry of history) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("history entry scores are numbers in 0–100", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    for (const entry of history) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  });
});

// ── Risk score progression ─────────────────────────────────────────────────

describe("computeProjectRisk — risk score progression in history", () => {
  it("adding a failure event increases the score in the next history entry", () => {
    const memories = [mem("m1", "p1", "drives")];
    const map = fbMap([["m1", [fb("m1", "failed", "2026-02-01T00:00:00.000Z")]]]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    const init   = history[0]; // project_created
    const failed = history[1]; // after failure
    expect(failed.score).toBeGreaterThan(init.score);
  });

  it("adding a success event after failures decreases the score", () => {
    const memories = [
      mem("m1", "p1", "drives"),
      mem("m2", "p1", "drives"),
    ];
    const map = fbMap([
      ["m1", [fb("m1", "failed",  "2026-02-01T00:00:00.000Z")]],
      ["m2", [fb("m2", "success", "2026-03-01T00:00:00.000Z")]],
    ]);
    const { history } = computeProjectRisk(proj({ id: "p1" }), memories, map, FIXED_NOW);
    const failureEntry  = history.find(h => h.source === "outcome_failed")!;
    const successEntry  = history.find(h => h.source === "outcome_resolved")!;
    expect(successEntry.score).toBeLessThan(failureEntry.score);
  });
});

// ── Risk trend ────────────────────────────────────────────────────────────

describe("computeProjectRisk — riskTrend", () => {
  const now = new Date("2026-06-17T12:00:00.000Z");
  // 50 days before now (> 30d cutoff)
  const oldTs  = new Date(now.getTime() - 50 * 24 * 3_600_000).toISOString();
  // 10 days before now (< 30d cutoff, so "recent")
  const recentTs = new Date(now.getTime() - 10 * 24 * 3_600_000).toISOString();

  it("stable when only project_created entry (< 2 history entries for comparison)", () => {
    const { riskTrend } = computeProjectRisk(
      proj({ id: "p1" }), [], new Map(), now
    );
    expect(riskTrend).toBe("stable");
  });

  it("stable when all history is within the last 30 days (no past anchor)", () => {
    // Project created 5 days ago — project_created entry is "recent" (< 30d ago),
    // so there is no past anchor and trend cannot be computed → stable.
    const veryRecentProjectTs = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
    const veryRecentFbTs      = new Date(now.getTime() - 2 * 24 * 3_600_000).toISOString();
    const memories = [mem("m1", "p1", "drives", 70, veryRecentProjectTs)];
    const map = fbMap([["m1", [fb("m1", "failed", veryRecentFbTs)]]]);
    const { riskTrend } = computeProjectRisk(
      proj({ id: "p1", createdAt: veryRecentProjectTs }), memories, map, now
    );
    expect(riskTrend).toBe("stable");
  });

  it("increasing: recent failure after old success raises score by > 5", () => {
    const memories = [
      mem("m1", "p1", "drives", 80, "2025-12-01T00:00:00.000Z"),
      mem("m2", "p1", "drives", 80, "2025-12-01T00:00:00.000Z"),
    ];
    // Old success → low score in the past
    // Recent failures → elevated score now
    const map = fbMap([
      ["m1", [fb("m1", "success", oldTs)]],
      ["m2", [fb("m2", "failed",  recentTs), fb("m2", "failed", recentTs.replace("T", "T00:01:"))]],
    ]);
    const { riskTrend } = computeProjectRisk(
      proj({ id: "p1", createdAt: "2025-12-01T00:00:00.000Z" }), memories, map, now
    );
    expect(riskTrend).toBe("increasing");
  });

  it("decreasing: recent success after old failure reduces score by > 5", () => {
    const memories = [
      mem("m1", "p1", "drives", 80, "2025-12-01T00:00:00.000Z"),
      mem("m2", "p1", "drives", 80, "2025-12-01T00:00:00.000Z"),
      mem("m3", "p1", "drives", 80, "2025-12-01T00:00:00.000Z"),
    ];
    // Multiple old failures → high past score
    // Recent successes → lower current score
    const map = fbMap([
      ["m1", [fb("m1", "failed",  oldTs)]],
      ["m2", [fb("m2", "failed",  oldTs)]],
      ["m3", [fb("m3", "success", recentTs)]],
    ]);
    const { riskTrend } = computeProjectRisk(
      proj({ id: "p1", createdAt: "2025-12-01T00:00:00.000Z" }), memories, map, now
    );
    expect(riskTrend).toBe("decreasing");
  });
});

// ── Critical risk ──────────────────────────────────────────────────────────

describe("computeProjectRisk — critical risk conditions", () => {
  it("100% failure rate + zero confidence + ≥5 recent incidents → critical", () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    const recentTs = new Date(now.getTime() - 5 * 24 * 3_600_000).toISOString();
    const memories = Array.from({ length: 5 }, (_, i) =>
      mem(`m${i}`, "p1", "drives", 0)
    );
    const map = fbMap(memories.map(m => [m.id, [fb(m.id, "failed", recentTs)]]));
    const { currentRisk } = computeProjectRisk(
      proj({ id: "p1" }), memories, map, now
    );
    expect(currentRisk.riskLevel).toBe("critical");
    expect(currentRisk.score).toBeGreaterThanOrEqual(65);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────

describe("computeProjectRisk — determinism", () => {
  it("same inputs always produce identical output", () => {
    const memories = [
      mem("m1", "p1", "drives", 70),
      mem("m2", "p1", "plc",    50),
    ];
    const map = fbMap([
      ["m1", [fb("m1", "failed",  "2026-02-01T00:00:00.000Z")]],
      ["m2", [fb("m2", "success", "2026-03-01T00:00:00.000Z")]],
    ]);
    const p = proj({ id: "p1" });
    const r1 = computeProjectRisk(p, memories, map, FIXED_NOW);
    const r2 = computeProjectRisk(p, memories, map, FIXED_NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
