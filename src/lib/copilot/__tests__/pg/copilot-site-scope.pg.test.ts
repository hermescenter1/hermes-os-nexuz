/**
 * Copilot and failure-insight site isolation (IR-03, IR-04) — adversarial matrix against REAL PostgreSQL
 * and the REAL route handlers.
 *
 * THE DEFECTS. Copilot (text query, conversation message, voice) passed the client's `siteId`/`assetId`
 * straight into an engine that read the organisation: insights over every asset of the organisation,
 * a dependency traversal over every Digital Twin relation of the organisation, the asset context of any
 * asset id. Conversations were readable by every member of the organisation. And
 * `GET /api/knowledge/failures/[id]?assetId=` read any asset's FailureIndicator and alarm count.
 *
 * REAL: routes, `requireOrgActor`, `requirePermission`, `getAllowedSiteIds`, the Copilot scope, the
 *       engine, the Digital Twin traversal, the root-cause reader, the voice guard's membership and RBAC
 *       steps, Prisma.
 * MOCKED: only the token layer (`verifyAccessToken`, `requirePlatformAuth` — the organisation comes from
 *       `x-test-org`, as the real guard derives it server side), metering, the audit WRITE, and — for the
 *       voice route — the three infrastructure gates that are not about sites (billing entitlement, rate
 *       limit, trusted-origin list).
 *
 * Fixtures use the `cps-` prefix; only they are removed and any leftover fails the run.
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
vi.mock("@/lib/billing-governance/runtime/require-entitlement", () => ({ enforceEntitlement: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/rate-limiter", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/auth/rate-limiter")>();
  return { ...orig, checkRateLimit: async () => true };
});
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return { ...orig, requireTrustedOrigin: () => ({ ok: true, reason: "allowed" }) };
});

const { getPrisma } = await import("@/lib/db/prisma");
const queryRoute = await import("@/app/api/copilot/query/route");
const voiceRoute = await import("@/app/api/copilot/voice/query/route");
const convsRoute = await import("@/app/api/copilot/conversations/route");
const convRoute = await import("@/app/api/copilot/conversations/[id]/route");
const failureRoute = await import("@/app/api/knowledge/failures/[id]/route");

// ── Fixtures ────────────────────────────────────────────────────────────────
const P = "cps-";
const ORG_A = `${P}org-a`, ORG_B = `${P}org-b`;
const ORGS = [ORG_A, ORG_B];
const A1 = `${P}site-a1`, A2 = `${P}site-a2`, A3 = `${P}site-a3-inactive`, B1 = `${P}site-b1`;
const AS = { a1: `${P}as-a1`, a2: `${P}as-a2`, a3: `${P}as-a3`, b1: `${P}as-b1` } as const;
const NAME = { a1: "CPS-ASSET-A1", a2: "CPS-HIDDEN-ASSET-A2", a3: "CPS-INACTIVE-ASSET-A3", b1: "CPS-FOREIGN-ASSET-B1" } as const;
const N = { a1: `${P}n-a1`, a1b: `${P}n-a1b`, a1c: `${P}n-a1c`, a2: `${P}n-a2`, a2b: `${P}n-a2b`, a3: `${P}n-a3`, b1: `${P}n-b1` } as const;
const TWIN = { a1: "CPS-TWIN-A1", a1b: "CPS-TWIN-A1B", a1c: "CPS-TWIN-A1C-ONLY-VIA-HIDDEN", a2: "CPS-HIDDEN-TWIN-A2", a2b: "CPS-HIDDEN-TWIN-A2B", a3: "CPS-INACTIVE-TWIN-A3", b1: "CPS-FOREIGN-TWIN-B1" } as const;
const R = { a1: `${P}r-a1-a1b`, cross: `${P}r-a1-to-a2`, a2: `${P}r-a2-a2b`, back: `${P}r-a2b-to-a1`, via: `${P}r-a2b-to-a1c` } as const;
const FM = `${P}fm`, RC = `${P}rc`;
const U = {
  OWNER: `${P}u-owner`, ADMIN: `${P}u-admin`,
  MGR1: `${P}u-manager-a1`, ENG1: `${P}u-engineer-a1`, VIEW1: `${P}u-viewer-a1`, BILL1: `${P}u-billing-a1`,
  V12: `${P}u-viewer-a1-a2`, V3: `${P}u-viewer-a3-only`, NONE: `${P}u-viewer-nogrant`, XADMIN: `${P}u-xadmin`,
} as const;
const USERS = Object.values(U);

type Row = Record<string, unknown>;
interface Model {
  create: (a: unknown) => Promise<Row>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
  findMany: (a?: unknown) => Promise<Row[]>;
}
let db: Record<string, Model>;
const ORG_TABLES = ["telemetryRecord", "failureIndicator", "copilotInsight", "industrialRootCause", "industrialFailureMode",
  "digitalTwinRelation", "digitalTwinNode", "industrialAsset", "industrialGateway", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  await db.copilotMessage.deleteMany({ where: { conversation: { organizationId: { in: ORGS } } } });
  await db.copilotConversation.deleteMany({ where: w });
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }, { userId: { in: USERS } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function assertNoResidue() {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of [...ORG_TABLES, "copilotConversation"]) left[m] = await db[m].count({ where: w });
  left.copilotMessage = await db.copilotMessage.count({ where: { conversation: { organizationId: { in: ORGS } } } });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }, { userId: { in: USERS } }] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  const bad = Object.entries(left).filter(([, n]) => n !== 0);
  if (bad.length > 0) throw new Error(`copilot fixture cleanup incomplete: ${JSON.stringify(Object.fromEntries(bad))}`);
}

beforeAll(async () => {
  const c = await getPrisma();
  if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  await purge();

  const now = () => new Date();
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string, status = "ACTIVE") => db.industrialSite.create({ data: { id, organizationId: org, name: `CPS-SITE-NAME-${id}`, slug: id, status, updatedAt: now() } });
  await site(A1, ORG_A); await site(A2, ORG_A); await site(A3, ORG_A, "INACTIVE"); await site(B1, ORG_B);

  const member = (userId: string, organizationId: string, role: string) => db.organizationMember.create({ data: { organizationId, userId, role, status: "ACTIVE" } });
  await member(U.OWNER, ORG_A, "OWNER"); await member(U.ADMIN, ORG_A, "ADMIN");
  await member(U.MGR1, ORG_A, "MANAGER"); await member(U.ENG1, ORG_A, "ENGINEER"); await member(U.VIEW1, ORG_A, "VIEWER"); await member(U.BILL1, ORG_A, "BILLING_ADMIN");
  await member(U.V12, ORG_A, "VIEWER"); await member(U.V3, ORG_A, "VIEWER"); await member(U.NONE, ORG_A, "VIEWER"); await member(U.XADMIN, ORG_B, "ADMIN");
  const grant = (userId: string, siteId: string) => db.userSite.create({ data: { userId, siteId, organizationId: ORG_A, role: "SITE_VIEWER", status: "ACTIVE" } });
  for (const u of [U.MGR1, U.ENG1, U.VIEW1, U.BILL1]) await grant(u, A1);
  await grant(U.V12, A1); await grant(U.V12, A2);
  await grant(U.V3, A3);                                       // an ACTIVE grant on an INACTIVE site

  for (const [s, org] of [[A1, ORG_A], [A2, ORG_A], [A3, ORG_A], [B1, ORG_B]] as const) {
    await db.industrialGateway.create({ data: { id: `${P}gw-${s}`, organizationId: org, siteId: s, name: `gw-${s}`, gatewayId: `${P}gw-${s}`, updatedAt: now() } });
  }
  const asset = (id: string, org: string, siteId: string, name: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name, assetType: "PUMP", gatewayId: `${P}gw-${siteId}` } });
  await asset(AS.a1, ORG_A, A1, NAME.a1); await asset(AS.a2, ORG_A, A2, NAME.a2); await asset(AS.a3, ORG_A, A3, NAME.a3); await asset(AS.b1, ORG_B, B1, NAME.b1);

  // every asset reports a run of BAD telemetry: each one produces a "Repeated fault: <name>" insight when it is in scope
  const since = Date.now() - 60_000;
  for (const [assetId, org, siteId] of [[AS.a1, ORG_A, A1], [AS.a2, ORG_A, A2], [AS.a3, ORG_A, A3], [AS.b1, ORG_B, B1]] as const) {
    for (let i = 0; i < 6; i++) {
      await db.telemetryRecord.create({ data: {
        organizationId: org, siteId, gatewayId: `${P}gw-${siteId}`, assetId, tag: "cps.pressure", value: 1, numericValue: 1, quality: "BAD",
        source: "cps-test", timestamp: new Date(since + i * 1000), receivedAt: new Date(since + i * 1000),
      } });
    }
  }

  const node = (id: string, org: string, siteId: string, displayName: string, assetId: string | null = null) =>
    db.digitalTwinNode.create({ data: { id, organizationId: org, siteId, assetId, displayName, nodeType: assetId ? "ASSET" : "AREA" } });
  await node(N.a1, ORG_A, A1, TWIN.a1, AS.a1); await node(N.a1b, ORG_A, A1, TWIN.a1b);
  await node(N.a1c, ORG_A, A1, TWIN.a1c);  // an A1 node reachable from N.a1 ONLY through the hidden site A2
  await node(N.a2, ORG_A, A2, TWIN.a2, AS.a2); await node(N.a2b, ORG_A, A2, TWIN.a2b);
  await node(N.a3, ORG_A, A3, TWIN.a3, AS.a3); await node(N.b1, ORG_B, B1, TWIN.b1, AS.b1);
  const rel = (id: string, s: string, t: string) => db.digitalTwinRelation.create({ data: { id, organizationId: ORG_A, sourceNodeId: s, targetNodeId: t, relationType: "FEEDS" } });
  await rel(R.a1, N.a1, N.a1b);           // inside A1
  await rel(R.cross, N.a1, N.a2);         // A1 → hidden A2 (legacy cross-site)
  await rel(R.a2, N.a2, N.a2b);           // inside hidden A2
  await rel(R.back, N.a2b, N.a1);         // hidden A2 → A1 (an upstream that must stay hidden)
  await rel(R.via, N.a2b, N.a1c);         // hidden A2 → A1: a path to a visible node that runs through hidden nodes

  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG_A, name: "CPS-FM", nameNorm: "cps-fm", description: "d", severity: "HIGH" } });
  await db.industrialRootCause.create({ data: { id: RC, organizationId: ORG_A, failureModeId: FM, description: "CPS-RC", confidenceWeight: 0.5 } });
  const fi = (assetId: string, org: string, probability: string, degradationClass: string) =>
    db.failureIndicator.create({ data: { organizationId: org, assetId, probability, confidence: "HIGH", riskScore: 0.5, degradationClass, alarmTrend: "stable", healthTrend: "stable" } });
  await fi(AS.a1, ORG_A, "LOW", "STABLE");
  await fi(AS.a2, ORG_A, "HIGH", "RAPIDLY_DEGRADING");          // hidden indicators: must never reach an A1-only reader
  await fi(AS.a3, ORG_A, "HIGH", "RAPIDLY_DEGRADING");
  await fi(AS.b1, ORG_B, "HIGH", "RAPIDLY_DEGRADING");
}, 600000);

afterAll(async () => {
  if (!db) return;
  await purge();
  await assertNoResidue();
}, 600000);

// ── helpers ─────────────────────────────────────────────────────────────────
type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
const request = (user: string, org: string, method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${user}`, "x-test-org": org, origin: "http://localhost" },
  });
async function call(handler: unknown, user: string, method: string, path: string, body?: unknown, id?: string, org = ORG_A) {
  const res = await (handler as Handler)(request(user, org, method, path, body), id ? { params: Promise.resolve({ id }) } : undefined);
  const text = await res.text();
  let json: Row = {};
  try { json = text ? (JSON.parse(text) as Row) : {}; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
const ask = (user: string, body: Row, org = ORG_A) => call(queryRoute.POST, user, "POST", "/api/copilot/query", body, undefined, org);
const voice = (user: string, transcript: string) => call(voiceRoute.POST, user, "POST", "/api/copilot/voice/query", { transcript, locale: "en" });
const failure = (user: string, fmId: string, assetId?: string) =>
  call(failureRoute.GET, user, "GET", `/api/knowledge/failures/${fmId}${assetId === undefined ? "" : `?assetId=${assetId}`}`, undefined, fmId);

/** Everything an A1-only reader must never receive. */
const HIDDEN_FOR_A1 = [NAME.a2, NAME.a3, NAME.b1, TWIN.a2, TWIN.a2b, TWIN.a3, TWIN.b1, AS.a2, AS.a3, AS.b1, N.a2, N.a2b, N.a3, N.b1, R.cross, R.a2, R.back, A2, A3, B1, "RAPIDLY_DEGRADING"];
/** Everything OWNER/ADMIN must never receive (inactive site, foreign organisation). */
const HIDDEN_FOR_ADMIN = [NAME.a3, NAME.b1, TWIN.a3, TWIN.b1, AS.a3, AS.b1, N.a3, N.b1, A3, B1];
const leaks = (text: string, hidden: readonly string[]) => hidden.filter((s) => text.includes(s));
const NOT_FOUND = { error: "Site or asset not found", code: "COPILOT_SCOPE_NOT_FOUND" };
const A1_READERS = [["MANAGER", U.MGR1], ["ENGINEER", U.ENG1], ["VIEWER", U.VIEW1], ["BILLING_ADMIN", U.BILL1]] as const;

