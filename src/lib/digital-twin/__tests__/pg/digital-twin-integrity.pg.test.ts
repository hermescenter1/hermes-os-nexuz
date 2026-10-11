/**
 * Digital Twin Slice 1 — tenant isolation, site isolation, relationship
 * integrity and audit reliability, against REAL PostgreSQL.
 *
 * WHAT IS REAL AND WHAT IS NOT
 *   Real:   the routes, the guard, org RBAC, site RBAC, `requireOrgActor`,
 *           `requireSiteActor`, `getAllowedSiteIds` (they read OrganizationMember /
 *           UserSite / IndustrialSite from the database), the services, the
 *           transactions, the advisory lock, the audit rows.
 *   Mocked: only the TOKEN layer — `verifyAccessToken` turns the test cookie
 *           `t:<userId>` into a payload — and `requirePlatformAuth`, which would
 *           otherwise need a signed JWT and a tenant-selection cookie. The org the
 *           caller acts in comes from the `x-test-org` header, exactly as the real
 *           guard would receive it from the tenant decision.
 *
 * Every refusal is asserted twice: the response the caller sees AND the state of
 * the database afterwards ("the refusal is correct" and "the refusal left nothing
 * behind" are different claims).
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule; runs under
 * vitest.phase91-postgres.config.ts against a DISPOSABLE database
 * (HERMES_STORAGE_MODE=database, DATABASE_URL, migrations applied). Creates rows
 * under a `dtp-` prefix and removes exactly those.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ failAudit: false, breakAuditRead: false }));

vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: async (t: string) => (t.startsWith("t:") ? { sub: t.slice(2) } : null),
}));
vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async (req: NextRequest) => {
    const tok = req.cookies.get("hermes_at")?.value;
    if (!tok) return { error: "Authentication required", status: 401 };
    return {
      ctx: {
        userId: tok.slice(2),
        orgId: req.headers.get("x-test-org"),
        authMethod: req.headers.get("x-test-auth") ?? "jwt",
        scopes: ["admin"],
      },
    };
  },
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => undefined }));
// The REAL audit-service runs; only the persist half can be told to fail, to
// model "the audit store is down" — the case the twin must roll back for.
vi.mock("@/lib/audit/audit-service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/audit/audit-service")>();
  return {
    ...orig,
    persistAuditEventInTx: async (...a: Parameters<typeof orig.persistAuditEventInTx>) => {
      if (h.failAudit) throw new Error("AUDIT_MODEL_UNAVAILABLE");
      return orig.persistAuditEventInTx(...a);
    },
  };
});
// When `breakAuditRead` is set the audit READERS cannot reach the database, which
// is the situation in which they fall back to the in-process buffer.
vi.mock("@/lib/db/prisma", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/prisma")>();
  return {
    ...orig,
    getPrisma: async () => {
      const client = await orig.getPrisma();
      if (!h.breakAuditRead || !client) return client;
      return new Proxy(client, {
        get(target, prop) {
          if (prop === "auditLog") return { findMany: async () => { throw new Error("audit read path down"); } };
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      });
    },
  };
});

const { getPrisma } = await import("@/lib/db/prisma");
const nodesRoute = await import("@/app/api/digital-twin/nodes/route");
const nodeIdRoute = await import("@/app/api/digital-twin/nodes/[id]/route");
const relationsRoute = await import("@/app/api/digital-twin/relations/route");
const graphRoute = await import("@/app/api/digital-twin/graph/route");
const layoutRoute = await import("@/app/api/digital-twin/layout/route");
const tagsRoute = await import("@/app/api/digital-twin/tags/route");
const { createNode } = await import("@/lib/digital-twin/nodes");
const { createRelation } = await import("@/lib/digital-twin/relations");
const { createTag } = await import("@/lib/digital-twin/tags");
const { createLayout } = await import("@/lib/digital-twin/layout");

// ── Fixtures ────────────────────────────────────────────────────────────────
const ORG_A = "dtp-org-a";
const ORG_B = "dtp-org-b";
const ORGS = [ORG_A, ORG_B];
const A_S1 = "dtp-a-site1";
const A_S2 = "dtp-a-site2";
const B_S1 = "dtp-b-site1";
const A_S1_PUMP = "dtp-a-s1-pump";
const A_S2_VALVE = "dtp-a-s2-valve";
const B_S1_PUMP = "dtp-b-s1-pump";

const U_OWNER = "dtp-u-owner";
const U_ADMIN = "dtp-u-admin";
const U_MGR1 = "dtp-u-mgr-site1"; // org MANAGER + SITE_MANAGER on site 1 only
const U_MGR0 = "dtp-u-mgr-nosite"; // org MANAGER, NO UserSite row at all
const U_VIEW1 = "dtp-u-view-site1"; // org VIEWER + SITE_VIEWER on site 1
const U_BADMIN = "dtp-u-b-admin";
const U_SUSP = "dtp-u-mgr-s1ok-s2susp"; // org MANAGER; ACTIVE on site 1, SUSPENDED on site 2
const USERS = [U_OWNER, U_ADMIN, U_MGR1, U_MGR0, U_VIEW1, U_BADMIN, U_SUSP];

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  findMany: (a?: unknown) => Promise<Row[]>;
  findFirst: (a?: unknown) => Promise<Row | null>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
type Db = Record<string, Model>;
let db: Db;

/**
 * FR-04. The official site guard records `site.access.denied` with NO
 * `organizationId` column value (the org only appears in `metadata`), so an
 * org-scoped purge leaves those rows behind. Ownership is proven by the suite's
 * own namespace: the audited entity is a `dtp-` site id (this suite's fixtures
 * AND its deliberately non-existent probes such as NOPE, all `dtp-`-prefixed and
 * used by nothing else), or the actor is one of THIS suite's users. The entity
 * clause still matches after the users are deleted (the FK nulls `userId`).
 */
const OWNED_DENIAL_ROWS = {
  action: "site.access.denied",
  entityType: "site",
  OR: [{ entityId: { startsWith: "dtp-" } }, { userId: { in: USERS } }],
};
async function purgeDenialAudit() {
  await db.auditLog.deleteMany({ where: OWNED_DENIAL_ROWS });
}

async function purgeTwin() {
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
  await purgeDenialAudit();
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
  // A denial audit is written fire-and-forget and can land after the requests
  // returned; sweep once more now that every owner is gone (matched by site id).
  await new Promise((resolve) => setTimeout(resolve, 250));
  await purgeDenialAudit();
}

/** FR-04: after the suite, nothing this suite owns may remain. A leftover is a hard failure, never hidden. */
async function assertNoOwnedResidue() {
  const residue = {
    auditByOrg: await db.auditLog.count({ where: { organizationId: { in: ORGS } } }),
    auditDenials: await db.auditLog.count({ where: OWNED_DENIAL_ROWS }),
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
  const leftovers = Object.entries(residue).filter(([, n]) => n !== 0);
  if (leftovers.length > 0) throw new Error(`FR-04 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(leftovers))}`);
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purgeAll();

  for (const id of USERS) {
    await db.user.create({
      data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date() },
    });
  }
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: new Date() } });
  for (const [id, org] of [[A_S1, ORG_A], [A_S2, ORG_A], [B_S1, ORG_B]] as const) {
    await db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: new Date() } });
  }
  for (const [id, org, site] of [[A_S1_PUMP, ORG_A, A_S1], [A_S2_VALVE, ORG_A, A_S2], [B_S1_PUMP, ORG_B, B_S1]] as const) {
    await db.industrialAsset.create({ data: { id, organizationId: org, siteId: site, name: id, updatedAt: new Date() } });
  }
  for (const [user, org, role] of [
    [U_OWNER, ORG_A, "OWNER"], [U_ADMIN, ORG_A, "ADMIN"], [U_MGR1, ORG_A, "MANAGER"],
    [U_MGR0, ORG_A, "MANAGER"], [U_VIEW1, ORG_A, "VIEWER"], [U_BADMIN, ORG_B, "ADMIN"], [U_SUSP, ORG_A, "MANAGER"],
  ] as const) {
    await db.organizationMember.create({ data: { organizationId: org, userId: user, role, status: "ACTIVE" } });
  }
  await db.userSite.create({ data: { userId: U_MGR1, siteId: A_S1, organizationId: ORG_A, role: "SITE_MANAGER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: U_VIEW1, siteId: A_S1, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: U_SUSP, siteId: A_S1, organizationId: ORG_A, role: "SITE_MANAGER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: U_SUSP, siteId: A_S2, organizationId: ORG_A, role: "SITE_MANAGER", status: "SUSPENDED" } });
});

