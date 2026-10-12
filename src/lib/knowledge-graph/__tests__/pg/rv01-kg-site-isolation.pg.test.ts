/**
 * RV-01 — Industrial Knowledge Graph: tenant and SITE isolation, against REAL PostgreSQL.
 *
 * The graph is a materialised cache that stores only `organizationId`. Before the
 * fix only `ASSET` nodes were filtered by site, so a site-scoped member (or one with
 * no site at all) could read another site's telemetry tags (`tagPath`), Digital Twin
 * nodes, risk scores and engineering cases, and every route except the list one had
 * no site filter whatsoever.
 *
 * WHAT IS REAL: the six read routes, `requireOrgActor`, `requirePermission`,
 * `getAllowedSiteIds` (reads OrganizationMember / UserSite / IndustrialSite), the graph
 * builder (`rebuildKnowledgeGraph`) and every Prisma query.
 * WHAT IS MOCKED: only the token layer, `requirePlatformAuth` (the org the caller acts in
 * comes from the `x-test-org` header, exactly as the real guard derives it server side),
 * metering, and the audit WRITE (so the suite leaves no audit rows behind).
 *
 * Fixtures use the `rv01-` prefix; only they are removed and a leftover fails the run.
 * Runs under vitest.phase91-postgres.config.ts against a DISPOSABLE database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/lib/audit/audit-service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/audit/audit-service")>();
  return { ...orig, recordAuditEvent: async () => undefined };
});

const { getPrisma } = await import("@/lib/db/prisma");
const { rebuildKnowledgeGraph } = await import("@/lib/knowledge-graph/builder");
const listRoute = await import("@/app/api/industrial-graph/route");
const pathRoute = await import("@/app/api/industrial-graph/path/route");
const assetRoute = await import("@/app/api/industrial-graph/assets/[assetId]/route");
const failureRoute = await import("@/app/api/industrial-graph/failures/[failureModeId]/route");
const procedureRoute = await import("@/app/api/industrial-graph/procedures/[procedureId]/route");
const rootCauseRoute = await import("@/app/api/industrial-graph/root-causes/[rootCauseId]/route");

// ── Fixture ids ─────────────────────────────────────────────────────────────
const ORG_A = "rv01-org-a";
const ORG_B = "rv01-org-b";
const ORGS = [ORG_A, ORG_B];
const A1 = "rv01-a1", A2 = "rv01-a2", A3 = "rv01-a3", B1 = "rv01-b1";

const U = {
  OWNER_A: "rv01-u-owner-a",
  ADMIN_A: "rv01-u-admin-a",
  V_A1: "rv01-u-v-a1",
  V_A2: "rv01-u-v-a2",
  V_A1A3: "rv01-u-v-a1a3",
  V_NONE: "rv01-u-v-none",
  V_SUSP: "rv01-u-v-susp",
  V_POLL: "rv01-u-v-poll",
  ADMIN_B: "rv01-u-admin-b",
} as const;
const USERS = Object.values(U);

const ASSET = { a1: "rv01-a1-pump", a2: "rv01-a2-valve", a3: "rv01-a3-motor", b1: "rv01-b1-asset" };
const TAG = { a1: "rv01-a1-tag", a2: "rv01-a2-tag", a3: "rv01-a3-tag", b1: "rv01-b1-tag" };
const TWIN = {
  a1: "rv01-a1-twin", a2: "rv01-a2-twin", a3: "rv01-a3-twin", b1: "rv01-b1-twin",
  a1Area: "rv01-a1-area", a2Area: "rv01-a2-area", a1Line: "rv01-a1-line", mismatch: "rv01-mismatch-twin",
};
const RISK = { a1: "rv01-a1-risk", a2: "rv01-a2-risk", a3: "rv01-a3-risk", b1: "rv01-b1-risk" };
const CASE = { a1: "rv01-a1-case", a2: "rv01-a2-case", org: "rv01-org-case", mismatch: "rv01-mismatch-case", b1: "rv01-b1-case" };
const FM = { shared: "rv01-fm-shared", a2only: "rv01-fm-a2only", b: "rv01-fm-b" };
const RC = { shared: "rv01-rc-shared" };
const PROC = { shared: "rv01-proc-shared", a2only: "rv01-proc-a2only" };
const GHOST_TAG = "rv01-ghost-tag";

/** Strings that must NEVER reach a caller who is not entitled to the owning site / org. */
const CANARY = {
  a1: ["RV01-CANARY-ASSET-A1", "RV01-CANARY-TAG-A1", "/rv01/a1/pressure", "RV01-CANARY-TWIN-A1", "RV01-CANARY-CASE-A1", "RV01-CANARY-AREA-A1", ASSET.a1, TAG.a1, TWIN.a1, RISK.a1, CASE.a1],
  a2: ["RV01-CANARY-ASSET-A2", "RV01-CANARY-TAG-A2", "/rv01/a2/flow", "RV01-CANARY-TWIN-A2", "RV01-CANARY-CASE-A2", "RV01-CANARY-AREA-A2", "RV01-CANARY-MISMATCH", ASSET.a2, TAG.a2, TWIN.a2, TWIN.a2Area, RISK.a2, CASE.a2, CASE.mismatch, TWIN.mismatch],
  a3: ["RV01-CANARY-ASSET-A3", "RV01-CANARY-TAG-A3", "/rv01/a3/torque", "RV01-CANARY-TWIN-A3", ASSET.a3, TAG.a3, TWIN.a3, RISK.a3],
  b: ["RV01-CANARY-ASSET-B1", "RV01-CANARY-TAG-B1", "/rv01/b1/level", "RV01-CANARY-TWIN-B1", "RV01-CANARY-CASE-B1", "RV01-CANARY-FM-B", ASSET.b1, TAG.b1, TWIN.b1, RISK.b1, CASE.b1, FM.b, "rv01-org-b"],
  ghost: ["RV01-CANARY-GHOST", GHOST_TAG],
};

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  findFirst: (a?: unknown) => Promise<Row | null>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
let db: Record<string, Model>;

