/**
 * Multi-site viewer-safe projection (IR-02) — the rules, without a database.
 *
 * The case policy SQL itself and the real routes are proven against PostgreSQL in
 * `pg/multi-site-visibility.pg.test.ts`; here the unit-level properties are pinned: what is asked of the
 * policy, how a case is accepted or dropped, how a pattern and a benchmark are rebuilt, and that nothing
 * stored and organisation-wide is forwarded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  visibleIds: [] as string[],
  visibleCalls: [] as { scope: unknown; query: unknown }[],
  cases: [] as Record<string, unknown>[],
  assets: [] as Record<string, unknown>[],
  caseQueries: [] as Record<string, unknown>[],
  logged: [] as unknown[][],
  throwVisible: false,
}));

vi.mock("@/lib/knowledge/case-visibility", () => ({
  MAX_VISIBLE_CASE_IDS: 50000,
  listVisibleCaseIds: async (_db: unknown, scope: unknown, query: unknown) => {
    h.visibleCalls.push({ scope, query });
    if (h.throwVisible) throw new Error("policy query failed");
    return h.visibleIds;
  },
}));
vi.mock("@/lib/knowledge-graph/visibility", () => ({
  createGraphViewerScope: (organizationId: string, allowedSiteIds: string[], organizationLevelAccess: boolean) =>
    ({ organizationId, allowedSiteIds, organizationLevelAccess }),
}));
vi.mock("@/lib/logger/security-events", () => ({ logInfraFailure: (...a: unknown[]) => { h.logged.push(a); } }));

import {
  assemblePattern,
  loadEligibleCases,
  projectBenchmark,
  projectPersistedPatterns,
  type EligibleCase,
} from "../projection";
import type { BenchmarkRecord } from "../types";

const ORG = "org-A";

/** A fake client that evaluates the `where` it receives, the way PostgreSQL would. */
const db = {
  industrialEngineeringCase: {
    findMany: async (a: { where: { organizationId: string; id: { in: string[] }; siteId: { in: string[] }; failureModeId: { not: null } } }) => {
      h.caseQueries.push(a.where);
      return h.cases.filter((c) =>
        c.organizationId === a.where.organizationId && a.where.id.in.includes(String(c.id)) &&
        c.siteId !== null && a.where.siteId.in.includes(String(c.siteId)) && c.failureModeId !== null);
    },
  },
  industrialAsset: {
    findMany: async (a: { where: { organizationId: string; id: { in: string[] } } }) =>
      h.assets.filter((x) => x.organizationId === a.where.organizationId && a.where.id.in.includes(String(x.id))),
  },
};

const kase = (id: string, siteId: string | null, assetId: string | null, failureModeId: string | null = "fm1", organizationId = ORG) =>
  ({ id, organizationId, siteId, assetId, failureModeId });
const asset = (id: string, siteId: string, assetType: string | null = "PUMP", organizationId = ORG) => ({ id, organizationId, siteId, assetType });

beforeEach(() => {
  h.visibleIds = [];
  h.visibleCalls = [];
  h.cases = [];
  h.assets = [];
  h.caseQueries = [];
  h.logged = [];
  h.throwVisible = false;
});

// ── eligibility ──────────────────────────────────────────────────────────────

