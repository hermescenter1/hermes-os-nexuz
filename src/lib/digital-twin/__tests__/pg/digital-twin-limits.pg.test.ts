/**
 * Digital Twin — result-set ceilings and the `truncated` contract, against REAL
 * PostgreSQL through the REAL routes.
 *
 * The ceilings are production values (TWIN_LIMITS); nothing is lowered or
 * special-cased to make the tests cheap, so each test seeds past the real limit.
 * Every capped response is probed just under, exactly at, and one row over its
 * ceiling:
 *
 *   under / at the limit → every row returned, `truncated: false`
 *   one over the limit   → exactly `limit` rows, the FIRST `limit` in the
 *                          documented total order, `truncated: true`
 *
 * and rows the caller may not see must never count toward a ceiling (otherwise a
 * foreign site could turn `truncated` on, and a count would leak across sites).
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule; runs under
 * vitest.phase91-postgres.config.ts against a DISPOSABLE database. Rows use the
 * `dtl-` prefix and are removed afterwards.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { TWIN_LIMITS } from "../../schemas";

// Seeding past real ceilings is slow on a loaded machine; the budget is set for
// THIS FILE only and relaxes no assertion.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: async (t: string) => (t.startsWith("t:") ? { sub: t.slice(2) } : null),
}));
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
const graphRoute = await import("@/app/api/digital-twin/graph/route");
const layoutRoute = await import("@/app/api/digital-twin/layout/route");
const tagsRoute = await import("@/app/api/digital-twin/tags/route");

const ORG = "dtl-org";
const S1 = "dtl-s1";
const S2 = "dtl-s2";
const ASSET1 = "dtl-asset-s1";
const ASSET2 = "dtl-asset-s2";
const U_OWNER = "dtl-owner";
const U_M1 = "dtl-mgr-s1"; // MANAGER with a UserSite on site 1 only
const USERS = [U_OWNER, U_M1];

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  createMany: (a: unknown) => Promise<{ count: number }>;
  deleteMany: (a: unknown) => Promise<unknown>;
}
let db: Record<string, Model>;
type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;

const BASE = Date.UTC(2026, 0, 1);
const pad = (n: number, w = 6) => String(n).padStart(w, "0");

async function chunked(model: string, rows: Row[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) await db[model].createMany({ data: rows.slice(i, i + size) });
}

// ids encode the creation order, so "the first N in (createdAt, id) order" is simply the first N seeded.
const nodeId = (site: string, i: number) => `dtl-${site === S1 ? "a" : "b"}-n${pad(i)}`;
async function seedNodes(site: string, count: number, offset = 0) {
  await chunked("digitalTwinNode", Array.from({ length: count }, (_, k) => {
    const i = offset + k;
    return {
      id: nodeId(site, i), organizationId: ORG, siteId: site, displayName: `n${i}`, nodeType: "AREA",
      createdAt: new Date(BASE + i * 1000), updatedAt: new Date(BASE + i * 1000),
    };
  }));
}

/** First `total` ordered pairs (i, i+d), d = 1..perNode, over nodes 0..nodeCount-1. All distinct. */
function pairs(nodeCount: number, perNode: number, total: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < nodeCount && out.length < total; i++) {
    for (let d = 1; d <= perNode && i + d < nodeCount && out.length < total; d++) out.push([i, i + d]);
  }
  if (out.length < total) throw new Error(`fixture cannot supply ${total} relations (got ${out.length})`);
  return out;
}
const relId = (site: string, k: number) => `dtl-${site === S1 ? "a" : "b"}-r${pad(k)}`;
async function seedRelations(site: string, list: Array<[number, number]>, offset = 0) {
  await chunked("digitalTwinRelation", list.map(([s, t], k) => ({
    id: relId(site, offset + k), organizationId: ORG, sourceNodeId: nodeId(site, s), targetNodeId: nodeId(site, t),
    relationType: "FEEDS", createdAt: new Date(BASE + (offset + k) * 1000),
  })));
}

async function purgeTwin() {
  for (const m of ["digitalTwinRelation", "digitalTwinNode", "digitalTwinLayout", "assetTag"]) {
    await db[m].deleteMany({ where: { organizationId: ORG } });
  }
}
/**
 * FR-04. `site.access.denied` rows carry no `organizationId` (the org is only in
 * `metadata`), so an org-scoped purge misses them. Ownership is proven by this
 * suite's own `dtl-` site ids / `dtl-` users; the entity clause still matches
 * after the users are gone (the FK nulls `userId`).
 */
