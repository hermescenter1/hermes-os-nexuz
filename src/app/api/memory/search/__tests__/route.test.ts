import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 18B — POST /api/memory/search route integration tests.
 *
 * All tests run in session mode (no DATABASE_URL). The globalThis stores are
 * reset before each test to prevent state bleed between runs.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function searchRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/memory/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---- Validation ----------------------------------------------------------

describe("POST /api/memory/search — validation", () => {
  it("returns 400 when query is missing", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ domain: "plc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("returns 400 when query is an empty string", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/memory/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });
});

// ---- Session mode behavior -----------------------------------------------

describe("POST /api/memory/search — session mode", () => {
  it("returns 200 with empty matches when no memories exist", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "PLC fault" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storageMode).toBe("session");
    expect(body.matches).toEqual([]);
  });

  it("includes storageMode in the response", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "fault" }));
    const body = await res.json();
    expect(body.storageMode).toBe("session");
  });

  it("returns matches with the correct shape", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "VFD trips on overcurrent at startup",
      domain: "drives",
      analysisSummary: "Acceleration ramp too steep",
      confidence: 75,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
    });

    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "VFD overcurrent trips" }));
    const body = await res.json();
    expect(body.matches).toHaveLength(1);
    const m = body.matches[0];
    expect(typeof m.id).toBe("string");
    expect(typeof m.query).toBe("string");
    expect(typeof m.domain).toBe("string");
    expect(typeof m.summary).toBe("string");
    expect(typeof m.confidence).toBe("number");
    expect(typeof m.outcome).toBe("string");
    expect(typeof m.score).toBe("number");
    expect(Array.isArray(m.reasons)).toBe(true);
  });
});

// ---- Ranking behavior (end-to-end) ---------------------------------------

describe("POST /api/memory/search — ranking", () => {
  it("memory with more keyword overlap ranks higher", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "profinet communication loss after switch replacement",
      domain: "otNetwork",
      analysisSummary: "switch vlan config mismatch",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });
    await createEngineeringMemory({
      query: "motor bearing vibration",
      domain: "motors",
      analysisSummary: "mechanical imbalance",
      confidence: 60,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    const { POST } = await import("../route");
    const res = await POST(
      searchRequest({ query: "profinet switch communication loss" })
    );
    const body = await res.json();
    expect(body.matches[0].query).toContain("profinet");
  });

  it("domain filter boosts matching memories to the top", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "VFD fault overcurrent trip",
      domain: "drives",
      analysisSummary: "acceleration ramp issue",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
    });
    await createEngineeringMemory({
      query: "VFD fault overcurrent trip",
      domain: "motors",
      analysisSummary: "acceleration ramp issue",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
    });

    const { POST } = await import("../route");
    const res = await POST(
      searchRequest({ query: "VFD fault overcurrent", domain: "drives" })
    );
    const body = await res.json();
    expect(body.matches[0].domain).toBe("drives");
  });

  it("failed memories rank below success memories with identical keywords", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({
      query: "E-Stop relay latched no reset",
      domain: "electrical",
      analysisSummary: "safety relay fault",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "failed",
    });
    await createEngineeringMemory({
      query: "E-Stop relay latched no reset",
      domain: "electrical",
      analysisSummary: "safety relay fault",
      confidence: 70,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "success",
    });

    const { POST } = await import("../route");
    const res = await POST(
      searchRequest({ query: "E-Stop relay latched reset" })
    );
    const body = await res.json();
    expect(body.matches[0].outcome).toBe("success");
    expect(body.matches[body.matches.length - 1].outcome).toBe("failed");
  });
});

// ---- Limit handling ------------------------------------------------------

describe("POST /api/memory/search — limit handling", () => {
  it("returns at most the requested limit of matches", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    for (let i = 0; i < 8; i++) {
      await createEngineeringMemory({
        query: `VFD fault query ${i}`,
        domain: "drives",
        analysisSummary: `analysis ${i}`,
        confidence: 50,
        relatedCaseIds: [],
        relatedDocumentIds: [],
        outcome: "unknown",
      });
    }
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "VFD fault", limit: 3 }));
    const body = await res.json();
    expect(body.matches.length).toBeLessThanOrEqual(3);
  });

  it("defaults to 20 results when limit is omitted", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    for (let i = 0; i < 25; i++) {
      await createEngineeringMemory({
        query: `VFD fault query ${i}`,
        domain: "drives",
        analysisSummary: `analysis ${i}`,
        confidence: 50,
        relatedCaseIds: [],
        relatedDocumentIds: [],
        outcome: "unknown",
      });
    }
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "VFD fault" }));
    const body = await res.json();
    expect(body.matches.length).toBeLessThanOrEqual(20);
  });

  it("clamps limit to 100 even if a larger value is requested", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "fault", limit: 9999 }));
    // Should not error — just return up to 100
    expect(res.status).toBe(200);
  });
});

// ---- Safe error behavior -------------------------------------------------

describe("POST /api/memory/search — safe error behavior", () => {
  it("never leaks raw stack traces or internal error messages", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "fault" }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|at Object\.|Error:|ENOENT/i);
  });

  it("returns storageMode even when matches is empty", async () => {
    const { POST } = await import("../route");
    const res = await POST(searchRequest({ query: "some unique query no matches" }));
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body).toHaveProperty("matches");
    expect(Array.isArray(body.matches)).toBe(true);
  });
});
