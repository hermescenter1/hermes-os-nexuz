/**
 * RV-01 corrective remediation — engineering-case visibility, write guards and the rebuild
 * summary, against REAL PostgreSQL and the REAL routes.
 *
 * REAL: the routes, `requireOrgActor`, `requirePermission`, `getAllowedSiteIds` (reads
 * OrganizationMember / UserSite / IndustrialSite), the case policy SQL, the graph builder, Prisma.
 * MOCKED: only the token layer, `requirePlatformAuth` (the org comes from `x-test-org`, exactly as
 * the real guard derives it server side), metering, and the audit WRITE (so no audit rows remain).
 *
 * Fixtures use the `rv01c-` prefix; only they are removed and any leftover fails the run.
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
const casesRoute = await import("@/app/api/knowledge/cases/route");
const caseIdRoute = await import("@/app/api/knowledge/cases/[id]/route");
const searchRoute = await import("@/app/api/knowledge/search/route");
const failuresRoute = await import("@/app/api/knowledge/failures/route");
const graphRoute = await import("@/app/api/industrial-graph/route");
const rebuildRoute = await import("@/app/api/industrial-graph/rebuild/route");

// ── Fixture ids ─────────────────────────────────────────────────────────────
const P = "rv01c-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const S1 = `${P}s1`, S2 = `${P}s2`, S3 = `${P}s3`, SI = `${P}s-inactive`, SB = `${P}sb`;
const A1 = `${P}a1`, A2 = `${P}a2`, A3 = `${P}a3`, AI = `${P}a-inactive`, AB = `${P}ab`;
const FM = `${P}fm`;
const U = {
  OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`, MGR1: `${P}u-mgr1`, MGR12: `${P}u-mgr12`, ENG1: `${P}u-eng1`, VIEW1: `${P}u-view1`,
  BILL1: `${P}u-bill1`, NONE: `${P}u-none`, VINACT: `${P}u-vinact`, VSUSP: `${P}u-vsusp`, XADMIN: `${P}u-xadmin`,
} as const;
const USERS = Object.values(U);

const C = {
  s1: `${P}c-s1`, s2: `${P}c-s2`, s3: `${P}c-s3`, a1: `${P}c-a1`, a2: `${P}c-a2`, s1a1: `${P}c-s1a1`, s2a2: `${P}c-s2a2`,
  bad: `${P}c-bad-s1-asset2`, bad2: `${P}c-bad-s2-asset1`, org: `${P}c-org-level`, inactive: `${P}c-inactive-site`, ai: `${P}c-inactive-asset`,
  foreignAsset: `${P}c-foreign-asset`, foreignSite: `${P}c-foreign-site`, dangling: `${P}c-dangling-asset`, b: `${P}c-orgb`,
} as const;
/** Marker words that must never reach someone who is not entitled to the case. */
const mark = (id: string) => `RVC-${id.replace(P, "").toUpperCase()}`;