afterAll(async () => {
  if (!db) return;
  await purgeAll();            // idempotent: safe when nothing (or only part) was created
  await assertNoOwnedResidue();
});

beforeEach(async () => {
  h.failAudit = false;
  h.breakAuditRead = false;
  await purgeTwin();
});

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;

function request(user: string, org: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org, ...extra },
  });
}
async function call(handler: Handler, user: string, org: string, method: string, path: string, body?: unknown, id?: string) {
  const res = await handler(request(user, org, method, path, body), id ? { params: Promise.resolve({ id }) } : undefined);
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON body */ }
  return { status: res.status, json, text };
}
const post = (h2: Handler, user: string, org: string, path: string, body: unknown) => call(h2, user, org, "POST", path, body);

const nodePost = (user: string, org: string, body: unknown) => post(nodesRoute.POST as Handler, user, org, "/api/digital-twin/nodes", body);
const relPost = (user: string, org: string, body: unknown) => post(relationsRoute.POST as Handler, user, org, "/api/digital-twin/relations", body);
const nodeGet = (user: string, org: string, id: string) => call(nodeIdRoute.GET as Handler, user, org, "GET", `/api/digital-twin/nodes/${id}`, undefined, id);
const nodePatch = (user: string, org: string, id: string, body: unknown) => call(nodeIdRoute.PATCH as Handler, user, org, "PATCH", `/api/digital-twin/nodes/${id}`, body, id);

async function seedNode(orgId: string, siteId: string, displayName: string, extra: Row = {}): Promise<string> {
  const r = await db.digitalTwinNode.create({ data: { organizationId: orgId, siteId, displayName, nodeType: "AREA", ...extra } });
  return String(r.id);
}
const countNodes = (org: string) => db.digitalTwinNode.count({ where: { organizationId: org } });
const countRels = (org: string) => db.digitalTwinRelation.count({ where: { organizationId: org } });
const twinAudit = (org: string) => db.auditLog.findMany({ where: { organizationId: org, action: { startsWith: "digital_twin." } } });
const NOPE = "dtp-does-not-exist";

// ── 1. tenant isolation ─────────────────────────────────────────────────────
describe("tenant isolation — a tenant cannot reference another tenant's records", () => {
  it("node: another tenant's SITE is refused (404) and nothing is written", async () => {
    const r = await nodePost(U_OWNER, ORG_A, { siteId: B_S1, displayName: "X", nodeType: "AREA" });
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("SITE_NOT_FOUND");
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await countNodes(ORG_B)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("node: another tenant's ASSET is refused even when the site is the caller's own", async () => {
    const r = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "X", nodeType: "ASSET", assetId: B_S1_PUMP });
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("ASSET_NOT_FOUND");
    expect(await countNodes(ORG_A)).toBe(0);
  });

  it("node: another tenant's PARENT node is refused", async () => {
    const foreign = await seedNode(ORG_B, B_S1, "B-area");
    const r = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "X", nodeType: "CELL", parentNodeId: foreign });
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("PARENT_NODE_NOT_FOUND");
    expect(await countNodes(ORG_A)).toBe(0);
  });

  it("node PATCH: cannot re-point an existing node at another tenant's asset or parent", async () => {
    const mine = await seedNode(ORG_A, A_S1, "mine");
    const foreignNode = await seedNode(ORG_B, B_S1, "theirs");
    const a = await nodePatch(U_OWNER, ORG_A, mine, { assetId: B_S1_PUMP });
    const p = await nodePatch(U_OWNER, ORG_A, mine, { parentNodeId: foreignNode });
    expect(a.status).toBe(404);
    expect(p.status).toBe(404);
    const row = await db.digitalTwinNode.findFirst({ where: { id: mine } });
    expect(row?.assetId).toBeNull();
    expect(row?.parentNodeId).toBeNull();
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("node PATCH: another tenant's node cannot be read or changed at all", async () => {
    const theirs = await seedNode(ORG_B, B_S1, "theirs");
    expect((await nodeGet(U_OWNER, ORG_A, theirs)).status).toBe(404);
    const r = await nodePatch(U_OWNER, ORG_A, theirs, { displayName: "hijacked" });
    expect(r.status).toBe(404);
    expect((await db.digitalTwinNode.findFirst({ where: { id: theirs } }))?.displayName).toBe("theirs");
  });

  it("relation: a source or target in another tenant is refused", async () => {
    const mine = await seedNode(ORG_A, A_S1, "mine");
    const theirs = await seedNode(ORG_B, B_S1, "theirs");
    const asTarget = await relPost(U_OWNER, ORG_A, { sourceNodeId: mine, targetNodeId: theirs, relationType: "FEEDS" });
    const asSource = await relPost(U_OWNER, ORG_A, { sourceNodeId: theirs, targetNodeId: mine, relationType: "FEEDS" });
    expect(asTarget.status).toBe(404);
    expect(asSource.status).toBe(404);
    expect(await countRels(ORG_A)).toBe(0);
    expect(await countRels(ORG_B)).toBe(0);
  });

  it("tag and layout: another tenant's asset / site is refused", async () => {
    const t = await post(tagsRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/tags", { assetId: B_S1_PUMP, tagName: "T", tagPath: "a.b" });
    const l = await post(layoutRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/layout", { siteId: B_S1, name: "L" });
    expect(t.status).toBe(404);
    expect(l.status).toBe(404);
    expect(await db.assetTag.count({ where: { organizationId: { in: ORGS } } })).toBe(0);
    expect(await db.digitalTwinLayout.count({ where: { organizationId: { in: ORGS } } })).toBe(0);
  });

  it("SERVICE LAYER (not just the route) refuses cross-tenant references", async () => {
    const mine = await seedNode(ORG_A, A_S1, "mine");
    const theirs = await seedNode(ORG_B, B_S1, "theirs");
    await expect(createNode({ organizationId: ORG_A, siteId: B_S1, displayName: "x", nodeType: "AREA" }))
      .rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    await expect(createNode({ organizationId: ORG_A, siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: B_S1_PUMP }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    await expect(createNode({ organizationId: ORG_A, siteId: A_S1, displayName: "x", nodeType: "AREA", parentNodeId: theirs }))
      .rejects.toMatchObject({ code: "PARENT_NODE_NOT_FOUND" });
    await expect(createRelation({ organizationId: ORG_A, sourceNodeId: mine, targetNodeId: theirs, relationType: "FEEDS" }))
      .rejects.toMatchObject({ code: "TARGET_NODE_NOT_FOUND" });
    await expect(createTag({ organizationId: ORG_A, assetId: B_S1_PUMP, tagName: "t", tagPath: "a.b" }))
      .rejects.toMatchObject({ code: "ASSET_NOT_FOUND" });
    await expect(createLayout({ organizationId: ORG_A, siteId: B_S1, name: "l" }))
      .rejects.toMatchObject({ code: "SITE_NOT_FOUND" });
    expect(await countNodes(ORG_A)).toBe(1); // only the seeded one
  });

  it("an asset at a DIFFERENT site of the same tenant is refused (site compatibility)", async () => {
    const r = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "X", nodeType: "ASSET", assetId: A_S2_VALVE });
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("ASSET_NOT_FOUND");
    expect(await countNodes(ORG_A)).toBe(0);
  });

  it("a legitimate asset of the matching site is accepted", async () => {
    const r = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "Pump", nodeType: "ASSET", assetId: A_S1_PUMP });
    expect(r.status).toBe(201);
    expect(await countNodes(ORG_A)).toBe(1);
  });

  it("organisation B's own admin can do the same in B (the rule is symmetric)", async () => {
    const r = await nodePost(U_BADMIN, ORG_B, { siteId: B_S1, displayName: "B-area", nodeType: "AREA" });
    expect(r.status).toBe(201);
    expect(await countNodes(ORG_B)).toBe(1);
    expect(await countNodes(ORG_A)).toBe(0);
  });
});

