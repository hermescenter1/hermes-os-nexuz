import { describe, it, expect, expectTypeOf, vi, beforeEach, afterEach } from "vitest";

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

/**
 * Each dependency is registered EXACTLY ONCE, hoisted above every import, and
 * behaviour is varied only through the shared `vi.fn`s.
 *
 * The no-benchmark test used to re-register `../benchmarks` inside its body to
 * override the factory registered in `beforeEach`. That is the same
 * ordering-dependent pattern that made the platform-auth API-key tests fail on
 * CI: overriding a registration only works while nothing has resolved the
 * specifier yet, so which factory wins depends on how vitest packs files into
 * workers. It passed locally and failed on CI (`expected 'bm_1' to be null`).
 * One permanent registration removes the race entirely.
 */
const { getLatestBenchmarkMock, getLatestSnapshotMock, getPrismaMock, projectMock } = vi.hoisted(() => ({
  getLatestBenchmarkMock: vi.fn(),
  getLatestSnapshotMock:  vi.fn(),
  getPrismaMock:          vi.fn(),
  projectMock:            vi.fn(),
}));

vi.mock("@/lib/knowledge-graph/builder", () => ({
  getLatestSnapshot: (...a: unknown[]) => getLatestSnapshotMock(...a),
  isStaleSince: () => false,
}));

vi.mock("../benchmarks", () => ({
  getLatestBenchmark: (...a: unknown[]) => getLatestBenchmarkMock(...a),
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: (...a: unknown[]) => getPrismaMock(...a),
}));

/**
 * The pattern count is the length of the viewer-safe PROJECTION (slice B / IR-02). Its real behaviour —
 * live, policy-eligible cases on two or more of the viewer's sites — is proven against PostgreSQL in
 * `pg/multi-site-visibility.pg.test.ts`; here only the summary's use of it is pinned. The stand-in keeps
 * the one rule that matters to the count: a stored pattern is visible only if two of the caller's sites
 * are among its sites.
 */
vi.mock("../projection", () => ({
  projectPersistedPatterns: (...a: unknown[]) => projectMock(...a),
}));

/** The latest SUCCESS benchmark, whose stored summary is ORG-WIDE. */
const BENCHMARK = {
  id: "bm_1",
  computedAt: "2026-08-01T00:00:00.000Z",
  stale: false,
  stalenessWarning: null,
  // What the endpoint used to hand out verbatim, naming an inaccessible site.
  summary: { highestRiskSiteId: FORBIDDEN, patternCount: 2 },
};