const VISIBLE = {
  all: [C.s1, C.s2, C.s3, C.a1, C.a2, C.s1a1, C.s2a2, C.org],
  s1: [C.s1, C.a1, C.s1a1],
  s12: [C.s1, C.a1, C.s1a1, C.s2, C.a2, C.s2a2],
} as const;
const NEVER = [C.bad, C.bad2, C.inactive, C.ai, C.foreignAsset, C.foreignSite, C.dangling, C.b];   // hidden from EVERY org-A actor, OWNER included
const ALL_A_IDS = [...Object.values(C)].filter((c) => c !== C.b);

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; createMany: (a: unknown) => Promise<unknown>; findFirst: (a?: unknown) => Promise<Row | null>; findMany: (a?: unknown) => Promise<Row[]>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
const ORG_TABLES = ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot", "assetKnowledgeLink", "industrialEngineeringCase", "industrialRootCause",
  "industrialMaintenanceProcedure", "industrialFailureMode", "assetRiskScore", "digitalTwinRelation", "digitalTwinNode", "assetTag", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  const bad = Object.entries(left).filter(([, n]) => n !== 0);
  if (bad.length > 0) throw new Error(`RV-01 case fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

const now = () => new Date();
async function seed() {
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  await site(S1, ORG_A); await site(S2, ORG_A); await site(S3, ORG_A); await site(SI, ORG_A, "INACTIVE"); await site(SB, ORG_B);
  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN"); await member(U.MGR1, ORG_A, "MANAGER"); await member(U.MGR12, ORG_A, "MANAGER");
  await member(U.ENG1, ORG_A, "ENGINEER"); await member(U.VIEW1, ORG_A, "VIEWER"); await member(U.BILL1, ORG_A, "BILLING_ADMIN"); await member(U.NONE, ORG_A, "VIEWER");
  await member(U.VINACT, ORG_A, "VIEWER"); await member(U.VSUSP, ORG_A, "VIEWER"); await member(U.XADMIN, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string, status = "ACTIVE") => db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role: "SITE_VIEWER", status } });
  for (const u of [U.MGR1, U.ENG1, U.VIEW1, U.BILL1]) await grant(u, S1);
  await grant(U.MGR12, S1); await grant(U.MGR12, S2);
  await grant(U.VINACT, S1); await grant(U.VINACT, SI);                  // an ACTIVE grant on an INACTIVE site
  await grant(U.VSUSP, S1); await grant(U.VSUSP, S2, "SUSPENDED");

  const asset = (id: string, org: string, siteId: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name` } });
  await asset(A1, ORG_A, S1); await asset(A2, ORG_A, S2); await asset(A3, ORG_A, S3); await asset(AI, ORG_A, SI); await asset(AB, ORG_B, SB);
  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG_A, name: "RVC-FM", nameNorm: "rvc-fm", description: "d", severity: "HIGH" } });

  const t = (iso: string) => new Date(iso);
  const kase = (id: string, org: string, siteId: string | null, assetId: string | null, updated = "2026-01-01T00:00:00Z", failureModeId: string | null = null) =>
    db.industrialEngineeringCase.create({ data: {
      id, organizationId: org, title: `${mark(id)} compressor failure`, titleNorm: `${mark(id).toLowerCase()} compressor failure`,
      diagnosis: `DIAG-${mark(id)}`, resolution: `RES-${mark(id)}`, symptoms: [], keywords: ["compressor"], siteId, assetId, failureModeId, createdAt: t(updated), updatedAt: t(updated),
    } });
  await kase(C.s1, ORG_A, S1, null, "2026-01-03T00:00:00Z", FM);
  await kase(C.s2, ORG_A, S2, null, "2026-01-03T00:00:00Z", FM);
  await kase(C.s3, ORG_A, S3, null);
  await kase(C.a1, ORG_A, null, A1, "2026-01-02T00:00:00Z");
  await kase(C.a2, ORG_A, null, A2);
  await kase(C.s1a1, ORG_A, S1, A1, "2026-01-01T00:00:00Z");
  await kase(C.s2a2, ORG_A, S2, A2);
  await kase(C.bad, ORG_A, S1, A2, "2026-01-01T00:00:00Z", FM);        // site says S1, asset lives in S2: ambiguous
  await kase(C.bad2, ORG_A, S2, A1);
  await kase(C.org, ORG_A, null, null, "2026-01-01T00:00:00Z", FM);    // organisation-level / ambiguous
  await kase(C.inactive, ORG_A, SI, null);
  await kase(C.ai, ORG_A, null, AI);
  await kase(C.foreignAsset, ORG_A, null, AB);                         // org A case that names ORG B's asset
  await kase(C.foreignSite, ORG_A, SB, null);                          // org A case that names ORG B's site
  await kase(C.dangling, ORG_A, null, `${P}no-such-asset`);
  await kase(C.b, ORG_B, SB, AB);
  // eight NEWER hidden cases: a page taken before authorisation would be full of them
  for (let i = 1; i <= 8; i++) await kase(`${P}c-hidden-new-${i}`, ORG_A, S2, null, `2026-03-0${i}T00:00:00Z`);

  await db.digitalTwinNode.create({ data: { id: `${P}twin-s1`, organizationId: ORG_A, siteId: S1, assetId: A1, displayName: "RVC-TWIN-S1", nodeType: "ASSET" } });
  await db.digitalTwinNode.create({ data: { id: `${P}twin-s2`, organizationId: ORG_A, siteId: S2, assetId: A2, displayName: "RVC-TWIN-S2", nodeType: "ASSET" } });
  await db.assetTag.create({ data: { id: `${P}tag-s2`, organizationId: ORG_A, assetId: A2, tagName: "RVC-TAG-S2", tagPath: "/rvc/s2/pressure" } });
  await rebuildKnowledgeGraph(ORG_A);
}