// ── text query ──────────────────────────────────────────────────────────────
describe("POST /api/copilot/query", () => {
  it.each(A1_READERS)("%s with A1 only: without a selector the answer is built from A1 only", async (_n, user) => {
    const r = await ask(user, { query: "show me fault alarms" });
    expect(r.status).toBe(200);
    expect(r.text).toContain(NAME.a1);                                     // the visible site still works
    expect(leaks(r.text, HIDDEN_FOR_A1)).toEqual([]);
  });

  it.each([["OWNER", U.OWNER], ["ADMIN", U.ADMIN]] as const)("%s: every ACTIVE site of the organisation, never the inactive one or another organisation", async (_n, user) => {
    const r = await ask(user, { query: "show me fault alarms" });
    expect(r.status).toBe(200);
    expect(r.text).toContain(NAME.a1);
    expect(r.text).toContain(NAME.a2);
    expect(leaks(r.text, HIDDEN_FOR_ADMIN)).toEqual([]);
  });

  it("hidden, inactive, foreign, missing and malformed selectors all get the SAME 404, before anything is read", async () => {
    const answers = await Promise.all([
      ask(U.VIEW1, { query: "status", siteId: A2 }), ask(U.VIEW1, { query: "status", siteId: A3 }), ask(U.VIEW1, { query: "status", siteId: B1 }),
      ask(U.VIEW1, { query: "status", siteId: `${P}nope` }), ask(U.VIEW1, { query: "status", siteId: 7 }),
      ask(U.VIEW1, { query: "status", assetId: AS.a2 }), ask(U.VIEW1, { query: "status", assetId: AS.a3 }), ask(U.VIEW1, { query: "status", assetId: AS.b1 }),
      ask(U.VIEW1, { query: "status", assetId: `${P}nope` }), ask(U.VIEW1, { query: "status", assetId: ["x"] }),
      ask(U.V12, { query: "status", siteId: A1, assetId: AS.a2 }),           // both readable, but they disagree
      ask(U.OWNER, { query: "status", siteId: A3 }), ask(U.OWNER, { query: "status", assetId: AS.b1 }),
    ]);
    for (const a of answers) { expect(a.status).toBe(404); expect(a.json).toEqual(NOT_FOUND); }
    expect(new Set(answers.map((a) => a.text)).size).toBe(1);
  });

  it("an authorised asset: the dependency answer walks the Digital Twin inside the readable sites only", async () => {
    const a1 = await ask(U.VIEW1, { query: "show downstream and upstream dependencies", assetId: AS.a1 });
    expect(a1.status).toBe(200);
    expect(a1.text).toContain(`Downstream: ${TWIN.a1b}`);
    expect(leaks(a1.text, HIDDEN_FOR_A1)).toEqual([]);                      // no A2 node through the cross-site edge, none upstream
    expect(a1.text).not.toContain(TWIN.a1c);                                // a visible node is not reached THROUGH hidden nodes
    // the same question by a reader of A1 AND A2: the hidden branch is now legitimately visible — the filter is the scope
    const both = await ask(U.V12, { query: "show downstream and upstream dependencies", assetId: AS.a1 });
    expect(both.text).toContain(`Downstream: ${TWIN.a2}`);
    expect(both.text).toContain(`Upstream: ${TWIN.a2b}`);
    expect(both.text).toContain(`Downstream: ${TWIN.a1c}`);
  });

  it("an authorised site selector narrows to that site", async () => {
    const r = await ask(U.V12, { query: "show me fault alarms", siteId: A1 });
    expect(r.status).toBe(200);
    expect(r.text).toContain(NAME.a1);
    expect(r.text).not.toContain(NAME.a2);
  });

  it.each([["no grant", U.NONE], ["only an ACTIVE grant on the INACTIVE site", U.V3]] as const)("%s: no site-derived data; a selector is refused", async (_n, user) => {
    const r = await ask(user, { query: "show me fault alarms" });
    expect(r.status).toBe(200);
    expect((r.json.response as Row).insufficientData).toBe(true);
    expect(leaks(r.text, [NAME.a1, ...HIDDEN_FOR_A1])).toEqual([]);
    expect((await ask(user, { query: "status", siteId: A3 })).json).toEqual(NOT_FOUND);
    expect((await ask(user, { query: "status", assetId: AS.a1 })).json).toEqual(NOT_FOUND);
  });

  it("client organisation / role / allow-list fields do not change the scope", async () => {
    const r = await ask(U.VIEW1, { query: "show me fault alarms", organizationId: ORG_B, role: "OWNER", allowedSiteIds: [A2, A3], siteIds: [A2] });
    expect(r.status).toBe(200);
    expect(leaks(r.text, HIDDEN_FOR_A1)).toEqual([]);
  });

  it("permission and membership are still enforced", async () => {
    expect((await ask(U.XADMIN, { query: "status" }, ORG_A)).status).toBe(403);          // not a member of A
    const anon = await queryRoute.POST(new NextRequest(new URL("/api/copilot/query", "http://localhost"), { method: "POST", body: "{}" }));
    expect(anon.status).toBe(401);
  });
});

