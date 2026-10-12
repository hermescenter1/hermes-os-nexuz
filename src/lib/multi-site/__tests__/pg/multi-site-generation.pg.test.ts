/**
 * Multi-site benchmark generation and knowledge coverage (slice D1: MS-01..MS-04) — against REAL PostgreSQL
 * and the REAL route handlers.
 *
 *   MS-01  POST /api/multi-site/benchmarks failed with a 500 for any organisation that had assets: the KPI
 *          comparison read the Prisma delegate \`kpiRecord\` (generated name: \`kPIRecord\`).
 *   MS-02  a site-limited member could replace the organisation's SHARED "latest" snapshot with a partial run.
 *   MS-03  the enterprise summary had an unscoped path.
 *   MS-04  knowledge coverage counted case links of cases the viewer may not see.
 *
 * REAL: routes, \`requireOrgActor\`, \`requirePermission\`, \`getAllowedSiteIds\`, the scope, the generator (KPI,
 *       risk, patterns, coverage), the transaction, the projection, the case policy SQL, the audit write.
 * MOCKED: the token layer (\`requirePlatformAuth\` — the organisation comes from \`x-test-org\`), metering, and a
 *       switch that makes the pattern step throw, to model a failed run.
 *
 * Fixtures use the \`msd1-\` prefix; only they are removed and any leftover fails the run.
 * Runs under vitest.phase91-postgres.config.ts against a DISPOSABLE database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ failPatterns: false }));

vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: async (t: string) => (t.startsWith("t:") ? { sub: t.slice(2) } : null) }));
vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async (req: NextRequest) => {
    const tok = req.cookies.get("hermes_at")?.value;
    if (!tok) return { error: "Authentication required", status: 401 };
    return { ctx: { userId: tok.slice(2), orgId: req.headers.get("x-test-org"), authMethod: "jwt", scopes: ["admin"] } };
  },
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => undefined }));
vi.mock("@/lib/multi-site/failure-patterns", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/multi-site/failure-patterns")>();
  return {
    ...orig,
    findCrossSiteFailurePatterns: async (...a: Parameters<typeof orig.findCrossSiteFailurePatterns>) => {
      if (h.failPatterns) throw new Error("injected pattern failure");
      return orig.findCrossSiteFailurePatterns(...a);
    },
  };
});

const { getPrisma } = await import("@/lib/db/prisma");
const benchmarksRoute = await import("@/app/api/multi-site/benchmarks/route");
const coverageRoute = await import("@/app/api/multi-site/knowledge-coverage/route");
const summaryRoute = await import("@/app/api/multi-site/summary/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "msd1-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A1 = `${P}site-a1`, A2 = `${P}site-a2`, A3 = `${P}site-a3`, A4 = `${P}site-a4-inactive`, B1 = `${P}site-b1`;
const AS = { a1: `${P}as-a1`, a1x: `${P}as-a1x`, a2: `${P}as-a2`, a3: `${P}as-a3`, a4: `${P}as-a4`, b1: `${P}as-b1` } as const;
const FM = `${P}fm`, FMB = `${P}fm-b`;
const C = {
  a1: `${P}c-a1`, a2: `${P}c-a2`, a3: `${P}c-a3`, a4: `${P}c-a4-inactive`, org: `${P}c-org-level`, bad: `${P}c-a1-with-a2-asset`, b1: `${P}c-b1`,
} as const;
const BM_OLD = `${P}bm-old-success`, BM_FAILED = `${P}bm-newer-failed`, BM_RUNNING = `${P}bm-newest-running`;
const U = {
  OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`,
  MGR12: `${P}u-manager-a1-a2`, ENG1: `${P}u-engineer-a1`, VIEW1: `${P}u-viewer-a1`, BILL1: `${P}u-billing-a1`,
  INACTIVE: `${P}u-viewer-a4-only`, NONE: `${P}u-viewer-nogrant`, XADMIN: `${P}u-xadmin`,
} as const;
const USERS = Object.values(U);

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
  findMany: (a?: unknown) => Promise<Row[]>;
}
let db: Record<string, Model>;
const ORG_TABLES = ["crossSiteFailurePattern", "siteKPIComparison", "siteRiskSnapshot", "multiSiteBenchmark", "assetKnowledgeLink",
  "industrialEngineeringCase", "industrialFailureMode", "assetRiskScore", "assetHealthHistory", "kPIRecord", "industrialAsset",
  "userSite", "organizationMember", "industrialSite"];
const AUDIT_OWNED = { OR: [{ organizationId: { in: ORGS } }, { entityId: { in: ORGS } }, { entityId: { startsWith: P } }, { userId: { in: USERS } }] };

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: AUDIT_OWNED });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: AUDIT_OWNED });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  const bad = Object.entries(left).filter(([, n]) => n !== 0);
  if (bad.length > 0) throw new Error(`slice D1 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();

  const now = () => new Date();
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: `MSD1-NAME-${id}`, slug: id, status, updatedAt: now() } });
  await site(A1, ORG_A); await site(A2, ORG_A); await site(A3, ORG_A); await site(A4, ORG_A, "INACTIVE"); await site(B1, ORG_B);

  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN");
  await member(U.MGR12, ORG_A, "MANAGER"); await member(U.ENG1, ORG_A, "ENGINEER"); await member(U.VIEW1, ORG_A, "VIEWER"); await member(U.BILL1, ORG_A, "BILLING_ADMIN");
  await member(U.INACTIVE, ORG_A, "VIEWER"); await member(U.NONE, ORG_A, "VIEWER"); await member(U.XADMIN, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string) => db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });
  await grant(U.MGR12, A1); await grant(U.MGR12, A2);
  for (const u of [U.ENG1, U.VIEW1, U.BILL1]) await grant(u, A1);
  await grant(U.INACTIVE, A4);

  const asset = (id: string, org: string, siteId: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name`, assetType: "PUMP" } });
  await asset(AS.a1, ORG_A, A1); await asset(AS.a1x, ORG_A, A1); await asset(AS.a2, ORG_A, A2); await asset(AS.a3, ORG_A, A3);
  await asset(AS.a4, ORG_A, A4); await asset(AS.b1, ORG_B, B1);

  // KPI, health and risk data for every asset: the generator's KPI step (the MS-01 defect) really runs.
  const recent = new Date(Date.now() - 3_600_000);
  for (const [id, org, avail, health, risk] of [
    [AS.a1, ORG_A, 70, 80, 20], [AS.a1x, ORG_A, 72, 82, 22], [AS.a2, ORG_A, 90, 50, 60], [AS.a3, ORG_A, 95, 60, 40],
    [AS.a4, ORG_A, 99, 99, 95], [AS.b1, ORG_B, 10, 10, 99],
  ] as const) {
    await db.kPIRecord.create({ data: { organizationId: org, assetId: id, kpiName: "availability", value: avail, period: "last30Days", calculatedAt: recent } });
    await db.kPIRecord.create({ data: { organizationId: org, assetId: id, kpiName: "efficiency", value: avail - 5, period: "last30Days", calculatedAt: recent } });
    await db.assetHealthHistory.create({ data: { organizationId: org, assetId: id, healthScore: health, healthStatus: "healthy", createdAt: recent } });
    await db.assetRiskScore.create({ data: {
      organizationId: org, assetId: id, riskScore: risk, confidence: "HIGH", healthTrendScore: 0, alarmTrendScore: 0, kpiDegradationScore: 0,
      telQualityScore: 0, telFreshnessScore: 0, criticalityFactor: 1, createdAt: recent,
    } });
  }

  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG_A, name: "MSD1-FM", nameNorm: "msd1-fm", description: "d", severity: "HIGH" } });
  await db.industrialFailureMode.create({ data: { id: FMB, organizationId: ORG_B, name: "MSD1-FM-B", nameNorm: "msd1-fm-b", description: "d", severity: "HIGH" } });
  const kase = (id: string, org: string, siteId: string | null, assetId: string | null, fm: string) => db.industrialEngineeringCase.create({ data: {
    id, organizationId: org, title: `MSD1-CASE-${id}`, titleNorm: `msd1 ${id}`, symptoms: [], keywords: [], siteId, assetId, failureModeId: fm,
  } });
  await kase(C.a1, ORG_A, A1, AS.a1, FM); await kase(C.a2, ORG_A, A2, AS.a2, FM); await kase(C.a3, ORG_A, A3, AS.a3, FM);
  await kase(C.a4, ORG_A, A4, AS.a4, FM);                  // inactive site
  await kase(C.org, ORG_A, null, null, FM);                // organisation-level: OWNER/ADMIN only
  await kase(C.bad, ORG_A, A1, AS.a2, FM);                 // site A1 but the asset stands on A2: nobody
  await kase(C.b1, ORG_B, B1, AS.b1, FMB);

  // Knowledge links. a1x's ONLY link is the inconsistent case, so it must never count as "covered".
  const link = (assetId: string, org: string, data: Row) => db.assetKnowledgeLink.create({ data: { organizationId: org, assetId, ...data } });
  await link(AS.a1, ORG_A, { caseId: C.a1 });              // visible to every A1 reader
  await link(AS.a1, ORG_A, { caseId: C.a2 });              // an A1 asset citing an A2 case: needs A2
  await link(AS.a1, ORG_A, { caseId: C.org });             // organisation-level case: OWNER/ADMIN only
  await link(AS.a1x, ORG_A, { caseId: C.bad });            // inconsistent case: nobody
  await link(AS.a2, ORG_A, { failureModeId: FM });         // catalogue link on an A2 asset
  await link(AS.a4, ORG_A, { caseId: C.a4 });              // inactive site
  await link(AS.b1, ORG_B, { caseId: C.b1 });              // foreign organisation

  // A previous SUCCESS snapshot, then a NEWER failed one and a NEWER running one: neither may become "latest".
  const old = new Date(Date.now() - 86_400_000);
  await db.multiSiteBenchmark.create({ data: { id: BM_OLD, organizationId: ORG_A, status: "SUCCESS", periodLabel: "last30Days", siteCount: 3, summary: {}, computedAt: old } });
  for (const s of [A1, A2, A3]) {
    await db.siteRiskSnapshot.create({ data: { organizationId: ORG_A, benchmarkId: BM_OLD, siteId: s, siteName: `old-${s}`, assetCount: 1, assetsWithData: 1, avgRiskScore: 1, maxRiskScore: 1, minRiskScore: 1, riskDistribution: {}, dataStatus: "ok", confidence: "HIGH" } });
  }
  await db.multiSiteBenchmark.create({ data: { id: BM_FAILED, organizationId: ORG_A, status: "FAILED", periodLabel: "last30Days", siteCount: 0, summary: {}, errorMessage: "x", computedAt: new Date(old.getTime() + 1000) } });
  await db.multiSiteBenchmark.create({ data: { id: BM_RUNNING, organizationId: ORG_A, status: "RUNNING", periodLabel: "last30Days", siteCount: 0, summary: {}, computedAt: new Date(old.getTime() + 2000) } });
}, 600000);

afterAll(async () => {
  if (!db) return;
  await new Promise((resolve) => setTimeout(resolve, 300));     // audit writes are fire-and-forget
  await purge();
  await assertNoResidue();
}, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest) => Promise<Response>;
const request = (user: string, org: string, method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org },
  });
async function call(handler: unknown, user: string, method: string, path: string, body?: unknown, org = ORG_A) {
  const res = await (handler as Handler)(request(user, org, method, path, body));
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
const generate = (user: string, body?: unknown, org = ORG_A) => call(benchmarksRoute.POST, user, "POST", "/api/multi-site/benchmarks", body, org);
const readBench = (user: string) => call(benchmarksRoute.GET, user, "GET", "/api/multi-site/benchmarks");
const coverage = (user: string, q = "", org = ORG_A) => call(coverageRoute.GET, user, "GET", `/api/multi-site/knowledge-coverage${q}`, undefined, org);
const summary = (user: string) => call(summaryRoute.GET, user, "GET", "/api/multi-site/summary");
const sitesOf = (r: { json: Row }, key: string) => ((r.json[key] as Row[] | undefined) ?? []).map((x) => String(x.siteId));
const latestSuccessId = async () => String((await db.multiSiteBenchmark.findMany({ where: { organizationId: ORG_A, status: "SUCCESS" }, orderBy: [{ computedAt: "desc" }, { id: "desc" }] }))[0]?.id);
const sideEffects = async () => ({
  benchmarks: await db.multiSiteBenchmark.count({ where: { organizationId: ORG_A } }),
  risk: await db.siteRiskSnapshot.count({ where: { organizationId: ORG_A } }),
  kpi: await db.siteKPIComparison.count({ where: { organizationId: ORG_A } }),
  patterns: await db.crossSiteFailurePattern.count({ where: { organizationId: ORG_A } }),
  audit: await db.auditLog.count({ where: AUDIT_OWNED }),
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

// ── before anything is generated ────────────────────────────────────────────
describe("latest-snapshot selection", () => {
  it("a newer FAILED or RUNNING run never replaces the latest SUCCESS snapshot", async () => {
    const r = await readBench(U.OWNER);
    expect(r.status).toBe(200);
    expect((r.json.benchmark as Row).id).toBe(BM_OLD);
  });
});

// ── MS-02: who may write the shared snapshot ────────────────────────────────
describe("POST /api/multi-site/benchmarks — only OWNER/ADMIN write the shared snapshot", () => {
  it.each([
    ["MANAGER (partial grant)", U.MGR12], ["ENGINEER", U.ENG1], ["VIEWER", U.VIEW1], ["BILLING_ADMIN", U.BILL1],
    ["a member with only an inactive-site grant", U.INACTIVE], ["a member with no grant", U.NONE],
  ] as const)("%s is refused with 403 and leaves NO run, snapshot, row, pattern or audit event", async (_n, user) => {
    const before = await sideEffects();
    const r = await generate(user, { siteIds: [A1, A2, A3] });
    expect(r.status).toBe(403);
    await settle();
    expect(await sideEffects()).toEqual(before);
    expect(await latestSuccessId()).toBe(BM_OLD);
  });

  it("an organisation-A admin acting in organisation B is refused as a non-member", async () => {
    expect((await generate(U.ADMIN, undefined, ORG_B)).status).toBe(403);
  });
});

// ── MS-01: generation really runs, over every active site only ──────────────
describe("POST /api/multi-site/benchmarks — generation works end to end (MS-01)", () => {
  let ownerRun = "";

  it("OWNER: 200 with a SUCCESS benchmark over the three ACTIVE sites of organisation A, even with a narrowing body", async () => {
    const r = await generate(U.OWNER, { siteIds: [A1], allowedSiteIds: [A1], organizationId: ORG_B });
    expect(r.status).toBe(200);
    const bm = r.json.benchmark as Row;
    expect(bm).toMatchObject({ status: "SUCCESS", siteCount: 3, organizationId: ORG_A });
    expect(bm.completedAt).toBeTruthy();
    ownerRun = String(bm.id);
    expect(await latestSuccessId()).toBe(ownerRun);
  });

  it("the persisted rows cover exactly A1, A2, A3 — never the inactive A4 or organisation B — and carry real KPI means", async () => {
    const risk = await db.siteRiskSnapshot.findMany({ where: { benchmarkId: ownerRun } });
    const kpi = await db.siteKPIComparison.findMany({ where: { benchmarkId: ownerRun } });
    expect(risk.map((x) => String(x.siteId)).sort()).toEqual([A1, A2, A3].sort());
    expect(kpi.map((x) => String(x.siteId)).sort()).toEqual([A1, A2, A3].sort());
    expect(kpi.find((x) => x.siteId === A2)).toMatchObject({ avgAvailability: 90, assetsWithKpiData: 1 });
    expect(kpi.find((x) => x.siteId === A1)).toMatchObject({ avgAvailability: 71, assetsWithKpiData: 2 });
    for (const row of [...risk, ...kpi]) expect(row.organizationId).toBe(ORG_A);
  });

  it("the persisted pattern uses only eligible cases (no inactive, organisation-level, inconsistent or foreign case)", async () => {
    const pats = await db.crossSiteFailurePattern.findMany({ where: { benchmarkId: ownerRun } });
    expect(pats).toHaveLength(1);
    expect(pats[0].siteIds).toEqual([A1, A2, A3]);
    const text = JSON.stringify(pats);
    for (const hidden of [C.a4, C.org, C.bad, C.b1, A4, B1]) expect(text).not.toContain(hidden);
  });

  it("ADMIN can generate too", async () => {
    const r = await generate(U.ADMIN);
    expect(r.status).toBe(200);
    expect((r.json.benchmark as Row).status).toBe("SUCCESS");
  });

  it("GET after generation stays viewer-projected: a manager of A1+A2 sees A1 and A2 only, a one-site viewer gets no benchmark", async () => {
    const m = await readBench(U.MGR12);
    expect(m.status).toBe(200);
    expect(sitesOf(m, "riskRanking").sort()).toEqual([A1, A2].sort());
    const pats = (m.json.failurePatterns as Row[]) ?? [];
    expect(pats).toHaveLength(1);
    expect(pats[0]).toMatchObject({ siteIds: [A1, A2].sort(), caseCount: 2 });
    for (const hidden of [A3, A4, B1, C.a3, AS.a3]) expect(m.text).not.toContain(hidden);
    expect((await readBench(U.VIEW1)).json).toEqual({ data: null, reason: "Insufficient accessible sites for a cross-site benchmark." });
  });

  it("a failed run is recorded FAILED, keeps no child row and does not replace the latest snapshot", async () => {
    const latestBefore = await latestSuccessId();
    h.failPatterns = true;
    try {
      const r = await generate(U.OWNER);
      expect(r.status).toBe(500);
      expect(r.json).toEqual({ error: "Benchmark failed. Check server logs." });
      expect(r.text).not.toContain("injected");
    } finally {
      h.failPatterns = false;
    }
    expect(await latestSuccessId()).toBe(latestBefore);
    const failed = await db.multiSiteBenchmark.findMany({ where: { organizationId: ORG_A, status: "FAILED", NOT: { id: BM_FAILED } } });
    expect(failed).toHaveLength(1);
    expect(await db.siteRiskSnapshot.count({ where: { benchmarkId: String(failed[0].id) } })).toBe(0);
    expect(await db.siteKPIComparison.count({ where: { benchmarkId: String(failed[0].id) } })).toBe(0);
    // and the flag was released: the next run succeeds
    expect((await generate(U.OWNER)).status).toBe(200);
  });

  it("two concurrent runs never mix rows: each SUCCESS benchmark owns exactly its own rows", async () => {
    const results = await Promise.all([generate(U.OWNER), generate(U.ADMIN)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);
    expect(statuses).toContain(200);
    const all = await db.multiSiteBenchmark.findMany({ where: { organizationId: ORG_A, status: "SUCCESS", NOT: { id: BM_OLD } } });
    for (const bm of all) {
      expect(await db.siteRiskSnapshot.count({ where: { benchmarkId: String(bm.id) } }), String(bm.id)).toBe(bm.siteCount);
      expect(await db.siteKPIComparison.count({ where: { benchmarkId: String(bm.id) } }), String(bm.id)).toBe(bm.siteCount);
    }
  });
});

// ── MS-03: the summary is always scoped ─────────────────────────────────────
describe("GET /api/multi-site/summary — always scoped", () => {
  it("a one-site viewer gets a one-site summary; no grant / inactive-only get the empty contract", async () => {
    const s = await summary(U.VIEW1);
    expect(s.json).toMatchObject({ siteCount: 1, riskSummary: { sitesRanked: 1, highestRiskSiteId: A1 }, noAccessibleSites: false });
    for (const hidden of [A2, A3, A4, B1]) expect(s.text).not.toContain(hidden);
    for (const user of [U.NONE, U.INACTIVE]) {
      const e = await summary(user);
      expect(e.json).toMatchObject({ siteCount: 0, patternCount: 0, latestBenchmarkId: null, noAccessibleSites: true });
    }
    expect((await summary(U.OWNER)).json).toMatchObject({ siteCount: 3, riskSummary: { sitesRanked: 3 } });
  });
});

// ── MS-04: knowledge coverage ───────────────────────────────────────────────
describe("GET /api/multi-site/knowledge-coverage (MS-04)", () => {
  const siteRow = (r: { json: Row }, siteId: string) => ((r.json.sites as Row[]) ?? []).find((s) => s.siteId === siteId);

  it("a one-site viewer: only A1, and only the case link it may see (not A2's case, not the organisation-level one, not the inconsistent one)", async () => {
    const r = await coverage(U.VIEW1);
    expect(r.status).toBe(200);
    expect(((r.json.sites as Row[]) ?? []).map((s) => s.siteId)).toEqual([A1]);
    expect(siteRow(r, A1)).toMatchObject({ assetCount: 2, assetsWithLinks: 1, totalCaseLinks: 1, totalFailureModeLinks: 0, coverageScore: 50 });
    for (const hidden of [A2, A3, A4, B1, C.a2, C.org, C.bad, AS.a2, AS.a1x, `MSD1-NAME-${A2}`]) expect(r.text).not.toContain(hidden);
  });

  it("a manager of A1+A2: the A2 case link on an A1 asset now counts, the organisation-level one still does not", async () => {
    const r = await coverage(U.MGR12);
    expect(((r.json.sites as Row[]) ?? []).map((s) => s.siteId)).toEqual([A2, A1]);
    expect(siteRow(r, A1)).toMatchObject({ totalCaseLinks: 2, assetsWithLinks: 1, coverageScore: 50 });
    expect(siteRow(r, A2)).toMatchObject({ totalFailureModeLinks: 1, coverageScore: 100 });
  });

  it.each([["OWNER", U.OWNER], ["ADMIN", U.ADMIN]] as const)("%s: every active site; the organisation-level case counts, the inconsistent, inactive and foreign ones never", async (_n, user) => {
    const r = await coverage(user);
    expect(((r.json.sites as Row[]) ?? []).map((s) => s.siteId)).toEqual([A2, A1, A3]);
    expect(siteRow(r, A1)).toMatchObject({ assetCount: 2, assetsWithLinks: 1, totalCaseLinks: 3, coverageScore: 50 });
    expect(siteRow(r, A3)).toMatchObject({ assetsWithLinks: 0, coverageScore: 0 });
    for (const hidden of [A4, B1, C.bad, C.a4, C.b1]) expect(r.text).not.toContain(hidden);
  });

  it("client organisation / role / site parameters cannot expand access", async () => {
    const hostile = `?siteId=${A2}&siteIds=${A2},${A3}&organizationId=${ORG_B}&role=OWNER&allowedSiteIds=${A2}`;
    expect((await coverage(U.VIEW1, hostile)).json).toEqual((await coverage(U.VIEW1)).json);
  });

  it("no grant and inactive-only: the safe empty result", async () => {
    for (const user of [U.NONE, U.INACTIVE]) expect((await coverage(user)).json).toEqual({ sites: [] });
  });

  it("organisation B's admin sees organisation B only", async () => {
    const r = await coverage(U.XADMIN, "", ORG_B);
    expect(((r.json.sites as Row[]) ?? []).map((s) => s.siteId)).toEqual([B1]);
    expect(siteRow(r, B1)).toMatchObject({ totalCaseLinks: 1 });
    for (const hidden of [A1, A2, A3, A4]) expect(r.text).not.toContain(hidden);
  });
});
