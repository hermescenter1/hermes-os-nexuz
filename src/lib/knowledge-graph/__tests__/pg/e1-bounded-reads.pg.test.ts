/**
 * Slice E1 / independent review S2-02, S2-03 and S2-04 — bounded reads and the failure oracle, against
 * REAL PostgreSQL.
 *
 * S2-02 multi-site KPI comparison read every `KPIRecord` of the 30-day period and kept the first row per
 *       (asset, KPI) in memory: a long history materialised in full.
 * S2-03 knowledge-graph visibility read EVERY historical `AssetRiskScore` row of every visible asset and
 *       EVERY `AssetKnowledgeLink` row of the organisation (other sites' included) on every graph GET,
 *       three times in one `/root-causes/[id]` request.
 * S2-04 `GET /api/knowledge/failures?assetId=` authorised with the raw `getAllowedSiteIds` grants, so an
 *       asset on a DEACTIVATED site still answered 200 while a missing asset answered 404.
 *
 * Both correctness AND materialisation are proven: `getPrisma` is wrapped in a transparent RECORDER (every
 * query still runs against the database; the recorder only notes which statements ran and how many rows
 * each returned), so "the history cannot grow the number of rows the application reads" is a measurement,
 * not a claim.
 *
 * Fixtures use the `e1-b-` prefix; only they are removed, and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

interface Call { model: string; op: string; rows: number | null; sql?: string }
const rec = vi.hoisted(() => ({ on: false, calls: [] as { model: string; op: string; rows: number | null; sql?: string }[] }));

vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/prisma")>();
  const WATCHED = new Set(["assetRiskScore", "assetKnowledgeLink", "kPIRecord", "assetHealthHistory",
    "industrialAsset", "industrialKnowledgeGraphNode", "industrialKnowledgeGraphEdge", "industrialEngineeringCase"]);
  const note = (model: string, op: string, result: unknown, sql?: string) => {
    if (rec.on) rec.calls.push({ model, op, rows: Array.isArray(result) ? result.length : null, sql });
    return result;
  };
  let base: unknown = null;
  let wrapped: unknown = null;
  const wrap = (client: Record<string, unknown>) => new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === "$queryRaw" && typeof value === "function") {
        return (...a: unknown[]) => (value as (...x: unknown[]) => Promise<unknown>).apply(target, a)
          .then((r) => note("$queryRaw", "raw", r, String((a[0] as readonly string[]).join("?")).replace(/\s+/g, " ")));
      }
      if (typeof prop === "string" && WATCHED.has(prop) && value && typeof value === "object") {
        const delegate = value as Record<string, unknown>;
        return new Proxy(delegate, {
          get(d, op) {
            const fn = Reflect.get(d, op);
            if (typeof fn !== "function" || typeof op !== "string") return fn;
            return (args: unknown) => (fn as (x: unknown) => Promise<unknown>).call(d, args).then((r) => note(prop, op, r));
          },
        });
      }
      return typeof value === "function" ? (value as (...x: unknown[]) => unknown).bind(target) : value;
    },
  });
  return {
    ...orig,
    getPrisma: async () => {
      const c = await orig.getPrisma();
      if (!c) return c;
      if (c !== base) { base = c; wrapped = wrap(c as unknown as Record<string, unknown>); }
      return wrapped as typeof c;
    },
  };
});
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
const { compareSiteKPIs } = await import("@/lib/multi-site/kpis");
const { rankSitesByRisk } = await import("@/lib/multi-site/risk");
const { rebuildKnowledgeGraph } = await import("@/lib/knowledge-graph/builder");
const { loadVisibleEntitySets, resolveGraphViewerScope } = await import("@/lib/knowledge-graph/visibility");
const { getKnowledgeGraph } = await import("@/lib/knowledge-graph/query");
const failuresRoute = await import("@/app/api/knowledge/failures/route");
const rootCauseRoute = await import("@/app/api/industrial-graph/root-causes/[rootCauseId]/route");

const P = "e1-b-";
const ORG = `${P}org`, ORG_B = `${P}org-b`;
const ORGS = [ORG, ORG_B];
const S1 = `${P}s1`, S2 = `${P}s2`, SI = `${P}s-inactive`, SB = `${P}sb`;
const A1 = `${P}a1`, A2 = `${P}a2`, AI = `${P}a-inactive`, AB = `${P}ab`;
const FM = `${P}fm`, RC = `${P}rc`, PROC = `${P}proc`;
/** Catalogue entries linked ONLY through assets the viewer cannot see (hidden S2 / inactive SI / org B). */
const FM_HIDDEN = `${P}fm-hidden`, PROC_HIDDEN = `${P}proc-hidden`;
/** ENGINEER with ACTIVE grants on S1 AND on the INACTIVE site SI (a stale grant). S2/SB are hidden. */
const ENG = `${P}u-eng1`;
const USERS = [ENG];