beforeAll(async () => {
  const c = await getPrisma(); if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();
  await seed();
}, 600000);
afterAll(async () => { if (!db) return; await purge(); await assertNoResidue(); }, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
const req = (user: string, org: string, method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org } });
async function settle(res: Response) { const text = await res.text(); let json: Row = {}; try { json = text ? JSON.parse(text) : {}; } catch { /* */ } return { status: res.status, text, json }; }
const call = async (h: (r: NextRequest) => Promise<Response>, user: string, method: string, path: string, body?: unknown, org = ORG_A) => settle(await h(req(user, org, method, path, body)));
const callId = async (h: (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>, user: string, method: string, id: string, body?: unknown, org = ORG_A) =>
  settle(await h(req(user, org, method, `/api/knowledge/cases/${id}`, body), { params: Promise.resolve({ id }) }));

const idsOf = (r: { json: Row }) => ((r.json.cases as Row[]) ?? []).map((c) => String(c.id)).sort();
const leaked = (text: string, hidden: readonly string[]) => hidden.filter((id) => text.includes(mark(id)) || text.includes(`DIAG-${mark(id)}`) || text.includes(`RES-${mark(id)}`) || text.includes(id));
const list = (user: string, q = "", org = ORG_A) => call(casesRoute.GET as never, user, "GET", `/api/knowledge/cases${q}`, undefined, org);
const sorted = (a: readonly string[]) => [...a].sort();

// ── READ: list ──────────────────────────────────────────────────────────────
describe("GET /api/knowledge/cases — list", () => {
  it("OWNER and ADMIN: every readable case of THEIR organisation incl. organisation-level; never ambiguous/foreign/inactive", async () => {
    for (const u of [U.OWNER, U.ADMIN]) {
      const r = await list(u, "?limit=100");
      expect(r.status).toBe(200);
      const got = idsOf(r).filter((id) => !id.includes("hidden-new"));
      expect(got).toEqual(sorted(VISIBLE.all));
      expect(leaked(r.text, NEVER)).toEqual([]);
    }
  });

  it.each([["MANAGER", U.MGR1], ["ENGINEER", U.ENG1], ["VIEWER", U.VIEW1], ["BILLING_ADMIN", U.BILL1], ["VIEWER with an ACTIVE grant on an INACTIVE site", U.VINACT], ["VIEWER with a SUSPENDED second grant", U.VSUSP]] as const)(
    "%s with ONE site sees only that site's cases (by site, by asset, by site+asset) and NOTHING else", async (_n, user) => {
      const r = await list(user, "?limit=100");
      expect(idsOf(r)).toEqual(sorted(VISIBLE.s1));
      const hidden = [...VISIBLE.all.filter((c) => !(VISIBLE.s1 as readonly string[]).includes(c)), ...NEVER];
      expect(leaked(r.text, hidden)).toEqual([]);
      expect(r.text).not.toContain("hidden-new");
    });

  it("a two-site manager sees exactly the union", async () => {
    const r = await list(U.MGR12, "?limit=100");
    // the eight newer S2 cases are legitimately visible to a manager who holds S2
    expect(idsOf(r).filter((id) => !id.includes("hidden-new"))).toEqual(sorted(VISIBLE.s12));
    expect(idsOf(r).filter((id) => id.includes("hidden-new")).length).toBe(8);
    expect(leaked(r.text, NEVER)).toEqual([]);
  });

  it("a user with NO site grant receives no case; the organisation-level case is not given to them", async () => {
    const r = await list(U.NONE, "?limit=100");
    expect(r.status).toBe(200);
    expect(r.json.cases).toEqual([]);
    expect(r.text).not.toContain(mark(C.org));
  });

  it("the other organisation's admin sees only its own case; no org-A case, title, diagnosis or id", async () => {
    const r = await list(U.XADMIN, "?limit=100", ORG_B);
    expect(idsOf(r)).toEqual([C.b]);
    expect(leaked(r.text, ALL_A_IDS)).toEqual([]);
  });

  it("an org-A admin acting in org B is refused (not a member there)", async () => {
    expect((await list(U.ADMIN, "?limit=100", ORG_B)).status).toBe(403);
  });

  it("client-supplied siteId / organizationId / allowed-site hints cannot widen access", async () => {
    const r = await list(U.VIEW1, `?limit=100&siteId=${S2}&siteIds=${S2},${S3}&organizationId=${ORG_B}&allowedSiteIds=${S2}`);
    expect(idsOf(r)).toEqual(sorted(VISIBLE.s1));
  });

  it("a client-supplied assetId of a hidden / inactive / foreign asset yields an empty list, never its cases", async () => {
    for (const a of [A2, A3, AI, AB]) {
      const r = await list(U.VIEW1, `?assetId=${a}&limit=100`);
      expect(r.status).toBe(200);
      expect(r.json.cases).toEqual([]);
    }
    expect(idsOf(await list(U.VIEW1, `?assetId=${A1}&limit=100`))).toEqual(sorted([C.a1, C.s1a1]));   // c-bad-s2-asset1 also names A1 but its site disagrees ⇒ hidden
  });

  it("pagination is applied AFTER authorisation: a page is full of VISIBLE cases even when newer hidden ones exist", async () => {
    const two = await list(U.VIEW1, "?limit=2");
    expect(((two.json.cases as Row[]) ?? []).map((c) => c.id)).toEqual([C.s1, C.a1]);           // newest visible, in order
    expect(two.text).not.toContain("hidden-new");
    expect(idsOf(await list(U.VIEW1, "?limit=3"))).toEqual(sorted(VISIBLE.s1));
    expect(idsOf(await list(U.VIEW1, "?limit=1000000")).length).toBe(VISIBLE.s1.length);          // oversize limits are capped, not widened
    expect(idsOf(await list(U.VIEW1, "?limit=abc")).length).toBe(VISIBLE.s1.length);
  });
});

// ── READ: detail ────────────────────────────────────────────────────────────
describe("GET /api/knowledge/cases/[id] — detail", () => {
  it("a visible case is returned with its related cases limited to visible ones", async () => {
    const r = await callId(caseIdRoute.GET as never, U.VIEW1, "GET", C.s1);
    expect(r.status).toBe(200);
    expect((r.json.case as Row).id).toBe(C.s1);
    const related = ((r.json.relatedCases as Row[]) ?? []).map((c) => String(c.id));
    expect(related.every((id) => (VISIBLE.s1 as readonly string[]).includes(id))).toBe(true);
    expect(leaked(r.text, [...NEVER, C.s2, C.s3, C.a2, C.s2a2, C.org])).toEqual([]);
  });

  it("hidden-site, other-site, ambiguous, inactive, foreign and NONEXISTENT ids all answer with the SAME status and body shape", async () => {
    const probes = [C.s2, C.a2, C.bad, C.inactive, C.ai, C.foreignAsset, C.foreignSite, C.org, C.b, `${P}no-such-case`];
    const answers = await Promise.all(probes.map((id) => callId(caseIdRoute.GET as never, U.VIEW1, "GET", id)));
    for (const a of answers) { expect(a.status).toBe(404); expect(a.json).toEqual({ error: "Not found" }); }
    expect(new Set(answers.map((a) => a.text)).size).toBe(1);                                  // byte-identical bodies
  });

  it("OWNER reads the organisation-level case; the site-limited and the no-site user do not", async () => {
    expect((await callId(caseIdRoute.GET as never, U.OWNER, "GET", C.org)).status).toBe(200);
    expect((await callId(caseIdRoute.GET as never, U.ADMIN, "GET", C.org)).status).toBe(200);
    for (const u of [U.MGR1, U.VIEW1, U.NONE, U.MGR12]) expect((await callId(caseIdRoute.GET as never, u, "GET", C.org)).status).toBe(404);
  });

  it("an ambiguous (site/asset disagree) or foreign-referencing case is hidden from OWNER too", async () => {
    for (const id of [C.bad, C.bad2, C.foreignAsset, C.foreignSite, C.dangling, C.inactive, C.ai]) {
      expect((await callId(caseIdRoute.GET as never, U.OWNER, "GET", id)).status, id).toBe(404);
    }
  });

  it("another tenant can never fetch an org-A case by id", async () => {
    for (const id of [C.s1, C.org]) expect((await callId(caseIdRoute.GET as never, U.XADMIN, "GET", id, undefined, ORG_B)).status).toBe(404);
  });
});

// ── READ: search + failure lookup ───────────────────────────────────────────
describe("case search and failure knowledge", () => {
  it("GET /api/knowledge/cases?q= returns only visible cases", async () => {
    const r = await list(U.VIEW1, "?q=compressor&limit=100");
    expect(idsOf(r)).toEqual(sorted(VISIBLE.s1));
    expect(leaked(r.text, [...NEVER, C.s2, C.s3, C.a2, C.s2a2, C.org])).toEqual([]);
    expect(idsOf(await list(U.NONE, "?q=compressor&limit=100"))).toEqual([]);
    expect(idsOf(await list(U.OWNER, "?q=compressor&limit=100")).filter((id) => !id.includes("hidden-new"))).toEqual(sorted(VISIBLE.all));
  });

  it("GET /api/knowledge/search (type=case): results, summaries and the TOTAL are computed after authorisation", async () => {
    const r = await call(searchRoute.GET as never, U.VIEW1, "GET", "/api/knowledge/search?q=compressor&type=case&limit=50");
    expect(r.status).toBe(200);
    const results = r.json.results as Row[];
    expect(results.map((x) => String(x.id)).sort()).toEqual(sorted(VISIBLE.s1));
    expect(r.json.total).toBe(VISIBLE.s1.length);
    expect(leaked(r.text, [...NEVER, C.s2, C.s3, C.a2, C.s2a2, C.org])).toEqual([]);
    const none = await call(searchRoute.GET as never, U.NONE, "GET", "/api/knowledge/search?q=compressor&type=case&limit=50");
    expect(none.json.total).toBe(0);
    const owner = await call(searchRoute.GET as never, U.OWNER, "GET", "/api/knowledge/search?q=compressor&type=case&limit=50");
    expect((owner.json.results as Row[]).map((x) => String(x.id)).filter((id) => !id.includes("hidden-new")).sort()).toEqual(sorted(VISIBLE.all));
  });

  it("failure lookup by an OWN asset returns only visible related cases", async () => {
    const r = await call(failuresRoute.GET as never, U.VIEW1, "GET", `/api/knowledge/failures?assetId=${A1}`);
    expect(r.status).toBe(200);
    const related = ((r.json.knowledge as { relatedCases: Row[] }).relatedCases ?? []).map((c) => String(c.id));
    expect(related).toEqual([C.s1]);                                                             // FM-linked: s1, s2, org, bad → only s1 is visible to VIEW1
    expect(leaked(r.text, [C.s2, C.org, C.bad])).toEqual([]);
    const owner = await call(failuresRoute.GET as never, U.OWNER, "GET", `/api/knowledge/failures?assetId=${A1}`);
    expect(((owner.json.knowledge as { relatedCases: Row[] }).relatedCases ?? []).map((c) => String(c.id)).sort()).toEqual(sorted([C.s1, C.s2, C.org]));
  });

  it("failure lookup by a HIDDEN, inactive or foreign assetId is a 404 with no case data", async () => {
    for (const a of [A2, A3, AI, AB, `${P}nope`]) {
      const r = await call(failuresRoute.GET as never, U.VIEW1, "GET", `/api/knowledge/failures?assetId=${a}`);
      expect(r.status, a).toBe(404);
      expect(leaked(r.text, ALL_A_IDS)).toEqual([]);
    }
    const nobody = await call(failuresRoute.GET as never, U.NONE, "GET", `/api/knowledge/failures?assetId=${A1}`);
    expect(nobody.status).toBe(404);
  });
});

// ── WRITE ───────────────────────────────────────────────────────────────────
const created: string[] = [];
const post = async (user: string, body: Row, org = ORG_A) => {
  const r = await call(casesRoute.POST as never, user, "POST", "/api/knowledge/cases", body, org);
  const id = (r.json.case as Row | undefined)?.id; if (typeof id === "string") created.push(id);
  return r;
};
const rowOf = (id: string) => db.industrialEngineeringCase.findFirst({ where: { id } });

describe("POST /api/knowledge/cases — the resulting scope is validated before anything is written", () => {
  it("a site-limited actor can create a case in their own site and with their own asset; the stored scope is server-derived", async () => {
    const a = await post(U.ENG1, { title: "RVC-NEW-S1", siteId: S1 });
    expect(a.status).toBe(201);
    expect(await rowOf(String((a.json.case as Row).id))).toMatchObject({ organizationId: ORG_A, siteId: S1, assetId: null });
    const b = await post(U.MGR1, { title: "RVC-NEW-A1", assetId: A1 });
    expect(b.status).toBe(201);
    expect(await rowOf(String((b.json.case as Row).id))).toMatchObject({ organizationId: ORG_A, siteId: null, assetId: A1 });
    const c = await post(U.MGR1, { title: "RVC-NEW-S1A1", siteId: S1, assetId: A1 });
    expect(c.status).toBe(201);
  });

  it("a client-supplied organizationId or id never decides the organisation or the record", async () => {
    const r = await post(U.ENG1, { title: "RVC-ORG-SPOOF", siteId: S1, organizationId: ORG_B, id: `${P}forced-id` });
    expect(r.status).toBe(201);
    const row = await rowOf(String((r.json.case as Row).id));
    expect(row).toMatchObject({ organizationId: ORG_A });
    expect(row?.id).not.toBe(`${P}forced-id`);
  });

  it("a site-limited actor CANNOT create an organisation-level (no site, no asset) case", async () => {
    const before = await db.industrialEngineeringCase.count({ where: { organizationId: ORG_A } });
    for (const u of [U.MGR1, U.ENG1, U.MGR12]) {
      const r = await post(u, { title: "RVC-NULL-NULL" });
      expect(r.status, u).toBe(403);
    }
    expect((await post(U.ENG1, { title: "RVC-NULL-NULL-2", siteId: null, assetId: null })).status).toBe(403);
    expect(await db.industrialEngineeringCase.count({ where: { organizationId: ORG_A } })).toBe(before);
  });

  it("references to a hidden, inactive, foreign or nonexistent site/asset are all the same 404, and nothing is written", async () => {
    const before = await db.industrialEngineeringCase.count({ where: { organizationId: ORG_A } });
    const bodies: Row[] = [{ siteId: S2 }, { siteId: S3 }, { siteId: SI }, { siteId: SB }, { siteId: `${P}no-such-site` }, { assetId: A2 }, { assetId: AI }, { assetId: AB }, { assetId: `${P}no-such-asset` }, { siteId: S1, assetId: A2 }];
    const answers = await Promise.all(bodies.map((b) => post(U.ENG1, { title: "RVC-HIDDEN-REF", ...b })));
    for (const a of answers) { expect(a.status).toBe(404); expect(a.json).toEqual({ error: "Site or asset not found" }); }
    expect(await db.industrialEngineeringCase.count({ where: { organizationId: ORG_A } })).toBe(before);
  });

  it("an inconsistent site+asset pair (both readable by the actor) is rejected", async () => {
    const r = await post(U.MGR12, { title: "RVC-MISMATCH", siteId: S1, assetId: A2 });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/different sites/);
    expect((await post(U.ADMIN, { title: "RVC-MISMATCH-ADMIN", siteId: S1, assetId: A2 })).status).toBe(400);
  });

  it("OWNER/ADMIN may create an organisation-level case; roles without manage_knowledge may create nothing", async () => {
    expect((await post(U.OWNER, { title: "RVC-ORG-LEVEL-OWNER" })).status).toBe(201);
    expect((await post(U.ADMIN, { title: "RVC-ORG-LEVEL-ADMIN" })).status).toBe(201);
    for (const u of [U.VIEW1, U.BILL1, U.NONE]) expect((await post(u, { title: "x", siteId: S1 })).status, u).toBe(403);
  });

  it("another organisation's actor cannot attach a case to an org-A site or asset", async () => {
    expect((await post(U.XADMIN, { title: "RVC-X", siteId: S1 }, ORG_B)).status).toBe(404);
    expect((await post(U.XADMIN, { title: "RVC-X", assetId: A1 }, ORG_B)).status).toBe(404);
  });
});

