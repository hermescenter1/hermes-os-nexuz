import { describe, it, expect, beforeEach } from "vitest";
import { scoreMemory, scoreLearned, WEIGHTS } from "../memory-retrieval";
import type { StoredMemory, MemoryWithFeedback } from "@/lib/storage/types";

/**
 * Phase 19A — Project Intelligence: unit tests.
 *
 * Covers:
 *  - Project CRUD (session mode via project-service)
 *  - Project ranking boost in scoreMemory and scoreLearned
 *  - No boost when projectId absent (backward compatibility)
 *  - Feature flag gating in getSimilarMemories
 *  - Storage failure fallback
 */

const FIXED_NOW = new Date("2026-06-20T12:00:00Z");
const RECENT = "2026-06-18T00:00:00Z"; // within 7-day recency window

function mem(overrides: Partial<StoredMemory> & { id: string }): StoredMemory {
  return {
    id: overrides.id,
    query: overrides.query ?? "generic fault",
    domain: overrides.domain ?? "plc",
    analysisSummary: overrides.analysisSummary ?? "check diagnostics",
    confidence: overrides.confidence ?? 50,
    relatedCaseIds: overrides.relatedCaseIds ?? [],
    relatedDocumentIds: overrides.relatedDocumentIds ?? [],
    outcome: overrides.outcome ?? "unknown",
    projectId: overrides.projectId,
    createdAt: overrides.createdAt ?? RECENT,
    updatedAt: overrides.updatedAt ?? RECENT,
  };
}

function memWithFb(
  overrides: Partial<StoredMemory> & { id: string }
): MemoryWithFeedback {
  return { ...mem(overrides), feedback: [] };
}

// ── CRUD tests (session mode) ──────────────────────────────────────────────

describe("project-service — createProject", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesProjects = [];
  });

  it("creates a project with the provided fields", async () => {
    const { createProject } = await import("../project-service");
    const p = await createProject({
      name: "Alfa Cement Line 3",
      description: "Kiln drive retrofit 2026",
      status: "active",
    });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe("Alfa Cement Line 3");
    expect(p.description).toBe("Kiln drive retrofit 2026");
    expect(p.status).toBe("active");
    expect(typeof p.createdAt).toBe("string");
    expect(typeof p.updatedAt).toBe("string");
  });

  it("defaults status to 'active' when not provided", async () => {
    const { createProject } = await import("../project-service");
    const p = await createProject({ name: "Unnamed", description: "" });
    expect(p.status).toBe("active");
  });
});

describe("project-service — listProjects", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesProjects = [];
  });

  it("returns an empty array when no projects exist", async () => {
    const { listProjects } = await import("../project-service");
    const projects = await listProjects();
    expect(projects).toEqual([]);
  });

  it("returns all created projects", async () => {
    const { createProject, listProjects } = await import("../project-service");
    await createProject({ name: "Alpha", description: "first" });
    await createProject({ name: "Beta",  description: "second" });
    const projects = await listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((p) => p.name)).toContain("Alpha");
    expect(projects.map((p) => p.name)).toContain("Beta");
  });
});