// ── Fixtures ────────────────────────────────────────────────────────────────
async function purge() {
  const orgWhere = { organizationId: { in: ORGS } };
  for (const m of ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot", "assetKnowledgeLink",
    "industrialEngineeringCase", "industrialRootCause", "industrialMaintenanceProcedure", "industrialFailureMode",
    "assetRiskScore", "digitalTwinRelation", "digitalTwinNode", "assetTag", "industrialAsset", "userSite", "organizationMember", "industrialSite"]) {
    await db[m].deleteMany({ where: orgWhere });
  }
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityType: "knowledge_graph", entityId: { in: ORGS } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}

async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const residue: Record<string, number> = {};
  for (const m of ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot", "assetKnowledgeLink", "industrialEngineeringCase",
    "industrialRootCause", "industrialMaintenanceProcedure", "industrialFailureMode", "assetRiskScore", "digitalTwinRelation", "digitalTwinNode", "assetTag",
    "industrialAsset", "userSite", "organizationMember", "industrialSite", "auditLog"]) {
    residue[m] = await db[m].count({ where: w });
  }
  residue.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  residue.user = await db.user.count({ where: { id: { in: USERS } } });
  const left = Object.entries(residue).filter(([, n]) => n !== 0);
  if (left.length > 0) throw new Error(`RV-01 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(left))}`);
}

