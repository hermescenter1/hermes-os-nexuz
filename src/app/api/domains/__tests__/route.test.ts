import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 24 — GET /api/domains route tests.
 * All tests run in session mode (no DATABASE_URL).
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects          = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback    = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

let mIdx = 0;
function seedMemory(id: string, opts: { domain?: string; confidence?: number; outcome?: string } = {}) {
  mIdx++;
  const arr = (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
  arr.push({
    id, query: `query ${mIdx}`,
    domain: opts.domain ?? "drives",
    analysisSummary: `summary ${mIdx}`,
    confidence: opts.confidence ?? 70,
    relatedCaseIds: [], relatedDocumentIds: [],
    outcome: opts.outcome ?? "unknown",
    createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
  });
}

// ── Response shape ─────────────────────────────────────────────────────────

describe("GET /api/domains — response shape", () => {
  it("returns 200 with correct top-level keys", async () => {
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("totalDomains");
    expect(body).toHaveProperty("domains");
    expect(Array.isArray(body.domains)).toBe(true);
  });

  it("each domain entry has required fields", async () => {
    seedMemory("m1");
    const { GET } = await import("../route");
    const { domains } = await (await GET()).json();
    expect(domains.length).toBeGreaterThan(0);
    const d = domains[0];
    expect(d).toHaveProperty("name");
    expect(d).toHaveProperty("memoryCount");
    expect(d).toHaveProperty("avgConfidence");
    expect(d).toHaveProperty("successRate");
    expect(d).toHaveProperty("failureRate");
    expect(d).toHaveProperty("feedbackRate");
    expect(d).toHaveProperty("healthScore");
  });
});

// ── Empty store ────────────────────────────────────────────────────────────

describe("GET /api/domains — empty store", () => {
  it("totalDomains=0 and empty domains array for empty store", async () => {
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.totalDomains).toBe(0);
    expect(body.domains).toEqual([]);
  });
});

// ── Seeded data ────────────────────────────────────────────────────────────

describe("GET /api/domains — seeded data", () => {
  it("counts domains correctly", async () => {
    seedMemory("m1", { domain: "drives" });
    seedMemory("m2", { domain: "hydraulics" });
    const { GET } = await import("../route");
    const body = await (await GET()).json();
    expect(body.totalDomains).toBe(2);
  });

  it("memoryCount per domain reflects actual count", async () => {
    seedMemory("m1", { domain: "drives" });
    seedMemory("m2", { domain: "drives" });
    const { GET } = await import("../route");
    const { domains } = await (await GET()).json();
    const drives = domains.find((d: { name: string }) => d.name === "drives");
    expect(drives?.memoryCount).toBe(2);
  });

  it("successRate reflects outcome distribution", async () => {
    seedMemory("m1", { domain: "drives", outcome: "success" });
    seedMemory("m2", { domain: "drives", outcome: "failed" });
    const { GET } = await import("../route");
    const { domains } = await (await GET()).json();
    const drives = domains.find((d: { name: string }) => d.name === "drives");
    expect(drives?.successRate).toBe(50);
  });

  it("domains sorted by healthScore DESC", async () => {
    seedMemory("m1", { domain: "hydraulics", confidence: 90, outcome: "success" });
    seedMemory("m2", { domain: "drives",     confidence: 30, outcome: "failed"  });
    const { GET } = await import("../route");
    const { domains } = await (await GET()).json();
    expect(domains[0].name).toBe("hydraulics");
    expect(domains[1].name).toBe("drives");
  });
});

// ── Failure fallback ───────────────────────────────────────────────────────

describe("GET /api/domains — failure fallback", () => {
  it("returns 200 with empty list when service throws", async () => {
    vi.doMock("@/lib/services/domain-intelligence-service", () => ({
      getDomainList: () => { throw new Error("db_down"); },
    }));
    const { GET } = await import("../route");
    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDomains).toBe(0);
    expect(body.domains).toEqual([]);
    vi.doUnmock("@/lib/services/domain-intelligence-service");
  });
});

// ── Backward compatibility ─────────────────────────────────────────────────

describe("GET /api/domains — backward compat", () => {
  it("dashboard route unaffected", async () => {
    const { GET } = await import("../../dashboard/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("systemSummary");
    expect(body).toHaveProperty("insights");
  });

  it("knowledge-graph route unaffected", async () => {
    const { GET } = await import("../../knowledge-graph/route");
    const body = await (await GET()).json();
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
  });

  it("memory route unaffected", async () => {
    const { GET } = await import("../../memory/route");
    const res = await GET(new Request("http://localhost/api/memory"));
    expect(res.status).toBe(200);
  });
});