describe("PATCH /api/knowledge/cases/[id] — the RESULTING scope is validated", () => {
  const patch = (user: string, id: string, body: Row, org = ORG_A) => callId(caseIdRoute.PATCH as never, user, "PATCH", id, body, org);
  const fresh = async (siteId: string | null, assetId: string | null) => {
    const row = await db.industrialEngineeringCase.create({ data: { organizationId: ORG_A, title: "RVC-PATCH-SRC", titleNorm: "rvc-patch-src", siteId, assetId, symptoms: [], keywords: [] } });
    return String(row.id);
  };

  it("a content-only update of a visible case works and does not touch the scope", async () => {
    const id = await fresh(S1, null);
    const r = await patch(U.ENG1, id, { title: "RVC-PATCH-OK", status: "resolved" });
    expect(r.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "RVC-PATCH-OK", siteId: S1, assetId: null, organizationId: ORG_A });
  });

  it("a hidden case, a foreign case and a missing case are indistinguishable (same 404) and are NOT modified", async () => {
    const hidden = await fresh(S2, null);
    const a = await patch(U.ENG1, hidden, { title: "PWNED" });
    const b = await patch(U.ENG1, `${P}no-such-case`, { title: "PWNED" });
    const c = await patch(U.XADMIN, hidden, { title: "PWNED" }, ORG_B);
    expect([a.status, b.status, c.status]).toEqual([404, 404, 404]);
    expect(new Set([a.text, b.text, c.text]).size).toBe(1);
    expect((await rowOf(hidden))?.title).toBe("RVC-PATCH-SRC");
    // …also when the patch touches the scope: a hidden case must answer exactly like a missing one (never a 500 or a scope error)
    const missingId = `${P}no-such-case`;
    for (const body of [{ siteId: S1 }, { assetId: A1 }, { siteId: null, assetId: null }, { siteId: S2 }, { siteId: SB }]) {
      const h = await patch(U.ENG1, hidden, body);
      const m = await patch(U.ENG1, missingId, body);
      expect(h.status, JSON.stringify(body)).toBe(404);
      expect(h.text, JSON.stringify(body)).toBe(m.text);
    }
    expect(await rowOf(hidden)).toMatchObject({ title: "RVC-PATCH-SRC", siteId: S2, assetId: null });
  });

  it("a site-limited actor cannot turn a site case into an organisation-level one", async () => {
    const id = await fresh(S1, null);
    expect((await patch(U.ENG1, id, { siteId: null, assetId: null })).status).toBe(403);
    expect((await patch(U.ENG1, id, { siteId: null })).status).toBe(403);
    expect(await rowOf(id)).toMatchObject({ siteId: S1, assetId: null });
  });

  it("a case cannot be moved to a hidden, inactive or foreign site or asset, nor given a conflicting pair", async () => {
    const id = await fresh(S1, null);
    for (const body of [{ siteId: S2 }, { siteId: SI }, { siteId: SB }, { assetId: A2 }, { assetId: AI }, { assetId: AB }, { siteId: S2, assetId: A2 }]) {
      expect((await patch(U.ENG1, id, body)).status, JSON.stringify(body)).toBe(404);
    }
    expect((await patch(U.MGR12, id, { assetId: A2 })).status).toBe(400);                      // site S1 is kept; asset A2 is in S2
    expect(await rowOf(id)).toMatchObject({ siteId: S1, assetId: null });
  });

  it("a legitimate scope change within the actor's sites succeeds and is stored as validated", async () => {
    const id = await fresh(S1, null);
    expect((await patch(U.MGR12, id, { siteId: S2 })).status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ siteId: S2 });
    expect((await patch(U.MGR12, id, { siteId: S2, assetId: A2 })).status).toBe(200);
  });

  it("OWNER/ADMIN may publish a case at organisation level; roles without manage_knowledge may change nothing", async () => {
    const id = await fresh(S1, null);
    expect((await patch(U.ADMIN, id, { siteId: null, assetId: null })).status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ siteId: null, assetId: null });
    expect((await callId(caseIdRoute.GET as never, U.VIEW1, "GET", id)).status).toBe(404);   // …and the site-limited viewer no longer sees it
    expect((await patch(U.VIEW1, id, { title: "x" })).status).toBe(403);
    expect((await patch(U.BILL1, id, { title: "x" })).status).toBe(403);
  });

  it("a body organizationId can never move a case between organisations", async () => {
    const id = await fresh(S1, null);
    const r = await patch(U.ENG1, id, { title: "RVC-KEEP", organizationId: ORG_B });
    expect(r.status).toBe(200);
    expect((await rowOf(id))?.organizationId).toBe(ORG_A);
  });
});

