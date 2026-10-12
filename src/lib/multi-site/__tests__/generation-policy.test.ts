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

describe("compareSiteKPIs (MS-01)", () => {
  it("reads the generated kPIRecord delegate, bounded to the compared assets, and computes the site means", async () => {
    const kpiQueries: Record<string, unknown>[] = [];
    const healthQueries: { sql: string; values: unknown[] }[] = [];
    // Only the GENERATED delegate names exist on this fake, exactly as on the real client.
    h.prisma = {
      kPIRecord: {
        findMany: async (a: Record<string, unknown>) => {
          kpiQueries.push(a);
          return [
            { assetId: "a1", kpiName: "availability", value: 90, calculatedAt: new Date() },
            { assetId: "a1", kpiName: "efficiency", value: 70, calculatedAt: new Date() },
            { assetId: "a2", kpiName: "availability", value: 50, calculatedAt: new Date() },
          ];
        },
      },
      // Slice D2: the latest health row per asset is selected in SQL (DISTINCT ON), not by Prisma's in-memory `distinct`.
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        healthQueries.push({ sql: strings.join("?"), values });
        return [{ assetId: "a1", healthScore: 80, createdAt: new Date() }];
      },
    };
    const { compareSiteKPIs } = await import("../kpis");
    const out = await compareSiteKPIs("org-A", new Map([["s1", "Site 1"], ["s2", "Site 2"]]), new Map([["s1", ["a1"]], ["s2", ["a2"]]]));
    expect(out.map((s) => [s.siteId, s.avgAvailability, s.avgEfficiency, s.avgHealthScore, s.assetsWithKpiData])).toEqual([
      ["s1", 90, 70, 80, 1],
      ["s2", null, null, null, 1],        // no health row: the existing data-sufficiency rule marks the site insufficient
    ]);
    expect(kpiQueries[0]).toMatchObject({ where: { organizationId: "org-A", assetId: { in: ["a1", "a2"] } } });
    expect(healthQueries).toHaveLength(1);
    expect(healthQueries[0].sql).toContain(`SELECT DISTINCT ON (h."assetId")`);
    expect(healthQueries[0].sql).toContain(`ORDER BY h."assetId" ASC, h."createdAt" DESC, h."id" ASC`);
    expect(healthQueries[0].values).toEqual(["org-A", ["a1", "a2"]]);
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
});