/**
 * History depth per asset: deep enough that an unbounded read is unmistakable in the recorder (one row
 * returned out of a dozen or more per asset), while keeping the fixture small enough that the knowledge
 * graph rebuild — which runs inside Prisma's 5 s interactive transaction — fits on a slow host.
 */
const RISK_HISTORY = 12;
const KPI_HISTORY = 12;
const LINKS_PER_ASSET = 6;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; createMany: (a: unknown) => Promise<{ count: number }>; findFirst: (a?: unknown) => Promise<Row | null>; findMany: (a?: unknown) => Promise<Row[]>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;

const ORG_TABLES = ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot",
  "assetKnowledgeLink", "assetRiskScore", "assetHealthHistory", "kPIRecord", "industrialEngineeringCase",
  "industrialRootCause", "industrialMaintenanceProcedure", "industrialFailureMode",
  "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const TIE = hoursAgo(2);

async function seed() {
  await db.user.create({ data: { id: ENG, name: ENG, email: `${ENG}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  await site(S1, ORG); await site(S2, ORG); await site(SI, ORG, "INACTIVE"); await site(SB, ORG_B);
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  const grant = (siteId: string) => db.userSite.create({ data: { userId: ENG, siteId, organizationId: ORG, role: "SITE_ENGINEER", status: "ACTIVE" } });
  await grant(S1); await grant(SI);                                   // the SI grant is ACTIVE but the site is not
  const asset = (id: string, org: string, siteId: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name` } });
  await asset(A1, ORG, S1); await asset(A2, ORG, S2); await asset(AI, ORG, SI); await asset(AB, ORG_B, SB);

  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG, name: "E1B-FM", nameNorm: "e1b-fm", description: "d", severity: "HIGH" } });
  await db.industrialFailureMode.create({ data: { id: FM_HIDDEN, organizationId: ORG, name: "E1B-FM-HIDDEN", nameNorm: "e1b-fm-hidden", description: "d", severity: "HIGH" } });
  await db.industrialMaintenanceProcedure.create({ data: { id: PROC_HIDDEN, organizationId: ORG, title: "E1B-PROC-HIDDEN", titleNorm: "e1b-proc-hidden", description: "E1B-PROC-HIDDEN-DESC", steps: [] } });
  await db.industrialRootCause.create({ data: { id: RC, organizationId: ORG, failureModeId: FM, description: "E1B-RC", confidenceWeight: 0.8 } });
  await db.industrialMaintenanceProcedure.create({ data: { id: PROC, organizationId: ORG, title: "E1B-PROC", titleNorm: "e1b-proc", description: "E1B-PROC-DESC", steps: [] } });

  // ── risk history: RISK_HISTORY rows per asset, with an equal-timestamp tie at the newest instant ──
  const risk = (id: string, org: string, assetId: string, riskScore: number, createdAt: Date) => ({
    id, organizationId: org, assetId, riskScore, confidence: "HIGH", createdAt,
    healthTrendScore: 0, alarmTrendScore: 0, kpiDegradationScore: 0, telQualityScore: 0, telFreshnessScore: 0, criticalityFactor: 1,
  });
  for (const [assetId, org] of [[A1, ORG], [A2, ORG], [AI, ORG], [AB, ORG_B]] as const) {
    const rows: Row[] = [];
    for (let i = 0; i < RISK_HISTORY; i++) rows.push(risk(`${P}rs-${assetId}-${String(i).padStart(2, "0")}`, org, assetId, 10 + i, hoursAgo(10 + i)));
    // two rows at the SAME newest instant: the lower id must win, deterministically
    rows.push(risk(`${P}rs-${assetId}-tie-a`, org, assetId, 71, TIE));
    rows.push(risk(`${P}rs-${assetId}-tie-b`, org, assetId, 72, TIE));
    await db.assetRiskScore.createMany({ data: rows });
  }

  // ── KPI history: KPI_HISTORY rows per (asset, name) inside the period, plus an equal-timestamp tie ──
  const kpi = (id: string, assetId: string, kpiName: string, value: number, calculatedAt: Date) =>
    ({ id, organizationId: ORG, siteId: null, assetId, kpiName, value, period: "last30Days", calculatedAt });
  for (const assetId of [A1, A2, AI]) {
    const rows: Row[] = [];
    for (const name of ["availability", "efficiency"]) {
      for (let i = 0; i < KPI_HISTORY; i++) rows.push(kpi(`${P}k-${assetId}-${name}-${String(i).padStart(2, "0")}`, assetId, name, 10 + i, hoursAgo(5 + i)));
      rows.push(kpi(`${P}k-${assetId}-${name}-tie-a`, assetId, name, 91, TIE));
      rows.push(kpi(`${P}k-${assetId}-${name}-tie-b`, assetId, name, 92, TIE));
    }
    // a KPI name the comparison does not use: it must never be read
    rows.push(kpi(`${P}k-${assetId}-runtime`, assetId, "runtime", 500, hoursAgo(1)));
    await db.kPIRecord.createMany({ data: rows });
  }
  const health = (id: string, assetId: string, healthScore: number, createdAt: Date) =>
    ({ id, organizationId: ORG, assetId, healthScore, healthStatus: "healthy", createdAt });
  await db.assetHealthHistory.createMany({ data: [
    health(`${P}h-a1-old`, A1, 10, hoursAgo(9)), health(`${P}h-a1-new`, A1, 70, hoursAgo(1)),
    health(`${P}h-a2-new`, A2, 40, hoursAgo(1)),
  ] });

  // ── knowledge links: many per asset, including other sites' and another organisation's ──
  const link = (id: string, org: string, assetId: string, extra: Row) => ({ id, organizationId: org, assetId, ...extra });
  for (const [assetId, org] of [[A1, ORG], [A2, ORG], [AI, ORG]] as const) {
    const rows: Row[] = [];
    for (let i = 0; i < LINKS_PER_ASSET; i++) {
      rows.push(link(`${P}l-${assetId}-fm-${i}`, org, assetId, { failureModeId: FM }));
      rows.push(link(`${P}l-${assetId}-proc-${i}`, org, assetId, { procedureId: PROC }));
    }
    // The HIDDEN pair exists only on the assets of hidden (S2) and inactive (SI) sites: a visible asset
    // never links FM_HIDDEN to PROC_HIDDEN, so that pair must never appear in the visible mitigations.
    if (assetId !== A1) {
      rows.push(link(`${P}l-${assetId}-fmh`, org, assetId, { failureModeId: FM_HIDDEN }));
      rows.push(link(`${P}l-${assetId}-proch`, org, assetId, { procedureId: PROC_HIDDEN }));
    }
    await db.assetKnowledgeLink.createMany({ data: rows });
  }

  await rebuildKnowledgeGraph(ORG);
}