// ── voice ───────────────────────────────────────────────────────────────────
describe("POST /api/copilot/voice/query — the same scope as text", () => {
  it("an A1-only reader receives nothing of A2, A3 or another organisation", async () => {
    const r = await voice(U.VIEW1, "show me fault alarms");
    expect(r.status).toBe(200);
    expect(leaks(r.text, HIDDEN_FOR_A1)).toEqual([]);
  });

  it("text and voice agree for the same reader and question", async () => {
    const t = await ask(U.VIEW1, { query: "show me fault alarms" });
    const v = await voice(U.VIEW1, "show me fault alarms");
    expect((v.json.answer as Row).summary).toBe((t.json.response as Row).summary);
    expect((v.json.answer as Row).insufficientData).toBe((t.json.response as Row).insufficientData);
  });

  it("no usable site: an insufficient answer, nothing site-derived", async () => {
    for (const user of [U.NONE, U.V3]) {
      const r = await voice(user, "show me fault alarms");
      expect(r.status).toBe(200);
      expect((r.json.answer as Row).insufficientData).toBe(true);
      expect(leaks(r.text, [NAME.a1, ...HIDDEN_FOR_A1])).toEqual([]);
    }
  });
});

// ── conversations ───────────────────────────────────────────────────────────
describe("conversations: owner only, selectors re-authorised, stored answers re-checked", () => {
  let convId = "";
  const getConv = (user: string, id: string) => call(convRoute.GET, user, "GET", `/api/copilot/conversations/${id}`, undefined, id);
  const say = (user: string, id: string, body: Row) => call(convRoute.POST, user, "POST", `/api/copilot/conversations/${id}`, body, id);
  const messageCount = (id: string) => db.copilotMessage.count({ where: { conversationId: id } });

  it("the owner creates a conversation and gets an answer for an authorised asset; it records its sites", async () => {
    const created = await call(convsRoute.POST, U.VIEW1, "POST", "/api/copilot/conversations", { title: "cps thread" });
    expect(created.status).toBe(201);
    convId = String((created.json.conversation as Row).id);
    const sent = await say(U.VIEW1, convId, { content: "show me fault alarms", assetId: AS.a1 });
    expect(sent.status).toBe(200);
    expect(leaks(sent.text, HIDDEN_FOR_A1)).toEqual([]);
    const [assistant] = await db.copilotMessage.findMany({ where: { conversationId: convId, role: "ASSISTANT" } });
    expect((assistant.metadata as Row).scope).toEqual({ siteIds: [A1] });
  });

  it("another member cannot list or read it; their answer is the same as for a missing id", async () => {
    const list = await call(convsRoute.GET, U.V12, "GET", "/api/copilot/conversations");
    expect(((list.json.conversations as Row[]) ?? []).map((c) => c.id)).not.toContain(convId);
    const theirs = await getConv(U.V12, convId);
    const missing = await getConv(U.V12, `${P}no-such-conversation`);
    expect(theirs.status).toBe(404);
    expect(theirs.text).toBe(missing.text);
    expect((await say(U.V12, convId, { content: "status" })).status).toBe(404);
  });

  it("a hidden selector on a continuation is refused before anything is written", async () => {
    const before = await messageCount(convId);
    const r = await say(U.VIEW1, convId, { content: "status", siteId: A2 });
    expect(r.status).toBe(404);
    expect(r.json).toEqual(NOT_FOUND);
    expect(await messageCount(convId)).toBe(before);
  });

  it("a legacy answer without site attribution is withheld from its own owner", async () => {
    await db.copilotMessage.create({ data: { conversationId: convId, role: "ASSISTANT", content: `LEGACY ${NAME.a2} summary`, metadata: { intent: "x", insightCount: 9 } } });
    const r = await getConv(U.VIEW1, convId);
    expect(r.status).toBe(200);
    expect(r.text).not.toContain("LEGACY");
    expect(r.text).not.toContain(NAME.a2);
    const withheld = ((r.json.messages as Row[]) ?? []).filter((m) => (m.metadata as Row)?.withheld === true);
    expect(withheld.length).toBe(1);
  });

  it("after the grant is removed (or the site deactivated) the stored A1 answer is withheld and continuation is refused", async () => {
    const assistantSummary = (await getConv(U.VIEW1, convId)).json.messages as Row[];
    expect(assistantSummary.some((m) => m.role === "ASSISTANT" && (m.metadata as Row)?.withheld !== true)).toBe(true);
    try {
      await db.userSite.updateMany({ where: { userId: U.VIEW1, siteId: A1 }, data: { status: "SUSPENDED" } });
      const r = await getConv(U.VIEW1, convId);
      expect(((r.json.messages as Row[]) ?? []).filter((m) => m.role === "ASSISTANT").every((m) => (m.metadata as Row)?.withheld === true)).toBe(true);
      expect((await say(U.VIEW1, convId, { content: "status", assetId: AS.a1 })).json).toEqual(NOT_FOUND);
    } finally {
      await db.userSite.updateMany({ where: { userId: U.VIEW1, siteId: A1 }, data: { status: "ACTIVE" } });
    }
    try {
      await db.industrialSite.updateMany({ where: { id: A1 }, data: { status: "INACTIVE" } });
      const r = await getConv(U.VIEW1, convId);
      expect(((r.json.messages as Row[]) ?? []).filter((m) => m.role === "ASSISTANT").every((m) => (m.metadata as Row)?.withheld === true)).toBe(true);
    } finally {
      await db.industrialSite.updateMany({ where: { id: A1 }, data: { status: "ACTIVE" } });
    }
    // access restored: the attributed answer is readable again, the legacy one stays withheld
    const back = await getConv(U.VIEW1, convId);
    const assistants = ((back.json.messages as Row[]) ?? []).filter((m) => m.role === "ASSISTANT");
    expect(assistants.filter((m) => (m.metadata as Row)?.withheld !== true).length).toBe(1);
  });
});

