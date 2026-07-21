import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNoUser, mockViewer, mockEngineer, unmockAuth } from "@/test/mock-auth";

/**
 * PHASE 90 — the knowledge-graph and domain-intelligence routes project the
 * PRIVATE engineering memory store (raw query text, project names, outcomes)
 * into graph / aggregate form. Their canonical sources — /api/memory and
 * /api/projects — were gated by Phase 82C, but these projections stayed
 * anonymous, leaving a side door around that hardening.
 *
 * These tests assert the CLOSED boundary: an anonymous or non-authoring caller
 * gets the empty/404 shape and, critically, none of the seeded private text.
 * The behavioural suites next to each route assert the authorised view.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

const PRIVATE_QUERY = "SECRET_TURBINE_VIBRATION_INVESTIGATION";
const PRIVATE_PROJECT = "SECRET_CLIENT_PROJECT";

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();

  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  (globalThis as Record<string, unknown>).__hermesProjects = [
    {
      id: "p1", name: PRIVATE_PROJECT, description: "d", status: "active",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [
    {
      id: "m1", query: PRIVATE_QUERY, domain: "drives",
      analysisSummary: "s", confidence: 80, relatedCaseIds: [], relatedDocumentIds: [],
      outcome: "success", projectId: "p1",
      createdAt: "2026-01-10T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z",
    },
  ];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

/** Nothing private may appear anywhere in a denied response. */
function expectNoPrivateContent(payload: unknown) {
  const raw = JSON.stringify(payload);
  expect(raw).not.toContain(PRIVATE_QUERY);
  expect(raw).not.toContain(PRIVATE_PROJECT);
}

describe("90A — knowledge graph is closed to unauthorised callers", () => {
  it.each([
    ["anonymous", mockNoUser],
    ["viewer (authenticated, non-authoring)", mockViewer],
  ])("%s gets an empty graph with no private text", async (_label, mockAs) => {
    mockAs();
    const { GET } = await import("@/app/api/knowledge-graph/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status, "shape is preserved — no 401 churn for the public shell").toBe(200);
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
    expect(body.summary.totalNodes).toBe(0);
    expectNoPrivateContent(body);
  });

  it("an authoring caller still sees the real graph (gate is not a blanket block)", async () => {
    mockEngineer();
    const { GET } = await import("@/app/api/knowledge-graph/route");
    const body = await (await GET()).json();
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).toContain(PRIVATE_QUERY);
  });

  it("analytics is closed to anonymous callers", async () => {
    mockNoUser();
    const { GET } = await import("@/app/api/knowledge-graph/analytics/route");
    const body = await (await GET()).json();
    expect(body.centrality).toEqual([]);
    expect(body.health.overallScore).toBe(0);
    expectNoPrivateContent(body);
  });

  it("node and neighbour lookups answer 404 — never disclosing that the node exists", async () => {
    mockNoUser();
    const node = await import("@/app/api/knowledge-graph/node/[id]/route");
    const neighbours = await import("@/app/api/knowledge-graph/neighbors/[id]/route");

    for (const [label, handler] of [["node", node.GET], ["neighbors", neighbours.GET]] as const) {
      const real = await handler(new Request("http://t"), { params: Promise.resolve({ id: "memory:m1" }) });
      const fake = await handler(new Request("http://t"), { params: Promise.resolve({ id: "memory:nope" }) });
      expect(real.status, `${label}: existing node`).toBe(404);
      expect(fake.status, `${label}: missing node`).toBe(404);
      expect(await real.json(), `${label}: identical to a miss`).toEqual(await fake.json());
    }
  });

  it("path search is closed to anonymous callers", async () => {
    mockNoUser();
    const { GET } = await import("@/app/api/knowledge-graph/path/route");
    const res = await GET(new Request("http://t/api/knowledge-graph/path?from=project:p1&to=memory:m1"));
    expect(res.status).toBe(404);
    expectNoPrivateContent(await res.json());
  });
});

describe("90A — domain intelligence is closed to unauthorised callers", () => {
  it("anonymous list is empty and leaks no project name", async () => {
    mockNoUser();
    const { GET } = await import("@/app/api/domains/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalDomains).toBe(0);
    expect(body.domains).toEqual([]);
    expectNoPrivateContent(body);
  });

  it("anonymous detail answers 404 for a real domain, same as an unknown one", async () => {
    mockNoUser();
    const { GET } = await import("@/app/api/domains/[name]/route");
    const real = await GET(new Request("http://t"), { params: Promise.resolve({ name: "drives" }) });
    const fake = await GET(new Request("http://t"), { params: Promise.resolve({ name: "nope" }) });
    expect(real.status).toBe(404);
    const realBody = await real.json();
    expect(realBody).toEqual(await fake.json());
    expectNoPrivateContent(realBody);
  });

  it("an authoring caller still sees domain intelligence", async () => {
    mockEngineer();
    const { GET } = await import("@/app/api/domains/route");
    const body = await (await GET()).json();
    expect(body.totalDomains).toBeGreaterThan(0);
  });
});