const OWNED_DENIAL_ROWS = {
  action: "site.access.denied",
  entityType: "site",
  OR: [{ entityId: { startsWith: "dtl-" } }, { userId: { in: USERS } }],
};
async function purgeAll() {
  await purgeTwin();
  await db.auditLog.deleteMany({ where: { organizationId: ORG } });
  await db.auditLog.deleteMany({ where: OWNED_DENIAL_ROWS });
  await db.userSite.deleteMany({ where: { organizationId: ORG } });
  await db.organizationMember.deleteMany({ where: { organizationId: ORG } });
  await db.industrialAsset.deleteMany({ where: { organizationId: ORG } });
  await db.industrialSite.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  // a fire-and-forget denial audit can land late; sweep again now that the owners are gone
  await new Promise((resolve) => setTimeout(resolve, 250));
  await db.auditLog.deleteMany({ where: OWNED_DENIAL_ROWS });
}

/** FR-04: nothing this suite owns may remain; a leftover fails the run instead of being hidden. */
async function assertNoOwnedResidue() {
  const count = (m: string, where: unknown) => (db[m] as unknown as { count: (a: unknown) => Promise<number> }).count({ where });
  const residue = {
    audit: await count("auditLog", { organizationId: ORG }),
    denials: await count("auditLog", OWNED_DENIAL_ROWS),
    nodes: await count("digitalTwinNode", { organizationId: ORG }),
    relations: await count("digitalTwinRelation", { organizationId: ORG }),
    layouts: await count("digitalTwinLayout", { organizationId: ORG }),
    tags: await count("assetTag", { organizationId: ORG }),
    assets: await count("industrialAsset", { organizationId: ORG }),
    sites: await count("industrialSite", { organizationId: ORG }),
    userSites: await count("userSite", { organizationId: ORG }),
    members: await count("organizationMember", { organizationId: ORG }),
    orgs: await count("organization", { id: ORG }),
    users: await count("user", { id: { in: USERS } }),
  };
  const leftovers = Object.entries(residue).filter(([, n]) => n !== 0);
  if (leftovers.length > 0) throw new Error(`FR-04 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(leftovers))}`);
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Record<string, Model>;
  await purgeAll();
  for (const id of USERS) {
    await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date() } });
  }
  await db.organization.create({ data: { id: ORG, name: ORG, slug: ORG, updatedAt: new Date() } });
  for (const id of [S1, S2]) await db.industrialSite.create({ data: { id, organizationId: ORG, name: id, slug: id, status: "ACTIVE", updatedAt: new Date() } });
  await db.industrialAsset.create({ data: { id: ASSET1, organizationId: ORG, siteId: S1, name: ASSET1, updatedAt: new Date() } });
  await db.industrialAsset.create({ data: { id: ASSET2, organizationId: ORG, siteId: S2, name: ASSET2, updatedAt: new Date() } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: U_OWNER, role: "OWNER", status: "ACTIVE" } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: U_M1, role: "MANAGER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: U_M1, siteId: S1, organizationId: ORG, role: "SITE_MANAGER", status: "ACTIVE" } });
});
afterAll(async () => {
  if (!db) return;
  await purgeAll();            // idempotent
  await assertNoOwnedResidue();
});
beforeEach(async () => { await purgeTwin(); });

async function get(handler: Handler, user: string, path: string, id?: string) {
  const res = await handler(
    new NextRequest(new URL(path, "http://localhost"), { method: "GET", headers: { cookie: `hermes_at=t:${user}`, "x-test-org": ORG } }),
    id ? { params: Promise.resolve({ id }) } : undefined,
  );
  return { status: res.status, json: (await res.json()) as Row };
}
const L = TWIN_LIMITS;

