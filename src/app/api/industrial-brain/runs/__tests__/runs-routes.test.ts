/**
 * PHASE 112 — route tests for the reasoning-run API surface.
 *
 * Uses the repository test double + mocked auth/rate-limit/audit seams so the
 * real route + service + engine + integrity code runs. Covers: anonymous
 * rejection, org-permission enforcement, mandatory idempotency key, idempotent
 * replay, cross-tenant 404, no-store headers, and replay semantics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { InMemoryReasoningRunRepository } from "@/lib/reasoning-runs/__tests__/fake-repository";

const MOCKED = [
  "@/lib/api/auth",
  "@/lib/org/context",
  "@/lib/auth/rate-limiter",
  "@/lib/audit/audit-service",
  "@/lib/reasoning-runs/prisma-repository",
];

// Mutable auth state per test.
let authState: { anonymous: boolean; orgId: string; userId: string; role: string };
let repo: InMemoryReasoningRunRepository;

function setActor(orgId: string, userId: string, role: string) {
  authState = { anonymous: false, orgId, userId, role };
}

beforeEach(() => {
  vi.resetModules();
  repo = new InMemoryReasoningRunRepository();
  authState = { anonymous: false, orgId: "orgA", userId: "userA", role: "OWNER" };

  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () =>
      authState.anonymous
        ? { error: "Authentication required", status: 401 }
        : { ctx: { orgId: authState.orgId, userId: authState.userId, authMethod: "jwt", scopes: ["admin"] } },
  }));
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () =>
      authState.anonymous
        ? { error: "Authentication required", status: 401 }
        : { ctx: { userId: authState.userId, orgId: authState.orgId, memberId: "m1", role: authState.role, status: "ACTIVE" } },
  }));
  vi.doMock("@/lib/auth/rate-limiter", () => ({
    checkRateLimit: async () => true,
    retryAfter: () => 60,
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: () => {},
    REASONING_AUDIT: {
      RUN_CREATED: "reasoning.run.created",
      RUN_REPLAY_ARCHIVAL: "reasoning.run.replay.archival",
      RUN_REPLAY_EXECUTION: "reasoning.run.replay.execution",
    },
  }));
  vi.doMock("@/lib/reasoning-runs/prisma-repository", () => ({ reasoningRunRepository: repo }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

function postRun(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://www.hermesnovin.com/api/industrial-brain/runs", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": "route-idem-000000001", ...headers },
    body: JSON.stringify(body),
  });
}

const validInput = {
  input: {
    problemTitle: "Pump cavitation suspected on line 3",
    observedSymptoms: "Suction pressure low and noise increasing on the pump during operation.",
  },
};

describe("POST /runs — auth + validation", () => {
  it("rejects an anonymous caller with 401", async () => {
    authState.anonymous = true;
    const { POST } = await import("../route");
    const res = await POST(postRun(validInput));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects a role without manage_industrial with 403", async () => {
    setActor("orgA", "userA", "VIEWER");
    const { POST } = await import("../route");
    const res = await POST(postRun(validInput));
    expect(res.status).toBe(403);
  });

  it("requires an idempotency key (400 when missing)", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("https://www.hermesnovin.com/api/industrial-brain/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validInput),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid analysis input with 400 (no rejected value echoed)", async () => {
    const { POST } = await import("../route");
    const res = await POST(postRun({ input: { problemTitle: "x", observedSymptoms: "y" } }));
    expect(res.status).toBe(400);
    const bodyText = await res.text();
    expect(bodyText).not.toContain("problemTitle\":\"x");
  });

  it("creates a run (201) then returns the SAME run on idempotent retry (200)", async () => {
    const { POST } = await import("../route");
    const first = await POST(postRun(validInput));
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.run.id).toBeTruthy();
    expect(firstBody.run.engine.engineId).toBe("hermes-industrial-brain");

    const second = await POST(postRun(validInput));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.run.id).toBe(firstBody.run.id);
    expect(repo.runs.size).toBe(1);
  });

  it("rejects idempotency-key reuse with a different request (409)", async () => {
    const { POST } = await import("../route");
    await POST(postRun(validInput));
    const res = await POST(
      postRun({ input: { problemTitle: "A different fault entirely here", observedSymptoms: "Unrelated symptoms described in full for this second request." } }),
    );
    expect(res.status).toBe(409);
  });
});

describe("GET /runs/[id] — tenant scoping + integrity", () => {
  it("returns 404 for another organization's run", async () => {
    const { POST } = await import("../route");
    const created = await POST(postRun(validInput));
    const { run } = await created.json();

    // Switch to a different tenant and try to read.
    setActor("orgB", "userB", "OWNER");
    const { GET } = await import("../[id]/route");
    const res = await GET(
      new NextRequest(`https://www.hermesnovin.com/api/industrial-brain/runs/${run.id}`),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns the run + verified artifacts for the owning tenant", async () => {
    const { POST } = await import("../route");
    const created = await POST(postRun(validInput));
    const { run } = await created.json();

    const { GET } = await import("../[id]/route");
    const res = await GET(
      new NextRequest(`https://www.hermesnovin.com/api/industrial-brain/runs/${run.id}`),
      { params: Promise.resolve({ id: run.id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.id).toBe(run.id);
    expect(body.artifacts.length).toBeGreaterThan(0);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("POST /runs/[id]/replay — semantics", () => {
  function replayReq(id: string, mode: string): NextRequest {
    return new NextRequest(`https://www.hermesnovin.com/api/industrial-brain/runs/${id}/replay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  }

  it("EXECUTION replay of a fresh run reports MATCH", async () => {
    const { POST } = await import("../route");
    const created = await POST(postRun(validInput));
    const { run } = await created.json();

    const { POST: REPLAY } = await import("../[id]/replay/route");
    const res = await REPLAY(replayReq(run.id, "EXECUTION"), { params: Promise.resolve({ id: run.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("MATCH");
  });

  it("ARCHIVAL replay by a VIEWER is allowed; EXECUTION by a VIEWER is 403", async () => {
    const { POST } = await import("../route");
    const created = await POST(postRun(validInput));
    const { run } = await created.json();

    setActor("orgA", "userA", "VIEWER");
    const { POST: REPLAY } = await import("../[id]/replay/route");
    const archival = await REPLAY(replayReq(run.id, "ARCHIVAL"), { params: Promise.resolve({ id: run.id }) });
    expect(archival.status).toBe(200);
    const execution = await REPLAY(replayReq(run.id, "EXECUTION"), { params: Promise.resolve({ id: run.id }) });
    expect(execution.status).toBe(403);
  });
});
