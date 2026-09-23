/**
 * ATS management-surface authorization regression.
 *
 * THE DEFECT THIS LOCKS
 * ---------------------
 * `src/middleware.ts` excludes `/api` from its matcher, so every API route is
 * protected only by its own in-route checks. Four ATS management endpoints had
 * none and answered any anonymous caller:
 *
 *     GET /api/ats/overview     GET /api/ats/analytics
 *     GET /api/ats/pipeline     GET /api/ats/candidates
 *
 * `/api/ats/pipeline` and `/api/ats/candidates` return whole candidate records
 * — name, email, phone, location, salary expectation and score breakdown. They
 * served fixtures, so nothing real leaked; the hazard was that pointing them at
 * PostgreSQL (the explicit next step) would have turned an unauthenticated
 * handler into a cross-tenant PII endpoint without anyone editing an auth line.
 *
 * WHY THE ASSERTIONS LOOK LIKE THIS
 * ---------------------------------
 * A status-code check alone would still pass if a handler computed the whole
 * response and then returned 401 — the work would have happened, and a later
 * refactor could leak it through a log or an error body. So each refusal is
 * also asserted to carry NO payload key: no `candidates`, no `columns`, no
 * `byStage`. The refusal must be empty of data, not merely labelled.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "REDIS_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/auth/rbac-server");
});

function mockAuthRole(role: string | null): void {
  vi.doUnmock("@/lib/auth/rbac-server");
  vi.doMock("@/lib/auth/rbac-server", () => ({ getAuthRole: async () => role }));
}

function getReq(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "x-real-ip": "10.0.0.1" },
  });
}

/** The four handlers that were reachable without a session. */
const READ_SURFACES = [
  { name: "/api/ats/overview", path: "../../../app/api/ats/overview/route", url: "/api/ats/overview" },
  { name: "/api/ats/analytics", path: "../../../app/api/ats/analytics/route", url: "/api/ats/analytics" },
  { name: "/api/ats/pipeline", path: "../../../app/api/ats/pipeline/route", url: "/api/ats/pipeline" },
  { name: "/api/ats/candidates", path: "../../../app/api/ats/candidates/route", url: "/api/ats/candidates" },
] as const;

/** Every key any of the four responses carries when it succeeds. */
const PAYLOAD_KEYS = [
  "candidates",
  "columns",
  "byStage",
  "topJobs",
  "topSkills",
  "recentActivity",
  "scoreDistribution",
  "total",
] as const;

async function callGet(path: string, url: string): Promise<Response> {
  const mod = (await import(path)) as { GET: (r: Request) => Promise<Response> };
  return mod.GET(getReq(url));
}

describe("ATS management reads refuse anonymous callers", () => {
  for (const surface of READ_SURFACES) {
    it(`${surface.name} answers 401 with no data when there is no session`, async () => {
      mockAuthRole(null);
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
  // `viewer` and `candidate` are the two roles that hold no capability at all.
  // `candidate` matters most: a signed-in job applicant must never be able to
  // read the recruiter's pipeline, and before this change they could.
  for (const role of ["viewer", "candidate"] as const) {
    for (const surface of READ_SURFACES) {
      it(`${surface.name} answers 403 with no data for role "${role}"`, async () => {
        mockAuthRole(role);
        const res = await callGet(surface.path, surface.url);

        expect(res.status).toBe(403);

        const body = (await res.json()) as Record<string, unknown>;
        for (const key of PAYLOAD_KEYS) {
          expect(body, `${surface.name} 403 body must not carry "${key}"`).not.toHaveProperty(key);
        }
      });
    }
  }
});

describe("ATS management reads still serve a caller holding the authoring capability", () => {
  // The gate must not have broken the dashboards it protects. `engineer` is
  // the least-privileged role that holds `authoring` today — see
  // docs/ats/ATS_BASELINE_AUDIT.md §7 for why that is itself an open question.
  for (const surface of READ_SURFACES) {
    it(`${surface.name} answers 200 for role "engineer"`, async () => {
      mockAuthRole("engineer");
      const res = await callGet(surface.path, surface.url);

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  }
});

describe("the refusal is not cacheable", () => {
  it("a 401 carries no-store, so a shared cache cannot serve it as a hit", async () => {
    mockAuthRole(null);
    const res = await callGet(READ_SURFACES[2].path, READ_SURFACES[2].url);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
