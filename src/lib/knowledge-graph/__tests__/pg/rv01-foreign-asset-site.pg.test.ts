/**
 * RV-01 regression (independent review M01) — a case whose asset belongs to ANOTHER organisation
 * but whose row points at a site of THIS organisation, against REAL PostgreSQL.
 *
 * WHY THIS STATE IS REACHABLE. `IndustrialAsset.siteId` is a plain foreign key to
 * `IndustrialSite(id)`; nothing in the database ties the asset's organisation to its site's
 * organisation (the only composite key is `UNIQUE (organizationId, id)` on the asset itself).
 * Legacy or hand-edited data can therefore hold an asset of organisation B that sits on a site
 * of organisation A. Such an asset must never make a case of organisation A readable:
 *
 *   - case.siteId = A1 (a site the viewer may read) + case.assetId = <org B asset on A1>
 *   - case.siteId = NULL                           + case.assetId = <org B asset on A1>
 *
 * The case policy (`case-visibility.ts`) joins the LIVE asset with `a.organizationId = <org>`. The
 * independent review showed that dropping that predicate was the one mutant no test killed: the
 * site test (`a.siteId = c.siteId`) alone happily accepts the foreign asset because the corrupt
 * row names the viewer's own site. This suite pins that predicate through the production SQL and
 * the real routes — no JS fake of the policy.
 *
 * REAL: routes, `requireOrgActor`, `getAllowedSiteIds`, the case policy SQL, the graph builder.
 * MOCKED: the token layer, `requirePlatformAuth`, metering and the audit WRITE.
 * Fixtures use the `rv01m-` prefix; only they are removed and any leftover fails the run.
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
const { rebuildKnowledgeGraph } = await import("@/lib/knowledge-graph/builder");
const { createGraphViewerScope } = await import("@/lib/knowledge-graph/visibility");
const { listVisibleCaseIds } = await import("@/lib/knowledge/case-visibility");
const casesRoute = await import("@/app/api/knowledge/cases/route");
const caseIdRoute = await import("@/app/api/knowledge/cases/[id]/route");
const searchRoute = await import("@/app/api/knowledge/search/route");
const failuresRoute = await import("@/app/api/knowledge/failures/route");
const graphRoute = await import("@/app/api/industrial-graph/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "rv01m-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A1 = `${P}site-a1`, B1 = `${P}site-b1`;
const OWN_ASSET = `${P}asset-own`;                 // org A, on A1: legitimate
const FOREIGN_ASSET = `${P}asset-foreign-on-a1`;   // org B, but its siteId is org A's A1: the corrupt row
const B_ASSET = `${P}asset-b1`;                    // org B, on org B's own site: legitimate for B
const FM = `${P}fm`;
const U = { OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`, VIEW1: `${P}u-view1`, MGR1: `${P}u-mgr1`, XADMIN: `${P}u-xadmin` } as const;
const USERS = Object.values(U);

const C = {
  okSite: `${P}c-ok-site`, okBoth: `${P}c-ok-both`, okAsset: `${P}c-ok-asset`,
  badSiteForeignAsset: `${P}c-bad-site-foreign-asset`,   // siteId A1 + the org-B asset on A1  (the exact M01 state)
  badAssetOnlyForeign: `${P}c-bad-asset-only-foreign`,   // assetId only, the org-B asset on A1
  orgB: `${P}c-org-b`,
} as const;
const VISIBLE = [C.okSite, C.okBoth, C.okAsset] as const;
const HIDDEN = [C.badSiteForeignAsset, C.badAssetOnlyForeign] as const;
const mark = (id: string) => `RVM-${id.replace(P, "").toUpperCase()}`;

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}
let db: Record<string, Model>;
const ORG_TABLES = ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot", "assetKnowledgeLink", "industrialEngineeringCase",
  "industrialFailureMode", "assetRiskScore", "digitalTwinRelation", "digitalTwinNode", "assetTag", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

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
  if (bad.length > 0) throw new Error(`M01 fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();

  const now = () => new Date();
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string) => db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: now() } });
  await site(A1, ORG_A); await site(B1, ORG_B);
  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN"); await member(U.VIEW1, ORG_A, "VIEWER"); await member(U.MGR1, ORG_A, "MANAGER"); await member(U.XADMIN, ORG_B, "ADMIN");
  for (const u of [U.VIEW1, U.MGR1]) await db.userSite.create({ data: { userId: u, siteId: A1, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });

  const asset = (id: string, org: string, siteId: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name` } });
  await asset(OWN_ASSET, ORG_A, A1);
  await asset(FOREIGN_ASSET, ORG_B, A1);       // the corrupt/legacy row: an organisation-B asset standing on organisation A's site
  await asset(B_ASSET, ORG_B, B1);
  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG_A, name: "RVM-FM", nameNorm: "rvm-fm", description: "d", severity: "HIGH" } });

  // The corrupt cases are the NEWEST: a page cut before authorisation would be full of them.
  const t = (iso: string) => new Date(iso);
  const kase = (id: string, org: string, siteId: string | null, assetId: string | null, updated: string) =>
    db.industrialEngineeringCase.create({ data: {
      id, organizationId: org, title: `${mark(id)} compressor failure`, titleNorm: `${mark(id).toLowerCase()} compressor failure`,
      diagnosis: `DIAG-${mark(id)}`, resolution: `RES-${mark(id)}`, symptoms: [], keywords: ["compressor"], siteId, assetId, failureModeId: org === ORG_A ? FM : null,
      createdAt: t(updated), updatedAt: t(updated),
    } });
  await kase(C.okSite, ORG_A, A1, null, "2026-01-01T00:00:00Z");
  await kase(C.okBoth, ORG_A, A1, OWN_ASSET, "2026-01-02T00:00:00Z");
  await kase(C.okAsset, ORG_A, null, OWN_ASSET, "2026-01-03T00:00:00Z");
  await kase(C.badSiteForeignAsset, ORG_A, A1, FOREIGN_ASSET, "2026-03-01T00:00:00Z");
  await kase(C.badAssetOnlyForeign, ORG_A, null, FOREIGN_ASSET, "2026-03-02T00:00:00Z");
  await kase(C.orgB, ORG_B, B1, B_ASSET, "2026-01-01T00:00:00Z");
  await rebuildKnowledgeGraph(ORG_A);
}, 600000);

afterAll(async () => {
  if (!db) return;
  await purge();
  await assertNoResidue();
}, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
const req = (user: string, org: string, method: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method, headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org } });
async function call(handler: unknown, user: string, path: string, id?: string, org = ORG_A) {
  const res = await (handler as (r: NextRequest, c?: { params: Promise<{ id: string }> }) => Promise<Response>)(req(user, org, "GET", path), id ? { params: Promise.resolve({ id }) } : undefined);
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
const idsOf = (r: { json: Row }, key = "cases") => ((r.json[key] as Row[]) ?? []).map((c) => String(c.id)).sort();
const sorted = (a: readonly string[]) => [...a].sort();
/** Anything that could identify the corrupt state: the case ids, their text, and the foreign asset's id. */
const leaks = (text: string) => [
  ...HIDDEN.filter((id) => text.includes(mark(id)) || text.includes(`DIAG-${mark(id)}`) || text.includes(`RES-${mark(id)}`) || text.includes(id)),
  ...(text.includes(FOREIGN_ASSET) ? ["<foreign asset id>"] : []),
];
const list = (u: string, q = "") => call(casesRoute.GET, u, `/api/knowledge/cases${q}`);

