import { describe, it, expect } from "vitest";
import { computeProjectTimeline } from "../project-timeline";
import type {
  StoredProject,
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  ProjectStatus,
} from "@/lib/storage/types";

/**
 * Phase 20B — Timeline engine unit tests.
 *
 * All tests call the pure `computeProjectTimeline` function directly.
 * No I/O, no mocking required.
 */

// ── Factories ──────────────────────────────────────────────────────────────

function proj(overrides: Partial<StoredProject> & { id: string }): StoredProject {
  return {
    id:          overrides.id,
    name:        overrides.name        ?? "Test Project",
    description: overrides.description ?? "test description",
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
  outcome: MemoryOutcome = "unknown",
  createdAt = "2026-01-10T00:00:00.000Z"
): StoredMemory {
  memIdx++;
  return {
    id, query: `query-${memIdx}`, domain,
    analysisSummary: `summary for ${domain}`,
    confidence: 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome, projectId,
    createdAt, updatedAt: createdAt,
  };
}

function fb(
  id: string,
  memoryId: string,
  outcome: MemoryOutcome,
  createdAt = "2026-01-20T00:00:00.000Z"
): StoredMemoryFeedback {
  return { id, memoryId, outcome, createdAt };
}

const FIXED_NOW = new Date("2026-06-17T12:00:00.000Z");

// ── Empty / minimal timeline ────────────────────────────────────────────────

describe("computeProjectTimeline — empty project", () => {
  it("always emits a project_created event", () => {
    const { timeline } = computeProjectTimeline(
      proj({ id: "p1" }), [], new Map(), FIXED_NOW
    );
    expect(timeline).toHaveLength(1);
    expect(timeline[0].type).toBe("project_created");
  });

  it("project_created event has correct timestamp and non-empty title/details", () => {
    const p = proj({ id: "p1", name: "My Project", createdAt: "2026-03-01T08:00:00.000Z" });
    const { timeline } = computeProjectTimeline(p, [], new Map(), FIXED_NOW);
    const evt = timeline[0];
    expect(evt.timestamp).toBe("2026-03-01T08:00:00.000Z");
    expect(evt.title).toContain("My Project");
    expect(evt.details.length).toBeGreaterThan(0);
  });

  it("stats reflect only the project_created event when no memories exist", () => {
    const p = proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" });
    const { stats } = computeProjectTimeline(p, [], new Map(), FIXED_NOW);
    // project_created is always emitted, so first/lastActivity equal the project timestamp
    expect(stats.firstActivity).toBe("2026-01-01T00:00:00.000Z");
    expect(stats.lastActivity).toBe("2026-01-01T00:00:00.000Z");
    expect(stats.totalEvents).toBe(1);
    expect(stats.projectAgeDays).toBeGreaterThan(0);
    expect(stats.activityTrend).toBe("stable");
  });

  it("does NOT emit project_updated when updatedAt equals createdAt", () => {
    const p = proj({
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { timeline } = computeProjectTimeline(p, [], new Map(), FIXED_NOW);
    expect(timeline.every((e) => e.type !== "project_updated")).toBe(true);
  });
});

// ── project_updated ─────────────────────────────────────────────────────────

describe("computeProjectTimeline — project_updated event", () => {
  it("emits project_updated when updatedAt differs from createdAt", () => {
    const p = proj({
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-15T00:00:00.000Z",
    });
    const { timeline } = computeProjectTimeline(p, [], new Map(), FIXED_NOW);
    const updateEvt = timeline.find((e) => e.type === "project_updated");
    expect(updateEvt).toBeDefined();
    expect(updateEvt!.timestamp).toBe("2026-02-15T00:00:00.000Z");
  });
});

// ── memory_created events ───────────────────────────────────────────────────

describe("computeProjectTimeline — memory_created events", () => {
  it("emits one memory_created event per memory", () => {
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-01-05T00:00:00.000Z"),
      mem("m2", "p1", "plc",    "success", "2026-01-10T00:00:00.000Z"),
    ];
    const { timeline } = computeProjectTimeline(
      proj({ id: "p1" }), memories, new Map(), FIXED_NOW
    );
    const memoryEvents = timeline.filter((e) => e.type === "memory_created");
    expect(memoryEvents).toHaveLength(2);
  });

  it("memory_created event includes domain in title", () => {
    const memories = [mem("m1", "p1", "drives", "unknown", "2026-01-05T00:00:00.000Z")];
    const { timeline } = computeProjectTimeline(
      proj({ id: "p1" }), memories, new Map(), FIXED_NOW
    );
    const evt = timeline.find((e) => e.type === "memory_created")!;
    expect(evt.title).toContain("drives");
    expect(evt.timestamp).toBe("2026-01-05T00:00:00.000Z");
  });

  it("uses analysisSummary as details when present", () => {
    const m: StoredMemory = {
      id: "m1", query: "raw query", domain: "sensors",
      analysisSummary: "custom summary", confidence: 60,
      relatedCaseIds: [], relatedDocumentIds: [],
      outcome: "unknown", projectId: "p1",
      createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z",
    };
    const { timeline } = computeProjectTimeline(
      proj({ id: "p1" }), [m], new Map(), FIXED_NOW
    );
    const evt = timeline.find((e) => e.type === "memory_created")!;
    expect(evt.details).toBe("custom summary");
  });

  it("falls back to query when analysisSummary is empty", () => {
    const m: StoredMemory = {
      id: "m1", query: "fallback query", domain: "plc",
      analysisSummary: "", confidence: 60,
      relatedCaseIds: [], relatedDocumentIds: [],
      outcome: "unknown", projectId: "p1",
      createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-05T00:00:00.000Z",
    };
    const { timeline } = computeProjectTimeline(
      proj({ id: "p1" }), [m], new Map(), FIXED_NOW
    );
    const evt = timeline.find((e) => e.type === "memory_created")!;
    expect(evt.details).toBe("fallback query");
  });
});

// ── Feedback events ─────────────────────────────────────────────────────────

describe("computeProjectTimeline — feedback / outcome events", () => {
  it("success feedback → outcome_resolved event", () => {
    const memories = [mem("m1", "p1", "drives")];
    const fbMap = new Map([["m1", [fb("f1", "m1", "success", "2026-02-01T00:00:00.000Z")]]]);
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, fbMap, FIXED_NOW);
    const evt = timeline.find((e) => e.type === "outcome_resolved")!;
    expect(evt).toBeDefined();
    expect(evt.timestamp).toBe("2026-02-01T00:00:00.000Z");
    expect(evt.title).toContain("drives");
  });

  it("failed feedback → outcome_failed event", () => {
    const memories = [mem("m1", "p1", "plc")];
    const fbMap = new Map([["m1", [fb("f1", "m1", "failed", "2026-02-05T00:00:00.000Z")]]]);
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, fbMap, FIXED_NOW);
    expect(timeline.some((e) => e.type === "outcome_failed")).toBe(true);
  });

  it("partial feedback → outcome_partial event", () => {
    const memories = [mem("m1", "p1", "motors")];
    const fbMap = new Map([["m1", [fb("f1", "m1", "partial", "2026-02-10T00:00:00.000Z")]]]);
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, fbMap, FIXED_NOW);
    expect(timeline.some((e) => e.type === "outcome_partial")).toBe(true);
  });

  it("unknown outcome feedback → feedback_added event", () => {
    const memories = [mem("m1", "p1", "sensors")];
    const fbMap = new Map([["m1", [fb("f1", "m1", "unknown", "2026-02-15T00:00:00.000Z")]]]);
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, fbMap, FIXED_NOW);
    expect(timeline.some((e) => e.type === "feedback_added")).toBe(true);
  });

  it("multiple feedback records on one memory generate multiple events", () => {
    const memories = [mem("m1", "p1", "drives")];
    const fbMap = new Map([
      [
        "m1",
        [
          fb("f1", "m1", "failed",  "2026-02-01T00:00:00.000Z"),
          fb("f2", "m1", "partial", "2026-02-05T00:00:00.000Z"),
          fb("f3", "m1", "success", "2026-02-10T00:00:00.000Z"),
        ],
      ],
    ]);
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, fbMap, FIXED_NOW);
    const fbTypes = timeline
      .filter((e) => ["outcome_resolved", "outcome_failed", "outcome_partial"].includes(e.type))
      .map((e) => e.type);
    expect(fbTypes).toContain("outcome_failed");
    expect(fbTypes).toContain("outcome_partial");
    expect(fbTypes).toContain("outcome_resolved");
  });

  it("memory with no feedback generates no outcome/feedback events", () => {
    const memories = [mem("m1", "p1", "drives")];
    const { timeline } = computeProjectTimeline(proj({ id: "p1" }), memories, new Map(), FIXED_NOW);
    const hasFbEvent = timeline.some((e) =>
      ["feedback_added", "outcome_resolved", "outcome_failed", "outcome_partial"].includes(e.type)
    );
    expect(hasFbEvent).toBe(false);
  });
});

