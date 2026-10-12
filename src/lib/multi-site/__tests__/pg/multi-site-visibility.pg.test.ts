/**
 * Multi-site analytics visibility (IR-02) — adversarial matrix against REAL PostgreSQL and the REAL routes.
 *
 * THE DEFECT. The benchmark and its cross-site failure patterns are organisation-wide snapshots. Two
 * readers returned them as stored (`/benchmarks`: every pattern + the stored summary; `/failure-patterns`: a
 * whole pattern as soon as ONE of its sites was readable), and the aggregation trusted `case.siteId` alone.
 * A restricted actor therefore received hidden site ids, case ids, asset ids, per-site counts, asset types and
 * which failure modes occur where. Now every reader PROJECTS the snapshot through the viewer's scope
 * (official allowed sites ∩ ACTIVE sites) and rebuilds each pattern from live, policy-eligible cases that
 * sit on at least two of the viewer's sites (lib/multi-site/projection.ts).
 *
 * REAL: routes, `requireOrgActor`, `requirePermission`, `getAllowedSiteIds`, `resolveMultiSiteScope`, the case
 *       policy SQL (`case-visibility.ts`), the projection, Prisma, the benchmark generator.
 * MOCKED: only the token layer (`verifyAccessToken`, `requirePlatformAuth` — the organisation comes from
 *       `x-test-org`, as the real guard derives it server side), metering and the audit WRITE.
 *
 * Fixtures use the `msv-` prefix; only they are removed and any leftover fails the run.
 * Runs under vitest.phase91-postgres.config.ts against a DISPOSABLE database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: async (t: string) => (t.startsWith("t:") ? { sub: t.slice(2) } : null) }));
vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async (req: NextRequest) => {
    const tok = req.cookies.get("hermes_at")?.value;
    if (!tok) return { error: "Authentication required", status: 401 };
    return { ctx: { userId: tok.slice(2), orgId: req.headers.get("x-test-org"), authMethod: "jwt", scopes: ["admin"] } };
  },
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => undefined }));
vi.mock("@/lib/audit/audit-service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/audit/audit-service")>();
  return { ...orig, recordAuditEvent: async () => undefined };
});

const { getPrisma } = await import("@/lib/db/prisma");
const { loadEligibleCases } = await import("@/lib/multi-site/projection");
const benchmarksRoute = await import("@/app/api/multi-site/benchmarks/route");
const patternsRoute = await import("@/app/api/multi-site/failure-patterns/route");
const kpisRoute = await import("@/app/api/multi-site/kpis/route");
const riskRoute = await import("@/app/api/multi-site/risk/route");
const summaryRoute = await import("@/app/api/multi-site/summary/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "msv-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A1 = `${P}site-a1`, A2 = `${P}site-a2`, A3 = `${P}site-a3`, A4 = `${P}site-a4-inactive`;
const B1 = `${P}site-b1`, B2 = `${P}site-b2`;
const AS = { a1: `${P}as-a1`, a1b: `${P}as-a1b`, a2: `${P}as-a2`, a3: `${P}as-a3`, a4: `${P}as-a4`, f2: `${P}as-foreign-on-a2`, b1: `${P}as-b1`, b2: `${P}as-b2` } as const;
const FM = { fm1: `${P}fm1`, fm2: `${P}fm2`, fm3: `${P}fm3`, fm4: `${P}fm4`, fm5: `${P}fm5`, fmB: `${P}fm-b` } as const;
const FM_NAME = { fm1: "Seal leak", fm2: "Bearing wear", fm3: "Corrosion", fm4: "Overheat", fm5: "Vibration", fmB: "Org B only" } as const;
const BM_A = `${P}bm-a`, BM_B = `${P}bm-b`;
const U = {
  OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`,
  V1: `${P}u-viewer-a1`, V12: `${P}u-viewer-a1-a2`, MGR12: `${P}u-manager-a1-a2`, ENG12: `${P}u-engineer-a1-a2`, BILL12: `${P}u-billing-a1-a2`,
  V14: `${P}u-viewer-a1-a4`, V4: `${P}u-viewer-a4-only`, NONE: `${P}u-viewer-nogrant`, XADMIN: `${P}u-xadmin`,
} as const;
const USERS = Object.values(U);

/** Cases. Every id says what it is. */
const C = {
  p1a1: `${P}c-p1-a1`, p1a2: `${P}c-p1-a2`, p1orgB: `${P}c-p1-org-b-citing-a2`,
  p2a2: `${P}c-p2-a2`, p2a3: `${P}c-p2-a3`,
  p3a1: `${P}c-p3-a1`, p3a2: `${P}c-p3-a2`, p3a3: `${P}c-p3-a3`,
  p4a1: `${P}c-p4-a1`, p4a4: `${P}c-p4-a4-inactive`,
  p5a1: `${P}c-p5-a1`, p5mismatch: `${P}c-p5-asset-on-other-site`, p5foreign: `${P}c-p5-foreign-org-asset`, p5missing: `${P}c-p5-missing-asset`,
  p5nullnull: `${P}c-p5-null-null`, p5assetOnly: `${P}c-p5-asset-only`, p5inactive: `${P}c-p5-inactive-site`,
  pb1: `${P}c-pb-b1`, pb2: `${P}c-pb-b2`,
} as const;
const P5_CASES = [C.p5a1, C.p5mismatch, C.p5foreign, C.p5missing, C.p5nullnull, C.p5assetOnly, C.p5inactive];
const PAT = { p1: `${P}pat-1`, p2: `${P}pat-2`, p3: `${P}pat-3`, p4: `${P}pat-4`, p5: `${P}pat-5`, pb: `${P}pat-b` } as const;
const STORED_TYPE = "MSV-STORED-ASSET-TYPE";

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
  findMany: (a?: unknown) => Promise<Row[]>;
}
let db: Record<string, Model>;
const ORG_TABLES = ["crossSiteFailurePattern", "siteKPIComparison", "siteRiskSnapshot", "multiSiteBenchmark", "industrialEngineeringCase", "industrialFailureMode",
  "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }, { userId: { in: USERS } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }, { userId: { in: USERS } }] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  const bad = Object.entries(left).filter(([, n]) => n !== 0);
  if (bad.length > 0) throw new Error(`multi-site fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();

  const now = () => new Date();
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: `MSV-NAME-${id}`, slug: id, status, updatedAt: now() } });
  await site(A1, ORG_A); await site(A2, ORG_A); await site(A3, ORG_A); await site(A4, ORG_A, "INACTIVE");
  await site(B1, ORG_B); await site(B2, ORG_B);

  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN");
  await member(U.V1, ORG_A, "VIEWER"); await member(U.V12, ORG_A, "VIEWER"); await member(U.MGR12, ORG_A, "MANAGER");
  await member(U.ENG12, ORG_A, "ENGINEER"); await member(U.BILL12, ORG_A, "BILLING_ADMIN");
  await member(U.V14, ORG_A, "VIEWER"); await member(U.V4, ORG_A, "VIEWER"); await member(U.NONE, ORG_A, "VIEWER");
  await member(U.XADMIN, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string) => db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });
  await grant(U.V1, A1);
  for (const u of [U.V12, U.MGR12, U.ENG12, U.BILL12]) { await grant(u, A1); await grant(u, A2); }
  await grant(U.V14, A1); await grant(U.V14, A4);        // an ACTIVE grant on an INACTIVE site
  await grant(U.V4, A4);

  const asset = (id: string, org: string, siteId: string, assetType: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name`, assetType } });
  await asset(AS.a1, ORG_A, A1, "PUMP"); await asset(AS.a1b, ORG_A, A1, "MOTOR"); await asset(AS.a2, ORG_A, A2, "VALVE");
  await asset(AS.a3, ORG_A, A3, "COMPRESSOR"); await asset(AS.a4, ORG_A, A4, "CONVEYOR");
  await asset(AS.f2, ORG_B, A2, "SENSOR");               // the corrupt/legacy row: an organisation-B asset standing on organisation A's site A2
  await asset(AS.b1, ORG_B, B1, "PUMP"); await asset(AS.b2, ORG_B, B2, "PUMP");

  for (const [k, id] of Object.entries(FM)) {
    const name = FM_NAME[k as keyof typeof FM_NAME];
    await db.industrialFailureMode.create({ data: { id, organizationId: k === "fmB" ? ORG_B : ORG_A, name, nameNorm: name.toLowerCase(), description: "d", severity: "HIGH" } });
  }

  const kase = (id: string, org: string, siteId: string | null, assetId: string | null, failureModeId: string) =>
    db.industrialEngineeringCase.create({ data: {
      id, organizationId: org, title: `MSV-CASE-TITLE-${id}`, titleNorm: `msv ${id}`, diagnosis: `MSV-DIAG-${id}`, resolution: `MSV-RES-${id}`,
      symptoms: [], keywords: [], siteId, assetId, failureModeId, severity: "MEDIUM",
    } });
  await kase(C.p1a1, ORG_A, A1, AS.a1, FM.fm1); await kase(C.p1a2, ORG_A, A2, AS.a2, FM.fm1);
  await kase(C.p1orgB, ORG_B, A2, null, FM.fm1);         // another organisation's case that names org A's site and org A's failure mode id
  await kase(C.p2a2, ORG_A, A2, null, FM.fm2); await kase(C.p2a3, ORG_A, A3, AS.a3, FM.fm2);
  await kase(C.p3a1, ORG_A, A1, AS.a1b, FM.fm3); await kase(C.p3a2, ORG_A, A2, AS.a2, FM.fm3); await kase(C.p3a3, ORG_A, A3, AS.a3, FM.fm3);
  await kase(C.p4a1, ORG_A, A1, null, FM.fm4); await kase(C.p4a4, ORG_A, A4, AS.a4, FM.fm4);
  // FM5: ONE valid site (A1); every other case is corrupt. Counted by ANY reader, each would add site A2 and surface a pattern.
  await kase(C.p5a1, ORG_A, A1, null, FM.fm5);
  await kase(C.p5mismatch, ORG_A, A2, AS.a1, FM.fm5);                 // site A2, but the asset stands on A1
  await kase(C.p5foreign, ORG_A, A2, AS.f2, FM.fm5);                  // site A2, asset of ANOTHER organisation that stands on A2
  await kase(C.p5missing, ORG_A, A2, `${P}as-ghost`, FM.fm5);         // site A2, asset that does not exist
  await kase(C.p5nullnull, ORG_A, null, null, FM.fm5);                // organisation-level case
  await kase(C.p5assetOnly, ORG_A, null, AS.a2, FM.fm5);              // asset only (site would have to be derived)
  await kase(C.p5inactive, ORG_A, A4, AS.a4, FM.fm5);                 // an inactive site
  await kase(C.pb1, ORG_B, B1, AS.b1, FM.fmB); await kase(C.pb2, ORG_B, B2, AS.b2, FM.fmB);

  // ── persisted, ORGANISATION-wide snapshot of organisation A (what a past benchmark run stored) ──
  await db.multiSiteBenchmark.create({ data: {
    id: BM_A, organizationId: ORG_A, status: "SUCCESS", periodLabel: "last30Days", siteCount: 5, computedAt: now(),
    // the stored summary names hidden / inactive / foreign sites on purpose
    summary: { topSiteByAvailability: A4, bottomSiteByAvailability: B1, topSiteByHealth: A4, bottomSiteByRisk: B1, highestRiskSiteId: A4, patternCount: 41, sitesWithInsufficientData: 9, sitesWithStaleData: 9 },
  } });
  const snap = (siteId: string, siteName: string, risk: number, avail: number, health: number) => Promise.all([
    db.siteRiskSnapshot.create({ data: { organizationId: ORG_A, benchmarkId: BM_A, siteId, siteName, assetCount: 3, assetsWithData: 3, avgRiskScore: risk, maxRiskScore: risk, minRiskScore: risk, riskDistribution: { HIGH: 1 }, dataStatus: "ok", confidence: "HIGH" } }),
    db.siteKPIComparison.create({ data: { organizationId: ORG_A, benchmarkId: BM_A, siteId, siteName, periodLabel: "last30Days", avgAvailability: avail, avgEfficiency: 50, avgHealthScore: health, assetCount: 3, assetsWithKpiData: 3, dataStatus: "ok" } }),
  ]);
  await snap(A1, `MSV-NAME-${A1}`, 20, 70, 80); await snap(A2, `MSV-NAME-${A2}`, 60, 90, 50); await snap(A3, `MSV-NAME-${A3}`, 40, 95, 60);
  await snap(A4, `MSV-NAME-${A4}`, 95, 99, 99);          // the site was active when the snapshot was taken, it is inactive now
  await snap(B1, `MSV-NAME-${B1}`, 99, 99, 99);          // a row of a FOREIGN site inside organisation A's benchmark
  const pattern = (id: string, org: string, bm: string, fm: string, name: string, siteIds: string[], caseIds: string[]) =>
    db.crossSiteFailurePattern.create({ data: {
      id, organizationId: org, benchmarkId: bm, failureModeId: fm, failureModeName: name, severity: "HIGH", siteIds, siteCount: siteIds.length, caseCount: 99,
      affectedAssetTypes: [STORED_TYPE],
      evidence: { caseIds, bySite: Object.fromEntries(siteIds.map((s) => [s, { caseIds, assetIds: [`${P}stored-asset-of-${s}`] }])), unknownField: `${P}forward-me` },
    } });
  await pattern(PAT.p1, ORG_A, BM_A, FM.fm1, FM_NAME.fm1, [A1, A2], [C.p1a1, C.p1a2, C.p1orgB]);
  await pattern(PAT.p2, ORG_A, BM_A, FM.fm2, FM_NAME.fm2, [A2, A3], [C.p2a2, C.p2a3]);
  await pattern(PAT.p3, ORG_A, BM_A, FM.fm3, FM_NAME.fm3, [A1, A2, A3], [C.p3a1, C.p3a2, C.p3a3]);
  await pattern(PAT.p4, ORG_A, BM_A, FM.fm4, FM_NAME.fm4, [A1, A4], [C.p4a1, C.p4a4]);
  await pattern(PAT.p5, ORG_A, BM_A, FM.fm5, FM_NAME.fm5, [A1, A2], P5_CASES);

  // ── organisation B's own benchmark ──
  await db.multiSiteBenchmark.create({ data: {
    id: BM_B, organizationId: ORG_B, status: "SUCCESS", periodLabel: "last30Days", siteCount: 2, computedAt: now(),
    summary: { highestRiskSiteId: A1, topSiteByAvailability: A1, patternCount: 5 },     // a corrupt stored summary naming an org-A site
  } });
  for (const [siteId, risk, avail] of [[B1, 30, 80], [B2, 50, 60]] as const) {
    await db.siteRiskSnapshot.create({ data: { organizationId: ORG_B, benchmarkId: BM_B, siteId, siteName: `MSV-NAME-${siteId}`, assetCount: 1, assetsWithData: 1, avgRiskScore: risk, maxRiskScore: risk, minRiskScore: risk, riskDistribution: {}, dataStatus: "ok", confidence: "HIGH" } });
    await db.siteKPIComparison.create({ data: { organizationId: ORG_B, benchmarkId: BM_B, siteId, siteName: `MSV-NAME-${siteId}`, periodLabel: "last30Days", avgAvailability: avail, avgEfficiency: 50, avgHealthScore: 50, assetCount: 1, assetsWithKpiData: 1, dataStatus: "ok" } });
  }
  await pattern(PAT.pb, ORG_B, BM_B, FM.fmB, FM_NAME.fmB, [B1, B2], [C.pb1, C.pb2]);
}, 600000);