describe("loadEligibleCases", () => {
  it("asks the canonical policy for the viewer's sites only, never with organisation-level access", async () => {
    h.visibleIds = ["c1"];
    h.cases = [kase("c1", "A1", null)];
    await loadEligibleCases(db, ORG, ["A1", "A1", "", "A2"], { failureModeIds: ["fm1"] });
    expect(h.visibleCalls).toHaveLength(1);
    expect(h.visibleCalls[0].scope).toEqual({ organizationId: ORG, allowedSiteIds: ["A1", "A2"], organizationLevelAccess: false });
    expect(h.visibleCalls[0].query).toMatchObject({ failureModeIds: ["fm1"] });
  });

  it("accepts a site-only case and a case whose asset exists in the organisation on the SAME site", async () => {
    h.visibleIds = ["c1", "c2"];
    h.cases = [kase("c1", "A1", null), kase("c2", "A1", "as1")];
    h.assets = [asset("as1", "A1", "PUMP")];
    const got = await loadEligibleCases(db, ORG, ["A1", "A2"]);
    expect(got).toEqual<EligibleCase[]>([
      { id: "c1", siteId: "A1", assetId: null, failureModeId: "fm1", assetType: null },
      { id: "c2", siteId: "A1", assetId: "as1", failureModeId: "fm1", assetType: "PUMP" },
    ]);
  });

  it("drops a case whose asset is on ANOTHER site, belongs to ANOTHER organisation, or does not exist — even if the policy listed it", async () => {
    h.visibleIds = ["differs", "foreign", "missing"];
    h.cases = [kase("differs", "A1", "as-a2"), kase("foreign", "A1", "as-b"), kase("missing", "A1", "as-none")];
    h.assets = [asset("as-a2", "A2"), asset("as-b", "A1", "PUMP", "org-B")];
    expect(await loadEligibleCases(db, ORG, ["A1", "A2"])).toEqual([]);
  });

  it("a case with no site (asset-only, or organisation-level) contributes nothing", async () => {
    h.visibleIds = ["assetOnly", "orgLevel"];
    h.cases = [kase("assetOnly", null, "as1"), kase("orgLevel", null, null)];
    h.assets = [asset("as1", "A1")];
    expect(await loadEligibleCases(db, ORG, ["A1"])).toEqual([]);
  });

  it("only cases the policy listed are read, and only inside the organisation and the viewer's sites", async () => {
    h.visibleIds = ["c1"];
    h.cases = [kase("c1", "A1", null), kase("hidden", "A1", null), kase("other-org", "A1", null, "fm1", "org-B")];
    const got = await loadEligibleCases(db, ORG, ["A1"]);
    expect(got.map((c) => c.id)).toEqual(["c1"]);
    expect(h.caseQueries[0]).toMatchObject({ organizationId: ORG, siteId: { in: ["A1"] }, failureModeId: { not: null } });
  });

  it("an explicit candidate set narrows the policy's list; nothing outside it is read", async () => {
    h.visibleIds = ["c1", "c2"];
    h.cases = [kase("c1", "A1", null), kase("c2", "A1", null)];
    const got = await loadEligibleCases(db, ORG, ["A1"], { caseIds: new Set(["c2", "not-visible"]) });
    expect(got.map((c) => c.id)).toEqual(["c2"]);
  });

  it("no viewer site, an empty failure-mode filter or an empty candidate set: nothing, and no policy query", async () => {
    expect(await loadEligibleCases(db, ORG, [])).toEqual([]);
    expect(await loadEligibleCases(db, ORG, ["A1"], { failureModeIds: [] })).toEqual([]);
    expect(await loadEligibleCases(db, ORG, ["A1"], { caseIds: new Set() })).toEqual([]);
    expect(h.visibleCalls).toHaveLength(0);
  });

  it("a policy error propagates (callers fail closed); it is never swallowed into 'everything'", async () => {
    h.throwVisible = true;
    await expect(loadEligibleCases(db, ORG, ["A1"])).rejects.toThrow("policy query failed");
  });
});

// ── pattern assembly ─────────────────────────────────────────────────────────

describe("assemblePattern", () => {
  const c = (id: string, siteId: string, assetId: string | null = null, assetType: string | null = null): EligibleCase =>
    ({ id, siteId, assetId, failureModeId: "fm1", assetType });

  it("needs two distinct sites: a single-site evidence set yields no pattern at all", () => {
    expect(assemblePattern([c("c1", "A1"), c("c2", "A1")])).toBeNull();
    expect(assemblePattern([])).toBeNull();
  });

  it("recomputes every field from the given cases, sorted and de-duplicated", () => {
    const body = assemblePattern([c("c3", "A2", "as2", "VALVE"), c("c1", "A1", "as1", "PUMP"), c("c2", "A1", null), c("c1", "A1", "as1", "PUMP")]);
    expect(body).toEqual({
      siteIds: ["A1", "A2"], siteCount: 2, caseCount: 3, affectedAssetTypes: ["PUMP", "VALVE"],
      evidence: { caseIds: ["c1", "c2", "c3"], bySite: { A1: { caseIds: ["c1", "c2"], assetIds: ["as1"] }, A2: { caseIds: ["c3"], assetIds: ["as2"] } } },
    });
  });
});

// ── persisted pattern projection ─────────────────────────────────────────────