const READERS = [["OWNER", U.OWNER], ["ADMIN", U.ADMIN], ["MANAGER with one site", U.MGR1], ["VIEWER with one site", U.VIEW1]] as const;

describe("a case that names an organisation-B asset standing on organisation A's site is hidden from EVERY organisation-A actor", () => {
  it("the fixture really holds the corrupt state (the database accepts it)", async () => {
    expect(await db.industrialAsset.count({ where: { id: FOREIGN_ASSET, organizationId: ORG_B, siteId: A1 } })).toBe(1);
    expect(await db.industrialEngineeringCase.count({ where: { id: C.badSiteForeignAsset, organizationId: ORG_A, siteId: A1, assetId: FOREIGN_ASSET } })).toBe(1);
  });

  it.each(READERS)("list — %s sees the three legitimate cases, never the corrupt ones, and the page is full of VISIBLE cases", async (_n, user) => {
    const all = await list(user, "?limit=100");
    expect(all.status).toBe(200);
    expect(idsOf(all)).toEqual(sorted(VISIBLE));
    expect(leaks(all.text)).toEqual([]);
    // pagination after authorisation: the two NEWEST rows are the corrupt ones
    const page = await list(user, "?limit=2");
    expect(((page.json.cases as Row[]) ?? []).map((c) => c.id)).toEqual([C.okAsset, C.okBoth]);
    expect(leaks(page.text)).toEqual([]);
    // a filter by the corrupt asset's id yields nothing and does not echo it
    const byAsset = await list(user, `?assetId=${FOREIGN_ASSET}&limit=100`);
    expect(byAsset.json.cases).toEqual([]);
    expect(byAsset.text).not.toContain(FOREIGN_ASSET);
  });

  it.each(READERS)("detail — %s gets the normal not-found answer, byte-identical to a missing id", async (_n, user) => {
    const missing = await call(caseIdRoute.GET, user, `/api/knowledge/cases/${P}missing`, `${P}missing`);
    expect(missing.status).toBe(404);
    for (const id of HIDDEN) {
      const r = await call(caseIdRoute.GET, user, `/api/knowledge/cases/${id}`, id);
      expect(r.status, id).toBe(404);
      expect(r.text, id).toBe(missing.text);
      expect(leaks(r.text), id).toEqual([]);
    }
    // a legitimate case's related-case list never carries a corrupt one either
    const ok = await call(caseIdRoute.GET, user, `/api/knowledge/cases/${C.okSite}`, C.okSite);
    expect(ok.status).toBe(200);
    expect(leaks(ok.text)).toEqual([]);
  });

  it.each(READERS)("search — %s: case search and the global knowledge search expose no title, diagnosis or resolution, and the total excludes them", async (_n, user) => {
    const q = await list(user, "?q=compressor&limit=100");
    expect(idsOf(q)).toEqual(sorted(VISIBLE));
    expect(leaks(q.text)).toEqual([]);
    const s = await call(searchRoute.GET, user, "/api/knowledge/search?q=compressor&type=case&limit=50");
    expect(s.status).toBe(200);
    expect(idsOf(s, "results")).toEqual(sorted(VISIBLE));
    expect(s.json.total).toBe(VISIBLE.length);
    expect(leaks(s.text)).toEqual([]);
  });

  it.each(READERS)("failure lookup — %s: the failure-mode-linked cases of an own asset exclude the corrupt ones; the foreign asset is simply not found", async (_n, user) => {
    const own = await call(failuresRoute.GET, user, `/api/knowledge/failures?assetId=${OWN_ASSET}`);
    expect(own.status).toBe(200);
    const related = ((own.json.knowledge as { relatedCases: Row[] }).relatedCases ?? []).map((c) => String(c.id)).sort();
    expect(related).toEqual(sorted([C.okSite, C.okBoth, C.okAsset]));
    expect(leaks(own.text)).toEqual([]);
    const foreign = await call(failuresRoute.GET, user, `/api/knowledge/failures?assetId=${FOREIGN_ASSET}`);
    expect(foreign.status).toBe(404);
    expect(foreign.text).not.toContain(FOREIGN_ASSET);
  });

  it("the production policy SQL itself: the visible id set is exactly the legitimate cases for an administrator scope and for a one-site scope", async () => {
    const d = (await getPrisma()) as unknown as Record<string, unknown>;
    const admin = await listVisibleCaseIds(d, createGraphViewerScope(ORG_A, [A1], true), { limit: 100 });
    const viewer = await listVisibleCaseIds(d, createGraphViewerScope(ORG_A, [A1], false), { limit: 100 });
    expect(sorted(admin)).toEqual(sorted(VISIBLE));
    expect(sorted(viewer)).toEqual(sorted(VISIBLE));
    // the corrupt cases are also invisible through a failure-mode filter and through an asset filter
    expect(sorted(await listVisibleCaseIds(d, createGraphViewerScope(ORG_A, [A1], true), { failureModeIds: [FM], limit: 100 }))).toEqual(sorted(VISIBLE));
    expect(await listVisibleCaseIds(d, createGraphViewerScope(ORG_A, [A1], true), { assetId: FOREIGN_ASSET, limit: 100 })).toEqual([]);
  });

  it("the Knowledge Graph shows no node for a corrupt case and carries no reference to the foreign asset", async () => {
    for (const user of [U.OWNER, U.ADMIN, U.MGR1, U.VIEW1]) {
      const g = await call(graphRoute.GET, user, "/api/industrial-graph");
      expect(g.status).toBe(200);
      const caseNodes = ((g.json.nodes as Row[]) ?? []).filter((n) => n.nodeType === "ENGINEERING_CASE").map((n) => String(n.entityId)).sort();
      expect(caseNodes, user).toEqual(sorted(VISIBLE));
      expect(leaks(g.text), user).toEqual([]);
    }
  });

  it("organisation B is unaffected: its own admin sees only its own case, and none of organisation A's", async () => {
    const r = await call(casesRoute.GET, U.XADMIN, "/api/knowledge/cases?limit=100", undefined, ORG_B);
    expect(idsOf(r)).toEqual([C.orgB]);
    expect(leaks(r.text)).toEqual([]);
    expect(VISIBLE.some((id) => r.text.includes(id))).toBe(false);
  });
});