beforeEach(() => {
  vi.resetModules();
  captured = {};

  getLatestSnapshotMock.mockReset();
  getLatestSnapshotMock.mockResolvedValue(null);

  getLatestBenchmarkMock.mockReset();
  getLatestBenchmarkMock.mockResolvedValue(BENCHMARK);

  projectMock.mockReset();
  projectMock.mockImplementation(async (_db: unknown, _org: string, sites: string[], rows: { siteIds: string[] }[]) =>
    rows.filter((r) => r.siteIds.filter((id) => sites.includes(id)).length >= 2));

  getPrismaMock.mockReset();
  getPrismaMock.mockResolvedValue({
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
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function summarize(allowed: string[]) {
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

  it("counts only the patterns the viewer-safe projection returns — not stored rows that merely touch an accessible site", async () => {
    const s = await summarize([ALLOWED]);
    // The stored org-wide count is 2 and one stored pattern touches the allowed site, but a pattern is visible
    // only with two readable sites: none is, so the card must not reveal that patterns elsewhere exist.
    expect(s.patternCount).toBe(0);
    expect(projectMock).toHaveBeenCalledTimes(1);
    expect(projectMock).toHaveBeenCalledWith(expect.anything(), ORG, [ALLOWED], PATTERN_ROWS);
    expect(captured.pattern).toMatchObject({ benchmarkId: "bm_1", organizationId: ORG });
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
      avgRisk: 11, avgAvailability: 90, patternCount: 0, highestRisk: ALLOWED,
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
    // Only the pattern that spans two readable sites is visible, even to someone who can read both.
    expect(s.patternCount).toBe(1);
  });
});

describe("enterprise summary — the scope is mandatory (slice D1, MS-03)", () => {
  it("the scope parameter is a required site list at compile time", async () => {
    const { getEnterpriseIndustrialSummary } = await import("../summary");
    expectTypeOf(getEnterpriseIndustrialSummary).parameter(1).toEqualTypeOf<readonly string[]>();
    expectTypeOf(getEnterpriseIndustrialSummary).parameters.toEqualTypeOf<[orgId: string, allowedSiteIds: readonly string[]]>();
  });

  it("an omitted or non-array scope is refused at runtime and reads NOTHING — there is no unscoped path", async () => {
    const { getEnterpriseIndustrialSummary } = await import("../summary");
    // A future caller that bypasses the type (e.g. from untyped JavaScript) still gets nothing.
    const untyped = getEnterpriseIndustrialSummary as unknown as (orgId: string, scope?: unknown) => Promise<unknown>;
    for (const scope of [undefined, null, "site_allowed", { in: [ALLOWED] }]) {
      await expect(untyped(ORG, scope), String(scope)).rejects.toThrow("SUMMARY_SCOPE_REQUIRED");
    }
    expect(getLatestBenchmarkMock).not.toHaveBeenCalled();
    expect(captured).toEqual({});
  });

  it("an EMPTY scope is the empty summary: no organisation figure, no benchmark claimed, nothing read", async () => {
    const s = await summarize([]);
    expect(s).toEqual({
      organizationId: ORG, siteCount: 0, latestBenchmarkId: null, latestBenchmarkAt: null, benchmarkStale: false, stalenessWarning: null,
      riskSummary: { sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null },
      kpiSummary: { sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null },
      patternCount: 0, knowledgeGraphStale: false, knowledgeGraphBuiltAt: null,
    });
    expect(getLatestBenchmarkMock).not.toHaveBeenCalled();
    expect(getPrismaMock).not.toHaveBeenCalled();
    expect(JSON.stringify(s)).not.toContain(FORBIDDEN);
  });

  it("the stored org-wide summary values are never reported, even to a caller holding every site", async () => {
    getLatestBenchmarkMock.mockResolvedValue({ ...BENCHMARK, summary: { highestRiskSiteId: "site_elsewhere", patternCount: 99 } });
    const s = await summarize([ALLOWED, FORBIDDEN]);
    expect(s.riskSummary.highestRiskSiteId).toBe(FORBIDDEN);      // recomputed from the rows (91 > 11)
    expect(s.patternCount).toBe(1);                                // the visible projection, not 99
    expect(JSON.stringify(s)).not.toContain("site_elsewhere");
  });
});

describe("enterprise summary — scoping survives the no-benchmark path", () => {
  it("still reports only accessible sites when no benchmark exists", async () => {
    getLatestBenchmarkMock.mockResolvedValue(null);
    const s = await summarize([ALLOWED]);

    expect(s.siteCount).toBe(1);
    expect(s.latestBenchmarkId).toBeNull();
    expect(s.riskSummary.highestRiskSiteId).toBeNull();
    expect(s.patternCount).toBe(0);
    expect(JSON.stringify(s)).not.toContain(FORBIDDEN);
  });
});

/**
 * Independent review S3 (deterministic selection): when two accessible sites share the SAME
 * `avgRiskScore`, the highest-risk site used to be whichever row the database happened to return
 * first, so two reads of the SAME benchmark could name different sites. The lowest site id wins.
 */
describe("enterprise summary — the highest-risk site is deterministic on a tie", () => {
  const TIE_A = "site-tie-a";
  const TIE_B = "site-tie-b";

  beforeEach(() => {
    getPrismaMock.mockResolvedValue({
      industrialSite: { count: async () => 2 },
      siteRiskSnapshot: {
        // Deliberately returned worst-id-first, so a "first wins" implementation picks TIE_B.
        findMany: async () => [
          { siteId: TIE_B, avgRiskScore: 77, dataStatus: "ok" },
          { siteId: TIE_A, avgRiskScore: 77, dataStatus: "ok" },
        ],
      },
      siteKPIComparison: { findMany: async () => [] },
      crossSiteFailurePattern: { findMany: async () => [] },
    });
  });

  it("picks the lowest site id, whatever order the rows arrive in", async () => {
    const first = await summarize([TIE_A, TIE_B]);
    expect(first.riskSummary.highestRiskSiteId).toBe(TIE_A);

    // Reversed row order must not change the answer.
    getPrismaMock.mockResolvedValue({
      industrialSite: { count: async () => 2 },
      siteRiskSnapshot: {
        findMany: async () => [
          { siteId: TIE_A, avgRiskScore: 77, dataStatus: "ok" },
          { siteId: TIE_B, avgRiskScore: 77, dataStatus: "ok" },
        ],
      },
      siteKPIComparison: { findMany: async () => [] },
      crossSiteFailurePattern: { findMany: async () => [] },
    });
    const second = await summarize([TIE_A, TIE_B]);
    expect(second.riskSummary.highestRiskSiteId).toBe(TIE_A);
    expect(second.riskSummary.highestRiskSiteId).toBe(first.riskSummary.highestRiskSiteId);
  });

  it("a strictly higher score still wins, whatever the ids", async () => {
    getPrismaMock.mockResolvedValue({
      industrialSite: { count: async () => 2 },
      siteRiskSnapshot: {
        findMany: async () => [
          { siteId: TIE_A, avgRiskScore: 50, dataStatus: "ok" },
          { siteId: TIE_B, avgRiskScore: 90, dataStatus: "ok" },
        ],
      },
      siteKPIComparison: { findMany: async () => [] },
      crossSiteFailurePattern: { findMany: async () => [] },
    });
    expect((await summarize([TIE_A, TIE_B])).riskSummary.highestRiskSiteId).toBe(TIE_B);
  });
});
