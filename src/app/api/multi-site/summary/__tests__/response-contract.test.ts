import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  isEnterpriseSummaryResponse,
  emptyEnterpriseSummary,
} from "@/lib/multi-site/summary-contract";

/**
 * GET /api/multi-site/summary answers with exactly ONE shape.
 *
 * The route used to have two incompatible 200 payloads: a full
 * `EnterpriseIndustrialSummary`, or — when the caller could reach no sites —
 * `{ data: null, reason: "No accessible sites.", siteCount: 0 }`. The dashboard
 * typed the response as the former, so the second was a deterministic client
 * crash for any fully-authorized user whose organization had no ACTIVE
 * industrial site. That is a SECOND crash path, independent of the 401 that
 * was originally reported.
 *
 * These tests pin the single contract and, alongside it, that the authorization
 * chain in front of it is untouched.
 */

const MOCKED = [
  "@/lib/api/auth",
  "@/lib/org/context",
  "@/lib/org/rbac",
  "@/lib/multi-site/summary",
  "@/lib/audit/audit-service",
  "@/lib/api/meter",
  "@/lib/site/context",
];

const FULL_SUMMARY = {
  organizationId:    "org_1",
  siteCount:         3,
  latestBenchmarkId: "bm_1",
  latestBenchmarkAt: "2026-08-01T10:00:00.000Z",
  benchmarkStale:    false,
  stalenessWarning:  null,
  riskSummary: { sitesRanked: 3, highestRiskSiteId: "site_1", avgOrgRiskScore: 55.5 },
  kpiSummary:  { sitesCompared: 3, avgOrgAvailability: 92.5, avgOrgHealthScore: 80 },
  patternCount:          2,
  knowledgeGraphStale:   false,
  knowledgeGraphBuiltAt: "2026-08-01T09:00:00.000Z",
};

/** Defaults: fully authorized actor, three accessible sites, real summary. */
function mockChain(over: {
  platform?: unknown;
  member?:   unknown;
  perm?:     unknown;
  sites?:    string[];
} = {}) {
  vi.doMock("@/lib/api/auth", () => ({
    requirePlatformAuth: async () =>
      over.platform ?? { ctx: { userId: "user_1", orgId: "org_1", authMethod: "jwt", scopes: ["admin"] } },
  }));
  vi.doMock("@/lib/org/context", () => ({
    requireOrgActor: async () =>
      over.member ?? { ctx: { userId: "user_1", orgId: "org_1", memberId: "m1", role: "OWNER", status: "ACTIVE" } },
  }));
  vi.doMock("@/lib/org/rbac", () => ({
    requirePermission: () => over.perm ?? { ok: true },
  }));
  vi.doMock("@/lib/site/context", () => ({
    getAllowedSiteIds: async () => over.sites ?? ["site_1", "site_2", "site_3"],
  }));
  vi.doMock("@/lib/multi-site/summary", () => ({
    getEnterpriseIndustrialSummary: async () => FULL_SUMMARY,
  }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async () => {},
    MULTI_SITE_AUDIT: { ENTERPRISE_SUMMARY_VIEWED: "multi_site.summary.viewed" },
  }));
  vi.doMock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => {} }));
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

const request = () => new NextRequest("http://localhost/api/multi-site/summary", { method: "GET" });