describe("projectPersistedPatterns", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "p1", benchmarkId: "bm1", organizationId: ORG, failureModeId: "fm1", failureModeName: "Seal leak", severity: "HIGH",
    siteIds: ["A1", "A2", "A3"], siteCount: 3, caseCount: 9, affectedAssetTypes: ["STORED-TYPE"], computedAt: new Date("2026-01-01T00:00:00Z"),
    evidence: { caseIds: ["c1", "c2", "c3", "ghost"], bySite: { A3: { caseIds: ["c3"], assetIds: ["secret-asset"] } }, extra: "forward-me" },
    ...over,
  });
  const seed = () => {
    h.visibleIds = ["c1", "c2", "c3"];
    h.cases = [kase("c1", "A1", "as1"), kase("c2", "A2", null), kase("c3", "A3", null)];
    h.assets = [asset("as1", "A1", "PUMP")];
  };

  it("rebuilds the pattern from the viewer's eligible evidence: hidden sites, cases, assets and counts disappear", async () => {
    seed();
    const out = await projectPersistedPatterns(db, ORG, ["A1", "A2"], [row()]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: "p1", benchmarkId: "bm1", failureModeId: "fm1", failureModeName: "Seal leak", severity: "HIGH", computedAt: "2026-01-01T00:00:00.000Z",
      siteIds: ["A1", "A2"], siteCount: 2, caseCount: 2, affectedAssetTypes: ["PUMP"],
      evidence: { caseIds: ["c1", "c2"], bySite: { A1: { caseIds: ["c1"], assetIds: ["as1"] }, A2: { caseIds: ["c2"], assetIds: [] } } },
    });
    const json = JSON.stringify(out);
    for (const leak of ["A3", "c3", "ghost", "secret-asset", "STORED-TYPE", "forward-me", "organizationId"]) expect(json).not.toContain(leak);
  });

  it("a pattern left with ONE viewer site is omitted, not redacted; with no second site nothing is even looked up", async () => {
    seed();
    expect(await projectPersistedPatterns(db, ORG, ["A1", "A3"].slice(0, 1), [row()])).toEqual([]);
    expect(h.visibleCalls).toHaveLength(0);
    h.visibleIds = ["c2", "c3"];
    h.cases = [kase("c2", "A2", null), kase("c3", "A3", null)];
    // a viewer holding A1 and A2: the pattern's A3 evidence is invisible, A1 has none ⇒ one site ⇒ omitted
    expect(await projectPersistedPatterns(db, ORG, ["A1", "A2"], [row({ evidence: { caseIds: ["c2", "c3"] } })])).toEqual([]);
  });

  it("only the cases the snapshot cited AND the policy still allows count; a case it did not cite is not added", async () => {
    h.visibleIds = ["c1", "c2", "c-new"];
    h.cases = [kase("c1", "A1", null), kase("c2", "A2", null), kase("c-new", "A2", null)];
    const [p] = await projectPersistedPatterns(db, ORG, ["A1", "A2"], [row({ evidence: { caseIds: ["c1", "c2"] } })]);
    expect(p.evidence.caseIds).toEqual(["c1", "c2"]);
  });

  it("a cited case of ANOTHER failure mode does not count towards this pattern", async () => {
    h.visibleIds = ["c1", "c2"];
    h.cases = [kase("c1", "A1", null), kase("c2", "A2", null, "other-fm")];
    expect(await projectPersistedPatterns(db, ORG, ["A1", "A2"], [row({ evidence: { caseIds: ["c1", "c2"] } })])).toEqual([]);
  });

  it("malformed stored rows are skipped, not repaired or forwarded", async () => {
    seed();
    const bad = [row({ id: "" }), row({ failureModeId: 7 }), row({ evidence: null }), row({ evidence: { caseIds: "c1" } }), row({ evidence: {} })];
    expect(await projectPersistedPatterns(db, ORG, ["A1", "A2"], bad)).toEqual([]);
  });

  it("orders by site count, case count, then name", async () => {
    h.visibleIds = ["a", "b", "c", "d"];
    h.cases = [kase("a", "A1", null, "fmA"), kase("b", "A2", null, "fmA"), kase("c", "A1", null, "fmB"), kase("d", "A2", null, "fmB"), kase("e", "A2", null, "fmB")];
    h.visibleIds.push("e");
    const rows = [
      row({ id: "pa", failureModeId: "fmA", failureModeName: "Zeta", evidence: { caseIds: ["a", "b"] } }),
      row({ id: "pb", failureModeId: "fmB", failureModeName: "Alpha", evidence: { caseIds: ["c", "d", "e"] } }),
    ];
    expect((await projectPersistedPatterns(db, ORG, ["A1", "A2"], rows)).map((p) => p.id)).toEqual(["pb", "pa"]);
  });

  it("fails closed: a policy error yields no pattern and is logged", async () => {
    seed();
    h.throwVisible = true;
    expect(await projectPersistedPatterns(db, ORG, ["A1", "A2"], [row()])).toEqual([]);
    expect(h.logged[0]?.slice(0, 2)).toEqual(["database", "multi_site.project_patterns"]);
  });
});