// ── Chronological ordering ──────────────────────────────────────────────────

describe("computeProjectTimeline — chronological ordering", () => {
  it("events are ordered by timestamp ascending", () => {
    const p = proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" });
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-03-01T00:00:00.000Z"),
      mem("m2", "p1", "plc",    "unknown", "2026-02-01T00:00:00.000Z"),
    ];
    const { timeline } = computeProjectTimeline(p, memories, new Map(), FIXED_NOW);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].timestamp >= timeline[i - 1].timestamp).toBe(true);
    }
  });

  it("same-timestamp events are ordered alphabetically by type (stable)", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    const p = proj({ id: "p1", createdAt: ts });
    // Memory with same timestamp as project creation
    const memories = [mem("m1", "p1", "drives", "unknown", ts)];
    const { timeline } = computeProjectTimeline(p, memories, new Map(), FIXED_NOW);
    const sameTs = timeline.filter((e) => e.timestamp === ts);
    expect(sameTs.length).toBe(2);
    // 'm' < 'p' alphabetically → memory_created sorts before project_created
    expect(sameTs[0].type).toBe("memory_created");
    expect(sameTs[1].type).toBe("project_created");
  });

  it("project_created is always first in the timeline", () => {
    const p = proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" });
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-01-02T00:00:00.000Z"),
    ];
    const fbMap = new Map([
      ["m1", [fb("f1", "m1", "success", "2026-01-03T00:00:00.000Z")]],
    ]);
    const { timeline } = computeProjectTimeline(p, memories, fbMap, FIXED_NOW);
    expect(timeline[0].type).toBe("project_created");
  });
});

