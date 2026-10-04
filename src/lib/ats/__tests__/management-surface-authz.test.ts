// @vitest-environment node
/**
 * ATS management READ surfaces — the authorization boundary.
 *
 *     GET /api/ats/overview     GET /api/ats/analytics
 *     GET /api/ats/pipeline     GET /api/ats/candidates
 *
 * These four answer with this organization's candidate data — names, e-mails,
 * stages and score breakdowns. They are now REAL and tenant-scoped behind
 * `requireAtsActor(req, "ATS_VIEW")`:
 *   - no session            → one 401, carrying NO payload key;
 *   - a member without the
 *     ATS_VIEW capability    → one 403, carrying NO payload key;
 *   - a member WITH ATS_VIEW → 200, served only from the real aggregator (here
 *     an empty organization), never a fixture.
 *
 * The guard runs BEFORE any data is read, and every response is no-store.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  actor: null as unknown,
}));

// The guard seam: the routes gate on requireAtsActor. We drive it directly so
// this test is about authorization, not about session/DB plumbing.
vi.mock("@/lib/ats/rbac", () => ({
  requireAtsActor: async () => h.actor,
}));

// The real aggregator for an organization with no applications — empty, never
// a fixture. Used only on the authorized (200) path.
vi.mock("@/lib/ats/dashboard", () => ({
  getAtsOverview: async () => ({
    openJobs: 0, totalCandidates: 0, averageScore: 0,
    byStage: { applied: 0, screening: 0, "technical-review": 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
    recentActivity: [], topJobs: [], hiringVelocityDays: 0,
  }),
  getAtsAnalytics: async () => ({
    openJobs: 0, closedJobs: 0, totalCandidates: 0, hiredCandidates: 0, rejectedCandidates: 0,
    averageAtsScore: 0, byStage: [], topSkills: [], byDepartment: [], bySources: [],
    rejectionReasons: [], hiringVelocityDays: 0, scoreDistribution: [],
  }),
  getAtsPipeline: async () => [],
  getAtsCandidates: async () => [],
}));

function refusal(status: number, code: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json({ error: "refused", code }, { status, headers: { "Cache-Control": "no-store" } }),
  };
}
function allow(): { ok: true; ctx: { userId: string; orgId: string; role: string } } {
  return { ok: true, ctx: { userId: "u-1", orgId: "org-A", role: "RECRUITER" } };
}

beforeEach(() => {
  h.actor = refusal(401, "AUTHENTICATION_REQUIRED");
});
afterEach(() => {
  vi.resetModules();
});

function getReq(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers: { "x-real-ip": "10.0.0.1" } });
}

const READ_SURFACES = [
  { name: "/api/ats/overview", path: "../../../app/api/ats/overview/route", url: "/api/ats/overview" },
  { name: "/api/ats/analytics", path: "../../../app/api/ats/analytics/route", url: "/api/ats/analytics" },
  { name: "/api/ats/pipeline", path: "../../../app/api/ats/pipeline/route", url: "/api/ats/pipeline" },
  { name: "/api/ats/candidates", path: "../../../app/api/ats/candidates/route", url: "/api/ats/candidates" },
] as const;

/** Every key a successful response may carry — a refusal must carry none. */
const PAYLOAD_KEYS = ["candidates", "columns", "byStage", "topJobs", "topSkills", "recentActivity", "scoreDistribution"] as const;

async function callGet(path: string, url: string): Promise<Response> {
  const mod = (await import(path)) as { GET: (r: Request) => Promise<Response> };
  return mod.GET(getReq(url));
}

describe("ATS management reads refuse anonymous callers", () => {
  for (const surface of READ_SURFACES) {
    it(`${surface.name} answers 401 with no data when there is no session`, async () => {
      h.actor = refusal(401, "AUTHENTICATION_REQUIRED");
      const res = await callGet(surface.path, surface.url);
      expect(res.status).toBe(401);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of PAYLOAD_KEYS) {
        expect(body, `${surface.name} 401 body must not carry "${key}"`).not.toHaveProperty(key);
      }
    });
  }
});

describe("ATS management reads refuse an authenticated caller without the capability", () => {
  for (const surface of READ_SURFACES) {
    it(`${surface.name} answers 403 with no data without ATS_VIEW`, async () => {
      h.actor = refusal(403, "FORBIDDEN");
      const res = await callGet(surface.path, surface.url);
      expect(res.status).toBe(403);
      const body = (await res.json()) as Record<string, unknown>;
      for (const key of PAYLOAD_KEYS) {
        expect(body, `${surface.name} 403 body must not carry "${key}"`).not.toHaveProperty(key);
      }
    });
  }
});

describe("ATS management reads serve a capability-holder from the real aggregator", () => {
  for (const surface of READ_SURFACES) {
    it(`${surface.name} answers 200, no-store, empty — never a fixture`, async () => {
      h.actor = allow();
      const res = await callGet(surface.path, surface.url);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = (await res.json()) as Record<string, unknown>;
      // empty organization: no invented people anywhere
      const json = JSON.stringify(body);
      expect(json).not.toMatch(/Ahmad|Karimi|Frankfurt|Siemens|cand-\d/);
    });
  }
});

describe("the refusal is not cacheable", () => {
  it("a 401 carries no-store, so a shared cache cannot serve it as a hit", async () => {
    h.actor = refusal(401, "AUTHENTICATION_REQUIRED");
    const res = await callGet(READ_SURFACES[2].path, READ_SURFACES[2].url);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