// ── nodes ───────────────────────────────────────────────────────────────────
describe(`GET /nodes — ceiling ${L.LIST_NODES}`, () => {
  it.each([L.LIST_NODES - 1, L.LIST_NODES, L.LIST_NODES + 1])("%i nodes at one site (OWNER)", async (count) => {
    await seedNodes(S1, count);
    const r = await get(nodesRoute.GET as Handler, U_OWNER, "/api/digital-twin/nodes");
    const ids = (r.json.nodes as Row[]).map((n) => String(n.id));
    expect(r.status).toBe(200);
    expect(ids).toHaveLength(Math.min(count, L.LIST_NODES));
    expect(r.json.truncated).toBe(count > L.LIST_NODES);
    // the FIRST `limit` in (createdAt, id) order — deterministic, no duplicates
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => nodeId(S1, i)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rows at a site the caller cannot reach never count toward the ceiling", async () => {
    await seedNodes(S1, L.LIST_NODES);        // exactly the limit, reachable
    await seedNodes(S2, 600);                 // unreachable for U_M1
    const mine = await get(nodesRoute.GET as Handler, U_M1, "/api/digital-twin/nodes");
    expect((mine.json.nodes as Row[])).toHaveLength(L.LIST_NODES);
    expect(mine.json.truncated).toBe(false);  // would be true if S2 rows were counted
    expect((mine.json.nodes as Row[]).every((n) => n.siteId === S1)).toBe(true);

    const owner = await get(nodesRoute.GET as Handler, U_OWNER, "/api/digital-twin/nodes");
    expect((owner.json.nodes as Row[])).toHaveLength(L.LIST_NODES);
    expect(owner.json.truncated).toBe(true);  // 1600 reachable rows
  });

  it("one over the limit at the caller's own site is truncated, with foreign rows still excluded", async () => {
    await seedNodes(S1, L.LIST_NODES + 1);
    await seedNodes(S2, 5);
    const r = await get(nodesRoute.GET as Handler, U_M1, "/api/digital-twin/nodes");
    expect((r.json.nodes as Row[])).toHaveLength(L.LIST_NODES);
    expect(r.json.truncated).toBe(true);
    expect((r.json.nodes as Row[]).some((n) => n.siteId === S2)).toBe(false);
  });
});

// ── relations ───────────────────────────────────────────────────────────────
describe(`GET /relations — ceiling ${L.LIST_RELATIONS}`, () => {
  const NODES = 1010;
  it.each([L.LIST_RELATIONS - 1, L.LIST_RELATIONS, L.LIST_RELATIONS + 1])("%i relations at one site (OWNER)", async (count) => {
    await seedNodes(S1, NODES);
    await seedRelations(S1, pairs(NODES, 5, count));
    const r = await get(relationsRoute.GET as Handler, U_OWNER, "/api/digital-twin/relations");
    const ids = (r.json.relations as Row[]).map((x) => String(x.id));
    expect(ids).toHaveLength(Math.min(count, L.LIST_RELATIONS));
    expect(r.json.truncated).toBe(count > L.LIST_RELATIONS);
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, k) => relId(S1, k)));
  });

  it("relations at an unreachable site never count toward the ceiling", async () => {
    await seedNodes(S1, NODES);
    await seedNodes(S2, 60);
    await seedRelations(S1, pairs(NODES, 5, L.LIST_RELATIONS));          // exactly the limit, reachable
    await seedRelations(S2, pairs(60, 5, 200), L.LIST_RELATIONS);        // unreachable for U_M1
    const mine = await get(relationsRoute.GET as Handler, U_M1, "/api/digital-twin/relations");
    expect((mine.json.relations as Row[])).toHaveLength(L.LIST_RELATIONS);
    expect(mine.json.truncated).toBe(false);
    expect((mine.json.relations as Row[]).every((x) => String(x.id).startsWith("dtl-a-"))).toBe(true);
    const owner = await get(relationsRoute.GET as Handler, U_OWNER, "/api/digital-twin/relations");
    expect(owner.json.truncated).toBe(true);
  });
});

