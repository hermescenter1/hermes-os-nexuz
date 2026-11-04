/**
 * DT-01 — closure of the independent review findings F1, F2 and F3, against REAL PostgreSQL.
 *
 * DT-01: `POST /nodes`, `PATCH /nodes/[id]`, `POST /layout` and `POST /tags` once persisted a
 * client-supplied siteId / assetId / parentNodeId without checking who owns it. The hardening series
 * closed that; the independent review then found:
 *
 *   F1  the site decision was taken by the route BEFORE the write transaction and re-checked inside it
 *       only for the organisation (no ACTIVE, no lock) — a site deactivated or an asset moved in between
 *       let the write land;
 *   F2  `rowToNode` returned `assetId` / `parentNodeId` raw, so a legacy row pointing at another site's
 *       node or asset handed its id to a viewer who cannot see that site;
 *   F3  missing positive/negative cases for the three write paths.
 *
 * REAL: routes, requireOrgActor, requirePermission, requireSiteActor, the services, the transactions,
 * the row locks, PostgreSQL locking. MOCKED: the token layer, `requirePlatformAuth` (org from
 * `x-test-org`) and metering. Fixtures use the `dt01-` prefix; only they are removed, and any leftover
 * fails the run.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

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
const graphRoute = await import("@/app/api/digital-twin/graph/route");
const layoutRoute = await import("@/app/api/digital-twin/layout/route");
const tagsRoute = await import("@/app/api/digital-twin/tags/route");
const { createNode, updateNode } = await import("@/lib/digital-twin/nodes");
const { createRelation } = await import("@/lib/digital-twin/relations");
const { createTag } = await import("@/lib/digital-twin/tags");
const { createLayout } = await import("@/lib/digital-twin/layout");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "dt01-";
const ORG_A = `${P}org-a`;
const ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A_S1 = `${P}a-s1`;           // ACTIVE, reachable by the site-limited users
const A_S2 = `${P}a-s2`;           // ACTIVE, same org, NOT reachable by the site-limited users
const A_S3 = `${P}a-s3-inactive`;  // INACTIVE, same org
const B_S1 = `${P}b-s1`;
const A_S1_PUMP = `${P}a-s1-pump`;
const A_S1_FAN = `${P}a-s1-fan`;
const A_S2_VALVE = `${P}a-s2-valve`;
const A_S3_MOTOR = `${P}a-s3-motor`;
const B_S1_PUMP = `${P}b-s1-pump`;
/** An org-B asset whose siteId names org A's site: a legal DB state (IndustrialAsset.siteId is a plain FK). */
const B_ON_A_S1 = `${P}b-asset-on-a-s1`;

const U_OWNER = `${P}u-owner`;
const U_MGR1 = `${P}u-mgr-s1`;   // org MANAGER + SITE_MANAGER on A_S1 only
const U_VIEW1 = `${P}u-view-s1`; // org VIEWER + SITE_VIEWER on A_S1 only
const USERS = [U_OWNER, U_MGR1, U_VIEW1];
const NOPE = `${P}does-not-exist`;

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
let db: Record<string, Model>;
let monitor: pg.Client;

const OWNED_AUDIT = { OR: [{ organizationId: { in: ORGS } }, { userId: { in: USERS } }, { entityId: { startsWith: P } }] };

