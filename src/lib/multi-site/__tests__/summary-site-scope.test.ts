import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * PHASE 43 — the enterprise summary must be constrained to the caller's
 * accessible sites.
 *
 * `/api/multi-site/summary` checked only whether the allow-list was EMPTY and
 * then computed org-wide, making it the one Phase 43 read surface that was not
 * actually site-scoped. Every sibling route (`/risk`, `/kpis`,
 * `/failure-patterns`, `/knowledge-coverage`, `/benchmarks`) narrows its reads
 * with `siteId: { in: allowedSiteIds }`; this one did not, so a member granted a
 * single site received:
 *   - an org-wide ACTIVE site count,
 *   - risk/KPI means computed across sites outside their scope,
 *   - an org-wide `patternCount`,
 *   - and `highestRiskSiteId`, which NAMES a site they cannot access.
 *
 * The fixture is the minimum that can detect all of that: ONE organization,
 * TWO active sites, a caller who may see only `site_allowed`.
 */

const ORG = "org_1";
const ALLOWED = "site_allowed";
const FORBIDDEN = "site_forbidden";

/** Benchmark child rows: the forbidden site is the riskiest in the org. */
const RISK_ROWS = [
  { siteId: FORBIDDEN, avgRiskScore: 91, dataStatus: "ok" },
  { siteId: ALLOWED,   avgRiskScore: 11, dataStatus: "ok" },
];
const KPI_ROWS = [
  { siteId: FORBIDDEN, avgAvailability: 50, avgHealthScore: 40, dataStatus: "ok" },
  { siteId: ALLOWED,   avgAvailability: 90, avgHealthScore: 80, dataStatus: "ok" },
];
/** Two patterns: one touches the allowed site, one is entirely out of scope. */
const PATTERN_ROWS = [
  { siteIds: [ALLOWED, FORBIDDEN] },
  { siteIds: [FORBIDDEN] },
];

const SITES = [
  { id: ALLOWED,   organizationId: ORG, status: "ACTIVE" },
  { id: FORBIDDEN, organizationId: ORG, status: "ACTIVE" },
];

/** Records what each model was actually asked for, so scoping is provable. */
interface Captured { risk?: unknown; kpi?: unknown; siteCount?: unknown; pattern?: unknown }
let captured: Captured;