describe("existence oracle — foreign and non-existent ids are indistinguishable", () => {
  it("every reference kind answers the SAME for a foreign id and an invented one", async () => {
    const foreignNode = await seedNode(ORG_B, B_S1, "theirs");
    const mine = await seedNode(ORG_A, A_S1, "mine");
    const pairs: Array<[string, () => Promise<{ status: number; json: Row }>, () => Promise<{ status: number; json: Row }>]> = [
      ["site (node create)", () => nodePost(U_OWNER, ORG_A, { siteId: B_S1, displayName: "x", nodeType: "AREA" }), () => nodePost(U_OWNER, ORG_A, { siteId: NOPE, displayName: "x", nodeType: "AREA" })],
      ["asset (node create)", () => nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: B_S1_PUMP }), () => nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "ASSET", assetId: NOPE })],
      ["parent (node create)", () => nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "AREA", parentNodeId: foreignNode }), () => nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "AREA", parentNodeId: NOPE })],
      ["node (detail)", () => nodeGet(U_OWNER, ORG_A, foreignNode), () => nodeGet(U_OWNER, ORG_A, NOPE)],
      ["node (patch)", () => nodePatch(U_OWNER, ORG_A, foreignNode, { displayName: "x" }), () => nodePatch(U_OWNER, ORG_A, NOPE, { displayName: "x" })],
      ["relation target", () => relPost(U_OWNER, ORG_A, { sourceNodeId: mine, targetNodeId: foreignNode, relationType: "FEEDS" }), () => relPost(U_OWNER, ORG_A, { sourceNodeId: mine, targetNodeId: NOPE, relationType: "FEEDS" })],
      ["tag asset", () => post(tagsRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/tags", { assetId: B_S1_PUMP, tagName: "t", tagPath: "a.b" }), () => post(tagsRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/tags", { assetId: NOPE, tagName: "t", tagPath: "a.b" })],
      ["graph site", () => call(graphRoute.GET as Handler, U_OWNER, ORG_A, "GET", `/api/digital-twin/graph?siteId=${B_S1}`), () => call(graphRoute.GET as Handler, U_OWNER, ORG_A, "GET", `/api/digital-twin/graph?siteId=${NOPE}`)],
      ["layout site", () => post(layoutRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/layout", { siteId: B_S1, name: "l" }), () => post(layoutRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/layout", { siteId: NOPE, name: "l" })],
    ];
    for (const [label, foreign, invented] of pairs) {
      const f = await foreign();
      const i = await invented();
      expect(f.status, `${label}: status`).toBe(i.status);
      expect(f.json, `${label}: body`).toEqual(i.json);
      expect(f.status, `${label}: is a refusal`).toBeGreaterThanOrEqual(400);
    }
  });
});

