/**
 * Independent review RV-T1 — the authorisation locks of a Knowledge Case write are HELD UNTIL THE WRITE
 * COMMITS, proven against REAL PostgreSQL.
 *
 * Why this test exists: the E1 race tests (`e1-case-authorization-race`) make the hostile change BEFORE
 * the writer reads, so they cannot tell "locks taken inside the writing transaction" from "locks taken on
 * an autocommit connection" — in both cases the writer waits for the hostile commit and then reads the new
 * state. A change that moves the lock statements off the transaction therefore passed every one of them.
 * The property that actually matters is the OTHER direction: a hostile change attempted AFTER the writer's
 * decision but BEFORE its commit must be made to WAIT.
 *
 * Window construction (pg_blocking_pids is the proof; no sleep is evidence):
 *   T3 holds `FOR UPDATE` on the failure-mode row. The real route locks the scopes first and the failure
 *      mode LAST, so T1 parks on the failure mode having ALREADY decided and holding its case/asset/site
 *      locks.
 *   T2 then tries to move the asset, deactivate the site or change the case row itself: it must be seen
 *      waiting BY T1's backend, and must not have completed while T1 was still open.
 *   T3 is rolled back → T1 writes and commits → T2 proceeds.
 *
 * REAL: routes, requireOrgActor, requirePermission, the scope resolution, the write locks, Prisma,
 * PostgreSQL locking. MOCKED: the token layer, `requirePlatformAuth` (org from `x-test-org`) and metering.
 * Fixtures use the `e2-l-` prefix; only they are removed, and any leftover fails the run.
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

const { getPrisma } = await import("@/lib/db/prisma");
const casesRoute = await import("@/app/api/knowledge/cases/route");
const caseIdRoute = await import("@/app/api/knowledge/cases/[id]/route");

const P = "e2-l-";
const ORG = `${P}org`;
const S1 = `${P}s1`, S2 = `${P}s2`;
const A1 = `${P}a1`;
const FM = `${P}fm`;
/** ENGINEER with an ACTIVE grant on S1 only. */
const ENG = `${P}u-eng`;
const USERS = [ENG];
const MON_APP = `${P}monitor`;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
let monitor: pg.Client;
const ORG_TABLES = ["industrialEngineeringCase", "industrialFailureMode", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: { organizationId: ORG } });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: ORG }, { userId: { in: USERS } }] } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: { organizationId: ORG } });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: ORG }, { userId: { in: USERS } }] } });
  left.organization = await db.organization.count({ where: { id: ORG } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  await db.user.create({ data: { id: ENG, name: ENG, email: `${ENG}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  await db.organization.create({ data: { id: ORG, name: ORG, slug: ORG, updatedAt: now() } });
  for (const s of [S1, S2]) await db.industrialSite.create({ data: { id: s, organizationId: ORG, name: s, slug: s, status: "ACTIVE", updatedAt: now() } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: ENG, siteId: S1, organizationId: ORG, role: "SITE_VIEWER", status: "ACTIVE" } });
  await db.industrialAsset.create({ data: { id: A1, organizationId: ORG, siteId: S1, name: `${A1}-name` } });
  await db.industrialFailureMode.create({ data: { id: FM, organizationId: ORG, name: FM, nameNorm: FM, description: "d", severity: "HIGH" } });
}

let seq = 0;
/** A fresh case at the given (visible) scope. */
async function freshCase(scope: { siteId: string | null; assetId: string | null }): Promise<string> {
  const id = `${P}case-${++seq}`;
  await db.industrialEngineeringCase.create({ data: {
    id, organizationId: ORG, title: `E2L-ORIGINAL-${seq}`, titleNorm: `e2l-original-${seq}`,
    symptoms: [], keywords: [], siteId: scope.siteId, assetId: scope.assetId,
  } });
  return id;
}

const req = (method: string, path: string, body: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${ENG}`, "x-test-org": ORG },
  });
const createCase = (body: unknown): Promise<Response> =>
  (casesRoute.POST as (r: NextRequest) => Promise<Response>)(req("POST", "/api/knowledge/cases", body));
const patchCase = (id: string, body: unknown): Promise<Response> =>
  (caseIdRoute.PATCH as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
    req("PATCH", `/api/knowledge/cases/${id}`, body), { params: Promise.resolve({ id }) },
  );

const connect = async (application_name: string) => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name });
  await c.connect();
  return c;
};
const pidOf = async (c: pg.Client) => Number((await c.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Polls PostgreSQL until some backend is blocked BY `blocker`, or fails at the deadline. */
async function waitUntilSomeoneIsBlockedBy(blocker: number, deadlineMs = 25000): Promise<number> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    const r = await monitor.query(
      `SELECT a.pid FROM pg_stat_activity a
        WHERE a.datname = current_database() AND a.wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(a.pid))`,
      [blocker],
    );
    if (r.rows[0]) return Number(r.rows[0].pid);
    await sleep(25);
  }
  throw new Error(`nobody was ever observed waiting on backend ${blocker}`);
}

/**
 * Parks the real writer on the failure-mode row (its LAST lock) after it has decided, then proves the
 * hostile statement is queued BEHIND the writer's own backend rather than merely being slow.
 */
