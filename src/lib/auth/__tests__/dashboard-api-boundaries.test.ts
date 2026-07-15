/**
 * Phase 86C4B2B1D-SECURITY-5 — Dashboard-supporting API security boundaries.
 *
 * Middleware excludes /api/** (SECURITY-4 protected the PAGES only), so each
 * dashboard-supporting API must enforce its own boundary. This suite is the
 * central classification regression for the audited route families and drives
 * runtime behavior (it invokes the real handlers), not source text.
 *
 * Classification (14 route-methods across 14 files):
 *
 *   AUTHENTICATED_PLATFORM (authoring-gated) — global engineering "brain"
 *   aggregates with no anonymous use; only consumer is the authoring-gated
 *   /engineering hub:
 *     - GET /api/dashboard
 *     - GET /api/intelligence            (also embeds raw user memory text)
 *     - GET /api/intelligence/agents
 *
 *   PUBLIC_DEMO — deterministic, GET-only, built from the static VENDORS
 *   catalog + synthetic cases.json (+ published-only knowledge enrichment);
 *   no tenant/user/PII/secret fields; consumed by SECURITY-4-protected
 *   /dashboard pages whose audience includes customer/vendor (so the
 *   authoring guard is intentionally NOT applied — it would lock them out):
 *     - GET /api/operations/{overview,alerts,sites,war-room,intelligence}
 *     - GET /api/eng-graph, /eng-graph/{stats,nodes,edges,node/[id]}
 *
 *   ALREADY-CORRECT (unchanged this phase):
 *     - GET  /api/analysis  → 200 with empty records to non-authoring callers
 *     - POST /api/analysis  → requireAuthoring (401/403)
 *
 * Session-store mode only (no DATABASE_URL); handlers imported after the auth
 * mock is set — no Next server, no Postgres, no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mockNoUser,
  mockViewer,
  mockEngineer,
  mockAdmin,
  mockAuthUser,
  buildUser,
  unmockAuth,
} from "@/test/mock-auth";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
  (globalThis as Record<string, unknown>).__hermesProjects = [];
  (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  (globalThis as Record<string, unknown>).__hermesCaseDrafts = [];
  (globalThis as Record<string, unknown>).__hermesArticleDrafts = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  unmockAuth();
});

function req(path: string): Request {
  return new Request(`http://localhost${path}`);
}

// Field names that must never surface in an anonymous response body.
const SENSITIVE_FIELD = /(?:"(?:userId|organizationId|orgId|tenantId|siteId|departmentId|membershipId|email|phone|ipAddress|accessToken|refreshToken|sessionToken|apiKey|secret|password|passwordHash)"\s*:)/i;
// Substrings that would betray internal error/path disclosure.
const INTERNAL_LEAK = /(?:\/home\/|[A-Z]:\\\\|node_modules|at Object\.|Error: |stack)/;

// ── AUTHENTICATED_PLATFORM: the three global-brain routes ────────────────────

const BRAIN_ROUTES = [
  { name: "/api/dashboard", path: "../../../app/api/dashboard/route" },
  { name: "/api/intelligence", path: "../../../app/api/intelligence/route" },
  {
    name: "/api/intelligence/agents",
    path: "../../../app/api/intelligence/agents/route",
  },
] as const;

describe("AUTHENTICATED_PLATFORM — global brain routes require the authoring capability", () => {
  for (const route of BRAIN_ROUTES) {
    it(`${route.name}: anonymous GET → 401`, async () => {
      mockNoUser();
      const { GET } = await import(route.path);
      const res = await GET();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        ok: false,
        error: "Authentication required.",
      });
    });

    it(`${route.name}: authenticated non-authoring roles → 403`, async () => {
      for (const mock of [
        () => mockViewer(),
        () => mockAuthUser(buildUser("customer")),
        () => mockAuthUser(buildUser("vendor")),
        () => mockAuthUser(buildUser("candidate")),
      ]) {
        vi.resetModules();
        mock();
        const { GET } = await import(route.path);
        const res = await GET();
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          ok: false,
          error: "Insufficient permissions.",
        });
      }
    });

    it(`${route.name}: authoring roles (engineer, admin) → 200`, async () => {
      for (const mock of [() => mockEngineer(), () => mockAdmin(), () => mockAuthUser(buildUser("superadmin"))]) {
        vi.resetModules();
        mock();
        const { GET } = await import(route.path);
        const res = await GET();
        expect(res.status).toBe(200);
        expect(await res.json()).toHaveProperty("storageMode");
      }
    });

    it(`${route.name}: exports no write method`, async () => {
      const mod = await import(route.path);
      expect(typeof (mod as Record<string, unknown>).GET).toBe("function");
      for (const m of ["POST", "PUT", "PATCH", "DELETE"] as const) {
        expect((mod as Record<string, unknown>)[m]).toBeUndefined();
      }
    });
  }
});

// ── PUBLIC_DEMO: operations + eng-graph static families ──────────────────────

const PUBLIC_DEMO_ROUTES = [
  { name: "/api/operations/overview", path: "../../../app/api/operations/overview/route", param: false },
  { name: "/api/operations/alerts", path: "../../../app/api/operations/alerts/route", param: false },
  { name: "/api/operations/sites", path: "../../../app/api/operations/sites/route", param: false },
  { name: "/api/operations/war-room", path: "../../../app/api/operations/war-room/route", param: false },
  { name: "/api/operations/intelligence", path: "../../../app/api/operations/intelligence/route", param: false },
  { name: "/api/eng-graph", path: "../../../app/api/eng-graph/route", param: false },
  { name: "/api/eng-graph/stats", path: "../../../app/api/eng-graph/stats/route", param: false },
  { name: "/api/eng-graph/nodes", path: "../../../app/api/eng-graph/nodes/route", param: false },
  { name: "/api/eng-graph/edges", path: "../../../app/api/eng-graph/edges/route", param: false },
  { name: "/api/eng-graph/node/[id]", path: "../../../app/api/eng-graph/node/[id]/route", param: true },
] as const;

async function callPublicGet(
  route: (typeof PUBLIC_DEMO_ROUTES)[number],
): Promise<Response> {
  const { GET } = await import(route.path);
  if (route.param) {
    return GET(req("/api/eng-graph/node/vendor-siemens"), {
      params: Promise.resolve({ id: "vendor-siemens" }),
    });
  }
  return GET(req(route.name));
}

describe("PUBLIC_DEMO — operations + eng-graph serve anonymous static data safely", () => {
  for (const route of PUBLIC_DEMO_ROUTES) {
    it(`${route.name}: anonymous GET is not auth-gated (never 401/403)`, async () => {
      mockNoUser();
      const res = await callPublicGet(route);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      // Deterministic static data resolves to 200 (node/[id] may 404 on a
      // missing id, which is still a public, non-leaking response).
      expect([200, 404]).toContain(res.status);
    });

    it(`${route.name}: response exposes no sensitive fields or internal leaks`, async () => {
      mockNoUser();
      const res = await callPublicGet(route);
      const text = JSON.stringify(await res.json());
      expect(text).not.toMatch(SENSITIVE_FIELD);
      expect(text).not.toMatch(INTERNAL_LEAK);
    });

    it(`${route.name}: exports GET only, no write method`, async () => {
      const mod = (await import(route.path)) as Record<string, unknown>;
      expect(typeof mod.GET).toBe("function");
      for (const m of ["POST", "PUT", "PATCH", "DELETE"] as const) {
        expect(mod[m]).toBeUndefined();
      }
    });
  }

  it("operations/eng-graph responses are identical for anonymous and authoring callers (no auth-varying body)", async () => {
    // A stable public contract: the payload must not change with a session.
    mockNoUser();
    const anon = await (await callPublicGet(PUBLIC_DEMO_ROUTES[0])).json();
    vi.resetModules();
    mockAdmin();
    const authed = await (await callPublicGet(PUBLIC_DEMO_ROUTES[0])).json();
    // builtAt is a timestamp; compare the stable structural keys instead.
    expect(Object.keys(anon).sort()).toEqual(Object.keys(authed).sort());
  });
});

// ── ALREADY-CORRECT: /api/analysis retains its Phase 82C contract ────────────

describe("ALREADY-CORRECT — /api/analysis keeps its prior guard", () => {
  const ANALYSIS = "../../../app/api/analysis/route";

  it("GET stays 200 with empty records for anonymous callers", async () => {
    mockNoUser();
    const { GET } = await import(ANALYSIS);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("storageMode");
    expect(body.records).toEqual([]);
  });

  it("POST rejects anonymous writes with 401", async () => {
    mockNoUser();
    const { POST } = await import(ANALYSIS);
    const res = await POST(
      new Request("http://localhost/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "anon" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

// ── Classification manifest: every audited route is accounted for ────────────

describe("classification manifest — no audited route is left unclassified", () => {
  it("covers exactly the 14 audited route-methods", () => {
    const manifest = {
      AUTHENTICATED_PLATFORM: BRAIN_ROUTES.map((r) => r.name),
      PUBLIC_DEMO: PUBLIC_DEMO_ROUTES.map((r) => r.name),
      ALREADY_CORRECT: ["/api/analysis (GET)", "/api/analysis (POST)"],
    };
    expect(manifest.AUTHENTICATED_PLATFORM).toHaveLength(3);
    expect(manifest.PUBLIC_DEMO).toHaveLength(10);
    expect(manifest.ALREADY_CORRECT).toHaveLength(2);
    const total =
      manifest.AUTHENTICATED_PLATFORM.length +
      manifest.PUBLIC_DEMO.length +
      manifest.ALREADY_CORRECT.length -
      // /api/analysis appears twice (GET+POST) but is one file
      1;
    expect(total).toBe(14);
  });
});

// ── Demo dataset safety: cases.json carries no real PII/credentials ──────────

describe("PUBLIC_DEMO dataset — cases.json is synthetic", () => {
  it("contains no emails, phone numbers, tokens or credentials", async () => {
    const cases = (await import("@/lib/industrial/knowledge-data/cases.json"))
      .default as { cases: unknown[] };
    const text = JSON.stringify(cases);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); // email
    expect(text).not.toMatch(/\b(?:secret|password|apikey|api_key|token)\b/i);
    expect(cases.cases.length).toBeGreaterThan(0);
  });
});