// ── 2. site isolation ───────────────────────────────────────────────────────
describe("site isolation", () => {
  let n1: string; // site 1
  let n2: string; // site 2
  beforeEach(async () => {
    n1 = await seedNode(ORG_A, A_S1, "node-site1");
    n2 = await seedNode(ORG_A, A_S2, "node-site2");
    await seedNode(ORG_B, B_S1, "node-orgB");
  });

  const listNames = async (user: string, query = "") => {
    const r = await call(nodesRoute.GET as Handler, user, ORG_A, "GET", `/api/digital-twin/nodes${query}`);
    return { status: r.status, names: ((r.json.nodes as Row[]) ?? []).map((n) => String(n.displayName)).sort() };
  };

  it("a site-1 member lists only site-1 nodes — never site 2, never another tenant", async () => {
    expect(await listNames(U_MGR1)).toEqual({ status: 200, names: ["node-site1"] });
  });

  it("?siteId NARROWS the allowed set and never replaces it", async () => {
    expect(await listNames(U_MGR1, `?siteId=${A_S2}`)).toEqual({ status: 200, names: [] });
    expect(await listNames(U_MGR1, `?siteId=${A_S1}`)).toEqual({ status: 200, names: ["node-site1"] });
    expect(await listNames(U_MGR1, `?siteId=${B_S1}`)).toEqual({ status: 200, names: [] });
  });

  it("a member with NO UserSite row reaches NOTHING (no fallback to all sites)", async () => {
    expect(await listNames(U_MGR0)).toEqual({ status: 200, names: [] });
    expect((await nodeGet(U_MGR0, ORG_A, n1)).status).toBe(404);
    expect((await call(graphRoute.GET as Handler, U_MGR0, ORG_A, "GET", `/api/digital-twin/graph?siteId=${A_S1}`)).status).toBe(404);
  });

  it("OWNER and ADMIN reach every ACTIVE site of their own organisation, and only that", async () => {
    for (const u of [U_OWNER, U_ADMIN]) {
      expect(await listNames(u)).toEqual({ status: 200, names: ["node-site1", "node-site2"] });
    }
    // An admin of ANOTHER organisation acting "in" org A is not a member there at all.
    expect((await listNames(U_BADMIN)).status).toBe(403);
  });

  it("detail: the other site's node is 404 (same as a missing node); the own site's is served", async () => {
    expect((await nodeGet(U_MGR1, ORG_A, n1)).status).toBe(200);
    const hidden = await nodeGet(U_MGR1, ORG_A, n2);
    const missing = await nodeGet(U_MGR1, ORG_A, NOPE);
    expect(hidden.status).toBe(404);
    expect(hidden.json).toEqual(missing.json);
  });

  it("mutation outside the site is refused and leaves the row and the audit trail untouched", async () => {
    const patch = await nodePatch(U_MGR1, ORG_A, n2, { displayName: "tampered" });
    expect(patch.status).toBe(404);
    const create = await nodePost(U_MGR1, ORG_A, { siteId: A_S2, displayName: "new", nodeType: "AREA" });
    expect(create.status).toBe(404);
    expect((await db.digitalTwinNode.findFirst({ where: { id: n2 } }))?.displayName).toBe("node-site2");
    expect(await countNodes(ORG_A)).toBe(2);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("a SITE_MANAGER can write inside the site; a SITE_VIEWER (and org VIEWER) cannot", async () => {
    expect((await nodePost(U_MGR1, ORG_A, { siteId: A_S1, displayName: "ok", nodeType: "AREA" })).status).toBe(201);
    expect((await nodePost(U_VIEW1, ORG_A, { siteId: A_S1, displayName: "no", nodeType: "AREA" })).status).toBe(403);
    expect((await nodePatch(U_VIEW1, ORG_A, n1, { displayName: "no" })).status).toBe(403);
    expect((await nodeGet(U_VIEW1, ORG_A, n1)).status).toBe(200); // read is allowed
  });

  it("graph: reachable site is served, other site is 404", async () => {
    expect((await call(graphRoute.GET as Handler, U_MGR1, ORG_A, "GET", `/api/digital-twin/graph?siteId=${A_S1}`)).status).toBe(200);
    expect((await call(graphRoute.GET as Handler, U_MGR1, ORG_A, "GET", `/api/digital-twin/graph?siteId=${A_S2}`)).status).toBe(404);
  });

  it("relations: a legacy edge between two sites is invisible to a one-site member, in the list AND in the node detail", async () => {
    // Written straight to the table: the API refuses to create this, but data from before Slice 1 may contain it.
    const legacy = await db.digitalTwinRelation.create({ data: { organizationId: ORG_A, sourceNodeId: n1, targetNodeId: n2, relationType: "FEEDS" } });
    const own2 = await seedNode(ORG_A, A_S1, "node-site1-b");
    await db.digitalTwinRelation.create({ data: { organizationId: ORG_A, sourceNodeId: n1, targetNodeId: own2, relationType: "FEEDS" } });

    const list = await call(relationsRoute.GET as Handler, U_MGR1, ORG_A, "GET", "/api/digital-twin/relations");
    const ids = ((list.json.relations as Row[]) ?? []).map((r) => String(r.id));
    expect(ids).not.toContain(String(legacy.id));
    expect(ids).toHaveLength(1);

    const detail = await nodeGet(U_MGR1, ORG_A, n1);
    const rel = detail.json.relations as { outbound: Row[]; inbound: Row[] };
    expect(rel.outbound.map((r) => String(r.id))).not.toContain(String(legacy.id));
    expect(JSON.stringify(detail.json)).not.toContain(n2); // the other site's node id does not leak

    const ownerList = await call(relationsRoute.GET as Handler, U_OWNER, ORG_A, "GET", "/api/digital-twin/relations");
    expect(((ownerList.json.relations as Row[]) ?? []).map((r) => String(r.id))).toContain(String(legacy.id));
  });

  it("tags: a tag on an asset of another site is neither listed nor creatable by a one-site member", async () => {
    await db.assetTag.create({ data: { organizationId: ORG_A, assetId: A_S2_VALVE, tagName: "T", tagPath: "v.pos" } });
    const list = await call(tagsRoute.GET as Handler, U_MGR1, ORG_A, "GET", `/api/digital-twin/tags?assetId=${A_S2_VALVE}`);
    expect(list.json.tags).toEqual([]);
    const create = await post(tagsRoute.POST as Handler, U_MGR1, ORG_A, "/api/digital-twin/tags", { assetId: A_S2_VALVE, tagName: "T2", tagPath: "v.other" });
    expect(create.status).toBe(404);
    expect(await db.assetTag.count({ where: { organizationId: ORG_A } })).toBe(1);
    const owner = await call(tagsRoute.GET as Handler, U_OWNER, ORG_A, "GET", `/api/digital-twin/tags?assetId=${A_S2_VALVE}`);
    expect((owner.json.tags as Row[]).length).toBe(1);
  });

  it("layouts follow the same site scope", async () => {
    await db.digitalTwinLayout.create({ data: { organizationId: ORG_A, siteId: A_S1, name: "L1" } });
    await db.digitalTwinLayout.create({ data: { organizationId: ORG_A, siteId: A_S2, name: "L2" } });
    const r = await call(layoutRoute.GET as Handler, U_MGR1, ORG_A, "GET", "/api/digital-twin/layout");
    expect(((r.json.layouts as Row[]) ?? []).map((l) => String(l.name))).toEqual(["L1"]);
    const owner = await call(layoutRoute.GET as Handler, U_OWNER, ORG_A, "GET", "/api/digital-twin/layout");
    expect((owner.json.layouts as Row[]).length).toBe(2);
  });
});

describe("authentication boundary against the real membership tables", () => {
  it("no cookie → 401; API-key method → 403; a user who is not a member → 403", async () => {
    const noCookie = await nodesRoute.GET(new NextRequest(new URL("http://localhost/api/digital-twin/nodes"), { headers: { "x-test-org": ORG_A } }));
    expect(noCookie.status).toBe(401);

    const apiKey = await nodesRoute.GET(request(U_OWNER, ORG_A, "GET", "/api/digital-twin/nodes", undefined, { "x-test-auth": "apikey" }));
    expect(apiKey.status).toBe(403);
    expect((await apiKey.json()).code).toBe("SESSION_REQUIRED");

    const outsider = await call(nodesRoute.GET as Handler, U_BADMIN, ORG_A, "GET", "/api/digital-twin/nodes");
    expect(outsider.status).toBe(403);
  });

  it("a SUSPENDED member is refused", async () => {
    await db.organizationMember.deleteMany({ where: { organizationId: ORG_A, userId: U_MGR0 } });
    await db.organizationMember.create({ data: { organizationId: ORG_A, userId: U_MGR0, role: "MANAGER", status: "SUSPENDED" } });
    const r = await call(nodesRoute.GET as Handler, U_MGR0, ORG_A, "GET", "/api/digital-twin/nodes");
    expect(r.status).toBe(403);
    await db.organizationMember.deleteMany({ where: { organizationId: ORG_A, userId: U_MGR0 } });
    await db.organizationMember.create({ data: { organizationId: ORG_A, userId: U_MGR0, role: "MANAGER", status: "ACTIVE" } });
  });
});

// ── 3. relationship invariants ──────────────────────────────────────────────
describe("relationship invariants", () => {
  let a: string, b: string, c: string, d: string, other: string;
  beforeEach(async () => {
    [a, b, c, d] = [await seedNode(ORG_A, A_S1, "a"), await seedNode(ORG_A, A_S1, "b"), await seedNode(ORG_A, A_S1, "c"), await seedNode(ORG_A, A_S1, "d")];
    other = await seedNode(ORG_A, A_S2, "other-site");
  });
  const rel = (s: string, t: string, type: string) => relPost(U_OWNER, ORG_A, { sourceNodeId: s, targetNodeId: t, relationType: type });

  it("creates a valid relation (and audits it exactly once)", async () => {
    const r = await rel(a, b, "FEEDS");
    expect(r.status).toBe(201);
    expect(await countRels(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
  });

  it("rejects a duplicate with 409 DUPLICATE_RELATION, not a 500", async () => {
    expect((await rel(a, b, "FEEDS")).status).toBe(201);
    const dup = await rel(a, b, "FEEDS");
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("DUPLICATE_RELATION");
    expect(await countRels(ORG_A)).toBe(1);
  });

  it("treats the reverse of a bidirectional CONNECTED_TO as a duplicate; a directed type is not", async () => {
    expect((await rel(a, b, "CONNECTED_TO")).status).toBe(201);
    const rev = await rel(b, a, "CONNECTED_TO");
    expect(rev.status).toBe(409);
    expect(rev.json.code).toBe("DUPLICATE_RELATION");
    expect((await rel(a, c, "FEEDS")).status).toBe(201);
    expect((await rel(c, a, "FEEDS")).status).toBe(201); // process loops are legitimate
  });

  it("rejects a self-loop with 422 SELF_RELATION", async () => {
    const r = await rel(a, a, "FEEDS");
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("SELF_RELATION");
    expect(await countRels(ORG_A)).toBe(0);
  });

  it("rejects a relation between two SITES of the same tenant with 422 CROSS_SITE_RELATION", async () => {
    const r = await rel(a, other, "FEEDS");
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("CROSS_SITE_RELATION");
    expect(await countRels(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("rejects a DIRECT PART_OF cycle with 422 HIERARCHY_CYCLE", async () => {
    expect((await rel(a, b, "PART_OF")).status).toBe(201);
    const r = await rel(b, a, "PART_OF");
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("HIERARCHY_CYCLE");
    expect(await countRels(ORG_A)).toBe(1);
  });

  it("rejects a MULTI-HOP PART_OF cycle", async () => {
    for (const [s, t] of [[a, b], [b, c], [c, d]]) expect((await rel(s, t, "PART_OF")).status).toBe(201);
    const r = await rel(d, a, "PART_OF");
    expect(r.status).toBe(422);
    expect(r.json.code).toBe("HIERARCHY_CYCLE");
    expect(await countRels(ORG_A)).toBe(3);
  });

  it("accepts a PART_OF tree/diamond (no cycle)", async () => {
    for (const [s, t] of [[d, b], [d, c], [b, a], [c, a]]) expect((await rel(s, t, "PART_OF")).status).toBe(201);
    expect(await countRels(ORG_A)).toBe(4);
  });

  it("CONCURRENT writers cannot close a 2-cycle: exactly one of A→B / B→A succeeds", async () => {
    const results = await Promise.all([rel(a, b, "PART_OF"), rel(b, a, "PART_OF")]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 422]);
    expect(await countRels(ORG_A)).toBe(1);
  });

  it("CONCURRENT writers cannot close a 3-cycle: exactly two of three succeed", async () => {
    const results = await Promise.all([rel(a, b, "PART_OF"), rel(b, c, "PART_OF"), rel(c, a, "PART_OF")]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 422)).toHaveLength(1);
    expect(results.find((r) => r.status === 422)?.json.code).toBe("HIERARCHY_CYCLE");
    expect(await countRels(ORG_A)).toBe(2);
  });

  it("CONCURRENT identical inserts yield one 201 and one 409 (the unique index backs the check)", async () => {
    const results = await Promise.all([rel(a, b, "FEEDS"), rel(a, b, "FEEDS")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await countRels(ORG_A)).toBe(1);
  });

  it("parentNodeId: self-parent, cycle and cross-site parent are all refused", async () => {
    expect((await nodePatch(U_OWNER, ORG_A, a, { parentNodeId: a })).status).toBe(422);
    expect((await nodePatch(U_OWNER, ORG_A, b, { parentNodeId: a })).status).toBe(200);
    expect((await nodePatch(U_OWNER, ORG_A, c, { parentNodeId: b })).status).toBe(200);
    const loop = await nodePatch(U_OWNER, ORG_A, a, { parentNodeId: c });
    expect(loop.status).toBe(422);
    expect(loop.json.code).toBe("HIERARCHY_CYCLE");
    const crossSite = await nodePatch(U_OWNER, ORG_A, d, { parentNodeId: other });
    expect(crossSite.status).toBe(404);
    expect((await db.digitalTwinNode.findFirst({ where: { id: a } }))?.parentNodeId).toBeNull();
  });

  it("node create: a parent at another site of the same tenant is refused", async () => {
    const r = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "child", nodeType: "CELL", parentNodeId: other });
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("PARENT_NODE_NOT_FOUND");
  });

  it("a duplicate tag path on one asset is 409 DUPLICATE_TAG", async () => {
    const body = { assetId: A_S1_PUMP, tagName: "T", tagPath: "pump.speed" };
    expect((await post(tagsRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/tags", body)).status).toBe(201);
    const dup = await post(tagsRoute.POST as Handler, U_OWNER, ORG_A, "/api/digital-twin/tags", body);
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe("DUPLICATE_TAG");
  });
});

// ── 4. error contract against the real database ─────────────────────────────
describe("error contract against the real database", () => {
  it("no response body ever carries a driver, constraint or table name", async () => {
    const a = await seedNode(ORG_A, A_S1, "a");
    const b = await seedNode(ORG_A, A_S1, "b");
    const bodies = [
      await relPost(U_OWNER, ORG_A, { sourceNodeId: a, targetNodeId: b, relationType: "FEEDS" }),
      await relPost(U_OWNER, ORG_A, { sourceNodeId: a, targetNodeId: b, relationType: "FEEDS" }),
      await relPost(U_OWNER, ORG_A, { sourceNodeId: a, targetNodeId: a, relationType: "FEEDS" }),
      await nodePost(U_OWNER, ORG_A, { siteId: B_S1, displayName: "x", nodeType: "AREA" }),
      await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "NOPE" }),
    ];
    for (const r of bodies) {
      expect(r.text, `status ${r.status}`).not.toMatch(/prisma|constraint|fkey|DigitalTwin|violat|P20\d\d|stack|at .*\.ts/i);
    }
  });
});

// ── 5. audit reliability ────────────────────────────────────────────────────
describe("audit reliability", () => {
  it("a successful create writes exactly ONE audit row carrying org, actor, action, target and site", async () => {
    const r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "Pump P-101", nodeType: "ASSET", assetId: A_S1_PUMP });
    expect(r.status).toBe(201);
    const id = String((r.json.node as Row).id);
    const rows = await twinAudit(ORG_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: ORG_A,
      userId: U_ADMIN,
      action: "digital_twin.node.created",
      entityType: "digital_twin",
      entityId: id,
      outcome: "success",
    });
    expect((rows[0].metadata as Row).siteId).toBe(A_S1);
    expect((rows[0].metadata as Row).organizationId).toBe(ORG_A);
  });

  it("an update audits the changed FIELD NAMES, not their values", async () => {
    const id = await seedNode(ORG_A, A_S1, "before");
    const r = await nodePatch(U_ADMIN, ORG_A, id, { displayName: "after-value", metadata: { note: "hello" } });
    expect(r.status).toBe(200);
    const rows = await twinAudit(ORG_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("digital_twin.node.updated");
    expect((rows[0].metadata as Row).changedFields).toEqual(["displayName", "metadata"]);
    expect(JSON.stringify(rows[0])).not.toContain("after-value");
  });

  it("secrets placed in metadata never reach the audit row", async () => {
    const r = await nodePost(U_ADMIN, ORG_A, {
      siteId: A_S1, displayName: "Gateway", nodeType: "SYSTEM",
      metadata: { apiToken: "s3cr3t-token-value", password: "hunter2-value" },
    });
    expect(r.status).toBe(201);
    const text = JSON.stringify(await twinAudit(ORG_A));
    expect(text).not.toContain("s3cr3t-token-value");
    expect(text).not.toContain("hunter2-value");
    expect(text).not.toContain("Gateway");
  });

  it("a no-op PATCH writes nothing and audits nothing", async () => {
    const id = await seedNode(ORG_A, A_S1, "same");
    const r = await nodePatch(U_ADMIN, ORG_A, id, {});
    expect(r.status).toBe(200);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("REJECTED mutations leave NO twin audit row (domain, tenant, site and validation refusals)", async () => {
    const a = await seedNode(ORG_A, A_S1, "a");
    await relPost(U_OWNER, ORG_A, { sourceNodeId: a, targetNodeId: a, relationType: "FEEDS" });
    await nodePost(U_OWNER, ORG_A, { siteId: B_S1, displayName: "x", nodeType: "AREA" });
    await nodePost(U_MGR1, ORG_A, { siteId: A_S2, displayName: "x", nodeType: "AREA" });
    await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "NOPE" });
    await nodePost(U_VIEW1, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "AREA" });
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(await twinAudit(ORG_B)).toHaveLength(0);
  });

  it("if the AUDIT write fails, the MUTATION is rolled back and the caller gets a sanitised 500", async () => {
    h.failAudit = true;
    const r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "should-not-persist", nodeType: "AREA" });
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    expect(r.text).not.toContain("AUDIT_MODEL_UNAVAILABLE");
    expect(await countNodes(ORG_A)).toBe(0);

    const a = await seedNode(ORG_A, A_S1, "a");
    const b = await seedNode(ORG_A, A_S1, "b");
    const rr = await relPost(U_ADMIN, ORG_A, { sourceNodeId: a, targetNodeId: b, relationType: "FEEDS" });
    expect(rr.status).toBe(500);
    expect(await countRels(ORG_A)).toBe(0);

    const up = await nodePatch(U_ADMIN, ORG_A, a, { displayName: "renamed" });
    expect(up.status).toBe(500);
    expect((await db.digitalTwinNode.findFirst({ where: { id: a } }))?.displayName).toBe("a");
  });

  it("once the audit store recovers, the same request succeeds and is audited", async () => {
    h.failAudit = true;
    expect((await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "n", nodeType: "AREA" })).status).toBe(500);
    h.failAudit = false;
    expect((await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "n", nodeType: "AREA" })).status).toBe(201);
    expect(await countNodes(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
  });
});

