import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockEngineer, mockViewer, mockNoUser, unmockAuth } from "@/test/mock-auth";

/**
 * Phase 19A — /api/projects route tests.
 *
 * All tests run in session mode (no DATABASE_URL).
 * Covers GET /api/projects, POST /api/projects, GET /api/projects/[id].
 *
 * Phase 82D.1: /api/projects writes and /api/projects/[id] are authoring-gated
 * (root GET is a soft gate that returns an empty list to non-authoring
 * callers). Tests mock an authoring session by default; the "auth gate" blocks
 * override it to prove the 401/403/empty-list invariants.
 */

const ENV_KEYS = [
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
  "HERMES_PROJECT_INTELLIGENCE_ENABLED",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  mockEngineer();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

function postReq(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

// ── GET /api/projects ────────────────────────────────────────────────────

describe("GET /api/projects", () => {
  it("returns 200 with an empty projects array when no projects exist", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBe(0);
    expect(body.storageMode).toBe("session");
  });

  it("returns all projects after creation", async () => {
    const { POST, GET } = await import("../route");
    await POST(postReq("/api/projects", { name: "Alpha", description: "first" }));
    await POST(postReq("/api/projects", { name: "Beta",  description: "second" }));

    const res = await GET();
    const body = await res.json();
    expect(body.projects.length).toBe(2);
    expect(body.projects.map((p: { name: string }) => p.name)).toContain("Alpha");
    expect(body.projects.map((p: { name: string }) => p.name)).toContain("Beta");
  });
});

// ── POST /api/projects ───────────────────────────────────────────────────

describe("POST /api/projects", () => {
  it("creates a project and returns 201 with the new record", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      postReq("/api/projects", {
        name: "Line 3 Retrofit",
        description: "Kiln drive upgrade 2026",
        status: "active",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project).toBeDefined();
    expect(body.project.id).toBeTruthy();
    expect(body.project.name).toBe("Line 3 Retrofit");
    expect(body.project.description).toBe("Kiln drive upgrade 2026");
    expect(body.project.status).toBe("active");
    expect(body.storageMode).toBe("session");
  });

  it("defaults status to 'active' when not provided", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq("/api/projects", { name: "Minimal" }));
    const body = await res.json();
    expect(body.project.status).toBe("active");
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq("/api/projects", { description: "no name" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("name_required");
  });

  it("returns 400 when name is empty", async () => {
    const { POST } = await import("../route");
    const res = await POST(postReq("/api/projects", { name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("name_required");
  });

  it("returns 400 for an invalid status value", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      postReq("/api/projects", { name: "X", status: "deleted" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_status");
    expect(Array.isArray(body.valid)).toBe(true);
  });

  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("accepts 'archived' and 'completed' as valid statuses", async () => {
    const { POST } = await import("../route");
    const archivedRes = await POST(postReq("/api/projects", { name: "Old", status: "archived" }));
    expect(archivedRes.status).toBe(201);

    const completedRes = await POST(postReq("/api/projects", { name: "Done", status: "completed" }));
    expect(completedRes.status).toBe(201);
  });
});

// ── GET /api/projects/[id] ───────────────────────────────────────────────

describe("GET /api/projects/[id]", () => {
  it("returns 200 with the correct project when found", async () => {
    // Create via list route first
    const { POST: projectPost } = await import("../route");
    const createRes = await projectPost(
      postReq("/api/projects", { name: "Zeta", description: "test project" })
    );
    const { project: created } = await createRes.json();

    const { GET } = await import("../[id]/route");
    const res = await GET(getReq(`/api/projects/${created.id}`), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe(created.id);
    expect(body.project.name).toBe("Zeta");
  });

  it("returns 404 for an unknown project id", async () => {
    const { GET } = await import("../[id]/route");
    const res = await GET(getReq("/api/projects/no-such-id"), {
      params: Promise.resolve({ id: "no-such-id" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});

// ── Storage failure fallback ──────────────────────────────────────────────

describe("GET /api/projects — storage failure fallback", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/memory/project-service");
  });

  it("returns 200 with empty array when listProjects throws", async () => {
    vi.doMock("@/lib/memory/project-service", () => ({
      listProjects: vi.fn().mockRejectedValue(new Error("simulated store failure")),
      createProject: vi.fn(),
      isValidProjectStatus: vi.fn().mockReturnValue(true),
    }));

    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toEqual([]);
    // Raw error never leaks
    const text = JSON.stringify(body);
    expect(text).not.toContain("simulated store failure");
  });
});

// ── Backward compatibility: existing memory endpoints unaffected ──────────

describe("backward compatibility — existing /api/memory endpoints unchanged", () => {
  it("POST /api/memory still works without projectId", async () => {
    const { POST } = await import("../../memory/route");
    const res = await POST(
      postReq("/api/memory", {
        query: "VFD overcurrent trip",
        domain: "drives",
        analysisSummary: "check ramp settings",
        confidence: 75,
        outcome: "unknown",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.memory.query).toBe("VFD overcurrent trip");
    expect(body.memory.projectId).toBeUndefined();
  });

  it("POST /api/memory accepts and stores optional projectId field", async () => {
    const { POST: projectPost } = await import("../route");
    const projRes = await projectPost(postReq("/api/projects", { name: "TestProj" }));
    const { project } = await projRes.json();

    const { POST } = await import("../../memory/route");
    const res = await POST(
      postReq("/api/memory", {
        query: "sensor drift detected",
        domain: "sensors",
        analysisSummary: "recalibrate",
        confidence: 60,
        outcome: "unknown",
        projectId: project.id,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // Phase 19A: projectId is now stored on the memory record
    expect(body.memory.projectId).toBe(project.id);
  });
});

// ── Auth gate (Phase 82D.1) ───────────────────────────────────────────────

describe("POST /api/projects — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    mockNoUser();
    const { POST } = await import("../route");
    const res = await POST(postReq("/api/projects", { name: "X" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a non-authoring (viewer) user", async () => {
    vi.resetModules();
    mockViewer();
    const { POST } = await import("../route");
    const res = await POST(postReq("/api/projects", { name: "X" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });
});

describe("GET /api/projects — soft gate returns empty list to non-authoring", () => {
  it("unauthenticated GET returns 200 with storageMode and empty projects", async () => {
    // Seed a project via the authoring default, then re-query as anonymous.
    const { POST } = await import("../route");
    await POST(postReq("/api/projects", { name: "Seeded" }));

    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storageMode).toBe("session");
    expect(body.projects).toEqual([]);
  });

  it("viewer GET returns 200 with storageMode and empty projects", async () => {
    const { POST } = await import("../route");
    await POST(postReq("/api/projects", { name: "Seeded" }));

    vi.resetModules();
    mockViewer();
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storageMode).toBe("session");
    expect(body.projects).toEqual([]);
  });
});

describe("GET /api/projects/[id] — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.resetModules();
    mockNoUser();
    const { GET } = await import("../[id]/route");
    const res = await GET(getReq("/api/projects/any"), {
      params: Promise.resolve({ id: "any" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Authentication required." });
  });

  it("returns 403 for a non-authoring (viewer) user", async () => {
    vi.resetModules();
    mockViewer();
    const { GET } = await import("../[id]/route");
    const res = await GET(getReq("/api/projects/any"), {
      params: Promise.resolve({ id: "any" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "Insufficient permissions." });
  });

  it("lets an authoring user reach the repository (404 for unknown id)", async () => {
    // Default beforeEach mock is an authoring engineer.
    const { GET } = await import("../[id]/route");
    const res = await GET(getReq("/api/projects/no-such-id"), {
      params: Promise.resolve({ id: "no-such-id" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
