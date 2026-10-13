/**
 * Slice D2 — REAL PostgreSQL concurrency proof for the Knowledge Case update pin.
 *
 * `updateCase` (1) reads the case through the canonical visibility policy, (2) validates the resulting
 * scope and (3) writes with `WHERE { id, organizationId, siteId: <observed>, assetId: <observed> }`.
 * These tests drive a genuine race against a disposable PostgreSQL:
 *
 *   T2 — a separate raw `pg` connection — moves the case to a hidden site / hidden asset inside an open
 *        transaction, holding the row lock;
 *   T1 — the REAL `PATCH /api/knowledge/cases/[id]` route → real `updateCase` → real Prisma — reads the
 *        old committed scope (READ COMMITTED: a plain read does not wait for T2), passes the visibility
 *        check, and BLOCKS on its pinned UPDATE;
 *   the test PROVES T1 is waiting on T2 from `pg_stat_activity` / `pg_blocking_pids` / `pg_locks`
 *   (polling observed lock state with a deadline — never a bare sleep), then commits (or rolls back) T2.
 *
 * After a COMMIT PostgreSQL re-evaluates T1's WHERE against the new row version (EvalPlanQual): the
 * pinned siteId/assetId no longer match, zero rows are written, the route answers 404 and the row keeps
 * T2's values. Without the pin the same race WRITES the hidden case — the mutation the suite must kill.
 *
 * REAL: route, requireOrgActor, requirePermission, resolveGraphViewerScope (OrganizationMember / UserSite /
 * IndustrialSite), the case policy SQL, Prisma, PostgreSQL locking. MOCKED: the token layer and
 * `requirePlatformAuth` (org from `x-test-org`), metering and the audit WRITE.
 * Fixtures use the `d2-c-` prefix; only they are removed and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
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
const caseIdRoute = await import("@/app/api/knowledge/cases/[id]/route");

const P = "d2-c-";
const ORG = `${P}org`;
const S1 = `${P}s1`, S2 = `${P}s2`;
const A1 = `${P}a1`, A2 = `${P}a2`;
const ENG = `${P}u-eng1`;          // ENGINEER, ACTIVE grant on S1 only: S2 and its assets are hidden
const USERS = [ENG];
const T2_APP = `${P}t2`, MON_APP = `${P}monitor`;
const TABLE = `"IndustrialEngineeringCase"`;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; findFirst: (a?: unknown) => Promise<Row | null>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
let monitor: pg.Client;
const ORG_TABLES = ["industrialEngineeringCase", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: ORG };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: ORG }, { entityId: { startsWith: P } }] } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const w = { organizationId: ORG };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: ORG }, { entityId: { startsWith: P } }] } });
  left.organization = await db.organization.count({ where: { id: ORG } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  await db.user.create({ data: { id: ENG, name: ENG, email: `${ENG}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  await db.organization.create({ data: { id: ORG, name: ORG, slug: ORG, updatedAt: now() } });
  for (const id of [S1, S2]) await db.industrialSite.create({ data: { id, organizationId: ORG, name: id, slug: id, status: "ACTIVE", updatedAt: now() } });
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: ENG, siteId: S1, organizationId: ORG, role: "SITE_VIEWER", status: "ACTIVE" } });
  await db.industrialAsset.create({ data: { id: A1, organizationId: ORG, siteId: S1, name: `${A1}-name` } });
  await db.industrialAsset.create({ data: { id: A2, organizationId: ORG, siteId: S2, name: `${A2}-name` } });
}

let seq = 0;
/** A fresh case at the VISIBLE scope S1 / A1 for each race. */
async function freshCase(): Promise<string> {
  const id = `${P}case-${++seq}`;
  await db.industrialEngineeringCase.create({ data: {
    id, organizationId: ORG, title: `D2C-ORIGINAL-${seq}`, titleNorm: `d2c-original-${seq}`, diagnosis: `D2C-DIAG-${seq}`,
    symptoms: [], keywords: [], siteId: S1, assetId: A1,
  } });
  return id;
}
const rowOf = (id: string) => db.industrialEngineeringCase.findFirst({ where: { id } });

