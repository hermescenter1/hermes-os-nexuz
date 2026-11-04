/**
 * Digital Twin — ACTIVE-site scope of every collection read (IR-01), against REAL PostgreSQL.
 *
 * THE DEFECT. `getAllowedSiteIds` returns a non-OWNER/ADMIN member's ACTIVE `UserSite` grants
 * without looking at the `IndustrialSite` itself. A member whose grant outlived the site's
 * deactivation therefore still LISTED that site's nodes, relations, tags and layouts, while the
 * detail routes (via `requireSiteActor`, which requires an ACTIVE site) answered 404 for the
 * very same records. `resolveSiteScope` (digital-twin/scope.ts) now intersects the grant with the
 * organisation's ACTIVE sites and every collection route uses it.
 *
 * REAL: the routes, the guards, org RBAC, site RBAC, `requireOrgActor`, `requireSiteActor`,
 *       `getAllowedSiteIds`, `resolveSiteScope`, the services and their SQL.
 * MOCKED: only the token layer (`verifyAccessToken`, `requirePlatformAuth` — the organisation comes
 *       from `x-test-org`, as the real guard derives it server side) and metering.
 *
 * Fixtures use the `dtas-` prefix; only they are removed, and any leftover fails the run.
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

const { getPrisma } = await import("@/lib/db/prisma");
const nodesRoute = await import("@/app/api/digital-twin/nodes/route");
const nodeIdRoute = await import("@/app/api/digital-twin/nodes/[id]/route");
const relationsRoute = await import("@/app/api/digital-twin/relations/route");
const relationIdRoute = await import("@/app/api/digital-twin/relations/[id]/route");
const graphRoute = await import("@/app/api/digital-twin/graph/route");
const layoutRoute = await import("@/app/api/digital-twin/layout/route");
const tagsRoute = await import("@/app/api/digital-twin/tags/route");
const tagIdRoute = await import("@/app/api/digital-twin/tags/[id]/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "dtas-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A1 = `${P}a1`, A2 = `${P}a2-inactive`, B1 = `${P}b1`;
const AS_A1 = `${P}as-a1`, AS_A2 = `${P}as-a2`, AS_B1 = `${P}as-b1`;
const N = {
  a1: `${P}n-a1`, a1b: `${P}n-a1b`, a2: `${P}n-a2`, a2b: `${P}n-a2b`, b1: `${P}n-b1`, b1b: `${P}n-b1b`,
} as const;
const R = { a1: `${P}r-a1`, a2: `${P}r-a2`, cross: `${P}r-cross-a1-a2`, b1: `${P}r-b1` } as const;
const T = { a1: `${P}t-a1`, a2: `${P}t-a2`, b1: `${P}t-b1` } as const;
const L = { a1: `${P}l-a1`, a2: `${P}l-a2`, b1: `${P}l-b1` } as const;
/** Marker words that must never reach someone who may not see the record. */
const MARK = { a1: "DTAS-VISIBLE-A1", a2: "DTAS-HIDDEN-INACTIVE-A2", b1: "DTAS-FOREIGN-B1" } as const;

