/**
 * Multi-site benchmark generation (slice D1: MS-01, MS-02) — without a database.
 *
 * - MS-01: the KPI comparison reads the GENERATED delegate `kPIRecord` (the old `db.kpiRecord` was
 *   undefined, so every benchmark of an organisation with assets failed).
 * - MS-02: the shared snapshot is written only by OWNER/ADMIN, over every active site; everyone else is
 *   refused before the in-flight flag, metering, any row or any audit event.
 * - The per-organisation in-flight flag is released when the RUNNING row cannot be created.
 *
 * The real POST route against PostgreSQL is `pg/multi-site-generation.pg.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  role: "OWNER",
  prisma: null as null | Record<string, unknown>,
  runCalls: [] as unknown[][],
  inFlightCalls: 0,
  meterCalls: 0,
  auditCalls: 0,
  scopeCalls: 0,
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({ ctx: { userId: "u1", orgId: "org-A", authMethod: "jwt", scopes: ["admin"] } }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: "u1", orgId: "org-A", role: h.role, status: "ACTIVE" } }),
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => { h.meterCalls++; } }));
vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async () => { h.auditCalls++; },
  MULTI_SITE_AUDIT: { BENCHMARK_RUN: "multi_site.benchmark.run" },
}));
vi.mock("@/lib/multi-site/scope", () => ({ resolveMultiSiteScope: async () => { h.scopeCalls++; return ["s1"]; } }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.prisma }));

beforeEach(() => {
  h.role = "OWNER"; h.prisma = null; h.runCalls = []; h.inFlightCalls = 0; h.meterCalls = 0; h.auditCalls = 0; h.scopeCalls = 0;
  vi.resetModules();
});

async function routeWithFakeRunner() {
  vi.doMock("@/lib/multi-site/benchmarks", () => ({
    getLatestBenchmark: async () => null,
    isBenchmarkInFlight: () => { h.inFlightCalls++; return false; },
    runBenchmark: async (...a: unknown[]) => { h.runCalls.push(a); return { id: "bm-new", siteCount: 3, status: "SUCCESS" }; },
  }));
  return import("@/app/api/multi-site/benchmarks/route");
}
const post = (body?: unknown) => new NextRequest(new URL("/api/multi-site/benchmarks", "http://localhost"), {
  method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" },
});

describe("POST /api/multi-site/benchmarks — the shared snapshot writer", () => {
  it.each(["MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN"])("%s is refused (403) before ANY side effect", async (role) => {
    h.role = role;
    const { POST } = await routeWithFakeRunner();
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(h.runCalls).toHaveLength(0);
    expect(h.inFlightCalls).toBe(0);
    expect(h.meterCalls).toBe(0);
    expect(h.auditCalls).toBe(0);
    expect(h.scopeCalls).toBe(0);
  });

  it.each(["OWNER", "ADMIN"])("%s runs the benchmark with the organisation only — no site list can reach the writer", async (role) => {
    h.role = role;
    const { POST } = await routeWithFakeRunner();
    const res = await POST(post({ siteIds: ["s1"], allowedSiteIds: ["s1"], organizationId: "org-EVIL" }));
    expect(res.status).toBe(200);
    expect(h.runCalls).toEqual([["org-A"]]);
    expect(h.auditCalls).toBe(1);
  });
});

describe("compareSiteKPIs (MS-01, and S2-02: both reads are bounded in the database)", () => {
  it("selects the latest row per (asset, KPI) and per asset for health, entirely in SQL", async () => {
    const raw: { sql: string; values: unknown[] }[] = [];
    // The ONLY client capability the module may use is $queryRaw: a delegate read would mean the
    // history is being materialised in the application again (independent review S2-02).
    h.prisma = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        raw.push({ sql, values });
        if (sql.includes(`"KPIRecord"`)) {
          return [
            { assetId: "a1", kpiName: "availability", value: 90, calculatedAt: new Date() },
            { assetId: "a1", kpiName: "efficiency", value: 70, calculatedAt: new Date() },
            { assetId: "a2", kpiName: "availability", value: 50, calculatedAt: new Date() },
          ];
        }
        return [{ assetId: "a1", healthScore: 80, createdAt: new Date() }];
      },
      // Present but forbidden: if the module ever falls back to the delegate, this throws.
      kPIRecord: { findMany: async () => { throw new Error("KPI delegate must not be used: the read must be bounded in SQL"); } },
      assetHealthHistory: { findMany: async () => { throw new Error("health delegate must not be used"); } },
    };
    const { compareSiteKPIs } = await import("../kpis");
    const out = await compareSiteKPIs("org-A", new Map([["s1", "Site 1"], ["s2", "Site 2"]]), new Map([["s1", ["a1"]], ["s2", ["a2"]]]));
    expect(out.map((s) => [s.siteId, s.avgAvailability, s.avgEfficiency, s.avgHealthScore, s.assetsWithKpiData])).toEqual([
      ["s1", 90, 70, 80, 1],
      ["s2", null, null, null, 1],        // no health row: the existing data-sufficiency rule marks the site insufficient
    ]);

    expect(raw).toHaveLength(2);
    const kpi = raw.find((r) => r.sql.includes(`"KPIRecord"`))!;
    const health = raw.find((r) => r.sql.includes(`"AssetHealthHistory"`))!;
    // One row per (asset, KPI name), newest first, id ASC breaking a tie — deterministic selection.
    expect(kpi.sql).toContain(`SELECT DISTINCT ON (k."assetId", k."kpiName")`);
    expect(kpi.sql).toContain(`ORDER BY k."assetId" ASC, k."kpiName" ASC, k."calculatedAt" DESC, k."id" ASC`);
    // Organisation, the compared assets, the compared KPI names and the period are ALL predicates.
    expect(kpi.sql).toContain(`k."organizationId" = ?`);
    expect(kpi.sql).toContain(`k."assetId" = ANY(?::text[])`);
    expect(kpi.sql).toContain(`k."kpiName" = ANY(?::text[])`);
    expect(kpi.sql).toContain(`k."calculatedAt" >= ?`);
    expect(kpi.values[0]).toBe("org-A");
    expect(kpi.values[1]).toEqual(["a1", "a2"]);
    expect(kpi.values[2]).toEqual(["availability", "efficiency"]);
    // No value is concatenated into the statement text.
    for (const v of ["org-A", "a1", "a2", "availability"]) expect(kpi.sql).not.toContain(v);

    expect(health.sql).toContain(`SELECT DISTINCT ON (h."assetId")`);
    expect(health.sql).toContain(`ORDER BY h."assetId" ASC, h."createdAt" DESC, h."id" ASC`);
    expect(health.values).toEqual(["org-A", ["a1", "a2"]]);
  });

  it("reads nothing at all when no asset is compared", async () => {
    let calls = 0;
    h.prisma = { $queryRaw: async () => { calls++; return []; } };
    const { compareSiteKPIs } = await import("../kpis");
    expect(await compareSiteKPIs("org-A", new Map([["s1", "Site 1"]]), new Map([["s1", []]]))).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("runBenchmark — the in-flight flag", () => {
  it("is released when the RUNNING row cannot be created, so a later run is not refused forever", async () => {
    let creates = 0;
    h.prisma = {
      multiSiteBenchmark: {
        create: async () => { creates++; throw new Error("db down"); },
        update: async () => ({}), findFirst: async () => null,
      },
    };
    vi.doUnmock("@/lib/multi-site/benchmarks");
    const { runBenchmark, isBenchmarkInFlight } = await import("../benchmarks");
    await expect(runBenchmark("org-A")).rejects.toThrow("db down");
    expect(isBenchmarkInFlight("org-A")).toBe(false);
    await expect(runBenchmark("org-A")).rejects.toThrow("db down");        // not BENCHMARK_IN_FLIGHT
    expect(creates).toBe(2);
  });

  /**
   * Independent review S3-04: everything after the child-row transaction commits is POST-COMMIT. A
   * failure there used to fall into the catch and relabel the committed SUCCESS run as FAILED, which
   * destroys the snapshot every reader uses. The run state must survive, and the failure must be
   * reported (logged) instead of rewritten.
   */
  it("a post-commit read-back failure never relabels the committed SUCCESS run", async () => {
    const updates: Record<string, unknown>[] = [];
    h.prisma = {
      multiSiteBenchmark: {
        create: async () => ({ id: "bm-1" }),
        update: async (a: { data: Record<string, unknown> }) => { updates.push(a.data); return {}; },
        findFirst: async () => { throw new Error("read-back failed after commit"); },
      },
      siteRiskSnapshot:       { create: async () => ({}) },
      siteKPIComparison:      { create: async () => ({}) },
      crossSiteFailurePattern:{ create: async () => ({}) },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => fn({
        multiSiteBenchmark:      { update: async (a: { data: Record<string, unknown> }) => { updates.push(a.data); return {}; } },
        siteRiskSnapshot:        { create: async () => ({}) },
        siteKPIComparison:       { create: async () => ({}) },
        crossSiteFailurePattern: { create: async () => ({}) },
      }),
    };
    vi.doUnmock("@/lib/multi-site/benchmarks");
    vi.doMock("@/lib/multi-site/comparison", () => ({
      compareSites: async () => ({
        siteMap: new Map([["s1", "Site 1"]]), siteAssetMap: new Map([["s1", ["a1"]]]), siteIds: ["s1"],
        kpis: [], risk: [], patterns: [], coverage: [], summary: { note: "ok" },
      }),
    }));
    const { runBenchmark, isBenchmarkInFlight } = await import("../benchmarks");

    const out = await runBenchmark("org-A");
    // The committed values are reported from what was written, not as a failure.
    expect(out).toMatchObject({ id: "bm-1", status: "SUCCESS", siteCount: 1 });
    // No FAILED was ever written.
    expect(updates.some((d) => d.status === "FAILED")).toBe(false);
    expect(updates.some((d) => d.status === "SUCCESS")).toBe(true);
    expect(isBenchmarkInFlight("org-A")).toBe(false);
  });
});
