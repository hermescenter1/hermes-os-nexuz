import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Phase 18A — /api/memory route integration tests.
 *
 * All tests run in session mode (no DATABASE_URL). Each test resets the
 * in-process globalThis stores and re-imports route modules so state never
 * bleeds between tests.
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

function postMemory(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/memory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idReq(
  id: string,
  path: string,
  method = "GET",
  body?: Record<string, unknown>
): { req: Request; params: Promise<{ id: string }> } {
  return {
    req: new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    params: Promise.resolve({ id }),
  };
}

// ---- GET /api/memory ----

describe("GET /api/memory", () => {
  it("returns an empty list when no memories exist", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/memory"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memories).toEqual([]);
    expect(body.storageMode).toBe("session");
  });

  it("returns memories that were previously created", async () => {
    const { POST, GET } = await import("../route");
    await POST(postMemory({ query: "PLC stops every hour", domain: "plc" }));
    const res = await GET(new Request("http://localhost/api/memory"));
    const body = await res.json();
    expect(body.memories).toHaveLength(1);
    expect(body.memories[0].query).toBe("PLC stops every hour");
  });

  it("respects the ?limit query param", async () => {
    const { POST, GET } = await import("../route");
    for (let i = 0; i < 5; i++) {
      await POST(postMemory({ query: `Q${i}`, domain: "plc" }));
    }
    const res = await GET(new Request("http://localhost/api/memory?limit=2"));
    const body = await res.json();
    expect(body.memories).toHaveLength(2);
  });
});

// ---- POST /api/memory ----