const U = {
  OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`,
  BOTH: `${P}u-viewer-a1-and-a2`,        // VIEWER, ACTIVE grants on the active A1 AND the inactive A2
  MGR_BOTH: `${P}u-manager-a1-and-a2`,   // MANAGER, same two grants
  INACTIVE_ONLY: `${P}u-viewer-a2-only`, // VIEWER, an ACTIVE grant on the inactive A2 only
  NONE: `${P}u-viewer-nogrant`,          // VIEWER, no UserSite at all
  XADMIN: `${P}u-xadmin`,                // ADMIN of organisation B
} as const;
const USERS = Object.values(U);

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
let db: Record<string, Model>;

const OWNED_DENIAL_ROWS = {
  action: "site.access.denied",
  entityType: "site",
  OR: [{ entityId: { startsWith: P } }, { userId: { in: USERS } }],
};
const purgeDenialAudit = () => db.auditLog.deleteMany({ where: OWNED_DENIAL_ROWS });

async function purgeAll() {
  const w = { organizationId: { in: ORGS } };
  await db.auditLog.deleteMany({ where: w });
  await purgeDenialAudit();
  await db.digitalTwinRelation.deleteMany({ where: w });
  await db.digitalTwinNode.deleteMany({ where: w });
  await db.digitalTwinLayout.deleteMany({ where: w });
  await db.assetTag.deleteMany({ where: w });
  await db.userSite.deleteMany({ where: w });
  await db.organizationMember.deleteMany({ where: w });
  await db.industrialAsset.deleteMany({ where: w });
  await db.industrialSite.deleteMany({ where: w });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  await new Promise((resolve) => setTimeout(resolve, 250));   // a denial audit is written fire-and-forget
  await purgeDenialAudit();
}
async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {
    auditByOrg: await db.auditLog.count({ where: w }),
    auditDenials: await db.auditLog.count({ where: OWNED_DENIAL_ROWS }),
    relations: await db.digitalTwinRelation.count({ where: w }),
    nodes: await db.digitalTwinNode.count({ where: w }),
    layouts: await db.digitalTwinLayout.count({ where: w }),
    tags: await db.assetTag.count({ where: w }),
    userSites: await db.userSite.count({ where: w }),
    members: await db.organizationMember.count({ where: w }),
    assets: await db.industrialAsset.count({ where: w }),
    sites: await db.industrialSite.count({ where: w }),
    orgs: await db.organization.count({ where: { id: { in: ORGS } } }),
    users: await db.user.count({ where: { id: { in: USERS } } }),
  };
  const bad = Object.entries(left).filter(([, n]) => n !== 0);
  if (bad.length > 0) throw new Error(`IR-01 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purgeAll();

  const now = () => new Date();
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status: string) =>
    db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  await site(A1, ORG_A, "ACTIVE"); await site(A2, ORG_A, "INACTIVE"); await site(B1, ORG_B, "ACTIVE");
  const asset = (id: string, org: string, siteId: string) =>
    db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: id, updatedAt: now() } });
  await asset(AS_A1, ORG_A, A1); await asset(AS_A2, ORG_A, A2); await asset(AS_B1, ORG_B, B1);

  const member = (userId: string, organizationId: string, role: string) =>
    db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN");
  await member(U.BOTH, ORG_A, "VIEWER"); await member(U.MGR_BOTH, ORG_A, "MANAGER");
  await member(U.INACTIVE_ONLY, ORG_A, "VIEWER"); await member(U.NONE, ORG_A, "VIEWER");
  await member(U.XADMIN, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string, role: string) =>
    db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role, status: "ACTIVE" } });
  await grant(U.BOTH, A1, "SITE_VIEWER"); await grant(U.BOTH, A2, "SITE_VIEWER");
  await grant(U.MGR_BOTH, A1, "SITE_MANAGER"); await grant(U.MGR_BOTH, A2, "SITE_MANAGER");
  await grant(U.INACTIVE_ONLY, A2, "SITE_VIEWER");

  const node = (id: string, org: string, siteId: string, name: string, assetId: string | null = null) =>
    db.digitalTwinNode.create({ data: { id, organizationId: org, siteId, assetId, displayName: name, nodeType: assetId ? "ASSET" : "AREA" } });
  await node(N.a1, ORG_A, A1, `${MARK.a1}-n1`, AS_A1); await node(N.a1b, ORG_A, A1, `${MARK.a1}-n2`);
  await node(N.a2, ORG_A, A2, `${MARK.a2}-n1`, AS_A2); await node(N.a2b, ORG_A, A2, `${MARK.a2}-n2`);
  await node(N.b1, ORG_B, B1, `${MARK.b1}-n1`, AS_B1); await node(N.b1b, ORG_B, B1, `${MARK.b1}-n2`);
  const rel = (id: string, org: string, s: string, t: string) =>
    db.digitalTwinRelation.create({ data: { id, organizationId: org, sourceNodeId: s, targetNodeId: t, relationType: "FEEDS" } });
  await rel(R.a1, ORG_A, N.a1, N.a1b);
  await rel(R.a2, ORG_A, N.a2, N.a2b);
  await rel(R.cross, ORG_A, N.a1, N.a2);     // a legacy edge that crosses from the active into the inactive site
  await rel(R.b1, ORG_B, N.b1, N.b1b);
  const tag = (id: string, org: string, assetId: string, name: string) =>
    db.assetTag.create({ data: { id, organizationId: org, assetId, tagName: name, tagPath: `/dtas/${id}` } });
  await tag(T.a1, ORG_A, AS_A1, `${MARK.a1}-tag`); await tag(T.a2, ORG_A, AS_A2, `${MARK.a2}-tag`); await tag(T.b1, ORG_B, AS_B1, `${MARK.b1}-tag`);
  const layout = (id: string, org: string, siteId: string, name: string) =>
    db.digitalTwinLayout.create({ data: { id, organizationId: org, siteId, name, layoutData: {} } });
  await layout(L.a1, ORG_A, A1, `${MARK.a1}-layout`); await layout(L.a2, ORG_A, A2, `${MARK.a2}-layout`); await layout(L.b1, ORG_B, B1, `${MARK.b1}-layout`);
}, 600000);