const now = () => new Date();
async function seed() {
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  for (const [id, org] of [[A1, ORG_A], [A2, ORG_A], [A3, ORG_A], [B1, ORG_B]] as const) {
    await db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: now() } });
  }
  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER_A, ORG_A, "OWNER");
  await member(U.ADMIN_A, ORG_A, "ADMIN");
  for (const u of [U.V_A1, U.V_A2, U.V_A1A3, U.V_NONE, U.V_SUSP, U.V_POLL]) await member(u, ORG_A, "VIEWER");
  await member(U.ADMIN_B, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string, organizationId: string, status = "ACTIVE") =>
    db.userSite.create({ data: { userId, siteId, organizationId, role: "SITE_VIEWER", status } });
  await grant(U.V_A1, A1, ORG_A);
  await grant(U.V_A2, A2, ORG_A);
  await grant(U.V_A1A3, A1, ORG_A); await grant(U.V_A1A3, A3, ORG_A);
  await grant(U.V_SUSP, A1, ORG_A); await grant(U.V_SUSP, A2, ORG_A, "SUSPENDED");
  await grant(U.V_POLL, A1, ORG_A);
  await grant(U.V_POLL, B1, ORG_A); // POLLUTED grant: a row in org A that names a site owned by org B

  const asset = (id: string, org: string, site: string, name: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId: site, name } });
  await asset(ASSET.a1, ORG_A, A1, "RV01-CANARY-ASSET-A1");
  await asset(ASSET.a2, ORG_A, A2, "RV01-CANARY-ASSET-A2");
  await asset(ASSET.a3, ORG_A, A3, "RV01-CANARY-ASSET-A3");
  await asset(ASSET.b1, ORG_B, B1, "RV01-CANARY-ASSET-B1");

  const tag = (id: string, org: string, assetId: string, name: string, path: string) => db.assetTag.create({ data: { id, organizationId: org, assetId, tagName: name, tagPath: path } });
  await tag(TAG.a1, ORG_A, ASSET.a1, "RV01-CANARY-TAG-A1", "/rv01/a1/pressure");
  await tag(TAG.a2, ORG_A, ASSET.a2, "RV01-CANARY-TAG-A2", "/rv01/a2/flow");
  await tag(TAG.a3, ORG_A, ASSET.a3, "RV01-CANARY-TAG-A3", "/rv01/a3/torque");
  await tag(TAG.b1, ORG_B, ASSET.b1, "RV01-CANARY-TAG-B1", "/rv01/b1/level");

  const twin = (id: string, org: string, site: string, assetId: string | null, name: string, nodeType = "ASSET") =>
    db.digitalTwinNode.create({ data: { id, organizationId: org, siteId: site, assetId, displayName: name, nodeType } });
  await twin(TWIN.a1, ORG_A, A1, ASSET.a1, "RV01-CANARY-TWIN-A1");
  await twin(TWIN.a2, ORG_A, A2, ASSET.a2, "RV01-CANARY-TWIN-A2");
  await twin(TWIN.a3, ORG_A, A3, ASSET.a3, "RV01-CANARY-TWIN-A3");
  await twin(TWIN.b1, ORG_B, B1, ASSET.b1, "RV01-CANARY-TWIN-B1");
  await twin(TWIN.a1Area, ORG_A, A1, null, "RV01-CANARY-AREA-A1", "AREA");
  await twin(TWIN.a2Area, ORG_A, A2, null, "RV01-CANARY-AREA-A2", "AREA");
  await twin(TWIN.a1Line, ORG_A, A1, null, "RV01-CANARY-LINE-A1", "LINE");
  // A twin node of site A1 that points at an asset of site A2: ownership is AMBIGUOUS.
  await twin(TWIN.mismatch, ORG_A, A1, ASSET.a2, "RV01-CANARY-MISMATCH-TWIN");
  const rel = (id: string, s: string, t: string) => db.digitalTwinRelation.create({ data: { id, organizationId: ORG_A, sourceNodeId: s, targetNodeId: t, relationType: "CONNECTED_TO" } });
  await rel("rv01-rel-1", TWIN.a1, TWIN.a1Area);          // same site
  await rel("rv01-rel-2", TWIN.a1Area, TWIN.a2Area);      // cross-site
  await rel("rv01-rel-3", TWIN.a2Area, TWIN.a1Line);      // the ONLY route between a1Area and a1Line runs through site A2

  const risk = (id: string, org: string, assetId: string, score: number) => db.assetRiskScore.create({
    data: { id, organizationId: org, assetId, riskScore: score, confidence: "HIGH", healthTrendScore: 1, alarmTrendScore: 1, kpiDegradationScore: 1, telQualityScore: 1, telFreshnessScore: 1, criticalityFactor: 1 },
  });
  await risk(RISK.a1, ORG_A, ASSET.a1, 41); await risk(RISK.a2, ORG_A, ASSET.a2, 77); await risk(RISK.a3, ORG_A, ASSET.a3, 12); await risk(RISK.b1, ORG_B, ASSET.b1, 63);

  const fm = (id: string, org: string, name: string) => db.industrialFailureMode.create({ data: { id, organizationId: org, name, nameNorm: name.toLowerCase(), description: `${name} description`, severity: "HIGH" } });
  await fm(FM.shared, ORG_A, "RV01-FM-SHARED"); await fm(FM.a2only, ORG_A, "RV01-FM-A2ONLY"); await fm(FM.b, ORG_B, "RV01-CANARY-FM-B");
  await db.industrialRootCause.create({ data: { id: RC.shared, organizationId: ORG_A, failureModeId: FM.shared, description: "RV01 shared root cause", confidenceWeight: 0.8 } });
  const proc = (id: string, title: string) => db.industrialMaintenanceProcedure.create({ data: { id, organizationId: ORG_A, title, titleNorm: title.toLowerCase(), description: `${title} description` } });
  await proc(PROC.shared, "RV01-PROC-SHARED"); await proc(PROC.a2only, "RV01-PROC-A2ONLY");

  const eCase = (id: string, org: string, title: string, siteId: string | null, assetId: string | null, failureModeId: string | null) =>
    db.industrialEngineeringCase.create({ data: { id, organizationId: org, title, titleNorm: title.toLowerCase(), siteId, assetId, failureModeId } });
  await eCase(CASE.a1, ORG_A, "RV01-CANARY-CASE-A1", A1, ASSET.a1, FM.shared);
  await eCase(CASE.a2, ORG_A, "RV01-CANARY-CASE-A2", A2, ASSET.a2, FM.shared);
  await eCase(CASE.org, ORG_A, "RV01-ORG-LEVEL-CASE", null, null, FM.shared);                // organisation-level / ambiguous: OWNER and ADMIN only
  await eCase(CASE.mismatch, ORG_A, "RV01-CANARY-MISMATCH-CASE", A1, ASSET.a2, FM.a2only);   // names site A1 but an asset of A2: ambiguous (own failure mode ⇒ its OBSERVED_ON edge cannot overwrite another case's)
  await eCase(CASE.b1, ORG_B, "RV01-CANARY-CASE-B1", B1, ASSET.b1, FM.b);

  const link = (id: string, assetId: string, failureModeId: string | null, procedureId: string | null) =>
    db.assetKnowledgeLink.create({ data: { id, organizationId: ORG_A, assetId, failureModeId, procedureId } });
  await link("rv01-l1", ASSET.a1, FM.shared, null); await link("rv01-l2", ASSET.a1, null, PROC.shared);   // FM.shared MITIGATED_BY PROC.shared, provenance = site A1
  await link("rv01-l3", ASSET.a2, FM.a2only, null); await link("rv01-l4", ASSET.a2, null, PROC.a2only);   // FM.a2only MITIGATED_BY PROC.a2only, provenance = site A2 ONLY

  await rebuildKnowledgeGraph(ORG_A);
  await rebuildKnowledgeGraph(ORG_B);

  // A stale cache entry whose source row no longer exists (the cache is only rebuilt on demand).
  const asset1 = await db.industrialKnowledgeGraphNode.findFirst({ where: { organizationId: ORG_A, nodeType: "ASSET", entityId: ASSET.a1 } });
  const ghost = await db.industrialKnowledgeGraphNode.create({ data: { organizationId: ORG_A, nodeType: "TELEMETRY_TAG", entityId: GHOST_TAG, label: "RV01-CANARY-GHOST", metadata: { tagPath: "/rv01/ghost", assetId: ASSET.a1 } } });
  await db.industrialKnowledgeGraphEdge.create({ data: { organizationId: ORG_A, sourceNodeId: String(ghost.id), targetNodeId: String(asset1?.id), edgeType: "CONNECTED_TO", weight: 0.5, evidence: { tagPath: "/rv01/ghost" } } });
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Record<string, Model>;
  await purge();
  await seed();
}, 300000);