// ── Stats ───────────────────────────────────────────────────────────────────

describe("computeProjectTimeline — stats", () => {
  it("totalEvents counts all generated events", () => {
    const p = proj({ id: "p1" });
    const memories = [
      mem("m1", "p1", "drives"),
      mem("m2", "p1", "plc"),
    ];
    const fbMap = new Map([
      ["m1", [fb("f1", "m1", "success", "2026-02-01T00:00:00.000Z")]],
    ]);
    const { stats } = computeProjectTimeline(p, memories, fbMap, FIXED_NOW);
    // 1 project_created + 2 memory_created + 1 outcome_resolved = 4
    expect(stats.totalEvents).toBe(4);
  });

  it("firstActivity and lastActivity are the first and last event timestamps", () => {
    const p = proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" });
    const memories = [mem("m1", "p1", "drives", "unknown", "2026-03-01T00:00:00.000Z")];
    const fbMap = new Map([
      ["m1", [fb("f1", "m1", "success", "2026-05-01T00:00:00.000Z")]],
    ]);
    const { stats } = computeProjectTimeline(p, memories, fbMap, FIXED_NOW);
    expect(stats.firstActivity).toBe("2026-01-01T00:00:00.000Z");
    expect(stats.lastActivity).toBe("2026-05-01T00:00:00.000Z");
  });

  it("projectAgeDays is non-negative and increases with older projects", () => {
    const recent = proj({ id: "p1", createdAt: FIXED_NOW.toISOString() });
    const older  = proj({ id: "p2", createdAt: "2026-01-01T00:00:00.000Z" });
    const { stats: s1 } = computeProjectTimeline(recent, [], new Map(), FIXED_NOW);
    const { stats: s2 } = computeProjectTimeline(older,  [], new Map(), FIXED_NOW);
    expect(s1.projectAgeDays).toBeGreaterThanOrEqual(0);
    expect(s2.projectAgeDays).toBeGreaterThan(s1.projectAgeDays);
  });

  it("activityTrend: increasing when last 30 days has more events than prior 30", () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    // 3 events in last 30 days, 1 in prior 30
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-05-20T00:00:00.000Z"),  // last 30 days
      mem("m2", "p1", "drives", "unknown", "2026-05-25T00:00:00.000Z"),  // last 30 days
      mem("m3", "p1", "drives", "unknown", "2026-05-10T00:00:00.000Z"),  // prior 30 days
    ];
    const { stats } = computeProjectTimeline(
      proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      memories, new Map(), now
    );
    // last30: m1+m2 = 2 events, prior30: m3 = 1 event → increasing
    expect(stats.activityTrend).toBe("increasing");
  });

  it("activityTrend: decreasing when last 30 has fewer events than prior 30", () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    // 1 event in last 30 days, 3 in prior 30
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-05-25T00:00:00.000Z"),  // last 30 days
      mem("m2", "p1", "drives", "unknown", "2026-05-05T00:00:00.000Z"),  // prior 30
      mem("m3", "p1", "drives", "unknown", "2026-05-08T00:00:00.000Z"),  // prior 30
      mem("m4", "p1", "drives", "unknown", "2026-05-10T00:00:00.000Z"),  // prior 30
    ];
    const { stats } = computeProjectTimeline(
      proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      memories, new Map(), now
    );
    expect(stats.activityTrend).toBe("decreasing");
  });

  it("activityTrend: stable when both 30-day windows have equal event counts", () => {
    const now = new Date("2026-06-17T12:00:00.000Z");
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-05-25T00:00:00.000Z"),  // last 30
      mem("m2", "p1", "drives", "unknown", "2026-05-05T00:00:00.000Z"),  // prior 30
    ];
    const { stats } = computeProjectTimeline(
      proj({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      memories, new Map(), now
    );
    expect(stats.activityTrend).toBe("stable");
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe("computeProjectTimeline — determinism", () => {
  it("same input produces identical output across two calls", () => {
    const p = proj({ id: "p1" });
    const memories = [
      mem("m1", "p1", "drives", "unknown", "2026-02-01T00:00:00.000Z"),
      mem("m2", "p1", "plc",    "unknown", "2026-03-01T00:00:00.000Z"),
    ];
    const fbMap = new Map([
      ["m1", [fb("f1", "m1", "success", "2026-02-15T00:00:00.000Z")]],
    ]);
    const r1 = computeProjectTimeline(p, memories, fbMap, FIXED_NOW);
    const r2 = computeProjectTimeline(p, memories, fbMap, FIXED_NOW);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