afterAll(async () => {
  if (!db) return;
  await purge();
  await assertNoResidue();
}, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest) => Promise<Response>;
const request = (user: string, org: string, method: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method, headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org } });
async function call(handler: unknown, user: string, path: string, org = ORG_A, method = "GET") {
  const res = await (handler as Handler)(request(user, org, method, path));
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
const benchmarks = (u: string, q = "", org = ORG_A) => call(benchmarksRoute.GET, u, `/api/multi-site/benchmarks${q}`, org);
const patterns = (u: string, q = "", org = ORG_A) => call(patternsRoute.GET, u, `/api/multi-site/failure-patterns${q}`, org);
const kpis = (u: string, org = ORG_A) => call(kpisRoute.GET, u, "/api/multi-site/kpis", org);
const risk = (u: string, org = ORG_A) => call(riskRoute.GET, u, "/api/multi-site/risk", org);
const summary = (u: string, org = ORG_A) => call(summaryRoute.GET, u, "/api/multi-site/summary", org);

const patternOf = (r: { json: Row }, id: string): Row | undefined => ((r.json.patterns ?? r.json.failurePatterns) as Row[] | undefined)?.find((p) => p.id === id);
const patternIds = (r: { json: Row }) => (((r.json.patterns ?? r.json.failurePatterns) as Row[] | undefined) ?? []).map((p) => String(p.id));
const sitesOf = (r: { json: Row }, key: string) => ((r.json[key] as Row[] | undefined) ?? []).map((x) => String(x.siteId));

/** Everything that identifies the part of organisation A that a given viewer may NOT see. */
const NEVER = [
  A4, B1, B2, `MSV-NAME-${A4}`, `MSV-NAME-${B1}`, `MSV-NAME-${B2}`, STORED_TYPE, `${P}forward-me`, `${P}stored-asset-of-`, "SENSOR", "CONVEYOR",
  AS.a4, AS.f2, AS.b1, AS.b2, C.p1orgB, C.p4a4, C.p4a1, ...P5_CASES, C.pb1, C.pb2, PAT.p4, PAT.p5, PAT.pb, FM.fm4, FM.fm5, FM.fmB,
];
const leaks = (text: string, hidden: readonly string[]) => hidden.filter((h) => text.includes(h));

const RESTRICTED_A1_A2 = [["VIEWER", U.V12], ["MANAGER", U.MGR12], ["ENGINEER", U.ENG12], ["BILLING_ADMIN", U.BILL12]] as const;
const ADMINS = [["OWNER", U.OWNER], ["ADMIN", U.ADMIN]] as const;

// ── eligibility, straight from the production policy ────────────────────────
describe("authoritative case eligibility (production SQL)", () => {
  it("for every ACTIVE site of the organisation only valid, site-bearing cases are eligible", async () => {
    const d = (await getPrisma()) as unknown as Record<string, unknown>;
    const got = (await loadEligibleCases(d, ORG_A, [A1, A2, A3])).map((x) => x.id).sort();
    expect(got).toEqual([C.p1a1, C.p1a2, C.p2a2, C.p2a3, C.p3a1, C.p3a2, C.p3a3, C.p4a1, C.p5a1].sort());
    for (const bad of [C.p1orgB, C.p4a4, C.p5mismatch, C.p5foreign, C.p5missing, C.p5nullnull, C.p5assetOnly, C.p5inactive]) expect(got).not.toContain(bad);
  });

  it("the inactive site and a foreign site never contribute even when listed among the viewer's sites by mistake", async () => {
    const d = (await getPrisma()) as unknown as Record<string, unknown>;
    // the SQL is org-bound: org B's case that names A2 is not org A's evidence, and site A4's case needs A4 in the list
    expect((await loadEligibleCases(d, ORG_A, [A2])).map((x) => x.id).sort()).toEqual([C.p1a2, C.p2a2, C.p3a2].sort());
    expect((await loadEligibleCases(d, ORG_A, [])).length).toBe(0);
  });
});

// ── OWNER / ADMIN ───────────────────────────────────────────────────────────
describe.each(ADMINS)("%s of organisation A", (_name, user) => {
  it("failure-patterns: the three patterns that hold two valid active sites, fully recomputed; nothing corrupt, inactive or foreign", async () => {
    const r = await patterns(user);
    expect(r.status).toBe(200);
    expect(patternIds(r)).toEqual([PAT.p3, PAT.p2, PAT.p1]);
    expect(patternOf(r, PAT.p1)).toMatchObject({
      siteIds: [A1, A2], siteCount: 2, caseCount: 2, affectedAssetTypes: ["PUMP", "VALVE"],
      evidence: { caseIds: [C.p1a1, C.p1a2].sort(), bySite: { [A1]: { caseIds: [C.p1a1], assetIds: [AS.a1] }, [A2]: { caseIds: [C.p1a2], assetIds: [AS.a2] } } },
    });
    expect(patternOf(r, PAT.p3)).toMatchObject({ siteCount: 3, caseCount: 3, affectedAssetTypes: ["COMPRESSOR", "MOTOR", "VALVE"] });
    expect(leaks(r.text, NEVER)).toEqual([]);
    expect(patternOf(r, PAT.p4)).toBeUndefined();            // A1 + an INACTIVE site
    expect(patternOf(r, PAT.p5)).toBeUndefined();            // every other contribution is corrupt
  });

  it("benchmarks: rows only of the three active sites of THIS organisation; ranking and summary recomputed from them", async () => {
    const r = await benchmarks(user);
    expect(r.status).toBe(200);
    expect(sitesOf(r, "riskRanking")).toEqual([A2, A3, A1]);
    expect(sitesOf(r, "kpiComparison")).toEqual([A3, A2, A1]);
    expect(r.json.benchmark).toMatchObject({
      id: BM_A, siteCount: 3,
      summary: { highestRiskSiteId: A2, bottomSiteByRisk: A1, topSiteByAvailability: A3, bottomSiteByAvailability: A1, topSiteByHealth: A1, patternCount: 3, sitesWithInsufficientData: 0, sitesWithStaleData: 0 },
    });
    expect(patternIds(r)).toEqual([PAT.p3, PAT.p2, PAT.p1]);
    expect(leaks(r.text, NEVER)).toEqual([]);
    const benchmark = r.json.benchmark as Row;
    for (const internal of ["errorMessage", "startedAt", "completedAt", "organizationId"]) expect(benchmark).not.toHaveProperty(internal);
  });

  it("kpis, risk and summary agree with the same three active sites", async () => {
    expect((await kpis(user)).json.sites).toHaveLength(3);
    expect(sitesOf(await kpis(user), "sites").sort()).toEqual([A1, A2, A3]);
    expect(sitesOf(await risk(user), "sites").sort()).toEqual([A1, A2, A3]);
    const s = await summary(user);
    expect(s.json).toMatchObject({ siteCount: 3, patternCount: 3, riskSummary: { sitesRanked: 3, highestRiskSiteId: A2 }, kpiSummary: { sitesCompared: 3 } });
    expect(leaks(s.text, NEVER)).toEqual([]);
  });
});

// ── restricted actors holding A1 + A2 ───────────────────────────────────────
describe.each(RESTRICTED_A1_A2)("%s holding A1 + A2", (_name, user) => {
  it("failure-patterns: A1+A2 pattern is whole; the A1+A2+A3 pattern is a fully recomputed A1+A2 projection; A2+A3, A1+A4 and the corrupt one are absent", async () => {
    const r = await patterns(user);
    expect(r.status).toBe(200);
    expect(patternIds(r)).toEqual([PAT.p3, PAT.p1]);                       // ordered by sites, cases, name (Corrosion < Seal leak)
    expect(patternOf(r, PAT.p1)).toMatchObject({ siteIds: [A1, A2], caseCount: 2, affectedAssetTypes: ["PUMP", "VALVE"] });
    expect(patternOf(r, PAT.p3)).toEqual(expect.objectContaining({
      siteIds: [A1, A2], siteCount: 2, caseCount: 2, affectedAssetTypes: ["MOTOR", "VALVE"],
      evidence: { caseIds: [C.p3a1, C.p3a2].sort(), bySite: { [A1]: { caseIds: [C.p3a1], assetIds: [AS.a1b] }, [A2]: { caseIds: [C.p3a2], assetIds: [AS.a2] } } },
    }));
    // nothing of the hidden site, in any nested position
    expect(leaks(r.text, [A3, `MSV-NAME-${A3}`, AS.a3, C.p3a3, C.p2a3, C.p2a2, "COMPRESSOR", PAT.p2, FM.fm2, ...NEVER])).toEqual([]);
    expect(patternOf(r, PAT.p2)).toBeUndefined();
    // the response contract has no total / page field to compute: it carries the patterns and the benchmark identity only
    expect(Object.keys(r.json).sort()).toEqual(["benchmarkId", "computedAt", "matchingCriterion", "patterns", "stale", "stalenessWarning"]);
  });

  it("benchmarks: only A1 and A2, recomputed ranking and summary, patternCount of the VISIBLE patterns, no stored aggregate", async () => {
    const r = await benchmarks(user);
    expect(r.status).toBe(200);
    expect(sitesOf(r, "riskRanking")).toEqual([A2, A1]);
    expect(sitesOf(r, "kpiComparison")).toEqual([A2, A1]);
    expect(r.json.benchmark).toMatchObject({
      siteCount: 2,
      summary: { highestRiskSiteId: A2, bottomSiteByRisk: A1, topSiteByAvailability: A2, bottomSiteByAvailability: A1, topSiteByHealth: A1, patternCount: 2, sitesWithInsufficientData: 0, sitesWithStaleData: 0 },
    });
    expect(patternIds(r)).toEqual([PAT.p3, PAT.p1]);
    expect(leaks(r.text, [A3, `MSV-NAME-${A3}`, AS.a3, C.p3a3, "COMPRESSOR", ...NEVER])).toEqual([]);
  });

  it("kpis, risk and summary list only A1 and A2 and count only visible patterns", async () => {
    expect(sitesOf(await kpis(user), "sites").sort()).toEqual([A1, A2]);
    expect(sitesOf(await risk(user), "sites").sort()).toEqual([A1, A2]);
    const s = await summary(user);
    expect(s.json).toMatchObject({ siteCount: 2, patternCount: 2, riskSummary: { sitesRanked: 2, highestRiskSiteId: A2 }, kpiSummary: { sitesCompared: 2 } });
    expect(leaks(s.text, [A3, A4, B1, `MSV-NAME-${A3}`])).toEqual([]);
  });

  it("a client siteId, a list of site ids, an organisation id or an allow-list cannot expand access", async () => {
    const hostile = `?siteId=${A3}&siteIds=${A3},${A4}&organizationId=${ORG_B}&allowedSiteIds=${A3}&role=OWNER`;
    expect((await patterns(user, hostile)).json).toEqual((await patterns(user)).json);
    expect((await benchmarks(user, hostile)).json).toEqual((await benchmarks(user)).json);
  });
});

// ── restricted actors that cannot form a cross-site view ────────────────────
describe("a viewer with ONE readable site", () => {
  it.each([["only A1", U.V1], ["A1 plus an ACTIVE grant on the INACTIVE A4", U.V14]] as const)("%s: no cross-site benchmark and no pattern — the answer reveals nothing about hidden sites", async (_n, user) => {
    const b = await benchmarks(user);
    expect(b.status).toBe(200);
    expect(b.json).toEqual({ data: null, reason: "Insufficient accessible sites for a cross-site benchmark." });
    const p = await patterns(user);
    expect(p.status).toBe(200);
    expect(p.json).toEqual({ patterns: [], reason: "Insufficient accessible sites for cross-site patterns." });
    // the same answer whatever is stored: it is decided from the caller's own scope
    expect(leaks(b.text + p.text, [A2, A3, A4, B1, "msv-pat", "msv-c-"])).toEqual([]);
  });

  it.each([["only A1", U.V1], ["A1 plus the inactive A4", U.V14]] as const)("%s: kpis, risk and summary describe the single readable site only", async (_n, user) => {
    expect(sitesOf(await kpis(user), "sites")).toEqual([A1]);
    expect(sitesOf(await risk(user), "sites")).toEqual([A1]);
    const s = await summary(user);
    expect(s.json).toMatchObject({ siteCount: 1, patternCount: 0, riskSummary: { sitesRanked: 1, highestRiskSiteId: A1 } });
    expect(leaks(s.text, [A2, A3, A4, B1])).toEqual([]);
  });
});

describe("a viewer with no usable site", () => {
  it.each([["only an ACTIVE grant on the INACTIVE site", U.V4], ["no grant at all", U.NONE]] as const)("%s: the safe empty answer everywhere", async (_n, user) => {
    expect((await benchmarks(user)).json).toEqual({ data: null, reason: "No accessible sites." });
    expect((await patterns(user)).json).toEqual({ patterns: [], reason: "No accessible sites." });
    expect((await kpis(user)).json).toEqual({ sites: [], reason: "No accessible sites." });
    expect((await risk(user)).json).toEqual({ sites: [], reason: "No accessible sites." });
    const s = await summary(user);
    expect(s.json).toMatchObject({ noAccessibleSites: true, siteCount: 0, patternCount: 0 });
    expect(leaks(s.text, [A1, A2, A3, A4, B1])).toEqual([]);
  });
});

// ── foreign organisation ────────────────────────────────────────────────────
describe("organisation isolation", () => {
  it("the admin of organisation B sees organisation B's own benchmark and nothing of organisation A; its corrupt stored summary is not forwarded", async () => {
    const r = await benchmarks(U.XADMIN, "", ORG_B);
    expect(r.status).toBe(200);
    expect(sitesOf(r, "riskRanking")).toEqual([B2, B1]);
    expect(r.json.benchmark).toMatchObject({ id: BM_B, siteCount: 2, summary: { highestRiskSiteId: B2, patternCount: 1 } });
    expect(patternIds(r)).toEqual([PAT.pb]);
    expect(leaks(r.text, [A1, A2, A3, A4, C.p1a1, C.p2a3, C.p3a3, AS.a1, AS.a2, AS.a3, BM_A])).toEqual([]);
    expect(patternIds(await patterns(U.XADMIN, "", ORG_B))).toEqual([PAT.pb]);
  });

  it("an organisation-A admin acting in organisation B is refused", async () => {
    expect((await benchmarks(U.ADMIN, "", ORG_B)).status).toBe(403);
    expect((await patterns(U.ADMIN, "", ORG_B)).status).toBe(403);
  });

  it("a foreign site's row stored inside organisation A's benchmark never reaches organisation A", async () => {
    for (const [, user] of ADMINS) {
      expect(sitesOf(await risk(user), "sites")).not.toContain(B1);
      expect(sitesOf(await benchmarks(user), "kpiComparison")).not.toContain(B1);
    }
  });
});

// ── the generator (producer) uses the same eligibility ──────────────────────
describe("the benchmark generator builds its patterns from eligible cases only", () => {
  // NOTE: `POST /api/multi-site/benchmarks` cannot run end to end on a database that has assets: `kpis.ts` reads the
  // Prisma delegate as `db.kpiRecord` (the generated name is `kPIRecord`). That pre-existing defect is outside this
  // slice, so the producer is exercised directly.
  it("for every active site: only the failure modes with two valid sites, and evidence free of corrupt, inactive and foreign cases", async () => {
    const { findCrossSiteFailurePatterns } = await import("@/lib/multi-site/failure-patterns");
    const out = await findCrossSiteFailurePatterns(ORG_A, [A1, A2, A3]);
    expect(out.map((p) => p.failureModeId)).toEqual([FM.fm3, FM.fm2, FM.fm1]);
    expect(out.find((p) => p.failureModeId === FM.fm1)).toEqual({
      failureModeId: FM.fm1, failureModeName: FM_NAME.fm1, severity: "HIGH", siteIds: [A1, A2], siteCount: 2, caseCount: 2,
      affectedAssetTypes: ["PUMP", "VALVE"],
      evidence: { caseIds: [C.p1a1, C.p1a2].sort(), bySite: { [A1]: { caseIds: [C.p1a1], assetIds: [AS.a1] }, [A2]: { caseIds: [C.p1a2], assetIds: [AS.a2] } } },
    });
    expect(leaks(JSON.stringify(out), [...P5_CASES, C.p1orgB, C.p4a4, C.p4a1, AS.f2, AS.a4, A4, FM.fm4, FM.fm5])).toEqual([]);
  });

  it("scoped to two sites it produces only the patterns those two sites support", async () => {
    const { findCrossSiteFailurePatterns } = await import("@/lib/multi-site/failure-patterns");
    const out = await findCrossSiteFailurePatterns(ORG_A, [A1, A2]);
    expect(out.map((p) => p.failureModeId)).toEqual([FM.fm3, FM.fm1]);
    expect(leaks(JSON.stringify(out), [A3, AS.a3, C.p3a3, C.p2a3])).toEqual([]);
    expect(await findCrossSiteFailurePatterns(ORG_A, [A1])).toEqual([]);
    expect(await findCrossSiteFailurePatterns(ORG_A, [])).toEqual([]);
  });

  it("POST by a member whose only grant is an inactive site is a FAILED run with no snapshot rows (the scope is the active one)", async () => {
    const before = await db.siteRiskSnapshot.count({ where: { organizationId: ORG_A } });
    const run = await call(benchmarksRoute.POST, U.V4, "/api/multi-site/benchmarks", ORG_A, "POST");
    expect(run.status).toBe(200);
    expect(run.json.benchmark).toMatchObject({ status: "FAILED", errorMessage: "No active sites found" });
    expect(await db.siteRiskSnapshot.count({ where: { organizationId: ORG_A } })).toBe(before);
    // a FAILED run is never "the latest benchmark": the readers still serve the SUCCESS snapshot
    expect(sitesOf(await benchmarks(U.V12), "riskRanking")).toEqual([A2, A1]);
  });
});