async function callGet() {
  const { GET } = await import("../route");
  const res = await GET(request());
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("summary route — one stable response contract", () => {
  it("a normal read returns a payload the client validator accepts", async () => {
    mockChain();
    const { res, body } = await callGet();

    expect(res.status).toBe(200);
    expect(isEnterpriseSummaryResponse(body)).toBe(true);
    expect(body.noAccessibleSites).toBe(false);
  });

  it("preserves every pre-existing success field byte-for-byte (backward compatible)", async () => {
    mockChain();
    const { body } = await callGet();

    for (const [key, value] of Object.entries(FULL_SUMMARY)) {
      expect(body[key], key).toEqual(value);
    }
    // The flag is purely additive.
    expect(Object.keys(body).sort()).toEqual([...Object.keys(FULL_SUMMARY), "noAccessibleSites"].sort());
  });

  it("ZERO accessible sites returns the SAME contract, not the legacy {data:null} shape", async () => {
    mockChain({ sites: [] });
    const { res, body } = await callGet();

    expect(res.status).toBe(200);
    expect(isEnterpriseSummaryResponse(body)).toBe(true);
    expect(body.noAccessibleSites).toBe(true);

    // The exact legacy keys that crashed the dashboard must be gone.
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("reason");

    // The two objects whose absence produced the production TypeError.
    expect(body.riskSummary).toBeTypeOf("object");
    expect(body.kpiSummary).toBeTypeOf("object");
  });

  it("the empty payload reports honest emptiness and fabricates no industrial data", async () => {
    mockChain({ sites: [] });
    const { body } = await callGet();

    // Counts of an empty set are 0; unknown measurements are null — never 0.
    expect(body.siteCount).toBe(0);
    expect(body.patternCount).toBe(0);
    expect(body.riskSummary).toEqual({ sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null });
    expect(body.kpiSummary).toEqual({ sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null });

    // No benchmark exists, so nothing is claimed about one — in either direction.
    expect(body.latestBenchmarkId).toBeNull();
    expect(body.latestBenchmarkAt).toBeNull();
    expect(body.benchmarkStale).toBe(false);
    expect(body.stalenessWarning).toBeNull();
    expect(body.knowledgeGraphBuiltAt).toBeNull();

    // The caller's real tenant is not a measurement.
    expect(body.organizationId).toBe("org_1");
  });

  it("does not compute a summary at all when no site is in scope", async () => {
    const compute = vi.fn(async () => FULL_SUMMARY);
    vi.doMock("@/lib/multi-site/summary", () => ({ getEnterpriseIndustrialSummary: compute }));
    mockChain({ sites: [] });
    await callGet();
    expect(compute).not.toHaveBeenCalled();
  });
});

describe("summary route — the authorization chain is unchanged", () => {
  it("propagates the platform-auth rejection verbatim (still 401)", async () => {
    mockChain({ platform: { error: "Authentication required", status: 401 } });
    const { res, body } = await callGet();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Authentication required" });
  });

  it("propagates a non-member rejection (403)", async () => {
    mockChain({ member: { error: "Not a member of this organization", status: 403 } });
    const { res, body } = await callGet();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Not a member of this organization" });
  });

  it("still enforces the view_multi_site permission (403)", async () => {
    mockChain({ perm: { ok: false, error: "Insufficient permissions", status: 403 } });
    const { res } = await callGet();
    expect(res.status).toBe(403);
  });

  it("never reaches the summary when RBAC denies", async () => {
    const compute = vi.fn(async () => FULL_SUMMARY);
    vi.doMock("@/lib/multi-site/summary", () => ({ getEnterpriseIndustrialSummary: compute }));
    mockChain({ perm: { ok: false, error: "Insufficient permissions", status: 403 } });
    await callGet();
    expect(compute).not.toHaveBeenCalled();
  });
});

describe("summary contract — the validator", () => {
  it("accepts the empty payload it produces", () => {
    expect(isEnterpriseSummaryResponse(emptyEnterpriseSummary("org_1"))).toBe(true);
  });

  it("rejects the legacy zero-sites shape that crashed the dashboard", () => {
    expect(isEnterpriseSummaryResponse({ data: null, reason: "No accessible sites.", siteCount: 0 })).toBe(false);
  });

  it("rejects an auth error body", () => {
    expect(isEnterpriseSummaryResponse({ error: "Authentication required" })).toBe(false);
  });

  it("rejects a payload missing either metric object", () => {
    const { riskSummary: _r, ...noRisk } = emptyEnterpriseSummary("o");
    const { kpiSummary: _k, ...noKpi }   = emptyEnterpriseSummary("o");
    void _r; void _k;
    expect(isEnterpriseSummaryResponse(noRisk)).toBe(false);
    expect(isEnterpriseSummaryResponse(noKpi)).toBe(false);
  });

  it("rejects wrongly-typed nested fields", () => {
    const base = emptyEnterpriseSummary("o");
    expect(isEnterpriseSummaryResponse({ ...base, riskSummary: { ...base.riskSummary, sitesRanked: "3" } })).toBe(false);
    expect(isEnterpriseSummaryResponse({ ...base, kpiSummary: { ...base.kpiSummary, avgOrgAvailability: "97" } })).toBe(false);
    expect(isEnterpriseSummaryResponse({ ...base, siteCount: Number.NaN })).toBe(false);
  });

  it("rejects non-objects and the empty envelope", () => {
    for (const bad of [null, undefined, "", 0, [], "ok"]) {
      expect(isEnterpriseSummaryResponse(bad)).toBe(false);
    }
  });

  it("tolerates unknown extra fields a future server may add", () => {
    expect(isEnterpriseSummaryResponse({ ...emptyEnterpriseSummary("o"), futureField: 1 })).toBe(true);
  });
});
