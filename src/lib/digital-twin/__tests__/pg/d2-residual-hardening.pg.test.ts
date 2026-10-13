/**
 * Slice D2 — residual scope, bound and error-contract hardening, against REAL PostgreSQL.
 *
 * Covers the scoped Digital Twin graph helpers (getNodeRelations, getConnectedAssets, getDependencyPath,
 * getUpstream/DownstreamAssets), the Factory Topology summary, the Copilot insight/context asset reads,
 * the Multi-site risk (and KPI health) "latest row per asset" reads, the legacy cross-site relation
 * contract, the site-confined hierarchy checks and the opaque layout payload.
 *
 * REAL: services, routes, guards, org/site RBAC, Prisma, PostgreSQL. MOCKED: the token layer
 * (`requirePlatformAuth`, org from `x-test-org`) and metering. `getPrisma` is wrapped by a transparent
 * RECORDER — every query still runs against the database; the recorder only notes which delegate
 * operations ran (with their arguments and row counts) so the suite can prove what was and was NOT read.
 *
 * Fixtures use the `d2-r-` prefix; only they are removed, and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

interface Call { model: string; op: string; args: unknown; rows: number | null }
const rec = vi.hoisted(() => ({ on: false, calls: [] as { model: string; op: string; args: unknown; rows: number | null }[] }));

vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/prisma")>();
  const WATCHED = new Set(["digitalTwinNode", "digitalTwinRelation", "assetRiskScore", "assetHealthHistory", "industrialAsset", "digitalTwinLayout"]);
  const note = (model: string, op: string, args: unknown, result: unknown) => {
    if (rec.on) rec.calls.push({ model, op, args, rows: Array.isArray(result) ? result.length : null });
    return result;
  };
  let base: unknown = null;
  let wrapped: unknown = null;
  const wrap = (client: Record<string, unknown>) => new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === "$queryRaw" && typeof value === "function") {
        return (...a: unknown[]) => (value as (...x: unknown[]) => Promise<unknown>).apply(target, a)
          .then((r) => note("$queryRaw", "raw", String((a[0] as readonly string[]).join("?")), r));
      }
      if (typeof prop === "string" && WATCHED.has(prop) && value && typeof value === "object") {
        const delegate = value as Record<string, unknown>;
        return new Proxy(delegate, {
          get(d, op) {
            const fn = Reflect.get(d, op);
            if (typeof fn !== "function" || typeof op !== "string") return fn;
            return (args: unknown) => (fn as (x: unknown) => Promise<unknown>).call(d, args).then((r) => note(prop, op, args, r));
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

const { getPrisma } = await import("@/lib/db/prisma");
const graph = await import("@/lib/digital-twin/graph");
const { getFactoryTopology } = await import("@/lib/digital-twin/brain");
const { generateInsights, INSIGHT_MAX_ASSETS } = await import("@/lib/copilot/insights");
const { getSiteContextSummary, getOrganizationContextSummary } = await import("@/lib/copilot/context");
const { authorizeCopilotSelectors } = await import("@/lib/copilot/scope");
const { rankSitesByRisk } = await import("@/lib/multi-site/risk");
const { compareSiteKPIs } = await import("@/lib/multi-site/kpis");
const { compareSites } = await import("@/lib/multi-site/comparison");
const relationIdRoute = await import("@/app/api/digital-twin/relations/[id]/route");
const relationsRoute = await import("@/app/api/digital-twin/relations/route");
const nodeIdRoute = await import("@/app/api/digital-twin/nodes/[id]/route");
const layoutRoute = await import("@/app/api/digital-twin/layout/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "d2-r-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`, ORG_R = `${P}org-r`;
const ORGS = [ORG_A, ORG_B, ORG_R];
const S1 = `${P}s1`, S2 = `${P}s2`, S3 = `${P}s3-copilot`, SI = `${P}s-inactive`, SB = `${P}sb`;
const R1 = `${P}r1`, R2 = `${P}r2`, RI = `${P}r-inactive`, RB = `${P}rb`;
const U = {
  ADMIN: `${P}u-admin`,
  VMGR: `${P}u-mgr-view-s1`,     // org MANAGER (manage_digital_twin), SITE_VIEWER on S1 only
  SMGR: `${P}u-mgr-manage-s1`,   // org MANAGER, SITE_MANAGER on S1 only
  V1: `${P}u-viewer-s1`,         // org VIEWER, SITE_VIEWER on S1 only
  CP: `${P}u-copilot-s3`,        // org VIEWER, SITE_VIEWER on S3 and an ACTIVE grant on the INACTIVE SI
} as const;
const USERS = Object.values(U);

/** Node ids. `m*` are at the hidden S2, `i1` at the inactive SI, `b1` in organisation B. */
const N = {
  n1: `${P}n1`, n2: `${P}n2`, n3: `${P}n3`, x1: `${P}x1`, x2: `${P}x2`, h: `${P}hub`,
  p: `${P}p`, q: `${P}q`, u: `${P}u`, v: `${P}v`, px: `${P}px`, pz: `${P}pz`, cx: `${P}cx`, cz: `${P}cz`,
  m1: `${P}m1-hidden`, m2: `${P}m2-hidden`, h2: `${P}h2-hidden`, py: `${P}py-hidden`,
  i1: `${P}i1-inactive`, b1: `${P}b1-foreign`,
} as const;
const HIDDEN_IDS = [N.m1, N.m2, N.h2, N.py, N.i1, N.b1];
const SPOKES = 205;
const CHAIN = 60;
const spoke = (i: number) => `${P}spoke-${String(i).padStart(3, "0")}`;
const chain = (i: number) => `${P}c${String(i).padStart(2, "0")}`;
const REL = {
  n1n2: `${P}rel-n1-n2`, n2n3: `${P}rel-n2-n3`, legS1S2: `${P}rel-leg-n2-m1`, legS2S1: `${P}rel-leg-m1-n3`,
  s2only: `${P}rel-m1-m2`, x1m1: `${P}rel-x1-m1`, m1x2: `${P}rel-m1-x2`, n3i1: `${P}rel-leg-n3-i1`,
} as const;

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>; createMany: (a: unknown) => Promise<{ count: number }>;
  findFirst: (a?: unknown) => Promise<Row | null>; findMany: (a?: unknown) => Promise<Row[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>; updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
let db: Record<string, Model>;

const ORG_TABLES = ["copilotInsight", "assetRiskScore", "assetHealthHistory", "kPIRecord", "digitalTwinRelation", "digitalTwinLayout", "assetTag",
  "userSite", "organizationMember"];
const DENIALS = { action: "site.access.denied", OR: [{ entityId: { startsWith: P } }, { userId: { in: USERS } }] };

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.digitalTwinNode.updateMany({ where: w, data: { parentNodeId: null } });
  await db.digitalTwinNode.deleteMany({ where: w });
  await db.industrialAsset.deleteMany({ where: w });
  await db.industrialSite.deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, DENIALS] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  await new Promise((r) => setTimeout(r, 250));                 // a denial audit is written fire-and-forget
  await db.auditLog.deleteMany({ where: DENIALS });
}
async function residue(): Promise<Record<string, number>> {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of [...ORG_TABLES, "digitalTwinNode", "industrialAsset", "industrialSite"]) left[m] = await db[m].count({ where: w });
  left.audit = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, DENIALS] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