// ── GRAPH + REBUILD ─────────────────────────────────────────────────────────
interface GNode { nodeType: string; entityId: string; label: string }
interface GBody { nodes: GNode[]; edges: { sourceNodeId: string; targetNodeId: string }[]; nodeCount: number; edgeCount: number; nodesByType: Record<string, number> }
const graph = async (user: string, org = ORG_A) => { const r = await call(graphRoute.GET as never, user, "GET", "/api/industrial-graph", undefined, org); return { ...r, body: r.json as unknown as GBody }; };
const caseNodes = (b: GBody) => b.nodes.filter((n) => n.nodeType === "ENGINEERING_CASE").map((n) => n.entityId).filter((id) => !id.includes(P + "c-hidden-new") && ![...created].includes(id)).sort();

describe("Knowledge Graph — case nodes follow the SAME policy", () => {
  it("OWNER/ADMIN: readable cases incl. organisation-level; no ambiguous/foreign/inactive case", async () => {
    for (const u of [U.OWNER, U.ADMIN]) {
      const g = await graph(u);
      const got = caseNodes(g.body).filter((id) => id.startsWith(P + "c-") && !id.includes("hidden-new"));
      expect(got).toEqual(sorted(VISIBLE.all));
      expect(leaked(g.text, NEVER)).toEqual([]);
    }
  });

  it("a one-site viewer sees only its cases; a two-site manager the union; no-site and other-tenant users see none of org A", async () => {
    const g1 = await graph(U.VIEW1);
    expect(caseNodes(g1.body).filter((id) => id.startsWith(P + "c-"))).toEqual(sorted(VISIBLE.s1));
    expect(leaked(g1.text, [...NEVER, C.s2, C.s3, C.a2, C.s2a2, C.org])).toEqual([]);
    expect(g1.text).not.toContain("RVC-TWIN-S2");
    expect(g1.text).not.toContain("/rvc/s2/pressure");                                            // the hidden site's tagPath
    expect(caseNodes((await graph(U.MGR12)).body).filter((id) => id.startsWith(P + "c-"))).toEqual(sorted(VISIBLE.s12));
    const none = await graph(U.NONE);
    expect(caseNodes(none.body)).toEqual([]);
    expect(none.body.nodesByType.ASSET ?? 0).toBe(0);
    expect(leaked((await graph(U.XADMIN, ORG_B)).text, ALL_A_IDS)).toEqual([]);
  });

  it("every edge connects two nodes of the response (no hidden endpoint, no dangling id) and the counts are the visible counts", async () => {
    for (const u of [U.OWNER, U.VIEW1, U.MGR12, U.NONE]) {
      const g = await graph(u);
      expect(g.body.nodeCount).toBe(g.body.nodes.length);
      expect(g.body.edgeCount).toBe(g.body.edges.length);
      expect(Object.values(g.body.nodesByType).reduce((a, b) => a + b, 0)).toBe(g.body.nodes.length);
    }
  });
});

