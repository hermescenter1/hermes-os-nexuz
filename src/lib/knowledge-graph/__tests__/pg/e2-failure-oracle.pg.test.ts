/**
 * Independent review S2-03 / S2-04 — measured at the DATABASE DRIVER, against REAL PostgreSQL.
 *
 *   1. `GET /api/knowledge/failures?assetId=` has ONE not-found answer. A missing, malformed, foreign,
 *      hidden-site, inactive-site (even with a stale `UserSite` grant) or empty asset id gets the
 *      byte-identical 404, and that decision is taken BEFORE any failure-history work: not one statement
 *      touching failure modes, root causes, knowledge links or cases is sent to PostgreSQL for a refused
 *      probe. Even an ADMIN gets the same answer for an INACTIVE site — an inactive site is nobody's.
 *   2. `GET /api/industrial-graph/root-causes/[id]` resolves the scoped graph exactly ONCE per request: one
 *      latest-risk statement, one node read, one edge read (it used to resolve three times).
 *
 * `e1-bounded-reads` already asserts (1) and (2) through a Prisma-delegate recorder. That recorder only sees
 * the delegates it wraps, so a failure-history read made through a model it does not watch would pass it.
 * This file records EVERY statement the application's own connections send (`pg.Client.prototype.query`),
 * and asserts the refused probes sent none that touches failure history.
 *
 * REAL: routes, requireOrgActor, requirePermission, the scope resolution, Prisma, PostgreSQL. MOCKED: the
 * token layer, `requirePlatformAuth` (org from `x-test-org`) and metering. The recorder ignores the
 * monitor connection and is removed in `afterAll`.
 * Fixtures use the `e2-o-` prefix; only they are removed, and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/audit/audit-service", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/audit/audit-service")>();
  return { ...orig, recordAuditEvent: async () => undefined };
});

const { getPrisma } = await import("@/lib/db/prisma");
const { rebuildKnowledgeGraph } = await import("@/lib/knowledge-graph/builder");
const failuresRoute = await import("@/app/api/knowledge/failures/route");
const rootCauseRoute = await import("@/app/api/industrial-graph/root-causes/[rootCauseId]/route");

const P = "e2-o-";
const ORG = `${P}org`, ORG_F = `${P}org-f`;
const ORGS = [ORG, ORG_F];
const S1 = `${P}s1`, S2 = `${P}s2`, S3 = `${P}s3`, SF = `${P}sf`;
const A1 = `${P}a1`, A2 = `${P}a2`, A3 = `${P}a3`, AF = `${P}af`;
const FM = `${P}fm`, RC = `${P}rc`;
/** ENGINEER with ACTIVE grants on S1 and on S3 — S3 is INACTIVE, so that grant is stale. S2 and SF are hidden. */
const ENG = `${P}u-eng`;
/** ADMIN: reaches every ACTIVE site of the organisation. */
const ADM = `${P}u-adm`;
const USERS = [ENG, ADM];
const MON_APP = `${P}monitor`;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; createMany: (a: unknown) => Promise<{ count: number }>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
let monitor: pg.Client;
let monitorPid = 0;
const ORG_TABLES = ["industrialKnowledgeGraphEdge", "industrialKnowledgeGraphNode", "knowledgeGraphSnapshot", "assetKnowledgeLink", "assetRiskScore",
  "industrialRootCause", "industrialFailureMode", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  for (const id of USERS) await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  for (const [id, org, status] of [[S1, ORG, "ACTIVE"], [S2, ORG, "ACTIVE"], [S3, ORG, "INACTIVE"], [SF, ORG_F, "ACTIVE"]] as const) {
    await db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status, updatedAt: now() } });
  }
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ADM, role: "ADMIN", status: "ACTIVE" } });
  for (const siteId of [S1, S3]) await db.userSite.create({ data: { userId: ENG, siteId, organizationId: ORG, role: "SITE_ENGINEER", status: "ACTIVE" } });
  for (const [id, org, siteId] of [[A1, ORG, S1], [A2, ORG, S2], [A3, ORG, S3], [AF, ORG_F, SF]] as const) {
    await db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name` } });
  }
  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG, name: "E2O-FM", nameNorm: "e2o-fm", description: "d", severity: "HIGH" } });
  await db.industrialRootCause.create({ data: { id: RC, organizationId: ORG, failureModeId: FM, description: "E2O-RC", confidenceWeight: 0.8 } });
  await db.assetKnowledgeLink.createMany({ data: [A1, A2].map((assetId) => ({ id: `${P}l-${assetId}`, organizationId: ORG, assetId, failureModeId: FM })) });
  await db.assetRiskScore.createMany({ data: [A1, A2].map((assetId) => ({
    id: `${P}rs-${assetId}`, organizationId: ORG, assetId, riskScore: 40, confidence: "HIGH", createdAt: now(),
    healthTrendScore: 0, alarmTrendScore: 0, kpiDegradationScore: 0, telQualityScore: 0, telFreshnessScore: 0, criticalityFactor: 1,
  })) });
  await rebuildKnowledgeGraph(ORG);
}

// ── driver-level recorder: every statement an application connection sends ──
let recording = false;
let statements: string[] = [];
const originalQuery = pg.Client.prototype.query;
function installRecorder() {
  (pg.Client.prototype as { query: unknown }).query = function (this: pg.Client & { processID?: number }, ...args: unknown[]) {
    if (recording && this.processID !== monitorPid) {
      const first = args[0];
      statements.push(String(typeof first === "string" ? first : (first as { text?: string } | undefined)?.text ?? ""));
    }
    return (originalQuery as (...a: unknown[]) => unknown).apply(this, args);
  };
}
async function recorded<T>(fn: () => Promise<T>): Promise<{ value: T; sql: string[] }> {
  statements = []; recording = true;
  try { return { value: await fn(), sql: [...statements] }; } finally { recording = false; }
}

type Res = { status: number; body: string };
const settle = async (res: Response): Promise<Res> => ({ status: res.status, body: await res.text() });
const request = (who: string, path: string) =>
  new NextRequest(new URL(path, "http://localhost"), { method: "GET", headers: { cookie: `hermes_at=t:${who}`, "x-test-org": ORG } });
const failures = (who: string, assetId: string) =>
  (failuresRoute.GET as (r: NextRequest) => Promise<Response>)(request(who, `/api/knowledge/failures?assetId=${encodeURIComponent(assetId)}`)).then(settle);
const rootCause = (who: string, id: string) =>
  (rootCauseRoute.GET as (r: NextRequest, c: { params: Promise<{ rootCauseId: string }> }) => Promise<Response>)(
    request(who, `/api/industrial-graph/root-causes/${id}`), { params: Promise.resolve({ rootCauseId: id }) },
  ).then(settle);

/** A statement that reads failure history: failure modes, root causes, knowledge links or cases. */
const FAILURE_HISTORY = /IndustrialFailureMode|IndustrialRootCause|AssetKnowledgeLink|IndustrialEngineeringCase/;

beforeAll(async () => {
  const c = await getPrisma(); if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  monitor = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: MON_APP });
  await monitor.connect();
  monitorPid = Number((await monitor.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  await purge();
  await seed();
  installRecorder();
}, 900000);
afterAll(async () => {
  (pg.Client.prototype as { query: unknown }).query = originalQuery;
  if (db) await purge();
  if (monitor) await monitor.end();
}, 600000);

describe("e2 S2-04 — a refused failure probe has one answer and costs no failure-history work", () => {
  it("e2-O1 positive control: an authorised asset answers 200 and DOES read failure history (so the recorder can see it)", async () => {
    const { value, sql } = await recorded(() => failures(ENG, A1));
    expect(value.status).toBe(200);
    expect(sql.some((s) => FAILURE_HISTORY.test(s))).toBe(true);
  });

  it("e2-O2 every non-reachable state is the byte-identical 404, and sends no failure-history statement", async () => {
    const states: Record<string, string> = {
      nonexistent: `${P}no-such-asset`,
      malformed: "a".repeat(200),
      traversal: "../../etc/passwd",
      foreign: AF,
      hiddenSite: A2,
      inactiveSiteStaleGrant: A3,
      empty: "",
    };
    const answers: Record<string, Res> = {};
    const historyReads: Record<string, number> = {};
    for (const [state, id] of Object.entries(states)) {
      const { value, sql } = await recorded(() => failures(ENG, id));
      answers[state] = value;
      historyReads[state] = sql.filter((s) => FAILURE_HISTORY.test(s)).length;
    }
    expect(answers.nonexistent.status).toBe(404);
    for (const state of Object.keys(states)) {
      expect(answers[state], state).toEqual(answers.nonexistent);
      expect(historyReads[state], state).toBe(0);
    }
    // Nothing the refused caller must not learn is echoed back.
    for (const hidden of [S2, S3, SF, FM, RC]) expect(answers.hiddenSite.body).not.toContain(hidden);
  });

  it("e2-O3 an ADMIN gets the same answer for an INACTIVE site, and still reaches an ACTIVE site the engineer cannot", async () => {
    const refused = await failures(ENG, `${P}no-such-asset`);
    expect(await failures(ADM, A3)).toEqual(refused);
    expect((await failures(ADM, A2)).status).toBe(200);
  });
});

describe("e2 S2-03 — the scoped graph is resolved once per request", () => {
  it("e2-O4 /root-causes/[id] sends exactly one latest-risk, one node and one edge statement", async () => {
    const { value, sql } = await recorded(() => rootCause(ENG, RC));
    expect(value.status).toBe(200);
    expect(sql.filter((s) => s.includes(`DISTINCT ON (r."assetId")`))).toHaveLength(1);
    expect(sql.filter((s) => /FROM "public"\."IndustrialKnowledgeGraphNode"/.test(s))).toHaveLength(1);
    expect(sql.filter((s) => /FROM "public"\."IndustrialKnowledgeGraphEdge"/.test(s))).toHaveLength(1);
  });
});

describe("e2 failure-oracle teardown", () => {
  it("e2-OZ leaves zero residue", async () => {
    await purge();
    expect(await residue()).toEqual({});
  });
});