const T0 = new Date("2026-01-01T00:00:00Z").getTime();
const at = (minutes: number) => new Date(T0 + minutes * 60_000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/** Copilot fixture: 55 visible assets on S3 (pairs share a createdAt), 10 NEWER on hidden S2, 5 NEWER on inactive SI. */
const CP_VISIBLE = Array.from({ length: 55 }, (_, i) => ({ id: `${P}cp-s3-${String(i).padStart(2, "0")}`, createdAt: at(Math.floor(i / 2)) }));
const CP_HIDDEN = Array.from({ length: 10 }, (_, i) => ({ id: `${P}cp-s2-${i}`, createdAt: at(10_000 + i) }));
const CP_INACTIVE = Array.from({ length: 5 }, (_, i) => ({ id: `${P}cp-si-${i}`, createdAt: at(20_000 + i) }));
const expectedFirstPage = () => [...CP_VISIBLE]
  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .slice(0, INSIGHT_MAX_ASSETS).map((a) => a.id);

async function seed() {
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  await site(S1, ORG_A); await site(S2, ORG_A); await site(S3, ORG_A); await site(SI, ORG_A, "INACTIVE"); await site(SB, ORG_B);
  await site(R1, ORG_R); await site(R2, ORG_R); await site(RI, ORG_R, "INACTIVE"); await site(RB, ORG_B);

  const member = (userId: string, role: string) => db.organizationMember.create({ data: { organizationId: ORG_A, userId, role, status: "ACTIVE" } });
  await member(U.ADMIN, "ADMIN"); await member(U.VMGR, "MANAGER"); await member(U.SMGR, "MANAGER"); await member(U.V1, "VIEWER"); await member(U.CP, "VIEWER");
  const grant = (userId: string, siteId: string, role: string) => db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role, status: "ACTIVE" } });
  await grant(U.VMGR, S1, "SITE_VIEWER"); await grant(U.SMGR, S1, "SITE_MANAGER"); await grant(U.V1, S1, "SITE_VIEWER");
  await grant(U.CP, S3, "SITE_VIEWER"); await grant(U.CP, SI, "SITE_VIEWER");

  // ── Digital Twin graph (organisation A) ─────────────────────────────────
  const node = (id: string, siteId: string, org = ORG_A, extra: Row = {}) =>
    ({ id, organizationId: org, siteId, displayName: id.toUpperCase(), nodeType: "SYSTEM", ...extra });
  await db.digitalTwinNode.createMany({ data: [
    node(N.n1, S1), node(N.n2, S1), node(N.n3, S1), node(N.x1, S1), node(N.x2, S1), node(N.h, S1),
    node(N.p, S1), node(N.q, S1), node(N.u, S1), node(N.v, S1), node(N.pz, S1), node(N.cx, S1), node(N.cz, S1),
    node(N.m1, S2), node(N.m2, S2), node(N.h2, S2), node(N.i1, SI), node(N.b1, SB, ORG_B),
    ...Array.from({ length: SPOKES }, (_, i) => node(spoke(i), S1)),
    ...Array.from({ length: CHAIN }, (_, i) => node(chain(i), S1)),
  ] });
  // Legacy parent pointers: px (S1) → py (S2, hidden) → pz (S1); and the in-site control cz → cx.
  await db.digitalTwinNode.create({ data: node(N.py, S2, ORG_A, { parentNodeId: N.pz }) });
  await db.digitalTwinNode.create({ data: node(N.px, S1, ORG_A, { parentNodeId: N.py }) });
  await db.digitalTwinNode.updateMany({ where: { id: N.cz }, data: { parentNodeId: N.cx } });

  let t = 0;
  const rel = (id: string | null, s: string, tg: string, relationType = "FEEDS", org = ORG_A) =>
    ({ ...(id ? { id } : {}), organizationId: org, sourceNodeId: s, targetNodeId: tg, relationType, createdAt: at(++t) });
  await db.digitalTwinRelation.createMany({ data: [
    rel(REL.n1n2, N.n1, N.n2), rel(REL.n2n3, N.n2, N.n3),
    rel(REL.legS1S2, N.n2, N.m1), rel(REL.legS2S1, N.m1, N.n3), rel(REL.s2only, N.m1, N.m2),   // legacy cross-site + hidden-only
    rel(REL.x1m1, N.x1, N.m1), rel(REL.m1x2, N.m1, N.x2),                                    // x1 → x2 only THROUGH hidden m1
    rel(REL.n3i1, N.n3, N.i1),                                                               // legacy edge into the inactive site
    rel(null, N.q, N.h2, "PART_OF"), rel(null, N.h2, N.p, "PART_OF"),                         // q ⊂ h2(hidden) ⊂ p
    rel(null, N.u, N.v, "PART_OF"),                                                          // in-site: u ⊂ v
    ...Array.from({ length: SPOKES }, (_, i) => rel(null, N.h, spoke(i))),
    ...Array.from({ length: CHAIN - 1 }, (_, i) => rel(null, chain(i), chain(i + 1))),
  ] });

  // ── Copilot assets ──────────────────────────────────────────────────────
  const asset = (id: string, org: string, siteId: string, createdAt = now()) => ({ id, organizationId: org, siteId, name: `${id}-name`, createdAt, updatedAt: now() });
  await db.industrialAsset.createMany({ data: [
    ...CP_VISIBLE.map((a) => asset(a.id, ORG_A, S3, a.createdAt)),
    ...CP_HIDDEN.map((a) => asset(a.id, ORG_A, S2, a.createdAt)),
    ...CP_INACTIVE.map((a) => asset(a.id, ORG_A, SI, a.createdAt)),
  ] });

  // ── Risk / health history (organisation R) ──────────────────────────────
  await db.industrialAsset.createMany({ data: [
    asset(`${P}r1a`, ORG_R, R1), asset(`${P}r1b`, ORG_R, R1), asset(`${P}r2a`, ORG_R, R2), asset(`${P}ri`, ORG_R, RI), asset(`${P}rb`, ORG_B, RB),
  ] });
  const tie = hoursAgo(1);
  const risk = (id: string, org: string, assetId: string, riskScore: number, createdAt: Date) => ({
    id, organizationId: org, assetId, riskScore, confidence: "HIGH", createdAt,
    healthTrendScore: 0, alarmTrendScore: 0, kpiDegradationScore: 0, telQualityScore: 0, telFreshnessScore: 0, criticalityFactor: 1,
  });
  await db.assetRiskScore.createMany({ data: [
    risk(`${P}rs-r1a-old`, ORG_R, `${P}r1a`, 90, hoursAgo(30)), risk(`${P}rs-r1a-new`, ORG_R, `${P}r1a`, 20, hoursAgo(2)),
    risk(`${P}rs-r1b-a`, ORG_R, `${P}r1b`, 70, tie), risk(`${P}rs-r1b-b`, ORG_R, `${P}r1b`, 10, tie), risk(`${P}rs-r1b-old`, ORG_R, `${P}r1b`, 5, hoursAgo(5)),
    risk(`${P}rs-r2a-new`, ORG_R, `${P}r2a`, 50, hoursAgo(3)), risk(`${P}rs-r2a-old`, ORG_R, `${P}r2a`, 99, hoursAgo(40)),
    risk(`${P}rs-ri`, ORG_R, `${P}ri`, 100, hoursAgo(1)),                         // inactive site
    // (An org-R row naming organisation B's asset cannot exist: the composite FK AssetRiskScore_org_assetId_fkey refuses it.)
    risk(`${P}rs-b`, ORG_B, `${P}rb`, 100, hoursAgo(0.5)),
  ] });
  const health = (id: string, assetId: string, healthScore: number, createdAt: Date) => ({ id, organizationId: ORG_R, assetId, healthScore, healthStatus: "healthy", createdAt });
  await db.assetHealthHistory.createMany({ data: [
    health(`${P}hh-r1a-1`, `${P}r1a`, 40, hoursAgo(10)), health(`${P}hh-r1a-2`, `${P}r1a`, 60, hoursAgo(5)), health(`${P}hh-r1a-3`, `${P}r1a`, 80, hoursAgo(1)),
    health(`${P}hh-r2a-a`, `${P}r2a`, 30, tie), health(`${P}hh-r2a-b`, `${P}r2a`, 90, tie), health(`${P}hh-r2a-old`, `${P}r2a`, 10, hoursAgo(12)),
  ] });
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();
  await seed();
}, 600000);
afterAll(async () => { if (db) await purge(); }, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
async function recording<T>(fn: () => Promise<T>): Promise<{ value: T; calls: Call[] }> {
  rec.calls = []; rec.on = true;
  try { return { value: await fn(), calls: [...rec.calls] }; } finally { rec.on = false; }
}
const req = (user: string, method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": ORG_A } });
async function settle(res: Response) { const text = await res.text(); let json: Row = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* */ } return { status: res.status, text, json }; }
type IdHandler = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
const callId = async (h: unknown, user: string, method: string, path: string, id: string, body?: unknown) =>
  settle(await (h as IdHandler)(req(user, method, `${path}/${id}`, body), { params: Promise.resolve({ id }) }));
const call = async (h: unknown, user: string, method: string, path: string, body?: unknown) =>
  settle(await (h as (r: NextRequest) => Promise<Response>)(req(user, method, path, body)));
const noHidden = (value: unknown) => {
  const text = JSON.stringify(value);
  for (const id of HIDDEN_IDS) expect(text).not.toContain(id);
};

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r graph helpers — scoped, bounded, deterministic", () => {
  it("d2-08 visible start/target returns only visible nodes", async () => {
    const down = await graph.getDownstreamAssets(N.n1, ORG_A, [S1]);
    expect(down.nodes.map((n) => n.id).sort()).toEqual([N.n2, N.n3].sort());
    const conn = await graph.getConnectedAssets(N.n2, ORG_A, [S1]);
    expect(conn.nodes.map((n) => n.id)).toEqual([N.n3, N.n1]);              // outbound first, then inbound, each by (createdAt, id)
    expect(conn.truncated).toBe(false);
    const path = await graph.getDependencyPath(N.n1, N.n3, ORG_A, [S1]);
    expect(path).toMatchObject({ path: [N.n1, N.n2, N.n3], truncated: false });
    expect(path?.nodes.map((n) => n.id)).toEqual([N.n1, N.n2, N.n3]);
    noHidden([down, conn, path]);
  });

  it("d2-09 a hidden, inactive-site or foreign START answers like a missing one", async () => {
    for (const start of [N.m1, N.i1, N.b1, `${P}no-such-node`]) {
      expect(await graph.getConnectedAssets(start, ORG_A, [S1])).toEqual({ nodes: [], truncated: false });
      expect(await graph.getUpstreamAssets(start, ORG_A, [S1])).toEqual({ nodes: [], cycleDetected: false, truncated: false });
      expect(await graph.getDependencyPath(start, N.n3, ORG_A, [S1])).toBeNull();
    }
  });

  it("d2-10 a hidden TARGET cannot be reached, and a path that exists only THROUGH a hidden node is not found", async () => {
    for (const target of [N.m1, N.i1, N.b1, `${P}no-such-node`]) {
      expect(await graph.getDependencyPath(N.n1, target, ORG_A, [S1])).toBeNull();
    }
    const through = await graph.getDependencyPath(N.x1, N.x2, ORG_A, [S1]);
    expect(through).toEqual({ path: null, nodes: [], truncated: false });
  });

  it("d2-11/12 a cross-site relation is omitted and no dangling hidden endpoint is returned", async () => {
    const rels = await graph.getNodeRelations(N.n2, ORG_A, { allowedSiteIds: [S1] });
    expect(rels.outbound.map((r) => r.id)).toEqual([REL.n2n3]);
    expect(rels.inbound.map((r) => r.id)).toEqual([REL.n1n2]);
    const conn3 = await graph.getConnectedAssets(N.n3, ORG_A, [S1]);
    expect(conn3.nodes.map((n) => n.id)).toEqual([N.n2]);                    // n3 → i1 and m1 → n3 are legacy cross-site
    noHidden([rels, conn3, await graph.getUpstreamAssets(N.n3, ORG_A, [S1]), await graph.getDownstreamAssets(N.x1, ORG_A, [S1])]);
  });

  it("d2-13 an empty scope returns nothing and performs no read at all", async () => {
    const { value, calls } = await recording(async () => [
      await graph.getConnectedAssets(N.n1, ORG_A, []),
      await graph.getDependencyPath(N.n1, N.n3, ORG_A, []),
      await graph.getNodeRelations(N.n1, ORG_A, { allowedSiteIds: [] }),
      await graph.getDownstreamAssets(N.n1, ORG_A, []),
      await getFactoryTopology(ORG_A, S1, []),
    ]);
    expect(value).toEqual([
      { nodes: [], truncated: false }, null, { outbound: [], inbound: [], truncated: false },
      { nodes: [], cycleDetected: false, truncated: false }, null,
    ]);
    expect(calls).toEqual([]);
  });

  it("d2-14/17 the result size is clamped to the server maximum whatever the caller asks", async () => {
    const all = await graph.getConnectedAssets(N.h, ORG_A, [S1]);
    expect(all.nodes).toHaveLength(graph.MAX_TRAVERSAL_RESULT_NODES);
    expect(all.truncated).toBe(true);
    expect((await graph.getConnectedAssets(N.h, ORG_A, [S1], { maxNodes: 100_000 })).nodes).toHaveLength(graph.MAX_TRAVERSAL_RESULT_NODES);
    const five = await graph.getConnectedAssets(N.h, ORG_A, [S1], { maxNodes: 5 });
    expect(five.nodes.map((n) => n.id)).toEqual([0, 1, 2, 3, 4].map(spoke));
    expect(five.truncated).toBe(true);
    const down = await graph.getDownstreamAssets(N.h, ORG_A, [S1], { maxNodes: 100_000 });
    expect(down.nodes).toHaveLength(graph.MAX_TRAVERSAL_RESULT_NODES);
    expect(down.truncated).toBe(true);
  });

  it("d2-15/17 the depth is clamped to MAX_TRAVERSAL_DEPTH whatever the caller asks", async () => {
    const down = await graph.getDownstreamAssets(chain(0), ORG_A, [S1], { maxDepth: 1000 });
    expect(down.nodes).toHaveLength(50);
    expect(down.truncated).toBe(true);
    expect(await graph.getDependencyPath(chain(0), chain(CHAIN - 1), ORG_A, [S1], { maxDepth: 1000 })).toMatchObject({ path: null });
    expect((await graph.getDependencyPath(chain(0), chain(40), ORG_A, [S1]))?.path).toHaveLength(41);
    expect(await graph.getDependencyPath(chain(0), chain(40), ORG_A, [S1], { maxDepth: 10 })).toMatchObject({ path: null });
  });

  it("d2-16 ordering is deterministic across calls", async () => {
    const a = await graph.getConnectedAssets(N.h, ORG_A, [S1], { maxNodes: 50 });
    const b = await graph.getConnectedAssets(N.h, ORG_A, [S1], { maxNodes: 50 });
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.nodes.map((n) => n.id)).toEqual(Array.from({ length: 50 }, (_, i) => spoke(i)));
  });

  it("d2-18 a foreign organisation's node never appears, even with its site id in the scope", async () => {
    expect(await graph.getConnectedAssets(N.b1, ORG_A, [SB])).toEqual({ nodes: [], truncated: false });
    expect(await graph.getDependencyPath(N.n1, N.b1, ORG_A, [S1, SB])).toBeNull();
    noHidden(await graph.getDownstreamAssets(N.n1, ORG_A, [S1, SB]));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r Factory Topology — scoped to one allowed ACTIVE site", () => {
  it("d2-19 counts only the site's nodes and the relations whose BOTH endpoints are there", async () => {
    const topo = await getFactoryTopology(ORG_A, S1, [S1]);
    const s1Nodes = await db.digitalTwinNode.count({ where: { organizationId: ORG_A, siteId: S1 } });
    const s1Rels = await db.digitalTwinRelation.count({ where: { organizationId: ORG_A, sourceNode: { siteId: S1 }, targetNode: { siteId: S1 } } });
    expect(topo).toMatchObject({ organizationId: ORG_A, siteId: S1, nodeCount: s1Nodes, relationCount: s1Rels, truncated: false });
    expect(topo?.nodesByType).toEqual({ SYSTEM: s1Nodes });
    noHidden(topo);
  });

  it("d2-20/21 hidden, inactive, foreign and unknown sites — and an empty scope — are null, not counted", async () => {
    expect(await getFactoryTopology(ORG_A, S2, [S1])).toBeNull();          // hidden: not in scope
    expect(await getFactoryTopology(ORG_A, SI, [S1, SI])).toBeNull();      // inactive, even if a stale scope lists it
    expect(await getFactoryTopology(ORG_A, SB, [S1, SB])).toBeNull();      // another organisation's site
    expect(await getFactoryTopology(ORG_A, `${P}no-such-site`, [`${P}no-such-site`])).toBeNull();
    expect(await getFactoryTopology(ORG_A, S1, [])).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r Copilot — asset reads bounded in the database", () => {
  it("d2-22/23/24 insights examine exactly the first INSIGHT_MAX_ASSETS visible assets, bounded IN the query", async () => {
    const auth = await authorizeCopilotSelectors(U.CP, ORG_A, {});
    if (!auth.ok) throw new Error("copilot scope refused");
    expect([...auth.scope.siteIds]).toEqual([S3]);                          // the inactive SI grant is not in scope
    const { value, calls } = await recording(() => generateInsights(auth.scope));
    const examined = value.map((i) => i.assetId);
    expect(examined).toEqual(expectedFirstPage());                          // newest first, id breaks the createdAt ties
    expect(new Set(examined).size).toBe(INSIGHT_MAX_ASSETS);
    for (const hidden of [...CP_HIDDEN, ...CP_INACTIVE]) expect(examined).not.toContain(hidden.id);
    const assetReads = calls.filter((c) => c.model === "industrialAsset" && c.op === "findMany");
    expect(assetReads).toHaveLength(1);
    expect(assetReads[0].args).toMatchObject({ where: { organizationId: ORG_A, siteId: { in: [S3] } }, take: INSIGHT_MAX_ASSETS });
    expect(assetReads[0].rows).toBe(INSIGHT_MAX_ASSETS);
    await db.copilotInsight.deleteMany({ where: { organizationId: ORG_A } });
  });

  it("d2-23 a second run selects the same first page", async () => {
    const auth = await authorizeCopilotSelectors(U.CP, ORG_A, {});
    if (!auth.ok) throw new Error("copilot scope refused");
    const first = (await generateInsights(auth.scope)).map((i) => i.assetId);
    const second = (await generateInsights(auth.scope)).map((i) => i.assetId);
    expect(second).toEqual(first);
    await db.copilotInsight.deleteMany({ where: { organizationId: ORG_A } });
  });

  it("d2-25 context summaries report the true count, page in the query and never load the whole site", async () => {
    const auth = await authorizeCopilotSelectors(U.CP, ORG_A, {});
    if (!auth.ok) throw new Error("copilot scope refused");
    const { value: site, calls } = await recording(() => getSiteContextSummary(auth.scope, S3));
    expect(site).toMatchObject({ siteId: S3, assetCount: CP_VISIBLE.length, moreAssets: CP_VISIBLE.length - 20 });
    expect(site?.assets.map((a) => a.assetId)).toEqual(expectedFirstPage().slice(0, 20));
    // The site's asset LIST is read once, with the page size in the query; the total is a COUNT.
    const siteReads = calls.filter((c) => c.model === "industrialAsset" && c.op === "findMany" && ((c.args as Row).where as Row).siteId === S3);
    expect(siteReads).toHaveLength(1);
    expect(siteReads[0]).toMatchObject({ args: { take: 20 }, rows: 20 });
    expect(calls.filter((c) => c.model === "industrialAsset" && c.op === "count")).toHaveLength(1);
    const org = await getOrganizationContextSummary(auth.scope);
    expect(org).toMatchObject({ siteCount: 1, assetCount: CP_VISIBLE.length });
    expect(await getSiteContextSummary(auth.scope, S2)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r Multi-site risk and health — one authoritative row per compared asset", () => {
  const siteMap = new Map([[R1, "R1"], [R2, "R2"]]);
  const siteAssetMap = new Map([[R1, [`${P}r1a`, `${P}r1b`]], [R2, [`${P}r2a`]]]);

  /** Independent reference: the latest row per asset (createdAt DESC, id ASC), computed from the full history. */
  async function referenceLatest(assetIds: string[]) {
    const rows = await db.assetRiskScore.findMany({ where: { organizationId: ORG_R, assetId: { in: assetIds } } });
    const best = new Map<string, Row>();
    for (const r of rows) {
      const cur = best.get(String(r.assetId));
      const newer = !cur || (r.createdAt as Date).getTime() > (cur.createdAt as Date).getTime()
        || ((r.createdAt as Date).getTime() === (cur.createdAt as Date).getTime() && String(r.id) < String(cur.id));
      if (newer) best.set(String(r.assetId), r);
    }
    return best;
  }

  it("d2-26/27/29 the latest row wins, a createdAt tie resolves to the lowest id, and the ranking matches the reference", async () => {
    const out = await rankSitesByRisk(ORG_R, siteMap, siteAssetMap);
    const ref = await referenceLatest([`${P}r1a`, `${P}r1b`, `${P}r2a`]);
    expect(ref.get(`${P}r1b`)?.id).toBe(`${P}rs-r1b-a`);
    const r1 = out.find((s) => s.siteId === R1)!, r2 = out.find((s) => s.siteId === R2)!;
    expect(r1).toMatchObject({ avgRiskScore: 45, maxRiskScore: 70, minRiskScore: 20, assetsWithData: 2, dataStatus: "ok" });
    expect(r2).toMatchObject({ avgRiskScore: 50, maxRiskScore: 50, assetsWithData: 1, dataStatus: "ok" });
    expect(out.map((s) => s.siteId)).toEqual([R2, R1]);
    const refAvg = (ids: string[]) => Math.round((ids.reduce((a, id) => a + Number(ref.get(id)?.riskScore), 0) / ids.length) * 10) / 10;
    expect(r1.avgRiskScore).toBe(refAvg([`${P}r1a`, `${P}r1b`]));
    expect(r2.avgRiskScore).toBe(refAvg([`${P}r2a`]));
  });

  it("d2-30 the database returns at most one risk row per compared asset — the history is never materialised", async () => {
    const { calls } = await recording(() => rankSitesByRisk(ORG_R, siteMap, siteAssetMap));
    expect(calls.filter((c) => c.model === "assetRiskScore")).toEqual([]);
    const raw = calls.filter((c) => c.model === "$queryRaw");
    expect(raw).toHaveLength(1);
    expect(String(raw[0].args)).toContain(`DISTINCT ON (r."assetId")`);
    expect(raw[0].rows).toBe(3);                                            // 3 assets, 7 history rows
    expect(await db.assetRiskScore.count({ where: { organizationId: ORG_R, assetId: { in: [`${P}r1a`, `${P}r1b`, `${P}r2a`] } } })).toBe(7);
  });

  it("d2-28 inactive-site and foreign assets do not influence the generated comparison", async () => {
    const result = await compareSites(ORG_R);
    expect(result?.siteIds.sort()).toEqual([R1, R2].sort());
    const r1 = result!.risk.find((s) => s.siteId === R1)!;
    expect(r1).toMatchObject({ avgRiskScore: 45, maxRiskScore: 70 });
    expect(result!.risk.map((s) => s.siteId)).not.toContain(RI);
    expect(result!.risk.every((s) => (s.maxRiskScore ?? 0) < 100)).toBe(true);
  });

  it("d2-30b KPI health: the latest row per asset is selected in SQL (tie → lowest id), one row per asset", async () => {
    const { value, calls } = await recording(() => compareSiteKPIs(ORG_R, siteMap, siteAssetMap));
    expect(calls.filter((c) => c.model === "assetHealthHistory")).toEqual([]);
    // Slice E1 (independent-review S2-02): the KPI read moved into SQL too, so this path now issues TWO
    // bounded statements — the KPI one and the health one — instead of one. Neither reads a delegate.
    expect(calls.filter((c) => c.model === "kPIRecord")).toEqual([]);
    const raw = calls.filter((c) => c.model === "$queryRaw");
    expect(raw).toHaveLength(2);
    const health = raw.find((c) => String(c.args).includes("AssetHealthHistory"))!;
    expect(health.rows).toBe(2);                                            // r1a and r2a have history; 6 rows in all
    const r1 = value.find((s) => s.siteId === R1)!, r2 = value.find((s) => s.siteId === R2)!;
    expect(r1.avgHealthScore).toBe(80);
    expect(r2.avgHealthScore).toBe(30);                                     // tie at the same createdAt → `hh-r2a-a`
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r legacy cross-site relations — one not-found contract", () => {
  const PATH = "/api/digital-twin/relations";
  const body = { metadata: { note: "d2" } };

  it("d2-31 PATCH: a legacy relation with a hidden endpoint (either order), a hidden-site relation and a missing id answer identically", async () => {
    const missing = await callId(relationIdRoute.PATCH, U.VMGR, "PATCH", PATH, `${P}no-such-relation`, body);
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Relation not found", code: "RELATION_NOT_FOUND" });
    for (const id of [REL.legS1S2, REL.legS2S1, REL.s2only]) {
      for (const user of [U.VMGR, U.SMGR]) {
        const r = await callId(relationIdRoute.PATCH, user, "PATCH", PATH, id, body);
        expect({ id, user, status: r.status, json: r.json }).toEqual({ id, user, status: missing.status, json: missing.json });
      }
    }
    // A relation the caller can SEE but not manage is the documented 403 (both sites reachable).
    const visible = await callId(relationIdRoute.PATCH, U.VMGR, "PATCH", PATH, REL.n1n2, body);
    expect(visible.status).toBe(403);
    expect(visible.json.code).toBe("INSUFFICIENT_SITE_PERMISSION");
    expect((await db.digitalTwinRelation.findFirst({ where: { id: REL.legS1S2 } }))?.metadata).toEqual({});
  });

  it("d2-32 GET and node detail never disclose a legacy relation's hidden endpoint", async () => {
    const missing = await callId(relationIdRoute.GET, U.V1, "GET", PATH, `${P}no-such-relation`);
    for (const id of [REL.legS1S2, REL.legS2S1, REL.s2only]) {
      const r = await callId(relationIdRoute.GET, U.V1, "GET", PATH, id);
      expect({ status: r.status, json: r.json }).toEqual({ status: missing.status, json: missing.json });
    }
    const detail = await callId(nodeIdRoute.GET, U.V1, "GET", "/api/digital-twin/nodes", N.n2);
    expect(detail.status).toBe(200);
    for (const id of HIDDEN_IDS) expect(detail.text).not.toContain(id);
    const list = await call(relationsRoute.GET, U.V1, "GET", `${PATH}?sourceNodeId=${N.n2}`);
    expect(list.status).toBe(200);
    for (const id of HIDDEN_IDS) expect(list.text).not.toContain(id);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r hierarchy checks stay inside the node's site", () => {
  it("d2-33 a PART_OF cycle check does not walk through a hidden node (no oracle); an in-site cycle is still refused", async () => {
    // q ⊂ h2 (hidden S2) ⊂ p exists only through legacy cross-site edges. Adding p ⊂ q is judged on S1's hierarchy alone.
    const created = await call(relationsRoute.POST, U.SMGR, "POST", "/api/digital-twin/relations", { sourceNodeId: N.p, targetNodeId: N.q, relationType: "PART_OF" });
    expect(created.status).toBe(201);
    for (const id of HIDDEN_IDS) expect(created.text).not.toContain(id);
    const cycle = await call(relationsRoute.POST, U.SMGR, "POST", "/api/digital-twin/relations", { sourceNodeId: N.v, targetNodeId: N.u, relationType: "PART_OF" });
    expect(cycle.status).toBe(422);
    expect(cycle.json.code).toBe("HIERARCHY_CYCLE");
  });

  it("d2-33b a parent-chain check stops at a legacy pointer into a hidden site; an in-site parent cycle is still refused", async () => {
    // px → py (hidden S2) → pz. Setting pz.parent = px is judged on S1's chain alone.
    const ok = await callId(nodeIdRoute.PATCH, U.SMGR, "PATCH", "/api/digital-twin/nodes", N.pz, { parentNodeId: N.px });
    expect(ok.status).toBe(200);
    for (const id of HIDDEN_IDS) expect(ok.text).not.toContain(id);
    const cycle = await callId(nodeIdRoute.PATCH, U.SMGR, "PATCH", "/api/digital-twin/nodes", N.cx, { parentNodeId: N.cz });
    expect(cycle.status).toBe(422);
    expect(cycle.json.code).toBe("HIERARCHY_CYCLE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("d2-r layout payload is opaque and bounded", () => {
  const PATH = "/api/digital-twin/layout";
  const layoutsAt = (siteId: string) => db.digitalTwinLayout.count({ where: { organizationId: ORG_A, siteId } });

  it("d2-34 a valid layout succeeds and is stored exactly", async () => {
    const layoutData = { positions: { [N.n1]: { x: 10, y: 20 } }, zoom: 1.5, legend: ["a", "b"] };
    const r = await call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: S1, name: "D2 layout", layoutData });
    expect(r.status).toBe(201);
    expect((r.json.layout as Row).layoutData).toEqual(layoutData);
  });

  it("d2-35/36 node-id-shaped values (hidden, foreign, inactive, missing) are stored opaquely: no node is resolved or read", async () => {
    const layoutData = { nodes: [{ id: N.m1 }, { id: N.b1 }, { id: N.i1 }, { id: `${P}no-such-node` }, { id: N.n1 }], nodeId: N.m1 };
    const { value: r, calls } = await recording(() => call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: S1, name: "D2 opaque", layoutData }));
    expect(r.status).toBe(201);
    expect((r.json.layout as Row).layoutData).toEqual(layoutData);
    expect(calls.filter((c) => c.model === "digitalTwinNode" || c.model === "digitalTwinRelation")).toEqual([]);
    // A layout at a site the caller cannot reach is "site not found" — the same as a site that does not exist.
    const hidden = await call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: S2, name: "x", layoutData: {} });
    const missing = await call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: `${P}no-such-site`, name: "x", layoutData: {} });
    expect({ status: hidden.status, json: hidden.json }).toEqual({ status: missing.status, json: missing.json });
    expect(hidden.status).toBe(404);
  });

  it("d2-37 the generic JSON limits still apply (depth, forbidden keys, size) and nothing is stored", async () => {
    const before = await layoutsAt(S1);
    let deep: Row = { leaf: 1 };
    for (let i = 0; i < 9; i++) deep = { d: deep };
    const tooDeep = await call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: S1, name: "deep", layoutData: deep });
    expect(tooDeep.status).toBe(400);
    const polluted = await settle(await (layoutRoute.POST as (r: NextRequest) => Promise<Response>)(new NextRequest(new URL(PATH, "http://localhost"), {
      method: "POST",
      body: `{"siteId":"${S1}","name":"proto","layoutData":{"a":{"__proto__":{"polluted":true}}}}`,
      headers: { "content-type": "application/json", cookie: `hermes_at=t:${U.SMGR}`, "x-test-org": ORG_A },
    })));
    expect(polluted.status).toBe(400);
    const big = await call(layoutRoute.POST, U.SMGR, "POST", PATH, { siteId: S1, name: "big", layoutData: { blob: "x".repeat(270 * 1024) } });
    expect(big.status).toBeGreaterThanOrEqual(400);
    expect(big.status).toBeLessThan(500);
    expect(await layoutsAt(S1)).toBe(before);
    expect(({} as Row).polluted).toBeUndefined();
  });
});

describe("d2-r teardown", () => {
  it("d2-38 leaves zero residue", async () => {
    await purge();
    expect(await residue()).toEqual({});
  });
});