afterAll(async () => {
  if (!db) return;
  await purgeAll();
  await assertNoResidue();
}, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
const request = (user: string, org: string, method: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method, headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org } });
async function get(handler: unknown, user: string, path: string, id?: string, org = ORG_A) {
  const res = await (handler as Handler)(request(user, org, "GET", path), id ? { params: Promise.resolve({ id }) } : undefined);
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
const idsOf = (r: { json: Row }, key: string) => ((r.json[key] as Row[] | undefined) ?? []).map((x) => String(x.id)).sort();
const sorted = (a: readonly string[]) => [...a].sort();
const markersIn = (text: string, which: readonly (keyof typeof MARK)[]) => which.filter((k) => text.includes(MARK[k]));

const nodes = (u: string, q = "", org = ORG_A) => get(nodesRoute.GET, u, `/api/digital-twin/nodes${q}`, undefined, org);
const relations = (u: string, q = "") => get(relationsRoute.GET, u, `/api/digital-twin/relations${q}`);
const tags = (u: string, assetId: string) => get(tagsRoute.GET, u, `/api/digital-twin/tags?assetId=${assetId}`);
const layouts = (u: string, q = "") => get(layoutRoute.GET, u, `/api/digital-twin/layout${q}`);
const graph = (u: string, siteId: string) => get(graphRoute.GET, u, `/api/digital-twin/graph?siteId=${siteId}`);
const nodeDetail = (u: string, id: string) => get(nodeIdRoute.GET, u, `/api/digital-twin/nodes/${id}`, id);
const relationDetail = (u: string, id: string) => get(relationIdRoute.GET, u, `/api/digital-twin/relations/${id}`, id);
const tagDetail = (u: string, id: string) => get(tagIdRoute.GET, u, `/api/digital-twin/tags/${id}`, id);

const NOPE = `${P}does-not-exist`;
const HIDDEN_FROM_ACTIVE_ONLY = ["a2", "b1"] as const;

// ── a member granted BOTH an active and an inactive site ────────────────────
describe("a site-limited member with an ACTIVE grant on an ACTIVE site and on an INACTIVE site", () => {
  it("nodes: sees the active site's nodes; the inactive site's and the foreign organisation's never appear", async () => {
    const r = await nodes(U.BOTH);
    expect(r.status).toBe(200);
    expect(idsOf(r, "nodes")).toEqual(sorted([N.a1, N.a1b]));
    expect(Object.keys(r.json).sort()).toEqual(["nodes", "truncated"]);          // no total / count field exists to leak
    expect(r.json.truncated).toBe(false);
    expect(markersIn(r.text, HIDDEN_FROM_ACTIVE_ONLY)).toEqual([]);
  });

  it("an explicit ?siteId of the inactive site cannot widen access; the active site still narrows normally", async () => {
    const inactive = await nodes(U.BOTH, `?siteId=${A2}`);
    expect(inactive.status).toBe(200);
    expect(inactive.json.nodes).toEqual([]);
    expect(markersIn(inactive.text, HIDDEN_FROM_ACTIVE_ONLY)).toEqual([]);
    expect(idsOf(await nodes(U.BOTH, `?siteId=${A1}`), "nodes")).toEqual(sorted([N.a1, N.a1b]));
    expect((await nodes(U.BOTH, `?siteId=${B1}`)).json.nodes).toEqual([]);          // a foreign site id is also just narrowing to nothing
  });

  it("relations: only edges whose BOTH endpoints are in the active site; the legacy edge into the inactive site is gone", async () => {
    const r = await relations(U.BOTH);
    expect(r.status).toBe(200);
    expect(idsOf(r, "relations")).toEqual([R.a1]);
    expect(r.text).not.toContain(R.cross);
    expect(r.text).not.toContain(N.a2);                                              // no dangling endpoint of the inactive site
    expect(idsOf(await relations(U.BOTH, `?sourceNodeId=${N.a1}`), "relations")).toEqual([R.a1]);
    expect((await relations(U.BOTH, `?targetNodeId=${N.a2}`)).json.relations).toEqual([]);
  });

  it("tags: the active site's asset lists its tags; the inactive site's and the foreign asset's list nothing", async () => {
    expect(idsOf(await tags(U.BOTH, AS_A1), "tags")).toEqual([T.a1]);
    for (const a of [AS_A2, AS_B1, NOPE]) {
      const r = await tags(U.BOTH, a);
      expect(r.status, a).toBe(200);
      expect(r.json.tags, a).toEqual([]);
      expect(markersIn(r.text, HIDDEN_FROM_ACTIVE_ONLY), a).toEqual([]);
    }
  });

  it("layout: only the active site's layout; ?siteId of the inactive site returns nothing", async () => {
    expect(idsOf(await layouts(U.BOTH), "layouts")).toEqual([L.a1]);
    const inactive = await layouts(U.BOTH, `?siteId=${A2}`);
    expect(inactive.status).toBe(200);
    expect(inactive.json.layouts).toEqual([]);
    expect(markersIn(inactive.text, HIDDEN_FROM_ACTIVE_ONLY)).toEqual([]);
  });

  it("graph: the active site is served with its own nodes and edges only; the inactive site answers like a site that does not exist", async () => {
    const ok = await graph(U.BOTH, A1);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.json.nodes as Row).sort()).toEqual(sorted([N.a1, N.a1b]));
    expect(((ok.json.relations as Row[]) ?? []).map((x) => String(x.id))).toEqual([R.a1]);
    expect(markersIn(ok.text, HIDDEN_FROM_ACTIVE_ONLY)).toEqual([]);
    const hidden = await graph(U.BOTH, A2);
    const missing = await graph(U.BOTH, NOPE);
    expect(hidden.status).toBe(404);
    expect({ status: hidden.status, body: hidden.json }).toEqual({ status: missing.status, body: missing.json });
  });

  it("node detail: the active node lists only edges inside the active site (no id of the inactive endpoint)", async () => {
    const r = await nodeDetail(U.BOTH, N.a1);
    expect(r.status).toBe(200);
    const rel = r.json.relations as { outbound: Row[]; inbound: Row[] };
    expect(rel.outbound.map((x) => String(x.id))).toEqual([R.a1]);
    expect(rel.inbound).toEqual([]);
    expect(r.text).not.toContain(R.cross);
    expect(r.text).not.toContain(N.a2);
  });

  it("LIST and DETAIL agree: every record of the inactive site is hidden by id exactly like a missing one", async () => {
    const same = async (hiddenId: string, probe: (u: string, id: string) => Promise<{ status: number; text: string }>) => {
      const hidden = await probe(U.BOTH, hiddenId);
      const missing = await probe(U.BOTH, NOPE);
      expect(hidden.status, hiddenId).toBe(404);
      expect(hidden.text, hiddenId).toBe(missing.text);
    };
    for (const id of [N.a2, N.a2b, N.b1]) await same(id, nodeDetail);
    for (const id of [R.a2, R.cross, R.b1]) await same(id, relationDetail);   // a relation with ONE endpoint in the inactive site is hidden too
    for (const id of [T.a2, T.b1]) await same(id, tagDetail);
  });

  it("the member's reach on the ACTIVE site is untouched (detail reads still work)", async () => {
    expect((await nodeDetail(U.BOTH, N.a1)).status).toBe(200);
    expect((await relationDetail(U.BOTH, R.a1)).status).toBe(200);
    expect((await tagDetail(U.BOTH, T.a1)).status).toBe(200);
  });

  it("a MANAGER holding the same two grants gets the same collections (the scope does not depend on the role)", async () => {
    expect(idsOf(await nodes(U.MGR_BOTH), "nodes")).toEqual(sorted([N.a1, N.a1b]));
    expect(idsOf(await relations(U.MGR_BOTH), "relations")).toEqual([R.a1]);
    expect(idsOf(await layouts(U.MGR_BOTH), "layouts")).toEqual([L.a1]);
    expect(idsOf(await tags(U.MGR_BOTH, AS_A1), "tags")).toEqual([T.a1]);
  });
});