async function recording<T>(fn: () => Promise<T>): Promise<{ value: T; calls: Call[] }> {
  rec.calls = []; rec.on = true;
  try { return { value: await fn(), calls: [...rec.calls] }; } finally { rec.on = false; }
}
const rowsRead = (calls: Call[], model: string): number =>
  calls.filter((c) => c.model === model).reduce((n, c) => n + (c.rows ?? 0), 0);

const req = (method: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method, headers: { cookie: `hermes_at=t:${ENG}`, "x-test-org": ORG } });
async function settle(res: Response) {
  const text = await res.text();
  let json: Row = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}
const failures = (query: string) => (failuresRoute.GET as (r: NextRequest) => Promise<Response>)(req("GET", `/api/knowledge/failures${query}`)).then(settle);

beforeAll(async () => {
  const c = await getPrisma(); if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();
  await seed();
}, 900000);
afterAll(async () => { if (db) await purge(); }, 600000);

// ═══════════════════════════════════════════════════════════════════════════
describe("e1 S2-02 — multi-site KPI history is bounded in the database", () => {
  const siteMap = new Map([[S1, "S1"], [S2, "S2"]]);
  const siteAssetMap = new Map([[S1, [A1]], [S2, [A2]]]);

  it("e1-K1 at most one row per (compared asset, KPI name) is read, however deep the history", async () => {
    const { value, calls } = await recording(() => compareSiteKPIs(ORG, siteMap, siteAssetMap));
    expect(calls.filter((c) => c.model === "kPIRecord")).toEqual([]);          // no delegate read at all
    const raw = calls.filter((c) => c.model === "$queryRaw");
    expect(raw).toHaveLength(2);                                               // KPI + health, both DISTINCT ON
    const kpiRaw = raw.find((c) => c.sql?.includes(`"KPIRecord"`))!;
    expect(kpiRaw.sql).toContain(`SELECT DISTINCT ON (k."assetId", k."kpiName")`);
    expect(kpiRaw.sql).toContain(`ORDER BY k."assetId" ASC, k."kpiName" ASC, k."calculatedAt" DESC, k."id" ASC`);
    // 2 compared assets × 2 KPI names = 4 rows, out of (KPI_HISTORY+2)×2+1 rows per asset in the table.
    expect(kpiRaw.rows).toBe(4);
    const perAsset = (KPI_HISTORY + 2) * 2 + 1;
    expect(await db.kPIRecord.count({ where: { organizationId: ORG, assetId: { in: [A1, A2] } } })).toBe(perAsset * 2);
    expect(kpiRaw.rows!).toBeLessThan(perAsset);                               // the history cannot grow the read
    expect(value.map((s) => s.siteId)).toEqual([S1, S2]);
  });

  it("e1-K2 the authoritative row is the newest, ties resolve to the lowest id, and unused KPI names are ignored", async () => {
    const out = await compareSiteKPIs(ORG, siteMap, siteAssetMap);
    const s1 = out.find((s) => s.siteId === S1)!;
    // `tie-a` (91) and `tie-b` (92) share the newest instant → the lower id wins.
    expect(s1.avgAvailability).toBe(91);
    expect(s1.avgEfficiency).toBe(91);
    expect(s1.avgHealthScore).toBe(70);                                        // newest health row
    // The `runtime` rows (value 500) can never reach the means.
    expect(JSON.stringify(out)).not.toContain("500");
  });

  it("e1-K3 an inactive-site or foreign asset contributes nothing even if a caller lists it", async () => {
    const out = await compareSiteKPIs(ORG, new Map([[S1, "S1"]]), new Map([[S1, [A1, AI, AB]]]));
    const s1 = out.find((s) => s.siteId === S1)!;
    expect(s1.avgAvailability).toBe(91);                                       // A1 only; AI/AB add no rows of ORG
    expect(s1.assetsWithKpiData).toBe(2);                                      // A1 and AI have rows; AB (org B) none
    const foreign = await compareSiteKPIs(ORG, new Map([[SB, "SB"]]), new Map([[SB, [AB]]]));
    expect(foreign.find((s) => s.siteId === SB)!.avgAvailability).toBeNull();
  });

  it("e1-K4 risk ranking also reads one row per asset, newest, lowest id on a tie", async () => {
    const { value, calls } = await recording(() => rankSitesByRisk(ORG, siteMap, siteAssetMap));
    expect(calls.filter((c) => c.model === "assetRiskScore")).toEqual([]);
    const raw = calls.filter((c) => c.model === "$queryRaw");
    expect(raw).toHaveLength(1);
    expect(raw[0].rows).toBe(2);                                               // one row per compared asset
    expect(value.find((s) => s.siteId === S1)!.avgRiskScore).toBe(71);          // tie-a, not tie-b
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("e1 S2-03 — knowledge-graph visibility is bounded in the database", () => {
  const scopeFor = () => resolveGraphViewerScope(ENG, ORG, "ENGINEER");

  it("e1-G1 the visible-entity sets read ONE risk row per visible asset and aggregate the links in SQL", async () => {
    const scope = await scopeFor();
    expect([...scope.allowedSiteIds]).toEqual([S1]);                           // the stale SI grant is dropped
    const raw = await getPrisma();
    const { value: sets, calls } = await recording(() => loadVisibleEntitySets(raw as unknown as Record<string, unknown>, scope));

    expect(calls.filter((c) => c.model === "assetRiskScore")).toEqual([]);
    expect(calls.filter((c) => c.model === "assetKnowledgeLink")).toEqual([]);
    const riskRaw = calls.find((c) => c.sql?.includes(`"AssetRiskScore"`))!;
    expect(riskRaw.sql).toContain(`SELECT DISTINCT ON (r."assetId")`);
    expect(riskRaw.rows).toBe(1);                                              // one visible asset (A1) → 1 row
    expect(await db.assetRiskScore.count({ where: { organizationId: ORG, assetId: A1 } })).toBe(RISK_HISTORY + 2);
    const linkRaw = calls.find((c) => c.sql?.includes(`"AssetKnowledgeLink"`))!;
    expect(linkRaw.sql).toContain("SELECT DISTINCT");
    expect(linkRaw.rows).toBe(1);                                              // exactly 1 (FM, PROC) pair
    // 3 assets x 25 pairs, plus the 4 hidden-only rows on the hidden/inactive-site assets.
    expect(await db.assetKnowledgeLink.count({ where: { organizationId: ORG } })).toBe(LINKS_PER_ASSET * 2 * 3 + 4);

    // Correctness is unchanged: the latest risk row of A1 is visible, no other asset's is.
    expect(sets.assets).toEqual(new Set([A1]));
    expect([...sets.risks]).toEqual([`${P}rs-${A1}-tie-a`]);                    // newest, lowest id on the tie
    // EXACTLY the pair a visible asset links. The pair that exists only on hidden/inactive-site assets
    // is absent — dropping the site predicate from the aggregation would add it here.
    expect([...sets.mitigations]).toEqual([`${FM}|${PROC}`]);
    expect([...sets.mitigations].join(",")).not.toContain(FM_HIDDEN);
    expect([...sets.mitigations].join(",")).not.toContain(PROC_HIDDEN);
  });

  it("e1-G2 no foreign, hidden or inactive-site row can enter the sets", async () => {
    const scope = await scopeFor();
    const raw = await getPrisma();
    const sets = await loadVisibleEntitySets(raw as unknown as Record<string, unknown>, scope);
    const all = JSON.stringify({ assets: [...sets.assets], risks: [...sets.risks], tags: [...sets.tags], twin: [...sets.twinNodes], mitigations: [...sets.mitigations] });
    for (const hidden of [A2, AI, AB, S2, SI, SB, FM_HIDDEN, PROC_HIDDEN]) expect(all).not.toContain(hidden);
  });

  it("e1-G3 a graph GET materialises the same bounded number of rows regardless of history depth", async () => {
    const scope = await scopeFor();
    const { value, calls } = await recording(() => getKnowledgeGraph(scope));
    expect(rowsRead(calls, "assetRiskScore")).toBe(0);
    expect(rowsRead(calls, "assetKnowledgeLink")).toBe(0);
    const rawRows = calls.filter((c) => c.model === "$queryRaw").reduce((n, c) => n + (c.rows ?? 0), 0);
    expect(rawRows).toBeLessThanOrEqual(10);                                    // ids only: one risk row + one pair + cases
    expect(value.nodes.every((n) => n.organizationId === ORG)).toBe(true);
  });

  it("e1-G4 /root-causes/[id] resolves the scoped graph ONCE, not three times", async () => {
    const { calls } = await recording(() =>
      (rootCauseRoute.GET as (r: NextRequest, c: { params: Promise<{ rootCauseId: string }> }) => Promise<Response>)(
        req("GET", `/api/industrial-graph/root-causes/${RC}`), { params: Promise.resolve({ rootCauseId: RC }) },
      ).then(settle));
    // The cache tables are read once per scoped-graph resolution; the visible sets come with them.
    expect(calls.filter((c) => c.model === "industrialKnowledgeGraphNode" && c.op === "findMany")).toHaveLength(1);
    expect(calls.filter((c) => c.model === "industrialKnowledgeGraphEdge" && c.op === "findMany")).toHaveLength(1);
    expect(calls.filter((c) => c.sql?.includes(`"AssetRiskScore"`))).toHaveLength(1);
    expect(calls.filter((c) => c.sql?.includes(`"AssetKnowledgeLink"`))).toHaveLength(1);
  });

  it("e1-G5 repeated evaluation stays bounded and deterministic", async () => {
    const scope = await scopeFor();
    const first = await recording(() => getKnowledgeGraph(scope));
    const second = await recording(() => getKnowledgeGraph(scope));
    expect(second.value.nodes.map((n) => n.id)).toEqual(first.value.nodes.map((n) => n.id));
    expect(second.calls.length).toBe(first.calls.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("e1 S2-04 — the failure route has one not-found answer", () => {
  it("e1-F1 an ACTIVE authorized asset succeeds", async () => {
    const r = await failures(`?assetId=${A1}`);
    expect(r.status).toBe(200);
    expect(r.json).toHaveProperty("knowledge");
  });

  it("e1-F2 inactive-site (stale grant), hidden-site, foreign, missing and malformed ids are ALL the same 404", async () => {
    const missing = await failures(`?assetId=${P}no-such-asset`);
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Asset not found" });
    for (const id of [AI, A2, AB, `${P}no-such-asset`, "../etc/passwd", "a".repeat(300), "' OR 1=1 --"]) {
      const r = await failures(`?assetId=${encodeURIComponent(id)}`);
      expect({ id, status: r.status, json: r.json }).toEqual({ id, status: 404, json: missing.json });
    }
  });

  it("e1-F3 a rejected probe performs no failure-history work and leaks no identifier", async () => {
    const { value: r, calls } = await recording(() => failures(`?assetId=${AI}`));
    expect(r.status).toBe(404);
    // No failure mode, case or link read happened for the refused asset.
    expect(calls.filter((c) => c.model === "industrialEngineeringCase")).toEqual([]);
    expect(calls.filter((c) => c.model === "assetKnowledgeLink")).toEqual([]);
    for (const hidden of [SI, S2, SB, FM, RC]) expect(r.text).not.toContain(hidden);
  });

  it("e1-F4 the failure-mode LIST (no assetId) still answers for the same actor", async () => {
    const r = await failures("");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.failureModes)).toBe(true);
  });
});

describe("e1 bounded-reads teardown", () => {
  it("e1-BZ leaves zero residue", async () => {
    await purge();
    expect(await residue()).toEqual({});
  });
});