const patchReq = (id: string, body: unknown) =>
  new NextRequest(new URL(`/api/knowledge/cases/${id}`, "http://localhost"), {
    method: "PATCH", body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${ENG}`, "x-test-org": ORG },
  });
async function patchCase(id: string, body: unknown): Promise<{ status: number; text: string }> {
  const res = await (caseIdRoute.PATCH as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(patchReq(id, body), { params: Promise.resolve({ id }) });
  return { status: res.status, text: await res.text() };
}

const connect = async (application_name: string) => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name });
  await c.connect();
  return c;
};

/** Lock evidence is appended to $D2_EVIDENCE_OUT (when set) so the run can be reported verbatim. */
function record(label: string, e: WaitEvidence): void {
  const out = process.env.D2_EVIDENCE_OUT;
  if (!out) return;
  fs.appendFileSync(out, JSON.stringify({ label, ...e, query: e.query.replace(/\s+/g, " ").slice(0, 400) }) + "\n");
}

interface WaitEvidence { waiterPid: number; waitEventType: string | null; waitEvent: string | null; query: string; ungrantedLocks: { locktype: string; mode: string }[] }

/**
 * Poll PostgreSQL until a backend is blocked BY `blockerPid` on an UPDATE of the case table, or fail at the
 * deadline. Synchronisation is on observed lock state; the short pause between polls is only pacing.
 */
async function waitUntilBlockedBy(blockerPid: number, settled: () => boolean, deadlineMs = 20000): Promise<WaitEvidence> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (settled()) throw new Error("T1 finished without ever waiting on T2's row lock");
    const r = await monitor.query(
      `SELECT a.pid, a.wait_event_type, a.wait_event, a.query
         FROM pg_stat_activity a
        WHERE a.datname = current_database()
          AND $1::int = ANY(pg_blocking_pids(a.pid))`,
      [blockerPid],
    );
    const hit = r.rows[0];
    if (hit) {
      const locks = await monitor.query(`SELECT locktype, mode FROM pg_locks WHERE pid = $1 AND NOT granted`, [hit.pid]);
      return { waiterPid: Number(hit.pid), waitEventType: hit.wait_event_type, waitEvent: hit.wait_event, query: String(hit.query), ungrantedLocks: locks.rows };
    }
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error("deadline: T1 was never observed waiting on T2");
}

/**
 * Run one race. `t2Sql` is executed by T2 inside an open transaction (row lock held); T1 is the real PATCH.
 * `finish` is "commit" or "rollback". Returns T1's response and the wait evidence.
 */
async function race(caseId: string, t2Sql: { text: string; values: unknown[] }, finish: "commit" | "rollback", t1Body: unknown) {
  const t2 = await connect(T2_APP);
  let t2Open = false;
  try {
    const pid = Number((await t2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await t2.query("BEGIN");
    t2Open = true;
    const upd = await t2.query(t2Sql.text, t2Sql.values);
    expect(upd.rowCount).toBe(1);                               // T2 now holds the row lock, uncommitted

    let done = false;
    const t1 = patchCase(caseId, t1Body).finally(() => { done = true; });
    const evidence = await waitUntilBlockedBy(pid, () => done);
    expect(done).toBe(false);                                   // still blocked when the evidence was taken

    await t2.query(finish === "commit" ? "COMMIT" : "ROLLBACK");
    t2Open = false;
    const res = await t1;
    return { res, evidence, t2Pid: pid };
  } finally {
    if (t2Open) await t2.query("ROLLBACK").catch(() => undefined);
    await t2.end();
  }
}

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

describe("d2-case-concurrency — the update pin under a real PostgreSQL race", () => {
  it("d2-01 baseline: without a race the engineer's PATCH of the visible S1/A1 case succeeds", async () => {
    const id = await freshCase();
    const r = await patchCase(id, { title: "D2C-BASELINE" });
    expect(r.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "D2C-BASELINE", siteId: S1, assetId: A1 });
  });

  it("d2-02/03/05 SITE race: T2 moves the case to hidden site S2 and commits → T1's pinned UPDATE writes 0 rows, 404, nothing leaks", async () => {
    const id = await freshCase();
    const { res, evidence } = await race(id, { text: `UPDATE ${TABLE} SET "siteId" = $1, "assetId" = NULL WHERE "id" = $2`, values: [S2, id] }, "commit", { title: "D2C-T1-WRITE" });

    // T1 got past the visibility read (old committed scope) and was blocked IN its UPDATE by T2.
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.ungrantedLocks.length).toBeGreaterThan(0);
    // The blocked statement belongs to the case write path: the case row lock, a scope lock, or the update.
    expect(evidence.query).toMatch(/IndustrialEngineeringCase|IndustrialAsset|IndustrialSite/);
    record("d2-02 site race", evidence);

    // The pinned WHERE no longer matched: T1 wrote nothing and answered "not found".
    expect(res.status).toBe(404);
    const row = await rowOf(id);
    expect(row).toMatchObject({ siteId: S2, assetId: null, title: expect.stringMatching(/^D2C-ORIGINAL-/) });
    expect(row?.title).not.toBe("D2C-T1-WRITE");
    // The hidden case's content never reaches the caller.
    expect(res.text).not.toContain("D2C-ORIGINAL");
    expect(res.text).not.toContain("D2C-DIAG");
    expect(res.text).not.toContain(S2);
  });

  it("d2-02b/03/05 ASSET race: T2 re-points the case to a hidden asset (S2) and commits → 0 rows, 404, nothing leaks", async () => {
    const id = await freshCase();
    const { res, evidence } = await race(id, { text: `UPDATE ${TABLE} SET "assetId" = $1 WHERE "id" = $2`, values: [A2, id] }, "commit", { title: "D2C-T1-WRITE" });
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.ungrantedLocks.length).toBeGreaterThan(0);
    record("d2-02b asset race", evidence);
    expect(res.status).toBe(404);
    const row = await rowOf(id);
    expect(row).toMatchObject({ siteId: S1, assetId: A2 });
    expect(row?.title).not.toBe("D2C-T1-WRITE");
    expect(res.text).not.toContain("D2C-ORIGINAL");
    expect(res.text).not.toContain(A2);
  });

  it("d2-04 ROLLBACK: T2 rolls back → T1 resumes, its pin still matches and the visible case is updated (200)", async () => {
    const id = await freshCase();
    const { res, evidence } = await race(id, { text: `UPDATE ${TABLE} SET "siteId" = $1, "assetId" = NULL WHERE "id" = $2`, values: [S2, id] }, "rollback", { title: "D2C-AFTER-ROLLBACK" });
    expect(evidence.waitEventType).toBe("Lock");
    record("d2-04 rollback", evidence);
    expect(res.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "D2C-AFTER-ROLLBACK", siteId: S1, assetId: A1 });
  });

  it("d2-04b control: T2 commits a NON-scope change → the pin still matches and T1 proceeds (the pin is not over-blocking)", async () => {
    const id = await freshCase();
    const { res, evidence } = await race(id, { text: `UPDATE ${TABLE} SET "diagnosis" = $1 WHERE "id" = $2`, values: ["D2C-T2-DIAG", id] }, "commit", { title: "D2C-AFTER-NONSCOPE" });
    expect(evidence.waitEventType).toBe("Lock");
    expect(res.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "D2C-AFTER-NONSCOPE", diagnosis: "D2C-T2-DIAG", siteId: S1, assetId: A1 });
  });

  it("d2-07 no blocked or open transaction remains, and teardown leaves zero residue", async () => {
    const open = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND application_name = $1`, [T2_APP]);
    expect(open.rows[0].n).toBe(0);
    const idleInTx = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`);
    expect(idleInTx.rows[0].n).toBe(0);
    const blocked = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`);
    expect(blocked.rows[0].n).toBe(0);

    await purge();
    expect(await residue()).toEqual({});
  });
});
