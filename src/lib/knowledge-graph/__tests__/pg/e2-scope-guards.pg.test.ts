/**
 * Independent review RV-T2 — two guards that no earlier test exercised, proven against REAL PostgreSQL.
 *
 *   1. A `ScopedGraphContext` is bound to the scope it was resolved for. It must NOT be reused under a
 *      different scope — neither a NARROWER set of sites, nor the same sites WITHOUT organisation-level
 *      access. Reusing it would let a caller read a graph that was resolved for a wider viewer.
 *   2. `GET /api/industrial/assets`: a session caller is site-scoped; only the machine (API-key) path,
 *      which the server itself authorises as `organizationWide`, sees every asset of the organisation.
 *      The client cannot widen the answer with `?siteId=`.
 *
 * REAL: the routes, the scope resolution (OrganizationMember / UserSite / IndustrialSite), the graph
 * query layer, Prisma, PostgreSQL. MOCKED: the token layer, `requirePlatformAuth` (the test header
 * `x-test-auth: apikey` selects the machine path; the org always comes from `x-test-org`) and metering.
 * Fixtures use the `e2-g-` prefix; only they are removed, and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/jwt", () => ({ verifyAccessToken: async (t: string) => (t.startsWith("t:") ? { sub: t.slice(2) } : null) }));
vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async (req: NextRequest) => {
    const tok = req.cookies.get("hermes_at")?.value;
    if (req.headers.get("x-test-auth") === "apikey") {
      return { ctx: { userId: null, orgId: req.headers.get("x-test-org"), authMethod: "apikey", scopes: ["industrial.read"] } };
    }
    if (!tok) return { error: "Authentication required", status: 401 };
    return { ctx: { userId: tok.slice(2), orgId: req.headers.get("x-test-org"), authMethod: "jwt", scopes: ["admin"] } };
  },
}));
vi.mock("@/lib/api/meter", () => ({ meterIndustrialEvent: () => undefined }));

const { getPrisma } = await import("@/lib/db/prisma");
const { createGraphViewerScope } = await import("@/lib/knowledge-graph/visibility");
const { loadScopedGraphContext, findShortestEvidencePath, getRootCauseGraph } = await import("@/lib/knowledge-graph/query");
const assetsRoute = await import("@/app/api/industrial/assets/route");

const P = "e2-g-";
const ORG = `${P}org`;
const S1 = `${P}s1`, S2 = `${P}s2`, S3 = `${P}s3`;
const A1 = `${P}a1`, A2 = `${P}a2`, A3 = `${P}a3`;
/** ENGINEER with an ACTIVE grant on S1 only. S2 is another ACTIVE site; S3 is INACTIVE. */
const ENG = `${P}u-eng`;
const USERS = [ENG];
const CASE0 = `${P}case0`;
const N_A1 = `${P}n-a1`, N_A2 = `${P}n-a2`, N_C0 = `${P}n-c0`;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
const ORG_TABLES = ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "industrialEngineeringCase", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: { organizationId: ORG } });
  left.organization = await db.organization.count({ where: { id: ORG } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  await db.user.create({ data: { id: ENG, name: ENG, email: `${ENG}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  await db.organization.create({ data: { id: ORG, name: ORG, slug: ORG, updatedAt: now() } });
  for (const [id, status] of [[S1, "ACTIVE"], [S2, "ACTIVE"], [S3, "INACTIVE"]] as const) {
    await db.industrialSite.create({ data: { id, organizationId: ORG, name: id, slug: id, status, updatedAt: now() } });
  }
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: ENG, siteId: S1, organizationId: ORG, role: "SITE_VIEWER", status: "ACTIVE" } });
  for (const [id, siteId] of [[A1, S1], [A2, S2], [A3, S3]] as const) {
    await db.industrialAsset.create({ data: { id, organizationId: ORG, siteId, name: `${id}-name` } });
  }
  // An organisation-level case (no site, no asset): reachable only with organisation-level graph access.
  await db.industrialEngineeringCase.create({ data: { id: CASE0, organizationId: ORG, title: "E2G-ORG-LEVEL", titleNorm: "e2g-org-level", symptoms: [], keywords: [] } });

  const node = (id: string, nodeType: string, entityId: string) =>
    db.industrialKnowledgeGraphNode.create({ data: { id, organizationId: ORG, nodeType, entityId, label: id } });
  await node(N_A1, "ASSET", A1); await node(N_A2, "ASSET", A2); await node(N_C0, "ENGINEERING_CASE", CASE0);
  const edge = (id: string, sourceNodeId: string, targetNodeId: string, edgeType: string) =>
    db.industrialKnowledgeGraphEdge.create({ data: { id, organizationId: ORG, sourceNodeId, targetNodeId, edgeType, weight: 0.9 } });
  await edge(`${P}e1`, N_A1, N_A2, "CONNECTED_TO");
  await edge(`${P}e2`, N_A1, N_C0, "DOCUMENTED_IN");
}

beforeAll(async () => {
  const c = await getPrisma(); if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();
  await seed();
}, 600000);
afterAll(async () => { if (db) await purge(); }, 600000);

describe("e2 RV-T2 — a ScopedGraphContext cannot widen a different scope", () => {
  const admin = () => createGraphViewerScope(ORG, [S1, S2], true);
  const narrowerSites = () => createGraphViewerScope(ORG, [S1], false);
  const sameSitesWithoutOrgLevel = () => createGraphViewerScope(ORG, [S1, S2], false);

  it("e2-G0 positive control: the wide scope with its own context reaches the other site and the org-level case", async () => {
    const scope = admin();
    const ctx = await loadScopedGraphContext(scope);
    expect((await findShortestEvidencePath(scope, N_A1, N_A2, 20, ctx)).found).toBe(true);
    expect((await findShortestEvidencePath(scope, N_A1, N_C0, 20, ctx)).found).toBe(true);
  });

  it("e2-G1 a context resolved for a WIDER set of sites is not used for a narrower scope", async () => {
    const ctx = await loadScopedGraphContext(admin());
    const narrow = narrowerSites();
    expect((await findShortestEvidencePath(narrow, N_A1, N_A2, 20, ctx)).found).toBe(false);
    expect((await getRootCauseGraph(narrow, "none", 20, ctx)).nodes).toEqual([]);
  });

  it("e2-G2 a context resolved WITH organisation-level access is not used for a scope without it (same sites)", async () => {
    const ctx = await loadScopedGraphContext(admin());
    const scope = sameSitesWithoutOrgLevel();
    expect((await findShortestEvidencePath(scope, N_A1, N_C0, 20, ctx)).found).toBe(false);
    // The site part of the two scopes is identical, so the site-level path stays reachable: only the org-level difference is cut.
    expect((await findShortestEvidencePath(scope, N_A1, N_A2, 20, ctx)).found).toBe(true);
  });
});

describe("e2 RV-T2 — GET /api/industrial/assets is site-scoped for sessions, organisation-wide only for the machine path", () => {
  const get = async (headers: Record<string, string>, query = "") => {
    const res = await (assetsRoute.GET as (r: NextRequest) => Promise<Response>)(
      new NextRequest(new URL(`/api/industrial/assets${query}`, "http://localhost"), { method: "GET", headers: { "x-test-org": ORG, ...headers } }),
    );
    const body = JSON.parse(await res.text()) as { assets?: { id: string }[] };
    return { status: res.status, ids: (body.assets ?? []).map((a) => a.id).sort() };
  };
  const session = { cookie: `hermes_at=t:${ENG}` };

  it("e2-S1 a session member sees ONLY the assets of their granted ACTIVE site", async () => {
    const r = await get(session);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([A1]);
  });

  it("e2-S2 a session member cannot widen the answer with ?siteId= of a site without a grant", async () => {
    expect((await get(session, `?siteId=${S2}`)).ids).toEqual([]);
    expect((await get(session, `?siteId=${S3}`)).ids).toEqual([]);
  });

  it("e2-S3 only the machine (API-key) path is organisation-wide — the documented pre-existing contract", async () => {
    const r = await get({ "x-test-auth": "apikey" });
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([A1, A2, A3]);
  });
});

describe("e2 scope-guards teardown", () => {
  it("e2-GZ leaves zero residue", async () => {
    await purge();
    expect(await residue()).toEqual({});
  });
});