afterAll(async () => {
  if (!db) return;
  await purge();
  await assertNoResidue();
}, 300000);

// ── Helpers ─────────────────────────────────────────────────────────────────
interface GraphNode { id: string; nodeType: string; entityId: string; label: string; metadata: Row; organizationId: string }
interface GraphEdge { id: string; sourceNodeId: string; targetNodeId: string; edgeType: string; evidence: Row; organizationId: string }
interface GraphBody { nodes: GraphNode[]; edges: GraphEdge[]; nodeCount: number; edgeCount: number; nodesByType: Record<string, number>; edgesByType: Record<string, number>; staleness: Row }

const asRequest = (user: string, org: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method: "GET", headers: { cookie: `hermes_at=t:${user}`, "x-test-org": org } });
async function settle(res: Response) {
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, text, json };
}
/** A route without dynamic segments. */
const getPlain = async (handler: (req: NextRequest) => Promise<Response>, user: string, org: string, path: string) =>
  settle(await handler(asRequest(user, org, path)));
/** A route with dynamic segments; `P` is checked against the route's own parameter type. */
const getWith = async <P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>,
  user: string, org: string, path: string, params: P,
) => settle(await handler(asRequest(user, org, path), { params: Promise.resolve(params) }));

const graph = async (user: string, org = ORG_A, query = "") => {
  const r = await getPlain(listRoute.GET, user, org, `/api/industrial-graph${query}`);
  expect(r.status).toBe(200);
  return { ...r, body: r.json as unknown as GraphBody };
};
const entityIds = (b: GraphBody, type?: string) => b.nodes.filter((n) => !type || n.nodeType === type).map((n) => n.entityId).sort();
const kgNodeId = async (org: string, nodeType: string, entityId: string) => String((await db.industrialKnowledgeGraphNode.findFirst({ where: { organizationId: org, nodeType, entityId } }))?.id);
const leaks = (text: string, ...groups: string[][]) => groups.flat().filter((c) => text.includes(c));