/** Apply a Prisma-shaped `{ in: [...] }` / equality filter to a row set. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "benchmarkId" || key === "organizationId") continue;
    const value = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
      if ("not" in c && value === c.not) return false;
    } else if (cond !== undefined && value !== cond) {
      return false;
    }
  }
  return true;
}

const MOCKED = ["@/lib/db/prisma", "@/lib/knowledge-graph/builder", "../benchmarks"];

beforeEach(() => {
  vi.resetModules();
  captured = {};

  vi.doMock("@/lib/knowledge-graph/builder", () => ({
    getLatestSnapshot: async () => null,
    isStaleSince: () => false,
  }));

  vi.doMock("../benchmarks", () => ({
    getLatestBenchmark: async () => ({
      id: "bm_1",
      computedAt: "2026-08-01T00:00:00.000Z",
      stale: false,
      stalenessWarning: null,
      // The stored ORG-WIDE summary — what the endpoint used to hand out verbatim.
      summary: { highestRiskSiteId: FORBIDDEN, patternCount: 2 },
    }),
  }));

  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () => ({
      industrialSite: {
        count: async (a: { where: Record<string, unknown> }) => {
          captured.siteCount = a.where;
          return SITES.filter((s) => matches(s, a.where)).length;
        },
      },
      siteRiskSnapshot: {
        findMany: async (a: { where: Record<string, unknown> }) => {
          captured.risk = a.where;
          return RISK_ROWS.filter((r) => matches(r, a.where));
        },
      },
      siteKPIComparison: {
        findMany: async (a: { where: Record<string, unknown> }) => {
          captured.kpi = a.where;
          return KPI_ROWS.filter((r) => matches(r, a.where));
        },
      },
      crossSiteFailurePattern: {
        findMany: async (a: { where: Record<string, unknown> }) => {
          captured.pattern = a.where;
          return PATTERN_ROWS;
        },
      },
    }),
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

async function summarize(allowed?: string[]) {
  const { getEnterpriseIndustrialSummary } = await import("../summary");
  return getEnterpriseIndustrialSummary(ORG, allowed);
}

describe("enterprise summary — a member scoped to one of two sites", () => {
  it("never names a site outside the caller's scope", async () => {
    const s = await summarize([ALLOWED]);

    // The regression: the org-wide benchmark summary named the forbidden site.
    expect(s.riskSummary.highestRiskSiteId).not.toBe(FORBIDDEN);
    expect(s.riskSummary.highestRiskSiteId).toBe(ALLOWED);
    expect(JSON.stringify(s)).not.toContain(FORBIDDEN);
  });

  it("counts only accessible ACTIVE sites, not the whole organization", async () => {
    const s = await summarize([ALLOWED]);
    expect(s.siteCount).toBe(1);
    // …and the count really was constrained at the query layer.
    expect(captured.siteCount).toMatchObject({
      organizationId: ORG,
      status: "ACTIVE",
      id: { in: [ALLOWED] },
    });
  });

  it("derives risk from the caller's rows only — not an org-wide mean", async () => {
    const s = await summarize([ALLOWED]);
    // Org-wide would be mean(91, 11) = 51; in scope it is 11.
    expect(s.riskSummary.avgOrgRiskScore).toBe(11);
    expect(s.riskSummary.sitesRanked).toBe(1);
    expect(captured.risk).toMatchObject({ siteId: { in: [ALLOWED] } });
  });

  it("derives KPIs from the caller's rows only", async () => {
    const s = await summarize([ALLOWED]);
    // Org-wide would be mean(50, 90) = 70 and mean(40, 80) = 60.
    expect(s.kpiSummary.avgOrgAvailability).toBe(90);
    expect(s.kpiSummary.avgOrgHealthScore).toBe(80);
    expect(s.kpiSummary.sitesCompared).toBe(1);
    expect(captured.kpi).toMatchObject({ siteId: { in: [ALLOWED] } });
  });

  it("counts only patterns that involve an accessible site", async () => {
    const s = await summarize([ALLOWED]);
    // The stored org-wide count is 2; only one pattern touches the allowed site.
    expect(s.patternCount).toBe(1);
  });

  it("does not fake scoping by adjusting siteCount alone", async () => {
    const s = await summarize([ALLOWED]);
    // Every metric must move together — a relabelled siteCount over org-wide
    // aggregates is exactly the defect this guards against.
    expect({
      siteCount:      s.siteCount,
      sitesRanked:    s.riskSummary.sitesRanked,
      sitesCompared:  s.kpiSummary.sitesCompared,
      avgRisk:        s.riskSummary.avgOrgRiskScore,
      avgAvailability: s.kpiSummary.avgOrgAvailability,
      patternCount:   s.patternCount,
      highestRisk:    s.riskSummary.highestRiskSiteId,
    }).toEqual({
      siteCount: 1, sitesRanked: 1, sitesCompared: 1,
      avgRisk: 11, avgAvailability: 90, patternCount: 1, highestRisk: ALLOWED,
    });
  });
});

describe("enterprise summary — an OWNER/ADMIN holding every site", () => {
  it("sees the whole organization when the allow-list contains all sites", async () => {
    const s = await summarize([ALLOWED, FORBIDDEN]);

    expect(s.siteCount).toBe(2);
    expect(s.riskSummary.sitesRanked).toBe(2);
    expect(s.riskSummary.avgOrgRiskScore).toBe(51);      // mean(91, 11)
    expect(s.kpiSummary.avgOrgAvailability).toBe(70);    // mean(50, 90)
    expect(s.riskSummary.highestRiskSiteId).toBe(FORBIDDEN);
    expect(s.patternCount).toBe(2);
  });
});

describe("enterprise summary — no user context (API-key auth)", () => {
  it("applies NO site filter and keeps the stored org-wide summary fields", async () => {
    const s = await summarize(undefined);

    expect(s.siteCount).toBe(2);
    expect(s.riskSummary.sitesRanked).toBe(2);
    expect(s.riskSummary.avgOrgRiskScore).toBe(51);
    // Unchanged behaviour: the stored benchmark values are used as before.
    expect(s.riskSummary.highestRiskSiteId).toBe(FORBIDDEN);
    expect(s.patternCount).toBe(2);

    // No siteId predicate was added to any query.
    expect(captured.risk).not.toHaveProperty("siteId");
    expect(captured.kpi).not.toHaveProperty("siteId");
    expect(captured.siteCount).not.toHaveProperty("id");
    // The extra pattern query is only issued when a scope applies.
    expect(captured.pattern).toBeUndefined();
  });
});

describe("enterprise summary — scoping survives the no-benchmark path", () => {
  it("still reports only accessible sites when no benchmark exists", async () => {
    vi.doMock("../benchmarks", () => ({ getLatestBenchmark: async () => null }));
    const s = await summarize([ALLOWED]);

    expect(s.siteCount).toBe(1);
    expect(s.latestBenchmarkId).toBeNull();
    expect(s.riskSummary.highestRiskSiteId).toBeNull();
    expect(s.patternCount).toBe(0);
    expect(JSON.stringify(s)).not.toContain(FORBIDDEN);
  });
});