describe("POST /api/industrial-graph/rebuild — the summary describes only what the caller may see", () => {
  const rebuild = (user: string) => call(rebuildRoute.POST as never, user, "POST", "/api/industrial-graph/rebuild");

  it("OWNER/ADMIN (all active sites) receive the organisation-wide summary", async () => {
    for (const u of [U.OWNER, U.ADMIN]) {
      const r = await rebuild(u);
      expect(r.status).toBe(200);
      const s = (r.json as { summary: Row }).summary;
      expect(Object.keys(s).sort()).toEqual(["buildDurationMs", "edgeCount", "nodeCount", "orphansRemoved", "snapshotId"]);
    }
  });

  it("a site-limited MANAGER receives ONLY the counts of the graph it may see — no organisation-wide figure", async () => {
    const own = await graph(U.MGR1);
    const owner = await graph(U.OWNER);
    const r = await rebuild(U.MGR1);
    expect(r.status).toBe(200);
    const s = (r.json as { summary: Row }).summary;
    expect(Object.keys(s).sort()).toEqual(["edgeCount", "nodeCount", "snapshotId"]);            // no orphansRemoved / buildDurationMs
    const after = await graph(U.MGR1);
    expect(s.nodeCount).toBe(after.body.nodeCount);
    expect(s.edgeCount).toBe(after.body.edgeCount);
    expect(s.nodeCount as number).toBeLessThan((await graph(U.OWNER)).body.nodeCount);          // strictly fewer than the organisation total
    expect(own.body.nodeCount).toBeLessThan(owner.body.nodeCount);
    // rebuild again as the 2-site manager: a different, larger-but-still-partial figure
    const r2 = await rebuild(U.MGR12);
    expect((r2.json as { summary: Row }).summary.nodeCount as number).toBeLessThan((await graph(U.OWNER)).body.nodeCount);
  });

  it("roles without manage_knowledge_graph are refused", async () => {
    for (const u of [U.ENG1, U.VIEW1, U.BILL1, U.NONE]) expect((await rebuild(u)).status, u).toBe(403);
  });
});