function expectGraphIsSelfConsistent(b: GraphBody) {
  const ids = new Set(b.nodes.map((n) => n.id));
  for (const e of b.edges) {
    expect(ids.has(e.sourceNodeId), `dangling source ${e.sourceNodeId}`).toBe(true);
    expect(ids.has(e.targetNodeId), `dangling target ${e.targetNodeId}`).toBe(true);
  }
  expect(b.nodeCount).toBe(b.nodes.length);
  expect(b.edgeCount).toBe(b.edges.length);
  expect(Object.values(b.nodesByType).reduce((a, c) => a + c, 0)).toBe(b.nodes.length);
  expect(Object.values(b.edgesByType).reduce((a, c) => a + c, 0)).toBe(b.edges.length);
}
const edgeBetween = (b: GraphBody, type: string, fromEntity: string, toEntity: string) => {
  const byEntity = new Map(b.nodes.map((n) => [n.id, n.entityId]));
  return b.edges.some((e) => e.edgeType === type && byEntity.get(e.sourceNodeId) === fromEntity && byEntity.get(e.targetNodeId) === toEntity);
};

const CATALOG = [FM.shared, FM.a2only, RC.shared, PROC.shared, PROC.a2only, CASE.org];
const SITE_SCOPED_TYPES = ["ASSET", "TELEMETRY_TAG", "DIGITAL_TWIN_NODE", "PREDICTIVE_RISK"];