// ── 6. validation against the real routes ───────────────────────────────────
describe("validation", () => {
  it("rejects oversized metadata, an unknown enum, malformed ids and bad JSON with 4xx and writes nothing", async () => {
    const big = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "AREA", metadata: { blob: "x".repeat(20000) } });
    const badEnum = await nodePost(U_OWNER, ORG_A, { siteId: A_S1, displayName: "x", nodeType: "ROBOT" });
    const badId = await nodePost(U_OWNER, ORG_A, { siteId: "a b; drop", displayName: "x", nodeType: "AREA" });
    expect([big.status, badEnum.status, badId.status]).toEqual([400, 400, 400]);
    const badJson = await (nodesRoute.POST as Handler)(
      new NextRequest(new URL("http://localhost/api/digital-twin/nodes"), {
        method: "POST", body: "{nope", headers: { cookie: `hermes_at=t:${U_OWNER}`, "x-test-org": ORG_A },
      }),
    );
    expect(badJson.status).toBe(400);
    expect(await countNodes(ORG_A)).toBe(0);
  });

  it("an injected organizationId / siteId in a PATCH is dropped, never applied", async () => {
    const id = await seedNode(ORG_A, A_S1, "n");
    const r = await nodePatch(U_OWNER, ORG_A, id, { displayName: "renamed", organizationId: ORG_B, siteId: A_S2 });
    expect(r.status).toBe(200);
    const row = await db.digitalTwinNode.findFirst({ where: { id } });
    expect(row?.organizationId).toBe(ORG_A);
    expect(row?.siteId).toBe(A_S1);
    expect(row?.displayName).toBe("renamed");
  });

  it("list responses are bounded and flag truncation", async () => {
    const r = await call(nodesRoute.GET as Handler, U_OWNER, ORG_A, "GET", "/api/digital-twin/nodes");
    expect(r.json.truncated).toBe(false);
    expect(Array.isArray(r.json.nodes)).toBe(true);
  });
});