async function purgeTwin() {
  await db.auditLog.deleteMany({ where: OWNED_AUDIT });
  await db.digitalTwinRelation.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.digitalTwinNode.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.digitalTwinLayout.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.assetTag.deleteMany({ where: { organizationId: { in: ORGS } } });
}
async function purgeAll() {
  await purgeTwin();
  await db.userSite.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.organizationMember.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAsset.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialSite.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
  // Denial audits are written fire-and-forget and may land after the request returned.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await db.auditLog.deleteMany({ where: OWNED_AUDIT });
}
async function residue(): Promise<Record<string, number>> {
  const left: Record<string, number> = {
    audit: await db.auditLog.count({ where: OWNED_AUDIT }),
    nodes: await db.digitalTwinNode.count({ where: { organizationId: { in: ORGS } } }),
    relations: await db.digitalTwinRelation.count({ where: { organizationId: { in: ORGS } } }),
    layouts: await db.digitalTwinLayout.count({ where: { organizationId: { in: ORGS } } }),
    tags: await db.assetTag.count({ where: { organizationId: { in: ORGS } } }),
    assets: await db.industrialAsset.count({ where: { organizationId: { in: ORGS } } }),
    sites: await db.industrialSite.count({ where: { organizationId: { in: ORGS } } }),
    userSites: await db.userSite.count({ where: { organizationId: { in: ORGS } } }),
    members: await db.organizationMember.count({ where: { organizationId: { in: ORGS } } }),
    orgs: await db.organization.count({ where: { id: { in: ORGS } } }),
    users: await db.user.count({ where: { id: { in: USERS } } }),
  };
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  for (const id of USERS) {
    await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  }
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  for (const [id, org, status] of [[A_S1, ORG_A, "ACTIVE"], [A_S2, ORG_A, "ACTIVE"], [A_S3, ORG_A, "INACTIVE"], [B_S1, ORG_B, "ACTIVE"]] as const) {
    await db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  }
  for (const [id, org, site] of [
    [A_S1_PUMP, ORG_A, A_S1], [A_S1_FAN, ORG_A, A_S1], [A_S2_VALVE, ORG_A, A_S2], [A_S3_MOTOR, ORG_A, A_S3],
    [B_S1_PUMP, ORG_B, B_S1], [B_ON_A_S1, ORG_B, A_S1],
  ] as const) {
    await db.industrialAsset.create({ data: { id, organizationId: org, siteId: site, name: id, updatedAt: now() } });
  }
  for (const [user, role] of [[U_OWNER, "OWNER"], [U_MGR1, "MANAGER"], [U_VIEW1, "VIEWER"]] as const) {
    await db.organizationMember.create({ data: { organizationId: ORG_A, userId: user, role, status: "ACTIVE" } });
  }
  await db.userSite.create({ data: { userId: U_MGR1, siteId: A_S1, organizationId: ORG_A, role: "SITE_MANAGER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: U_VIEW1, siteId: A_S1, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  monitor = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: `${P}monitor` });
  await monitor.connect();
  await purgeAll();
  await seed();
}, 600000);

afterAll(async () => {
  try {
    if (db) {
      await purgeAll();
      const left = await residue();
      if (Object.keys(left).length > 0) throw new Error(`dt01 fixture cleanup incomplete: ${JSON.stringify(left)}`);
    }
  } finally {
    if (monitor) await monitor.end();
  }
}, 600000);

beforeEach(async () => {
  await purgeTwin();
  // A race test may have changed these; every test starts from the seeded state.
  await monitor.query(`UPDATE "IndustrialSite" SET "status" = 'ACTIVE' WHERE "id" = ANY($1::text[])`, [[A_S1, A_S2, B_S1]]);
  await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = ANY($2::text[])`, [A_S1, [A_S1_PUMP, A_S1_FAN, B_ON_A_S1]]);
});

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;

async function call(handler: Handler, user: string, method: string, path: string, body?: unknown, id?: string) {
  const req = new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": ORG_A },
  });
  const res = await handler(req, id ? { params: Promise.resolve({ id }) } : undefined);
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON body */ }
  return { status: res.status, json, text };
}
const nodePost = (user: string, body: unknown) => call(nodesRoute.POST as Handler, user, "POST", "/api/digital-twin/nodes", body);
const nodePatch = (user: string, id: string, body: unknown) => call(nodeIdRoute.PATCH as Handler, user, "PATCH", `/api/digital-twin/nodes/${id}`, body, id);
const nodeGet = (user: string, id: string) => call(nodeIdRoute.GET as Handler, user, "GET", `/api/digital-twin/nodes/${id}`, undefined, id);
const nodeList = (user: string, siteId?: string) =>
  call(nodesRoute.GET as Handler, user, "GET", `/api/digital-twin/nodes${siteId ? `?siteId=${siteId}` : ""}`);
const graphGet = (user: string, siteId: string) => call(graphRoute.GET as Handler, user, "GET", `/api/digital-twin/graph?siteId=${siteId}`);
const layoutPost = (user: string, body: unknown) => call(layoutRoute.POST as Handler, user, "POST", "/api/digital-twin/layout", body);
const tagPost = (user: string, body: unknown) => call(tagsRoute.POST as Handler, user, "POST", "/api/digital-twin/tags", body);

async function seedNode(siteId: string, displayName: string, extra: Row = {}, orgId = ORG_A): Promise<string> {
  const r = await db.digitalTwinNode.create({ data: { organizationId: orgId, siteId, displayName, nodeType: "AREA", ...extra } });
  return String(r.id);
}
const counts = async () => ({
  nodes: await db.digitalTwinNode.count({ where: { organizationId: { in: ORGS } } }),
  layouts: await db.digitalTwinLayout.count({ where: { organizationId: { in: ORGS } } }),
  tags: await db.assetTag.count({ where: { organizationId: { in: ORGS } } }),
  relations: await db.digitalTwinRelation.count({ where: { organizationId: { in: ORGS } } }),
});
const NOTHING = { nodes: 0, layouts: 0, tags: 0, relations: 0 };

/** Two refusals are indistinguishable: same status AND byte-identical body. */
function expectSameRefusal(a: { status: number; text: string }, b: { status: number; text: string }) {
  expect(a.status).toBe(404);
  expect(b.status).toBe(a.status);
  expect(b.text).toBe(a.text);
}

// ── F1 — the decision is re-taken inside the write, on locked rows ──────────
describe("DT-01 F1 — every twin write re-checks its site as ACTIVE inside the transaction", () => {
  it("SERVICE createNode on an INACTIVE same-org site is refused as SITE_NOT_FOUND; nothing written", async () => {
    await expect(createNode({ organizationId: ORG_A, siteId: A_S3, displayName: "x", nodeType: "AREA" }))
      .rejects.toMatchObject({ code: "SITE_NOT_FOUND", status: 404 });
    expect(await counts()).toEqual(NOTHING);
  });

  it("SERVICE createLayout on an INACTIVE site is refused as SITE_NOT_FOUND; nothing written", async () => {
    await expect(createLayout({ organizationId: ORG_A, siteId: A_S3, name: "l" }))
      .rejects.toMatchObject({ code: "SITE_NOT_FOUND", status: 404 });
    expect(await counts()).toEqual(NOTHING);
  });

  it("SERVICE createTag on an asset of an INACTIVE site is refused as ASSET_NOT_FOUND; nothing written", async () => {
    await expect(createTag({ organizationId: ORG_A, assetId: A_S3_MOTOR, siteId: A_S3, tagName: "t", tagPath: "a.b" }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND", status: 404 });
    expect(await counts()).toEqual(NOTHING);
  });

  it("SERVICE createTag refuses when the asset no longer stands on the AUTHORISED site (moved since)", async () => {
    // The route authorised A_S1 for this asset; it now stands on A_S2.
    await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [A_S2, A_S1_PUMP]);
    await expect(createTag({ organizationId: ORG_A, assetId: A_S1_PUMP, siteId: A_S1, tagName: "t", tagPath: "a.b" }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("SERVICE createTag accepts the asset at its authorised, ACTIVE site", async () => {
    const tag = await createTag({ organizationId: ORG_A, assetId: A_S1_PUMP, siteId: A_S1, tagName: "t", tagPath: "a.b" });
    expect(tag?.assetId).toBe(A_S1_PUMP);
    expect((await counts()).tags).toBe(1);
  });

  it("SERVICE createNode refuses an asset that moved off the node's site; accepts one still on it", async () => {
    await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [A_S2, A_S1_PUMP]);
    await expect(createNode({ organizationId: ORG_A, siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: A_S1_PUMP }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    const ok = await createNode({ organizationId: ORG_A, siteId: A_S1, displayName: "fan", nodeType: "ASSET", assetId: A_S1_FAN });
    expect(ok?.assetId).toBe(A_S1_FAN);
    expect((await counts()).nodes).toBe(1);
  });

  it("SERVICE createNode refuses a foreign-org asset even when its siteId names the node's site", async () => {
    await expect(createNode({ organizationId: ORG_A, siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: B_ON_A_S1 }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    expect(await counts()).toEqual(NOTHING);
  });

  it("SERVICE updateNode on a node whose site is now INACTIVE is refused as NODE_NOT_FOUND; row unchanged", async () => {
    const id = await seedNode(A_S1, "before");
    await monitor.query(`UPDATE "IndustrialSite" SET "status" = 'INACTIVE' WHERE "id" = $1`, [A_S1]);
    await expect(updateNode(id, ORG_A, { displayName: "after" })).rejects.toMatchObject({ code: "NODE_NOT_FOUND" });
    const row = await monitor.query(`SELECT "displayName" FROM "DigitalTwinNode" WHERE "id" = $1`, [id]);
    expect(row.rows[0].displayName).toBe("before");
  });

  it("SERVICE createRelation between nodes of an INACTIVE site is refused; nothing written", async () => {
    const a = await seedNode(A_S1, "a");
    const b = await seedNode(A_S1, "b");
    await monitor.query(`UPDATE "IndustrialSite" SET "status" = 'INACTIVE' WHERE "id" = $1`, [A_S1]);
    await expect(createRelation({ organizationId: ORG_A, sourceNodeId: a, targetNodeId: b, relationType: "FEEDS" }))
      .rejects.toMatchObject({ code: "SOURCE_NODE_NOT_FOUND" });
    expect((await counts()).relations).toBe(0);
  });

  it("LOCKS: a deactivation that commits while the writer waits is SEEN — the layout is refused", async () => {
    const t3 = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: `${P}t3` });
    await t3.connect();
    try {
      const t3pid = Number((await t3.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      await t3.query("BEGIN");
      await t3.query(`UPDATE "IndustrialSite" SET "status" = 'INACTIVE' WHERE "id" = $1`, [A_S1]);
      const pending = createLayout({ organizationId: ORG_A, siteId: A_S1, name: "raced" }).then(
        () => "written", (e: { code?: string }) => e.code ?? "error");
      // Proof the writer is parked on THIS row lock (no sleep is evidence).
      let waiting = false;
      for (const until = Date.now() + 10000; Date.now() < until && !waiting;) {
        const r = await monitor.query(
          `SELECT 1 FROM pg_stat_activity a WHERE a.datname = current_database() AND a.wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(a.pid))`,
          [t3pid]);
        waiting = r.rows.length > 0;
        if (!waiting) await new Promise((res) => setTimeout(res, 25));
      }
      expect(waiting).toBe(true);
      await t3.query("COMMIT");
      expect(await pending).toBe("SITE_NOT_FOUND");
      expect((await counts()).layouts).toBe(0);
    } finally {
      await t3.query("ROLLBACK").catch(() => undefined);
      await t3.end();
    }
  });

  it("LOCKS: an asset move attempted after createTag's decision is queued behind the writer", async () => {
    const t3 = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: `${P}t3` });
    const t2 = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: `${P}t2` });
    await t3.connect();
    await t2.connect();
    try {
      const pidOf = async (c: pg.Client) => Number((await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const t3pid = await pidOf(t3);
      const t2pid = await pidOf(t2);
      // T3 holds the SITE row: createTag takes the asset lock first, then parks on the site.
      await t3.query("BEGIN");
      await t3.query(`SELECT 1 FROM "IndustrialSite" WHERE "id" = $1 FOR UPDATE`, [A_S1]);
      const pending = createTag({ organizationId: ORG_A, assetId: A_S1_PUMP, siteId: A_S1, tagName: "t", tagPath: "race.tag" });
      // On a failure path the writer is abandoned; never let it reject unhandled.
      pending.catch(() => undefined);

      let writerPid = 0;
      for (const until = Date.now() + 10000; Date.now() < until && !writerPid;) {
        const r = await monitor.query(
          `SELECT a.pid FROM pg_stat_activity a WHERE a.datname = current_database() AND a.wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(a.pid))`,
          [t3pid]);
        writerPid = r.rows[0] ? Number(r.rows[0].pid) : 0;
        if (!writerPid) await new Promise((res) => setTimeout(res, 25));
      }
      expect(writerPid).toBeGreaterThan(0);

      await t2.query("BEGIN");
      let moved = false;
      const move = t2.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [A_S2, A_S1_PUMP]).then(() => { moved = true; });
      let blockedByWriter = false;
      for (const until = Date.now() + 6000; Date.now() < until && !moved && !blockedByWriter;) {
        const r = await monitor.query(
          `SELECT 1 FROM pg_stat_activity a WHERE a.pid = $1 AND a.wait_event_type = 'Lock' AND $2::int = ANY(pg_blocking_pids(a.pid))`,
          [t2pid, writerPid]);
        blockedByWriter = r.rows.length > 0;
        if (!blockedByWriter) await new Promise((res) => setTimeout(res, 25));
      }
      expect(moved).toBe(false);
      expect(blockedByWriter).toBe(true);

      await t3.query("ROLLBACK");           // the site is still ACTIVE → the writer writes and commits
      const tag = await pending;
      await move;
      await t2.query("COMMIT");
      expect(tag?.assetId).toBe(A_S1_PUMP);
      expect((await counts()).tags).toBe(1);
    } finally {
      await t3.query("ROLLBACK").catch(() => undefined);
      await t2.query("ROLLBACK").catch(() => undefined);
      await t3.end();
      await t2.end();
    }
  });
});

// ── F3 (d) — writes against an INACTIVE site through the routes ─────────────
describe("DT-01 F3(d) — a write naming an INACTIVE site answers exactly like a missing one", () => {
  it("POST /nodes, POST /layout and POST /tags", async () => {
    expectSameRefusal(
      await nodePost(U_OWNER, { siteId: A_S3, displayName: "x", nodeType: "AREA" }),
      await nodePost(U_OWNER, { siteId: NOPE, displayName: "x", nodeType: "AREA" }));
    expectSameRefusal(
      await layoutPost(U_OWNER, { siteId: A_S3, name: "l" }),
      await layoutPost(U_OWNER, { siteId: NOPE, name: "l" }));
    expectSameRefusal(
      await tagPost(U_OWNER, { assetId: A_S3_MOTOR, tagName: "t", tagPath: "a.b" }),
      await tagPost(U_OWNER, { assetId: NOPE, tagName: "t", tagPath: "a.b" }));
    expect(await counts()).toEqual(NOTHING);
  });
});

// ── F3 (a)(b)(c)(e) — references on create and on PATCH ─────────────────────
describe("DT-01 F3 — asset and parent references, accepted and refused", () => {
  it("(b) POST /nodes with a same-site parent is accepted and the parent is returned", async () => {
    const parent = await seedNode(A_S1, "line");
    const r = await nodePost(U_MGR1, { siteId: A_S1, displayName: "cell", nodeType: "CELL", parentNodeId: parent });
    expect(r.status).toBe(201);
    expect((r.json.node as Row).parentNodeId).toBe(parent);
  });

  it("(e) POST /nodes on a reachable site: an asset/parent at an UNREACHABLE same-org site answers like a missing one", async () => {
    const hiddenParent = await seedNode(A_S2, "hidden");
    expectSameRefusal(
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: A_S2_VALVE }),
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: NOPE }));
    expectSameRefusal(
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "CELL", parentNodeId: hiddenParent }),
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "CELL", parentNodeId: NOPE }));
    expectSameRefusal(
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: B_S1_PUMP }),
      await nodePost(U_MGR1, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: NOPE }));
    expect((await counts()).nodes).toBe(1); // only the seeded hidden parent
  });

  it("(a) PATCH assetId: same-site accepted; another site of the same org refused; nothing changed", async () => {
    const id = await seedNode(A_S1, "n");
    const ok = await nodePatch(U_MGR1, id, { assetId: A_S1_PUMP });
    expect(ok.status).toBe(200);
    expect((ok.json.node as Row).assetId).toBe(A_S1_PUMP);

    const bad = await nodePatch(U_MGR1, id, { assetId: A_S2_VALVE });
    expect(bad.status).toBe(404);
    expect(bad.json.code).toBe("ASSET_NOT_FOUND");
    const row = await monitor.query(`SELECT "assetId" FROM "DigitalTwinNode" WHERE "id" = $1`, [id]);
    expect(row.rows[0].assetId).toBe(A_S1_PUMP);
  });

  it("(c) PATCH assetId / parentNodeId: foreign, hidden-site and nonexistent ids give the SAME body", async () => {
    const id = await seedNode(A_S1, "n");
    const foreignNode = await seedNode(B_S1, "theirs", {}, ORG_B);
    const hiddenNode = await seedNode(A_S2, "hidden");
    const missingAsset = await nodePatch(U_OWNER, id, { assetId: NOPE });
    expectSameRefusal(missingAsset, await nodePatch(U_OWNER, id, { assetId: B_S1_PUMP }));
    expectSameRefusal(missingAsset, await nodePatch(U_OWNER, id, { assetId: B_ON_A_S1 }));
    expectSameRefusal(missingAsset, await nodePatch(U_OWNER, id, { assetId: A_S2_VALVE }));
    const missingParent = await nodePatch(U_OWNER, id, { parentNodeId: NOPE });
    expectSameRefusal(missingParent, await nodePatch(U_OWNER, id, { parentNodeId: foreignNode }));
    expectSameRefusal(missingParent, await nodePatch(U_OWNER, id, { parentNodeId: hiddenNode }));
    const row = await monitor.query(`SELECT "assetId", "parentNodeId" FROM "DigitalTwinNode" WHERE "id" = $1`, [id]);
    expect(row.rows[0]).toEqual({ assetId: null, parentNodeId: null });
  });
});

// ── F2 — legacy references are not echoed outside their scope ───────────────
describe("DT-01 F2 — a node's reference is shown only when it resolves inside the node's own site", () => {
  async function seedLegacy() {
    const hiddenParent = await seedNode(A_S2, "hidden-parent");
    const legacy = await seedNode(A_S1, "legacy", { parentNodeId: hiddenParent, assetId: A_S2_VALVE });
    const foreignAsset = await seedNode(A_S1, "foreign-asset", { assetId: B_ON_A_S1 });
    const okParent = await seedNode(A_S1, "ok-parent");
    const ok = await seedNode(A_S1, "ok", { parentNodeId: okParent, assetId: A_S1_PUMP });
    return { hiddenParent, legacy, foreignAsset, okParent, ok };
  }
  const byId = (nodes: unknown) => new Map((nodes as Row[]).map((n) => [String(n.id), n]));

  it("GET /nodes (list) withholds cross-site and cross-tenant references and never prints their ids", async () => {
    const s = await seedLegacy();
    const r = await nodeList(U_VIEW1, A_S1);
    expect(r.status).toBe(200);
    const nodes = byId(r.json.nodes);
    expect(nodes.get(s.legacy)).toMatchObject({ parentNodeId: null, assetId: null });
    expect(nodes.get(s.foreignAsset)).toMatchObject({ assetId: null });
    expect(nodes.get(s.ok)).toMatchObject({ parentNodeId: s.okParent, assetId: A_S1_PUMP });
    expect(r.text).not.toContain(s.hiddenParent);
    expect(r.text).not.toContain(A_S2_VALVE);
    expect(r.text).not.toContain(B_ON_A_S1);
  });

  it("GET /nodes/[id] (detail) withholds them too", async () => {
    const s = await seedLegacy();
    const r = await nodeGet(U_VIEW1, s.legacy);
    expect(r.status).toBe(200);
    expect(r.json.node).toMatchObject({ id: s.legacy, parentNodeId: null, assetId: null });
    expect(r.text).not.toContain(s.hiddenParent);
    expect(r.text).not.toContain(A_S2_VALVE);
    const ok = await nodeGet(U_VIEW1, s.ok);
    expect(ok.json.node).toMatchObject({ parentNodeId: s.okParent, assetId: A_S1_PUMP });
  });

  it("GET /graph withholds them too", async () => {
    const s = await seedLegacy();
    const r = await graphGet(U_VIEW1, A_S1);
    expect(r.status).toBe(200);
    expect(r.text).toContain(s.legacy);
    expect(r.text).not.toContain(s.hiddenParent);
    expect(r.text).not.toContain(A_S2_VALVE);
    expect(r.text).not.toContain(B_ON_A_S1);
  });

  it("PATCH of an unrelated field does not echo a legacy reference back", async () => {
    const s = await seedLegacy();
    const r = await nodePatch(U_MGR1, s.legacy, { displayName: "renamed" });
    expect(r.status).toBe(200);
    expect(r.json.node).toMatchObject({ displayName: "renamed", parentNodeId: null, assetId: null });
    expect(r.text).not.toContain(s.hiddenParent);
    expect(r.text).not.toContain(A_S2_VALVE);
  });
});