describe("POST /api/memory — validation", () => {
  it("rejects missing query", async () => {
    const { POST } = await import("../route");
    const res = await POST(postMemory({ domain: "plc" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("query_required");
  });

  it("rejects missing domain", async () => {
    const { POST } = await import("../route");
    const res = await POST(postMemory({ query: "Motor overheats" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("domain_required");
  });

  it("rejects an invalid outcome value", async () => {
    const { POST } = await import("../route");
    const res = await POST(postMemory({ query: "Q", domain: "drives", outcome: "resolved" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_outcome");
    expect(Array.isArray(body.valid)).toBe(true);
  });

  it("rejects invalid JSON body", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });
});

describe("POST /api/memory — success", () => {
  it("creates a memory and returns 201 with all fields", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      postMemory({
        query: "VFD trips on overcurrent",
        domain: "drives",
        analysisSummary: "Acceleration ramp too steep",
        confidence: 78,
        relatedCaseIds: ["case-123"],
        relatedDocumentIds: ["doc-456"],
        outcome: "unknown",
        notes: "Check fault log first",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.storageMode).toBe("session");
    expect(body.memory.id).toMatch(/^mem-/);
    expect(body.memory.query).toBe("VFD trips on overcurrent");
    expect(body.memory.domain).toBe("drives");
    expect(body.memory.analysisSummary).toBe("Acceleration ramp too steep");
    expect(body.memory.confidence).toBe(78);
    expect(body.memory.relatedCaseIds).toEqual(["case-123"]);
    expect(body.memory.relatedDocumentIds).toEqual(["doc-456"]);
    expect(body.memory.outcome).toBe("unknown");
    expect(body.memory.notes).toBe("Check fault log first");
  });

  it("defaults confidence to 0 and outcome to unknown when omitted", async () => {
    const { POST } = await import("../route");
    const res = await POST(postMemory({ query: "SCADA alarm flood", domain: "scada" }));
    const body = await res.json();
    expect(body.memory.confidence).toBe(0);
    expect(body.memory.outcome).toBe("unknown");
    expect(body.memory.relatedCaseIds).toEqual([]);
  });

  it("clamps confidence to 0-100", async () => {
    const { POST } = await import("../route");
    const tooBig = await POST(postMemory({ query: "Q", domain: "plc", confidence: 150 }));
    expect((await tooBig.json()).memory.confidence).toBe(100);
    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    const tooSmall = await POST(postMemory({ query: "Q", domain: "plc", confidence: -5 }));
    expect((await tooSmall.json()).memory.confidence).toBe(0);
  });
});

// ---- GET /api/memory/[id] ----

describe("GET /api/memory/[id]", () => {
  it("returns 404 for an unknown id", async () => {
    const { GET } = await import("../[id]/route");
    const { req, params } = idReq("no-such-id", "/api/memory/no-such-id");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("returns the memory with an empty feedback array", async () => {
    const { POST: postRoute } = await import("../route");
    const created = await (
      await postRoute(postMemory({ query: "Sensor drift", domain: "sensors" }))
    ).json();
    const memId = created.memory.id;

    vi.resetModules();
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory =
      (globalThis as Record<string, unknown>).__hermesEngineeringMemory;

    const { GET } = await import("../[id]/route");
    const { req, params } = idReq(memId, `/api/memory/${memId}`);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memory.id).toBe(memId);
    expect(body.memory.query).toBe("Sensor drift");
    expect(body.memory.feedback).toEqual([]);
  });

  it("returns the memory with its feedback attached", async () => {
    const { createEngineeringMemory, addMemoryFeedback } = await import(
      "@/lib/memory/memory-service"
    );
    const mem = await createEngineeringMemory({
      query: "E-Stop no reset",
      domain: "electrical",
      analysisSummary: "Safety relay latched",
      confidence: 85,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });
    await addMemoryFeedback(mem.id, {
      memoryId: mem.id,
      outcome: "success",
      notes: "Reset safety relay",
      submittedBy: "engineer@plant.io",
    });

    const { GET } = await import("../[id]/route");
    const { req, params } = idReq(mem.id, `/api/memory/${mem.id}`);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.memory.feedback).toHaveLength(1);
    expect(body.memory.feedback[0].outcome).toBe("success");
    expect(body.memory.feedback[0].notes).toBe("Reset safety relay");
    expect(body.memory.feedback[0].submittedBy).toBe("engineer@plant.io");
    // Parent outcome mirrored
    expect(body.memory.outcome).toBe("success");
  });
});

// ---- POST /api/memory/[id]/feedback ----

describe("POST /api/memory/[id]/feedback — validation", () => {
  it("returns 400 for missing outcome", async () => {
    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq("any-id", "/api/memory/any-id/feedback", "POST", {
      notes: "no outcome field",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_outcome");
  });

  it("returns 400 for an invalid outcome value", async () => {
    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq("any-id", "/api/memory/any-id/feedback", "POST", {
      outcome: "maybe",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the memory does not exist", async () => {
    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq("ghost-id", "/api/memory/ghost-id/feedback", "POST", {
      outcome: "failed",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});

describe("POST /api/memory/[id]/feedback — success", () => {
  it("creates feedback and returns 201", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory({
      query: "Motor bearings overheating",
      domain: "motors",
      analysisSummary: "Lubrication failure",
      confidence: 90,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq(mem.id, `/api/memory/${mem.id}/feedback`, "POST", {
      outcome: "success",
      notes: "Re-greased bearings, issue resolved",
      submittedBy: "technician@plant.io",
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.storageMode).toBe("session");
    expect(body.feedback.id).toMatch(/^fb-/);
    expect(body.feedback.memoryId).toBe(mem.id);
    expect(body.feedback.outcome).toBe("success");
    expect(body.feedback.notes).toBe("Re-greased bearings, issue resolved");
    expect(body.feedback.submittedBy).toBe("technician@plant.io");
  });

  it("updates the parent memory outcome after feedback", async () => {
    const { createEngineeringMemory, getEngineeringMemory } = await import(
      "@/lib/memory/memory-service"
    );
    const mem = await createEngineeringMemory({
      query: "Profinet comm loss",
      domain: "otNetwork",
      analysisSummary: "Switch replacement issue",
      confidence: 65,
      relatedCaseIds: [],
      relatedDocumentIds: [],
      outcome: "unknown",
    });

    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq(mem.id, `/api/memory/${mem.id}/feedback`, "POST", {
      outcome: "partial",
    });
    await POST(req, { params });

    const updated = await getEngineeringMemory(mem.id);
    expect(updated!.outcome).toBe("partial");
  });

  it("never exposes raw internal errors in the response", async () => {
    const { POST } = await import("../[id]/feedback/route");
    const { req, params } = idReq("ghost", "/api/memory/ghost/feedback", "POST", {
      outcome: "failed",
    });
    const res = await POST(req, { params });
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|at Object\.|Error:/i);
  });
});