// ── RV-02 · POST /relations: the same answer for every way an endpoint can be unavailable ──
describe("RV-02 — POST /relations endpoints: missing, foreign, unreachable-site and suspended-site are indistinguishable", () => {
  let own: string, own2: string, hiddenSameOrg: string, foreign: string;
  beforeEach(async () => {
    own = await seedNode(ORG_A, A_S1, "own");
    own2 = await seedNode(ORG_A, A_S1, "own-2");
    hiddenSameOrg = await seedNode(ORG_A, A_S2, "hidden-at-site-2");
    foreign = await seedNode(ORG_B, B_S1, "foreign-tenant");
  });

  /** Everything a caller can observe: status, full body, and the headers a client could key on. */
  async function observe(user: string, sourceNodeId: string, targetNodeId: string) {
    const res = await (relationsRoute.POST as Handler)(
      request(user, ORG_A, "POST", "/api/digital-twin/relations", { sourceNodeId, targetNodeId, relationType: "FEEDS" }),
    );
    const text = await res.text();
    const wanted = ["content-type", "cache-control", "retry-after", "www-authenticate", "location"];
    return {
      status: res.status,
      body: JSON.parse(text) as Row,
      text,
      headers: [...res.headers.entries()].filter(([k]) => wanted.includes(k)).sort(),
    };
  }
  const sameObservation = (a: Awaited<ReturnType<typeof observe>>, b: Awaited<ReturnType<typeof observe>>) => {
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
    expect(a.body.code).toBe(b.body.code);
    expect(a.body.error).toBe(b.body.error);
    expect(a.headers).toEqual(b.headers);
    expect(a.text).toBe(b.text); // byte-for-byte
  };

  it("SOURCE: fake == foreign tenant == same-org unreachable site (MANAGER of site 1)", async () => {
    const fake = await observe(U_MGR1, "dtp-no-such-node", own);
    const foreignTenant = await observe(U_MGR1, foreign, own);
    const unreachable = await observe(U_MGR1, hiddenSameOrg, own);
    sameObservation(unreachable, fake);
    sameObservation(foreignTenant, fake);
    expect(fake.status).toBe(404);
    expect(fake.body.code).toBe("SOURCE_NODE_NOT_FOUND");
  });

  it("TARGET: fake == foreign tenant == same-org unreachable site (MANAGER of site 1)", async () => {
    const fake = await observe(U_MGR1, own, "dtp-no-such-node");
    const foreignTenant = await observe(U_MGR1, own, foreign);
    const unreachable = await observe(U_MGR1, own, hiddenSameOrg);
    sameObservation(unreachable, fake);
    sameObservation(foreignTenant, fake);
    expect(fake.status).toBe(404);
    expect(fake.body.code).toBe("TARGET_NODE_NOT_FOUND");
  });

  it("SUSPENDED site membership: a real node there answers exactly like a fake one (source and target)", async () => {
    // U_SUSP is ACTIVE on site 1 and SUSPENDED on site 2.
    sameObservation(await observe(U_SUSP, hiddenSameOrg, own), await observe(U_SUSP, "dtp-no-such-node", own));
    sameObservation(await observe(U_SUSP, own, hiddenSameOrg), await observe(U_SUSP, own, "dtp-no-such-node"));
  });

  it("the user with NO UserSite row: every endpoint, real or not, is unavailable the same way", async () => {
    sameObservation(await observe(U_MGR0, own, own2), await observe(U_MGR0, "dtp-no-such-node", own2));
  });

  it("source and target keep their OWN codes, and never the generic NODE_NOT_FOUND", async () => {
    for (const [s, t] of [[hiddenSameOrg, own], [own, hiddenSameOrg], [foreign, own], [own, foreign], ["dtp-x", "dtp-y"]]) {
      const r = await observe(U_MGR1, s, t);
      expect(r.body.code, `${s} to ${t}`).not.toBe("NODE_NOT_FOUND");
      expect(["SOURCE_NODE_NOT_FOUND", "TARGET_NODE_NOT_FOUND"]).toContain(r.body.code);
    }
  });

  it("authorised source + hidden target → TARGET error; hidden source + authorised target → SOURCE error", async () => {
    expect((await observe(U_MGR1, own, hiddenSameOrg)).body.code).toBe("TARGET_NODE_NOT_FOUND");
    expect((await observe(U_MGR1, hiddenSameOrg, own)).body.code).toBe("SOURCE_NODE_NOT_FOUND");
  });

  it("no response names a hidden or foreign id", async () => {
    for (const id of [hiddenSameOrg, foreign]) {
      expect((await observe(U_MGR1, id, own)).text).not.toContain(id);
      expect((await observe(U_MGR1, own, id)).text).not.toContain(id);
    }
  });

  it("every refusal above created no relation and no audit row", async () => {
    await observe(U_MGR1, hiddenSameOrg, own);
    await observe(U_MGR1, own, hiddenSameOrg);
    await observe(U_MGR1, foreign, own);
    await observe(U_SUSP, own, hiddenSameOrg);
    expect(await countRels(ORG_A)).toBe(0);
    expect(await countRels(ORG_B)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
  });

  it("two reachable endpoints are still accepted (the repair did not close the happy path)", async () => {
    const r = await observe(U_MGR1, own, own2);
    expect(r.status).toBe(201);
    expect(await countRels(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
  });

  it("OWNER (all sites): a real cross-site pair is a DOMAIN refusal (422), not a 404 — both endpoints are visible to them", async () => {
    const r = await observe(U_OWNER, own, hiddenSameOrg);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("CROSS_SITE_RELATION");
  });
});

// ── RV-04 · a rolled-back mutation leaves no audit row AND no buffered success event ──
describe("RV-04 — rollback leaves no audit row and no in-process success event", () => {
  type BufferEvent = { entityId: string | null; action: string; outcome: string | null; organizationId: string | null; createdAt: string; metadata: Row };
  const g = globalThis as unknown as { __hermesAudit?: BufferEvent[] };
  const twinBuffer = () => (g.__hermesAudit ?? []).filter((e) => e.action.startsWith("digital_twin.") && e.organizationId === ORG_A);
  const SECRET = "s3cr3t-rv04-value-91c2";

  it("success: one node, one DB row, exactly one buffered event — published AFTER commit and consistent with the row", async () => {
    const before = twinBuffer().length;
    const r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "committed", nodeType: "AREA" });
    expect(r.status).toBe(201);
    const id = String((r.json.node as Row).id);
    expect(await countNodes(ORG_A)).toBe(1);
    const rows = await twinAudit(ORG_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityId: id, outcome: "success" });
    const added = twinBuffer().slice(0, twinBuffer().length - before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ entityId: id, outcome: "success", action: "digital_twin.node.created" });
  });

  it("audit persistence failure: mutation rolled back, 0 DB audit rows, 0 buffer growth, sanitised 500, no secret in logs", async () => {
    const before = twinBuffer().length;
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => { writes.push(String(chunk)); return true; }) as never);
    h.failAudit = true;
    let r: Awaited<ReturnType<typeof nodePost>>;
    try {
      r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "must-not-persist", nodeType: "SYSTEM", metadata: { apiToken: SECRET } });
    } finally {
      spy.mockRestore();
    }
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    expect(r.text).not.toContain(SECRET);
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(twinBuffer().length).toBe(before);
    expect(writes.join("")).not.toContain(SECRET);
  });

  it("a later statement failing AFTER the audit row was written: node, row and buffer all stay empty (real transaction)", async () => {
    const { runTwinTransaction, auditInTx } = await import("@/lib/digital-twin/tx");
    const before = twinBuffer().length;
    await expect(
      runTwinTransaction(async (tx) => {
        const n = await tx.digitalTwinNode.create({ data: { organizationId: ORG_A, siteId: A_S1, displayName: "phantom-candidate", nodeType: "AREA" } });
        await auditInTx(tx, { organizationId: ORG_A, userId: U_ADMIN, action: "digital_twin.node.created", entityId: String(n.id), siteId: A_S1 });
        // The audit row now exists inside the open transaction. Fail afterwards.
        throw new Error("simulated failure after the audit insert");
      }),
    ).rejects.toThrow("simulated failure");
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(twinBuffer().length).toBe(before);
  });

  it("retry after a failure: the second attempt succeeds and ONLY its event is observable", async () => {
    const before = twinBuffer().length;
    h.failAudit = true;
    expect((await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "retried", nodeType: "AREA" })).status).toBe(500);
    h.failAudit = false;
    const ok = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "retried", nodeType: "AREA" });
    expect(ok.status).toBe(201);
    const id = String((ok.json.node as Row).id);
    expect(await countNodes(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
    const added = twinBuffer().slice(0, twinBuffer().length - before);
    expect(added.map((e) => e.entityId)).toEqual([id]);
  });

  it("rolled-back relation and update mutations are equally invisible", async () => {
    const a = await seedNode(ORG_A, A_S1, "a");
    const b = await seedNode(ORG_A, A_S1, "b");
    const before = twinBuffer().length;
    h.failAudit = true;
    expect((await relPost(U_ADMIN, ORG_A, { sourceNodeId: a, targetNodeId: b, relationType: "FEEDS" })).status).toBe(500);
    expect((await nodePatch(U_ADMIN, ORG_A, a, { displayName: "renamed" })).status).toBe(500);
    h.failAudit = false;
    expect(await countRels(ORG_A)).toBe(0);
    expect((await db.digitalTwinNode.findFirst({ where: { id: a } }))?.displayName).toBe("a");
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(twinBuffer().length).toBe(before);
  });

  it("FALLBACK READER: with the audit database unreadable, the buffer shows the committed event and NOT the rolled-back one", async () => {
    const { filterAuditEvents } = await import("@/lib/audit/audit-service");
    const bufferIdsBefore = new Set(twinBuffer().map((e) => e.entityId));

    const ok = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "real", nodeType: "AREA" });
    const realId = String((ok.json.node as Row).id);
    h.failAudit = true;
    expect((await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "rolled-back", nodeType: "AREA" })).status).toBe(500);
    h.failAudit = false;

    h.breakAuditRead = true; // audit-service.model() now returns a client whose findMany throws → buffer fallback
    let fallback: Awaited<ReturnType<typeof filterAuditEvents>>;
    try {
      fallback = await filterAuditEvents({ entityType: "digital_twin", limit: 500 });
    } finally {
      h.breakAuditRead = false;
    }

    const fromThisTest = fallback.events.filter(
      (e) => e.organizationId === ORG_A && e.action === "digital_twin.node.created" && !bufferIdsBefore.has(e.entityId),
    );
    expect(fromThisTest.map((e) => e.entityId)).toEqual([realId]); // the fallback IS exercised, and holds exactly the committed event
  });

  it("secret-bearing metadata reaches neither the DB audit row nor the buffer", async () => {
    const r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "gateway", nodeType: "SYSTEM", metadata: { apiToken: SECRET, password: SECRET } });
    expect(r.status).toBe(201);
    expect(JSON.stringify(await twinAudit(ORG_A))).not.toContain(SECRET);
    expect(JSON.stringify(g.__hermesAudit ?? [])).not.toContain(SECRET);
  });
});