// ── graph ───────────────────────────────────────────────────────────────────
describe(`GET /graph — ceilings ${L.GRAPH_NODES} nodes / ${L.GRAPH_RELATIONS} relations`, () => {
  it.each([L.GRAPH_NODES - 1, L.GRAPH_NODES, L.GRAPH_NODES + 1])("%i nodes at the site", async (count) => {
    await seedNodes(S1, count);
    const r = await get(graphRoute.GET as Handler, U_OWNER, `/api/digital-twin/graph?siteId=${S1}`);
    const ids = Object.keys(r.json.nodes as Row);
    expect(r.status).toBe(200);
    expect(ids).toHaveLength(Math.min(count, L.GRAPH_NODES));
    expect(r.json.truncated).toBe(count > L.GRAPH_NODES);
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, i) => nodeId(S1, i)));
  });

  it.each([L.GRAPH_RELATIONS - 1, L.GRAPH_RELATIONS, L.GRAPH_RELATIONS + 1])("%i relations among %i nodes", async (count) => {
    const nodes = L.GRAPH_NODES - 1; // below the node ceiling, so only the relation ceiling can truncate
    await seedNodes(S1, nodes);
    await seedRelations(S1, pairs(nodes, 6, count));
    const r = await get(graphRoute.GET as Handler, U_OWNER, `/api/digital-twin/graph?siteId=${S1}`);
    const rels = r.json.relations as Row[];
    expect(rels).toHaveLength(Math.min(count, L.GRAPH_RELATIONS));
    expect(r.json.truncated).toBe(count > L.GRAPH_RELATIONS);
    expect(rels.map((x) => String(x.id))).toEqual(Array.from({ length: rels.length }, (_, k) => relId(S1, k)));
  });

  it("an unreachable site's graph is not built at all; rows elsewhere do not count", async () => {
    await seedNodes(S1, 10);
    await seedNodes(S2, L.GRAPH_NODES + 5);
    const own = await get(graphRoute.GET as Handler, U_M1, `/api/digital-twin/graph?siteId=${S1}`);
    expect(Object.keys(own.json.nodes as Row)).toHaveLength(10);
    expect(own.json.truncated).toBe(false);
    const other = await get(graphRoute.GET as Handler, U_M1, `/api/digital-twin/graph?siteId=${S2}`);
    expect(other.status).toBe(404);
    expect(JSON.stringify(other.json)).not.toMatch(/truncated|nodes/);
  });
});

// ── tags ────────────────────────────────────────────────────────────────────
describe(`GET /tags — ceiling ${L.LIST_TAGS}`, () => {
  const tag = (asset: string, org: string, i: number) => ({
    id: `dtl-tag-${asset}-${pad(i)}`, organizationId: org, assetId: asset, tagName: `t${i}`, tagPath: `t${pad(i)}`, updatedAt: new Date(),
  });
  it.each([L.LIST_TAGS - 1, L.LIST_TAGS, L.LIST_TAGS + 1])("%i tags on one asset", async (count) => {
    await chunked("assetTag", Array.from({ length: count }, (_, i) => tag(ASSET1, ORG, i)));
    const r = await get(tagsRoute.GET as Handler, U_OWNER, `/api/digital-twin/tags?assetId=${ASSET1}`);
    const paths = (r.json.tags as Row[]).map((t) => String(t.tagPath));
    expect(paths).toHaveLength(Math.min(count, L.LIST_TAGS));
    expect(r.json.truncated).toBe(count > L.LIST_TAGS);
    expect(paths).toEqual(Array.from({ length: paths.length }, (_, i) => `t${pad(i)}`)); // tagPath ascending
  });

  it("an asset at an unreachable site yields an empty, non-truncated list — its size is not observable", async () => {
    await chunked("assetTag", Array.from({ length: L.LIST_TAGS + 1 }, (_, i) => tag(ASSET2, ORG, i)));
    const r = await get(tagsRoute.GET as Handler, U_M1, `/api/digital-twin/tags?assetId=${ASSET2}`);
    expect(r.json).toEqual({ tags: [], truncated: false });
  });
});