// ── 1. the list route ───────────────────────────────────────────────────────
describe("GET /api/industrial-graph — site and tenant isolation", () => {
  it("OWNER and ADMIN of org A see every live node of org A and nothing of org B (positive contract)", async () => {
    for (const user of [U.OWNER_A, U.ADMIN_A]) {
      const { body, text } = await graph(user);
      expect(Object.keys(body).sort()).toEqual(["edgeCount", "edges", "nodeCount", "nodes", "nodesByType", "edgesByType", "staleness"].sort());
      expect(entityIds(body, "ASSET")).toEqual([ASSET.a1, ASSET.a2, ASSET.a3].sort());
      expect(entityIds(body, "TELEMETRY_TAG")).toEqual([TAG.a1, TAG.a2, TAG.a3].sort());
      expect(entityIds(body, "DIGITAL_TWIN_NODE")).toEqual([TWIN.a1, TWIN.a2, TWIN.a3, TWIN.a1Area, TWIN.a2Area, TWIN.a1Line, TWIN.mismatch].sort());
      expect(entityIds(body, "PREDICTIVE_RISK")).toHaveLength(3);
      expect(entityIds(body, "ENGINEERING_CASE")).toEqual([CASE.a1, CASE.a2, CASE.org].sort());   // the site/asset-ambiguous case is hidden from everyone
      for (const id of CATALOG.filter((c) => c !== CASE.org)) expect(entityIds(body)).toContain(id);
      expect(leaks(text, CANARY.b, CANARY.ghost)).toEqual([]);          // other tenant + a stale orphan never appear
      expect(body.nodes.every((n) => n.organizationId === ORG_A)).toBe(true);
      expect(edgeBetween(body, "MITIGATED_BY", FM.a2only, PROC.a2only)).toBe(true);
      expectGraphIsSelfConsistent(body);
    }
  });

  it("a viewer of site A1 sees ONLY A1 data: asset, tag (and its tagPath), twin node, risk, case — and no A2/A3/B canary anywhere", async () => {
    const { body, text } = await graph(U.V_A1);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.a1]);
    expect(entityIds(body, "TELEMETRY_TAG")).toEqual([TAG.a1]);
    expect(entityIds(body, "DIGITAL_TWIN_NODE")).toEqual([TWIN.a1, TWIN.a1Area, TWIN.a1Line].sort());
    expect(entityIds(body, "PREDICTIVE_RISK")).toEqual([RISK.a1]);
    expect(entityIds(body, "ENGINEERING_CASE")).toEqual([CASE.a1]);                            // not the organisation-level case any more
    expect(leaks(text, CANARY.a2, CANARY.a3, CANARY.b, CANARY.ghost)).toEqual([]);
    expect(text).not.toContain("RV01-ORG-LEVEL-CASE");
    expect(text).toContain("/rv01/a1/pressure");                          // the viewer's OWN tagPath is still returned
    expectGraphIsSelfConsistent(body);
  });

  it("a viewer of site A2 sees only A2 data (the symmetric case)", async () => {
    const { body, text } = await graph(U.V_A2);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.a2]);
    expect(entityIds(body, "TELEMETRY_TAG")).toEqual([TAG.a2]);
    expect(entityIds(body, "DIGITAL_TWIN_NODE")).toEqual([TWIN.a2, TWIN.a2Area].sort());
    expect(leaks(text, CANARY.a1, CANARY.a3, CANARY.b, CANARY.ghost)).toEqual([]);
    expectGraphIsSelfConsistent(body);
  });

  it("a multi-site viewer sees exactly the union of the sites assigned to it", async () => {
    const { body, text } = await graph(U.V_A1A3);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.a1, ASSET.a3].sort());
    expect(entityIds(body, "TELEMETRY_TAG")).toEqual([TAG.a1, TAG.a3].sort());
    expect(leaks(text, CANARY.a2, CANARY.b)).toEqual([]);
    expectGraphIsSelfConsistent(body);
  });

  it("a SUSPENDED site grant gives no access to that site", async () => {
    const { body, text } = await graph(U.V_SUSP);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.a1]);
    expect(leaks(text, CANARY.a2, CANARY.a3, CANARY.b)).toEqual([]);
  });

  it("a viewer with NO site assignment sees no site-scoped data and no case, no dangling edge and no leaked count", async () => {
    const { body, text } = await graph(U.V_NONE);
    for (const t of SITE_SCOPED_TYPES) expect(entityIds(body, t)).toEqual([]);
    expect(entityIds(body, "ENGINEERING_CASE")).toEqual([]);                   // the organisation-level case belongs to OWNER/ADMIN only
    expect(leaks(text, CANARY.a1, CANARY.a2, CANARY.a3, CANARY.b, CANARY.ghost)).toEqual([]);
    expect(body.nodesByType.ASSET ?? 0).toBe(0);
    expect(body.nodesByType.TELEMETRY_TAG ?? 0).toBe(0);
    expect(body.nodesByType.DIGITAL_TWIN_NODE ?? 0).toBe(0);
    expectGraphIsSelfConsistent(body);
  });

  it("a grant row that names ANOTHER ORGANISATION's site never widens the scope to that organisation", async () => {
    const { body, text } = await graph(U.V_POLL);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.a1]);
    expect(leaks(text, CANARY.b, CANARY.a2, CANARY.a3)).toEqual([]);
    expect(body.nodes.every((n) => n.organizationId === ORG_A)).toBe(true);
  });

  it("the other organisation's admin sees only its own graph", async () => {
    const { body, text } = await graph(U.ADMIN_B, ORG_B);
    expect(entityIds(body, "ASSET")).toEqual([ASSET.b1]);
    expect(leaks(text, CANARY.a1, CANARY.a2, CANARY.a3, [ASSET.a1, "rv01-org-a"])).toEqual([]);
    expect(body.nodes.every((n) => n.organizationId === ORG_B)).toBe(true);
  });

  it("an org-A admin acting in org B (not a member there) gets nothing from org B", async () => {
    const r = await getPlain(listRoute.GET, U.ADMIN_A, ORG_B, "/api/industrial-graph");
    expect(r.status).toBe(403);
    expect(leaks(r.text, CANARY.b)).toEqual([]);
  });

  it("client-supplied siteId / organizationId query parameters never widen the scope", async () => {
    const plain = await graph(U.V_A1);
    const hostile = await graph(U.V_A1, ORG_A, `?siteId=${A2}&organizationId=${ORG_B}&siteIds=${A2},${A3}`);
    expect(entityIds(hostile.body)).toEqual(entityIds(plain.body));
    expect(leaks(hostile.text, CANARY.a2, CANARY.a3, CANARY.b)).toEqual([]);
  });

  it("edges: no edge whose provenance lies in a hidden site (MITIGATED_BY via a hidden asset link) and no edge citing a hidden case", async () => {
    const a1 = await graph(U.V_A1);
    expect(edgeBetween(a1.body, "MITIGATED_BY", FM.shared, PROC.shared)).toBe(true);     // provenance: asset of A1
    expect(edgeBetween(a1.body, "MITIGATED_BY", FM.a2only, PROC.a2only)).toBe(false);   // provenance: asset of A2 only
    const a2 = await graph(U.V_A2);
    expect(edgeBetween(a2.body, "MITIGATED_BY", FM.a2only, PROC.a2only)).toBe(true);
    expect(edgeBetween(a2.body, "MITIGATED_BY", FM.shared, PROC.shared)).toBe(false);
    // OBSERVED_ON FM -> A2 asset is evidenced by the ambiguous (hidden) case: an A2-only viewer must not see that case id
    expect(a2.text).not.toContain(CASE.mismatch);
    expect(a2.body.edges.filter((e) => e.evidence.caseId === CASE.mismatch)).toEqual([]);
    // no twin<->twin edge crosses a site boundary for a one-site viewer
    expect(a1.body.edges.filter((e) => e.edgeType === "CONNECTED_TO").every((e) => {
      const ends = new Set(a1.body.nodes.map((n) => n.id));
      return ends.has(e.sourceNodeId) && ends.has(e.targetNodeId);
    })).toBe(true);
  });

  it("an ambiguous twin node (site A1, asset of A2) and an ambiguous case are hidden from both one-site viewers", async () => {
    for (const user of [U.V_A1, U.V_A2]) {
      const { body } = await graph(user);
      expect(entityIds(body)).not.toContain(TWIN.mismatch);
      expect(entityIds(body)).not.toContain(CASE.mismatch);
    }
  });
});