// ── benchmark projection ─────────────────────────────────────────────────────

describe("projectBenchmark", () => {
  const bm: BenchmarkRecord = {
    id: "bm1", organizationId: ORG, status: "SUCCESS", periodLabel: "last30Days", siteCount: 3,
    summary: {
      topSiteByAvailability: "A3", bottomSiteByAvailability: "A3", topSiteByHealth: "A3", bottomSiteByRisk: "A3",
      highestRiskSiteId: "A3", patternCount: 7, sitesWithInsufficientData: 2, sitesWithStaleData: 1,
    },
    errorMessage: "internal-generation-error", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:01:00.000Z",
    computedAt: "2026-01-01T00:01:00.000Z", stale: false, stalenessWarning: null,
  };
  const risk = (siteId: string, avgRiskScore: number | null, dataStatus = "ok") => ({ siteId, siteName: `name-${siteId}`, avgRiskScore, dataStatus, riskDistribution: {} });
  const kpi = (siteId: string, avgAvailability: number | null, avgHealthScore: number | null, dataStatus = "ok") =>
    ({ siteId, siteName: `name-${siteId}`, avgAvailability, avgHealthScore, dataStatus });
  const riskRows = [risk("A3", 99), risk("A1", 20), risk("A2", 60)];
  const kpiRows = [kpi("A3", 99, 99), kpi("A1", 70, 80), kpi("A2", 90, 50)];

  it("keeps only the viewer's sites and recomputes rankings and summary from them", () => {
    const out = projectBenchmark(bm, riskRows, kpiRows, [], ["A1", "A2"])!;
    expect(out.riskRanking.map((r) => r.siteId)).toEqual(["A2", "A1"]);
    expect(out.kpiComparison.map((r) => r.siteId)).toEqual(["A2", "A1"]);
    expect(out.benchmark.siteCount).toBe(2);
    expect(out.benchmark.summary).toEqual({
      topSiteByAvailability: "A2", bottomSiteByAvailability: "A1", topSiteByHealth: "A1", bottomSiteByRisk: "A1",
      highestRiskSiteId: "A2", patternCount: 0, sitesWithInsufficientData: 0, sitesWithStaleData: 0,
    });
  });

  it("nothing of the stored organisation-wide summary or of the internal-generation metadata survives", () => {
    const out = projectBenchmark(bm, riskRows, kpiRows, [], ["A1", "A2"])!;
    const json = JSON.stringify(out);
    expect(json).not.toContain("A3");
    expect(json).not.toContain("internal-generation-error");
    expect(out.benchmark).not.toHaveProperty("errorMessage");
    expect(out.benchmark).not.toHaveProperty("startedAt");
    expect(out.benchmark).not.toHaveProperty("completedAt");
    expect(out.benchmark).not.toHaveProperty("organizationId");
  });

  it("the pattern count is the number of visible patterns passed in, not the stored 7", () => {
    const pattern = { id: "p1" } as never;
    expect(projectBenchmark(bm, riskRows, kpiRows, [pattern], ["A1", "A2"])!.benchmark.summary.patternCount).toBe(1);
  });

  it("fewer than two readable sites with rows: no benchmark at all", () => {
    expect(projectBenchmark(bm, riskRows, kpiRows, [], ["A1"])).toBeNull();
    expect(projectBenchmark(bm, riskRows, kpiRows, [], [])).toBeNull();
    expect(projectBenchmark(bm, riskRows, kpiRows, [], ["A1", "not-in-the-snapshot"])).toBeNull();
  });

  it("data-status counts and 'insufficient' rows follow the visible rows only", () => {
    const rr = [risk("A1", 20, "stale"), risk("A2", null, "insufficientData"), risk("A3", 99, "insufficientData")];
    const kk = [kpi("A1", 70, 80), kpi("A2", null, null, "insufficientData"), kpi("A3", 5, 5, "insufficientData")];
    const out = projectBenchmark(bm, rr, kk, [], ["A1", "A2"])!;
    expect(out.benchmark.summary).toMatchObject({ sitesWithInsufficientData: 1, sitesWithStaleData: 1, highestRiskSiteId: "A1", bottomSiteByRisk: "A1", topSiteByAvailability: "A1" });
  });
});