// ── layouts ─────────────────────────────────────────────────────────────────
describe(`GET /layout — ceiling ${L.LIST_LAYOUTS}`, () => {
  // updatedAt DESCENDING with the index, so the expected order is simply 0..N-1.
  const layout = (site: string, i: number, total: number) => ({
    id: `dtl-l-${site === S1 ? "a" : "b"}-${pad(i)}`, organizationId: ORG, siteId: site, name: `L${i}`,
    createdAt: new Date(BASE), updatedAt: new Date(BASE + (total - i) * 1000),
  });
  it.each([L.LIST_LAYOUTS - 1, L.LIST_LAYOUTS, L.LIST_LAYOUTS + 1])("%i layouts at one site", async (count) => {
    await chunked("digitalTwinLayout", Array.from({ length: count }, (_, i) => layout(S1, i, count)));
    const r = await get(layoutRoute.GET as Handler, U_OWNER, "/api/digital-twin/layout");
    const names = (r.json.layouts as Row[]).map((l) => String(l.name));
    expect(names).toHaveLength(Math.min(count, L.LIST_LAYOUTS));
    expect(r.json.truncated).toBe(count > L.LIST_LAYOUTS);
    expect(names).toEqual(Array.from({ length: names.length }, (_, i) => `L${i}`));
  });

  it("layouts at an unreachable site never count toward the ceiling", async () => {
    await chunked("digitalTwinLayout", Array.from({ length: L.LIST_LAYOUTS }, (_, i) => layout(S1, i, L.LIST_LAYOUTS)));
    await chunked("digitalTwinLayout", Array.from({ length: 50 }, (_, i) => layout(S2, i, 50)));
    const mine = await get(layoutRoute.GET as Handler, U_M1, "/api/digital-twin/layout");
    expect((mine.json.layouts as Row[])).toHaveLength(L.LIST_LAYOUTS);
    expect(mine.json.truncated).toBe(false);
    expect((mine.json.layouts as Row[]).every((l) => l.siteId === S1)).toBe(true);
  });
});

// ── node detail: relations per direction ────────────────────────────────────
describe(`GET /nodes/[id] — relations ceiling ${L.LIST_RELATIONS} per direction`, () => {
  const CENTER = 0;
  const star = (n: number) => Array.from({ length: n }, (_, k): [number, number] => [CENTER, k + 1]);       // outbound
  const inStar = (n: number) => Array.from({ length: n }, (_, k): [number, number] => [k + 1, CENTER]);     // inbound
  const detail = (user: string) => get(nodeIdRoute.GET as Handler, user, `/api/digital-twin/nodes/${nodeId(S1, CENTER)}`, nodeId(S1, CENTER));

  it.each([L.LIST_RELATIONS, L.LIST_RELATIONS + 1])("%i OUTBOUND relations", async (count) => {
    await seedNodes(S1, count + 1);
    await seedRelations(S1, star(count));
    const r = await detail(U_OWNER);
    const rel = r.json.relations as { outbound: Row[]; inbound: Row[]; truncated: boolean };
    expect(rel.outbound).toHaveLength(Math.min(count, L.LIST_RELATIONS));
    expect(rel.inbound).toHaveLength(0);
    expect(rel.truncated).toBe(count > L.LIST_RELATIONS);
    expect(rel.outbound.map((x) => String(x.id))).toEqual(Array.from({ length: rel.outbound.length }, (_, k) => relId(S1, k)));
  });

  it("one INBOUND relation over the ceiling truncates the response too", async () => {
    await seedNodes(S1, L.LIST_RELATIONS + 2);
    await seedRelations(S1, inStar(L.LIST_RELATIONS + 1));
    const rel = (await detail(U_OWNER)).json.relations as { outbound: Row[]; inbound: Row[]; truncated: boolean };
    expect(rel.inbound).toHaveLength(L.LIST_RELATIONS);
    expect(rel.truncated).toBe(true);
  });

  it("relations to an unreachable site are not counted and do not truncate", async () => {
    await seedNodes(S1, L.LIST_RELATIONS + 1);
    await seedNodes(S2, 10);
    await seedRelations(S1, star(L.LIST_RELATIONS));                      // exactly the limit, reachable
    // legacy edges from the centre to site-2 nodes (the API refuses to create these today)
    await chunked("digitalTwinRelation", Array.from({ length: 10 }, (_, k) => ({
      id: `dtl-x-r${pad(k)}`, organizationId: ORG, sourceNodeId: nodeId(S1, CENTER), targetNodeId: nodeId(S2, k),
      relationType: "CONNECTED_TO", createdAt: new Date(BASE + (L.LIST_RELATIONS + k) * 1000),
    })));
    const mine = (await detail(U_M1)).json.relations as { outbound: Row[]; truncated: boolean };
    expect(mine.outbound).toHaveLength(L.LIST_RELATIONS);
    expect(mine.truncated).toBe(false);
    expect(mine.outbound.every((x) => !String(x.id).startsWith("dtl-x-"))).toBe(true);
    const owner = (await detail(U_OWNER)).json.relations as { outbound: Row[]; truncated: boolean };
    expect(owner.truncated).toBe(true); // 5010 reachable for the OWNER
  });
});