// ── a member whose ONLY grant is the inactive site, and a member with no grant ──
describe.each([
  ["only an ACTIVE grant on the INACTIVE site", U.INACTIVE_ONLY],
  ["no site grant at all", U.NONE],
] as const)("a site-limited member with %s", (_name, user) => {
  it("receives the authorised-empty answer from EVERY collection route", async () => {
    const n = await nodes(user);
    expect(n.status).toBe(200);
    expect(n.json).toEqual({ nodes: [], truncated: false });
    expect((await relations(user)).json).toEqual({ relations: [], truncated: false });
    expect((await layouts(user)).json).toEqual({ layouts: [], truncated: false });
    for (const a of [AS_A1, AS_A2, AS_B1]) expect((await tags(user, a)).json, a).toEqual({ tags: [], truncated: false });
    expect((await nodes(user, `?siteId=${A2}`)).json.nodes).toEqual([]);
    expect((await layouts(user, `?siteId=${A2}`)).json.layouts).toEqual([]);
  });

  it("cannot reach any site through the graph or the detail routes", async () => {
    for (const s of [A1, A2, B1]) expect((await graph(user, s)).status, s).toBe(404);
    for (const id of [N.a1, N.a2, N.b1]) expect((await nodeDetail(user, id)).status, id).toBe(404);
    for (const id of [R.a1, R.a2, R.cross]) expect((await relationDetail(user, id)).status, id).toBe(404);
    for (const id of [T.a1, T.a2]) expect((await tagDetail(user, id)).status, id).toBe(404);
  });
});