async function hostileDuringWindow(writer: () => Promise<Response>, hostile: { text: string; values: unknown[] }) {
  const t3 = await connect(`${P}t3`);
  const t2 = await connect(`${P}t2`);
  try {
    const t3pid = await pidOf(t3);
    const t2pid = await pidOf(t2);
    await t3.query("BEGIN");
    await t3.query(`SELECT 1 FROM "IndustrialFailureMode" WHERE "id" = $1 FOR UPDATE`, [FM]);

    const pending = writer();
    const t1pid = await waitUntilSomeoneIsBlockedBy(t3pid);       // T1 is parked on the failure mode: its scope locks are already taken

    await t2.query("BEGIN");
    let hostileDone = false;
    const hostileRun = t2.query(hostile.text, hostile.values).then(() => { hostileDone = true; });
    const until = Date.now() + 6000;
    let blockedByWriter = false;
    while (Date.now() < until && !hostileDone && !blockedByWriter) {
      const r = await monitor.query(
        `SELECT 1 FROM pg_stat_activity a WHERE a.pid = $1 AND a.wait_event_type = 'Lock' AND $2::int = ANY(pg_blocking_pids(a.pid))`,
        [t2pid, t1pid],
      );
      blockedByWriter = r.rows.length > 0;
      if (!blockedByWriter) await sleep(25);
    }
    const hostileCompletedBeforeWriterCommit = hostileDone;

    await t3.query("ROLLBACK");                                   // release the failure mode → the writer writes and commits
    const res = await pending;
    await hostileRun;
    await t2.query("COMMIT");
    return { blockedByWriter, hostileCompletedBeforeWriterCommit, status: res.status };
  } finally {
    await t3.query("ROLLBACK").catch(() => undefined);
    await t2.query("ROLLBACK").catch(() => undefined);
    await t3.end();
    await t2.end();
    await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [S1, A1]);
    await monitor.query(`UPDATE "IndustrialSite" SET "status" = 'ACTIVE' WHERE "organizationId" = $1`, [ORG]);
  }
}

const moveAsset = { text: `UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, values: [S2, A1] };
const deactivateS1 = { text: `UPDATE "IndustrialSite" SET "status" = 'INACTIVE' WHERE "id" = $1`, values: [S1] };

beforeAll(async () => {
  const c = await getPrisma(); if (!c) throw new Error("No database. Set HERMES_STORAGE_MODE=database and DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = c as unknown as Record<string, Model>;
  monitor = await connect(MON_APP);
  await purge();
  await seed();
}, 600000);
afterAll(async () => {
  if (db) await purge();
  if (monitor) await monitor.end();
}, 600000);

describe("e2 RV-T1 — the authorisation locks are held until the write commits", () => {
  it("e2-L1 create: an asset move attempted after the decision is queued behind the writer", async () => {
    const r = await hostileDuringWindow(() => createCase({ title: "E2L-L1", assetId: A1, failureModeId: FM }), moveAsset);
    expect(r.hostileCompletedBeforeWriterCommit).toBe(false);
    expect(r.blockedByWriter).toBe(true);
    expect(r.status).toBe(201);
  });

  it("e2-L2 create: a site deactivation attempted after the decision is queued behind the writer", async () => {
    const r = await hostileDuringWindow(() => createCase({ title: "E2L-L2", siteId: S1, failureModeId: FM }), deactivateS1);
    expect(r.hostileCompletedBeforeWriterCommit).toBe(false);
    expect(r.blockedByWriter).toBe(true);
    expect(r.status).toBe(201);
  });

  it("e2-L3 update: an asset move attempted after the decision is queued behind the writer", async () => {
    const id = await freshCase({ siteId: null, assetId: A1 });
    const r = await hostileDuringWindow(() => patchCase(id, { title: "E2L-L3", failureModeId: FM }), moveAsset);
    expect(r.hostileCompletedBeforeWriterCommit).toBe(false);
    expect(r.blockedByWriter).toBe(true);
    expect(r.status).toBe(200);
  });

  it("e2-L4 update: a site deactivation attempted after the decision is queued behind the writer", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    const r = await hostileDuringWindow(() => patchCase(id, { title: "E2L-L4", failureModeId: FM }), deactivateS1);
    expect(r.hostileCompletedBeforeWriterCommit).toBe(false);
    expect(r.blockedByWriter).toBe(true);
    expect(r.status).toBe(200);
  });

  it("e2-L5 update: a change to the CASE ROW itself attempted after the decision is queued behind the writer", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    const r = await hostileDuringWindow(
      () => patchCase(id, { title: "E2L-L5", failureModeId: FM }),
      { text: `UPDATE "IndustrialEngineeringCase" SET "siteId" = $1 WHERE "id" = $2`, values: [S2, id] },
    );
    expect(r.hostileCompletedBeforeWriterCommit).toBe(false);
    expect(r.blockedByWriter).toBe(true);
    expect(r.status).toBe(200);
  });
});

describe("e2 lock-hold teardown", () => {
  it("e2-LZ no fixture, blocked backend or open transaction remains", async () => {
    const open = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND application_name LIKE $1 AND (state LIKE 'idle in transaction%' OR wait_event_type = 'Lock')`,
      [`${P}%`],
    );
    expect(open.rows[0].n).toBe(0);
    await purge();
    expect(await residue()).toEqual({});
  });
});