// ── 2. traversal routes ─────────────────────────────────────────────────────
describe("GET /api/industrial-graph/path — traversal never crosses a hidden node", () => {
  it("the only route between two A1 twin nodes runs through site A2: found for the owner, NOT found for the A1 viewer", async () => {
    const from = await kgNodeId(ORG_A, "DIGITAL_TWIN_NODE", TWIN.a1Area);
    const to = await kgNodeId(ORG_A, "DIGITAL_TWIN_NODE", TWIN.a1Line);
    const q = `/api/industrial-graph/path?from=${from}&to=${to}`;
    const owner = await getPlain(pathRoute.GET, U.OWNER_A, ORG_A, q);
    expect(owner.json.found).toBe(true);
    const viewer = await getPlain(pathRoute.GET, U.V_A1, ORG_A, q);
    expect(viewer.status).toBe(200);
    expect(viewer.json.found).toBe(false);
    expect(leaks(viewer.text, CANARY.a2)).toEqual([]);
  });

  it("a path to a hidden node is indistinguishable from a path to a node that does not exist", async () => {
    const from = await kgNodeId(ORG_A, "ASSET", ASSET.a1);
    const hidden = await kgNodeId(ORG_A, "ASSET", ASSET.a2);
    const hiddenRes = await getPlain(pathRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/path?from=${from}&to=${hidden}`);
    const missingRes = await getPlain(pathRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/path?from=${from}&to=rv01-no-such-node`);
    const shape = (r: { status: number; json: Row }) => ({ status: r.status, found: r.json.found, path: r.json.path, totalCost: r.json.totalCost, ev: r.json.evidenceSummary });
    expect(shape(hiddenRes)).toEqual(shape(missingRes));
  });

  it("a path through the shared failure mode into an A2 asset does not exist for the A1 viewer but does for the owner", async () => {
    const from = await kgNodeId(ORG_A, "ASSET", ASSET.a1);
    const to = await kgNodeId(ORG_A, "ASSET", ASSET.a2);
    const q = `/api/industrial-graph/path?from=${from}&to=${to}`;
    expect((await getPlain(pathRoute.GET, U.OWNER_A, ORG_A, q)).json.found).toBe(true);
    const viewer = await getPlain(pathRoute.GET, U.V_A1, ORG_A, q);
    expect(viewer.json.found).toBe(false);
    expect(leaks(viewer.text, CANARY.a2, [FM.shared])).toEqual([]);
  });

  it("another tenant's node ids yield found:false and nothing else", async () => {
    const a1 = await kgNodeId(ORG_A, "ASSET", ASSET.a1);
    const b1 = await kgNodeId(ORG_B, "ASSET", ASSET.b1);
    const r = await getPlain(pathRoute.GET, U.ADMIN_B, ORG_B, `/api/industrial-graph/path?from=${a1}&to=${b1}`);
    expect(r.json.found).toBe(false);
    expect(leaks(r.text, CANARY.a1)).toEqual([]);
  });
});