// ── OWNER / ADMIN: the canonical policy is "all ACTIVE sites of THEIR organisation" ──
describe.each([["OWNER", U.OWNER], ["ADMIN", U.ADMIN]] as const)("%s of organisation A", (_name, user) => {
  it("sees every ACTIVE site's data and none of the inactive site's or of the foreign organisation's", async () => {
    expect(idsOf(await nodes(user), "nodes")).toEqual(sorted([N.a1, N.a1b]));
    expect(idsOf(await relations(user), "relations")).toEqual([R.a1]);
    expect(idsOf(await layouts(user), "layouts")).toEqual([L.a1]);
    expect(idsOf(await tags(user, AS_A1), "tags")).toEqual([T.a1]);
    expect((await tags(user, AS_A2)).json.tags).toEqual([]);
    expect((await graph(user, A1)).status).toBe(200);
    expect((await graph(user, A2)).status).toBe(404);
    expect((await nodeDetail(user, N.a2)).status).toBe(404);
    const all = await nodes(user);
    expect(markersIn(all.text, HIDDEN_FROM_ACTIVE_ONLY)).toEqual([]);
  });
});

// ── organisation isolation ──────────────────────────────────────────────────
describe("organisation isolation is unchanged", () => {
  it("the admin of organisation B sees exactly B's records and no organisation-A marker", async () => {
    const n = await nodes(U.XADMIN, "", ORG_B);
    expect(idsOf(n, "nodes")).toEqual(sorted([N.b1, N.b1b]));
    expect(markersIn(n.text, ["a1", "a2"])).toEqual([]);
    expect((await get(relationsRoute.GET, U.XADMIN, "/api/digital-twin/relations", undefined, ORG_B)).json.relations).toHaveLength(1);
    expect((await get(layoutRoute.GET, U.XADMIN, "/api/digital-twin/layout", undefined, ORG_B)).json.layouts).toHaveLength(1);
  });

  it("an organisation-A admin acting in organisation B is refused", async () => {
    expect((await nodes(U.ADMIN, "", ORG_B)).status).toBe(403);
  });
});

// ── the mechanism is the SITE STATUS, nothing else ──────────────────────────
describe("the effect is driven by IndustrialSite.status", () => {
  it("re-activating the site makes its data visible to the same member; deactivating hides it again", async () => {
    try {
      await db.industrialSite.updateMany({ where: { id: A2 }, data: { status: "ACTIVE" } });
      expect(idsOf(await nodes(U.BOTH), "nodes")).toEqual(sorted([N.a1, N.a1b, N.a2, N.a2b]));
      expect(idsOf(await layouts(U.BOTH), "layouts")).toEqual(sorted([L.a1, L.a2]));
      expect(idsOf(await relations(U.BOTH), "relations")).toEqual(sorted([R.a1, R.a2, R.cross]));
      expect((await nodeDetail(U.BOTH, N.a2)).status).toBe(200);
      expect(idsOf(await nodes(U.INACTIVE_ONLY), "nodes")).toEqual(sorted([N.a2, N.a2b]));
    } finally {
      await db.industrialSite.updateMany({ where: { id: A2 }, data: { status: "INACTIVE" } });
    }
    expect(idsOf(await nodes(U.BOTH), "nodes")).toEqual(sorted([N.a1, N.a1b]));
    expect((await nodeDetail(U.BOTH, N.a2)).status).toBe(404);
    expect((await nodes(U.INACTIVE_ONLY)).json.nodes).toEqual([]);
  });
});