// ── failure detail ──────────────────────────────────────────────────────────
describe("GET /api/knowledge/failures/[id]?assetId= — the asset is authorised before its indicators are read", () => {
  it.each(A1_READERS)("%s with A1 only: the readable asset works", async (_n, user) => {
    const r = await failure(user, FM, AS.a1);
    expect(r.status).toBe(200);
    expect(((r.json.rootCauseCandidates as Row[]) ?? []).length).toBe(1);
    expect(r.text).toContain("LOW probability, STABLE");
  });

  it("hidden, inactive, foreign, missing and malformed assets answer exactly like a missing failure mode", async () => {
    const missingFm = await failure(U.VIEW1, `${P}no-such-fm`, AS.a1);
    expect(missingFm.status).toBe(404);
    for (const assetId of [AS.a2, AS.a3, AS.b1, `${P}nope`, ""]) {
      const r = await failure(U.VIEW1, FM, assetId);
      expect(r.status, assetId).toBe(404);
      expect(r.text, assetId).toBe(missingFm.text);
      expect(leaks(r.text, ["RAPIDLY_DEGRADING", "HIGH probability", "alarm count"])).toEqual([]);
    }
  });

  it("OWNER reads an asset of an active site, but not one of the inactive site or of another organisation", async () => {
    const a2 = await failure(U.OWNER, FM, AS.a2);
    expect(a2.status).toBe(200);
    expect(a2.text).toContain("HIGH probability, RAPIDLY_DEGRADING");
    expect((await failure(U.OWNER, FM, AS.a3)).status).toBe(404);
    expect((await failure(U.OWNER, FM, AS.b1)).status).toBe(404);
  });

  it("without an asset the failure mode alone is returned, with no candidate", async () => {
    const r = await failure(U.VIEW1, FM);
    expect(r.status).toBe(200);
    expect(r.json.rootCauseCandidates).toEqual([]);
  });

  it("no usable site: every asset is not found", async () => {
    for (const user of [U.NONE, U.V3]) expect((await failure(user, FM, AS.a1)).status).toBe(404);
  });
});