describe("GET /api/industrial-graph/assets/[assetId] — subgraph and explanation", () => {
  it("an A2 asset is a plain 404 for the A1 viewer and for a no-site viewer", async () => {
    for (const user of [U.V_A1, U.V_NONE]) {
      const r = await getWith(assetRoute.GET, user, ORG_A, `/api/industrial-graph/assets/${ASSET.a2}`, { assetId: ASSET.a2 });
      expect(r.status).toBe(404);
      expect(leaks(r.text, CANARY.a2)).toEqual([]);
    }
  });

  it("the A1 asset's subgraph and explanation contain nothing from A2, even though they share a failure mode", async () => {
    const r = await getWith(assetRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/assets/${ASSET.a1}`, { assetId: ASSET.a1 });
    expect(r.status).toBe(200);
    expect(leaks(r.text, CANARY.a2, CANARY.a3, CANARY.b, CANARY.ghost)).toEqual([]);
    const sub = (r.json.subgraph as { nodes: GraphNode[]; edges: GraphEdge[] });
    const ids = new Set(sub.nodes.map((n) => n.id));
    expect(sub.edges.every((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId))).toBe(true);
  });

  it("the owner's view of the same asset still includes the A2 observation (positive regression)", async () => {
    const r = await getWith(assetRoute.GET, U.OWNER_A, ORG_A, `/api/industrial-graph/assets/${ASSET.a1}`, { assetId: ASSET.a1 });
    expect(r.status).toBe(200);
    expect(r.text).toContain("RV01-CANARY-ASSET-A2");
  });
});

describe("GET /api/industrial-graph/{failures,procedures,root-causes}/[id] — catalogue roots", () => {
  it("the shared failure mode's subgraph and explanation show an A1 viewer only A1 assets and cases", async () => {
    const r = await getWith(failureRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/failures/${FM.shared}`, { failureModeId: FM.shared });
    expect(r.status).toBe(200);
    expect(leaks(r.text, CANARY.a2, CANARY.a3, CANARY.b, CANARY.ghost)).toEqual([]);
    expect(r.text).toContain("RV01-CANARY-ASSET-A1");
    const explanation = r.json.explanation as { affectedAssets: { entityId: string }[]; engineeringCases: { entityId: string }[] };
    expect(explanation.affectedAssets.map((a) => a.entityId)).toEqual([ASSET.a1]);
    expect(explanation.engineeringCases.map((c) => c.entityId).sort()).toEqual([CASE.a1]);
  });

  it("a viewer with no site gets the catalogue entry but none of the assets or site cases around it", async () => {
    const r = await getWith(failureRoute.GET, U.V_NONE, ORG_A, `/api/industrial-graph/failures/${FM.shared}`, { failureModeId: FM.shared });
    expect(r.status).toBe(200);
    expect(leaks(r.text, CANARY.a1, CANARY.a2, CANARY.a3, CANARY.b)).toEqual([]);
    expect((r.json.explanation as { affectedAssets: unknown[] }).affectedAssets).toEqual([]);
  });

  it("the procedure and root-cause explanations are scoped the same way", async () => {
    const p = await getWith(procedureRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/procedures/${PROC.shared}`, { procedureId: PROC.shared });
    expect(p.status).toBe(200);
    expect(leaks(p.text, CANARY.a2, CANARY.a3, CANARY.b)).toEqual([]);
    const rc = await getWith(rootCauseRoute.GET, U.V_A1, ORG_A, `/api/industrial-graph/root-causes/${RC.shared}`, { rootCauseId: RC.shared });
    expect(rc.status).toBe(200);
    expect(leaks(rc.text, CANARY.a2, CANARY.a3, CANARY.b)).toEqual([]);
    // A root cause has no outbound edge, so its directed BFS is just the root; whatever it lists must still be A1-only.
    const affected = (rc.json.explanation as { affectedAssets: { entityId: string }[] }).affectedAssets.map((a) => a.entityId);
    expect(affected.every((id) => id === ASSET.a1)).toBe(true);
  });

  it("another organisation's failure-mode id returns an empty subgraph, never the owning tenant's data", async () => {
    const r = await getWith(failureRoute.GET, U.ADMIN_B, ORG_B, `/api/industrial-graph/failures/${FM.shared}`, { failureModeId: FM.shared });
    expect(r.status).toBe(200);
    expect((r.json.subgraph as { rootNode: unknown }).rootNode).toBeNull();
    expect(leaks(r.text, CANARY.a1, CANARY.a2, CANARY.a3, ["RV01-FM-SHARED"])).toEqual([]);
  });

  it("a failure-mode id that does not exist answers exactly like one the caller may not see (no oracle)", async () => {
    const hidden = await getWith(failureRoute.GET, U.ADMIN_B, ORG_B, `/api/industrial-graph/failures/${FM.shared}`, { failureModeId: FM.shared });
    const missing = await getWith(failureRoute.GET, U.ADMIN_B, ORG_B, `/api/industrial-graph/failures/rv01-no-such-fm`, { failureModeId: "rv01-no-such-fm" });
    const strip = (t: string, id: string) => t.split(id).join("<ID>");
    expect(strip(hidden.text, FM.shared).replace(/"lastBuiltAt":"[^"]*"/g, "")).toEqual(strip(missing.text, "rv01-no-such-fm").replace(/"lastBuiltAt":"[^"]*"/g, ""));
  });
});