// ── FR-01 ───────────────────────────────────────────────────────────────────
describe("FR-01 — DATABASE_COMMIT_IS_AUTHORITATIVE: a post-commit publication failure never fails a committed mutation", () => {
  type BufferEvent = { entityId: string | null; action: string; organizationId: string | null };
  const g = globalThis as unknown as { __hermesAudit?: BufferEvent[] };
  const frozen = () => Object.freeze([]) as unknown as BufferEvent[];
  const CODE = "DIGITAL_TWIN_POST_COMMIT_AUDIT_BUFFER_PUBLISH_FAILED";
  let savedBuffer: BufferEvent[] | undefined;
  beforeEach(() => { savedBuffer = g.__hermesAudit; });
  afterEach(() => { g.__hermesAudit = savedBuffer ?? []; vi.restoreAllMocks(); });

  /** Runs `fn` while capturing everything written to stdout (the logger's sink). */
  async function captureStdout<T>(fn: () => Promise<T>): Promise<{ value: T; out: string }> {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => { writes.push(String(chunk)); return true; }) as never);
    try {
      return { value: await fn(), out: writes.join("") };
    } finally {
      spy.mockRestore();
    }
  }

  it("normal success: 201, one node, one audit row, one buffered event, nothing logged", async () => {
    g.__hermesAudit = [];
    const { value: r, out } = await captureStdout(() => nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "fr01-normal", nodeType: "AREA" }));
    expect(r.status).toBe(201);
    expect(await countNodes(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
    expect((g.__hermesAudit ?? []).filter((e) => e.organizationId === ORG_A)).toHaveLength(1);
    expect(out).not.toContain(CODE);
  });

  it("FROZEN buffer: still a real 201, exactly one node and one audit row, no duplicates, no exception reaches the route", async () => {
    g.__hermesAudit = frozen();
    const { value: r, out } = await captureStdout(() => nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "fr01-frozen", nodeType: "AREA", metadata: { apiToken: "s3cr3t-fr01-pg" } }));
    expect(r.status).toBe(201);
    const id = String((r.json.node as Row).id);
    expect(await countNodes(ORG_A)).toBe(1);
    const rows = await twinAudit(ORG_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityId: id, outcome: "success", action: "digital_twin.node.created" });
    expect(g.__hermesAudit).toHaveLength(0);              // the frozen buffer is untouched, not replaced
    expect(out).toContain(CODE);                          // reported once, with the fixed code…
    expect(out.split(CODE).length - 1).toBe(1);
    expect(out).not.toContain("s3cr3t-fr01-pg");          // …and never with payload or secrets
    expect(out).not.toContain(id);
  });

  it("a successful first request leaves nothing to retry; a deliberate re-send is an independent request (no idempotency claimed)", async () => {
    g.__hermesAudit = frozen();
    const body = { siteId: A_S1, displayName: "fr01-resend", nodeType: "AREA" };
    const first = await captureStdout(() => nodePost(U_ADMIN, ORG_A, body));
    expect(first.value.status).toBe(201);
    expect(await countNodes(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
    const second = await captureStdout(() => nodePost(U_ADMIN, ORG_A, body));
    expect(second.value.status).toBe(201);
    expect(await countNodes(ORG_A)).toBe(2);              // two requests → two independent mutations
    expect(await twinAudit(ORG_A)).toHaveLength(2);
  });

  it("a logger that throws is swallowed: node and audit row committed, response is still 201", async () => {
    g.__hermesAudit = frozen();
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => { throw new Error("logger sink down"); });
    const r = await nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "fr01-logger-down", nodeType: "AREA" });
    expect(r.status).toBe(201);
    expect(errorSpy).toHaveBeenCalledWith(CODE);
    expect(await countNodes(ORG_A)).toBe(1);
    expect(await twinAudit(ORG_A)).toHaveLength(1);
  });

  it("multi-event transaction on real PostgreSQL: the first publication fails, the rest are published in order, once each", async () => {
    const { runTwinTransaction, auditInTx } = await import("@/lib/digital-twin/tx");
    const arr: BufferEvent[] = [];
    const attempts: string[] = [];
    const real = arr.unshift.bind(arr) as (...e: BufferEvent[]) => number;
    let n = 0;
    (arr as unknown as { unshift: (...e: BufferEvent[]) => number }).unshift = (...e) => {
      n += 1; attempts.push(String(e[0]?.entityId));
      if (n === 1) throw new TypeError("buffer unavailable");
      return real(...e);
    };
    g.__hermesAudit = arr;
    const ids: string[] = [];
    const out = await captureStdout(() => runTwinTransaction(async (tx) => {
      for (const name of ["m1", "m2", "m3"]) {
        const node = await tx.digitalTwinNode.create({ data: { organizationId: ORG_A, siteId: A_S1, displayName: `fr01-${name}`, nodeType: "AREA" } });
        ids.push(String(node.id));
        await auditInTx(tx, { organizationId: ORG_A, userId: U_ADMIN, action: "digital_twin.node.created", entityId: String(node.id), siteId: A_S1 });
      }
      return "committed";
    }));
    expect(out.value).toBe("committed");
    expect(await countNodes(ORG_A)).toBe(3);
    expect((await twinAudit(ORG_A)).map((r) => String(r.entityId)).sort()).toEqual([...ids].sort());
    expect(attempts).toEqual(ids);                         // produced order, one attempt each
    expect(arr.map((e) => e.entityId)).toEqual([ids[2], ids[1]]); // m2, m3 published (newest first); m1 is the failed one
    expect(new Set(arr.map((e) => e.entityId)).size).toBe(arr.length);
    expect(out.out.split(CODE).length - 1).toBe(1);
  });

  it("GENUINE audit FK failure (unknown user): mutation rolled back, error propagates, nothing published or logged", async () => {
    const { runTwinTransaction, auditInTx } = await import("@/lib/digital-twin/tx");
    g.__hermesAudit = [];
    let thrown: unknown;
    const { out } = await captureStdout(async () => {
      try {
        await runTwinTransaction(async (tx) => {
          const node = await tx.digitalTwinNode.create({ data: { organizationId: ORG_A, siteId: A_S1, displayName: "fr01-fk", nodeType: "AREA" } });
          await auditInTx(tx, { organizationId: ORG_A, userId: "dtp-no-such-user", action: "digital_twin.node.created", entityId: String(node.id), siteId: A_S1 });
        });
      } catch (e) { thrown = e; }
    });
    expect(thrown).toBeInstanceOf(Error);                  // the DATABASE failure is not masked by the publication guard
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(g.__hermesAudit).toHaveLength(0);
    expect(out).not.toContain(CODE);
  });

  it("callback failure after the audit row was persisted: rollback, nothing published or logged", async () => {
    const { runTwinTransaction, auditInTx } = await import("@/lib/digital-twin/tx");
    g.__hermesAudit = [];
    let thrown: unknown;
    const { out } = await captureStdout(async () => {
      try {
        await runTwinTransaction(async (tx) => {
          const node = await tx.digitalTwinNode.create({ data: { organizationId: ORG_A, siteId: A_S1, displayName: "fr01-late", nodeType: "AREA" } });
          await auditInTx(tx, { organizationId: ORG_A, userId: U_ADMIN, action: "digital_twin.node.created", entityId: String(node.id), siteId: A_S1 });
          throw new Error("later statement failed");
        });
      } catch (e) { thrown = e; }
    });
    expect((thrown as Error).message).toBe("later statement failed");
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(g.__hermesAudit).toHaveLength(0);
    expect(out).not.toContain(CODE);
  });

  it("route-level audit failure with a frozen buffer: still a sanitised 500 and a full rollback (the guard does not mask it)", async () => {
    g.__hermesAudit = frozen();
    h.failAudit = true;
    const { value: r, out } = await captureStdout(() => nodePost(U_ADMIN, ORG_A, { siteId: A_S1, displayName: "fr01-audit-down", nodeType: "AREA" }));
    h.failAudit = false;
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: "Internal server error", code: "INTERNAL_ERROR" });
    expect(await countNodes(ORG_A)).toBe(0);
    expect(await twinAudit(ORG_A)).toHaveLength(0);
    expect(out).not.toContain(CODE);
  });
});