describe("project-service — getProject", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesProjects = [];
  });

  it("returns the correct project by id", async () => {
    const { createProject, getProject } = await import("../project-service");
    const created = await createProject({ name: "Gamma", description: "third" });
    const found = await getProject(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("Gamma");
  });

  it("returns null for an unknown project id", async () => {
    const { getProject } = await import("../project-service");
    const result = await getProject("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns null (not a throw) when the store is corrupted", async () => {
    (globalThis as Record<string, unknown>).__hermesProjects = null; // corrupt
    const { getProject } = await import("../project-service");
    await expect(getProject("any-id")).resolves.toBeNull();
  });
});

// ── Project ranking boost in scoreMemory ──────────────────────────────────

describe("scoreMemory — Phase 19A project boost", () => {
  it("adds project_match reason and boost when projectId matches", () => {
    const m = mem({ id: "m1", projectId: "proj-42" });
    const { score, reasons } = scoreMemory("generic fault", m, undefined, FIXED_NOW, "proj-42");
    expect(reasons).toContain("project_match");
    // Verify the score is higher than without project context
    const { score: base } = scoreMemory("generic fault", m, undefined, FIXED_NOW, undefined);
    expect(score).toBeGreaterThan(base);
  });

  it("boost equals WEIGHTS.PROJECT (20 pts, before clamp)", () => {
    // Use a low-scoring memory (no domain match, no keywords, low conf, unknown outcome, old)
    const lowMem = mem({
      id: "low",
      query: "xyz",
      domain: "plc",
      confidence: 0,
      outcome: "unknown",
      createdAt: "2020-01-01T00:00:00Z",
      projectId: "p1",
    });
    const withBoost    = scoreMemory("abc", lowMem, undefined, FIXED_NOW, "p1");
    const withoutBoost = scoreMemory("abc", lowMem, undefined, FIXED_NOW, undefined);
    expect(withBoost.score - withoutBoost.score).toBe(WEIGHTS.PROJECT);
  });

  it("does not add project_match when projectId does not match", () => {
    const m = mem({ id: "m1", projectId: "proj-A" });
    const { reasons } = scoreMemory("fault", m, undefined, FIXED_NOW, "proj-B");
    expect(reasons).not.toContain("project_match");
  });

  it("does not add project_match when memory has no projectId", () => {
    const m = mem({ id: "m1" }); // projectId undefined
    const { reasons } = scoreMemory("fault", m, undefined, FIXED_NOW, "proj-A");
    expect(reasons).not.toContain("project_match");
  });

  it("clamps to 100 even when project boost pushes raw score above 100", () => {
    // High-scoring memory: domain match + keywords + full confidence + success
    const highMem = mem({
      id: "high",
      query: "VFD fault drives ABB ACS580",
      domain: "drives",
      confidence: 100,
      outcome: "success",
      createdAt: RECENT,
      projectId: "p1",
    });
    const { score } = scoreMemory("VFD fault drives ABB ACS580", highMem, "drives", FIXED_NOW, "p1");
    expect(score).toBeLessThanOrEqual(100);
  });

  it("same-project memory ranks higher than an identical off-project memory", () => {
    const base = {
      query: "motor bearing vibration",
      domain: "motors",
      confidence: 60,
      outcome: "unknown" as const,
      createdAt: RECENT,
    };
    const inProject  = mem({ id: "a", ...base, projectId: "proj-X" });
    const outProject = mem({ id: "b", ...base });

    const { score: scoreIn }  = scoreMemory("motor bearing", inProject,  undefined, FIXED_NOW, "proj-X");
    const { score: scoreOut } = scoreMemory("motor bearing", outProject, undefined, FIXED_NOW, "proj-X");
    expect(scoreIn).toBeGreaterThan(scoreOut);
  });

  it("no filterProjectId → identical score to pre-Phase-19A (backward compatible)", () => {
    const m = mem({ id: "m1", confidence: 70, outcome: "success" });
    const { score: withUndefined } = scoreMemory("fault", m, "plc", FIXED_NOW, undefined);
    const { score: withoutParam }  = scoreMemory("fault", m, "plc", FIXED_NOW);
    expect(withUndefined).toBe(withoutParam);
  });
});

// ── Project ranking boost in scoreLearned ─────────────────────────────────

describe("scoreLearned — Phase 19A project boost", () => {
  it("adds project_match reason inside learning-weighted scoring", () => {
    const m = memWithFb({ id: "m1", projectId: "proj-42" });
    const { reasons } = scoreLearned("fault", m, undefined, FIXED_NOW, "proj-42");
    expect(reasons).toContain("project_match");
  });

  it("project boost is modulated by learning weight (inside raw score)", () => {
    // Memory with all-failed feedback → weight ≈ 0.9 (1.0 - 0.10)
    const m: MemoryWithFeedback = {
      ...mem({ id: "m1", projectId: "p1", confidence: 0, createdAt: "2020-01-01T00:00:00Z" }),
      feedback: [{ id: "f1", memoryId: "m1", outcome: "failed", createdAt: RECENT }],
    };
    const withProject    = scoreLearned("abc", m, undefined, FIXED_NOW, "p1");
    const withoutProject = scoreLearned("abc", m, undefined, FIXED_NOW, undefined);
    // Project boost is present but dampened by failed history
    expect(withProject.score).toBeGreaterThan(withoutProject.score);
    // Boost is < full WEIGHTS.PROJECT because weight < 1.0
    expect(withProject.score - withoutProject.score).toBeLessThan(WEIGHTS.PROJECT);
  });

  it("no filterProjectId → identical score to Phase 18C (backward compatible)", () => {
    const m = memWithFb({ id: "m1", confidence: 70 });
    const { score: withUndefined } = scoreLearned("fault", m, "plc", FIXED_NOW, undefined);
    const { score: withoutParam }  = scoreLearned("fault", m, "plc", FIXED_NOW);
    expect(withUndefined).toBe(withoutParam);
  });
});

// ── Feature flag gating in getSimilarMemories ──────────────────────────────

describe("getSimilarMemories — project flag gating (session mode)", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
    delete process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED;
  });

  it("when flag is on, same-project memory ranks above off-project memory", async () => {
    process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED = "true";
    const { createEngineeringMemory, getSimilarMemories } = await import("../memory-service");

    const inProject = await createEngineeringMemory({
      query: "pump cavitation fault",
      domain: "hydraulics",
      analysisSummary: "check inlet pressure",
      confidence: 50,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
      projectId: "project-alpha",
    });
    await createEngineeringMemory({
      query: "pump cavitation fault",
      domain: "hydraulics",
      analysisSummary: "check inlet pressure",
      confidence: 50,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    const results = await getSimilarMemories(
      "pump cavitation fault",
      "hydraulics",
      10,
      "project-alpha"
    );
    expect(results[0].id).toBe(inProject.id);
    expect(results[0].reasons).toContain("project_match");
  });

  it("when flag is off, projectId is ignored and results are equivalent to no-project search", async () => {
    delete process.env.HERMES_PROJECT_INTELLIGENCE_ENABLED;
    const { createEngineeringMemory, getSimilarMemories } = await import("../memory-service");

    await createEngineeringMemory({
      query: "pump cavitation fault",
      domain: "hydraulics",
      analysisSummary: "check inlet pressure",
      confidence: 50,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
      projectId: "project-alpha",
    });

    const withProject    = await getSimilarMemories("pump cavitation", "hydraulics", 10, "project-alpha");
    const withoutProject = await getSimilarMemories("pump cavitation", "hydraulics", 10);

    // With flag off, scores must be identical (project boost never applied)
    expect(withProject[0].score).toBe(withoutProject[0].score);
    expect(withProject[0].reasons).not.toContain("project_match");
  });
});
