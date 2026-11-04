/**
 * Slice E1 / independent review S2-01 — the Knowledge Case write is atomic with its AUTHORISATION,
 * proven against REAL PostgreSQL.
 *
 * Slice D2 proved the pin on the case's OWN columns (R1/R2). The independent review then showed the
 * decision still rested on values other rows own: the case's asset could be MOVED to a hidden site, or
 * the authoritative site could be DEACTIVATED, between the check and the write — and the write landed.
 *
 * The remediation decides everything inside ONE transaction, under row locks taken in a fixed order
 * (case row `FOR UPDATE`, then assets, then sites, then the failure mode, each `FOR SHARE`), and
 * re-reads the locked values before writing (see lib/site/write-locks.ts).
 *
 * EACH RACE HERE IS REAL:
 *   T2 = a separate raw `pg` connection that performs the hostile change inside an open transaction and
 *        holds the row lock;
 *   T1 = the REAL route (`PATCH`/`POST /api/knowledge/cases`) → real service → real Prisma;
 *   the test PROVES T1 is waiting ON T2 through `pg_stat_activity` + `pg_blocking_pids` + `pg_locks`
 *        (polling observed lock state with a deadline; never a bare sleep as the only evidence),
 *   then commits or rolls T2 back and asserts the DATABASE STATE, not only the HTTP status.
 *
 * REAL: routes, requireOrgActor, requirePermission, resolveGraphViewerScope (OrganizationMember /
 * UserSite / IndustrialSite), the case policy SQL, the write locks, Prisma, PostgreSQL locking.
 * MOCKED: the token layer and `requirePlatformAuth` (org from `x-test-org`), metering, the audit WRITE
 * (captured in-process so "no misleading audit event" can be asserted).
 * Fixtures use the `e1-c-` prefix; only they are removed and any leftover fails the run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import pg from "pg";

const audit = vi.hoisted(() => ({ events: [] as { action: string; entityId?: string }[] }));

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
  return {
    ...orig,
    recordAuditEvent: async (e: { action: string; entityId?: string }) => { audit.events.push(e); },
  };
});

const { getPrisma } = await import("@/lib/db/prisma");
const casesRoute = await import("@/app/api/knowledge/cases/route");
const caseIdRoute = await import("@/app/api/knowledge/cases/[id]/route");

const P = "e1-c-";
const ORG = `${P}org`, ORG_B = `${P}org-b`;
const ORGS = [ORG, ORG_B];
const S1 = `${P}s1`, S2 = `${P}s2`, SB = `${P}sb`;
const A1 = `${P}a1`, A2 = `${P}a2`, AB = `${P}ab`;
const FM = `${P}fm`, FM_B = `${P}fm-b`;
/** ENGINEER (manage_knowledge), ACTIVE grant on S1 only: S2, SB and their assets are hidden. */
const ENG = `${P}u-eng1`;
const USERS = [ENG];
const T2_APP = `${P}t2`, MON_APP = `${P}monitor`;
const CASES = `"IndustrialEngineeringCase"`;

type Row = Record<string, unknown>;
interface Model { create: (a: unknown) => Promise<Row>; findFirst: (a?: unknown) => Promise<Row | null>; findMany: (a?: unknown) => Promise<Row[]>; deleteMany: (a: unknown) => Promise<{ count: number }>; count: (a?: unknown) => Promise<number> }
let db: Record<string, Model>;
let monitor: pg.Client;
const ORG_TABLES = ["industrialEngineeringCase", "industrialFailureMode", "industrialAsset", "userSite", "organizationMember", "industrialSite"];

async function purge() {
  const w = { organizationId: { in: ORGS } };
  for (const m of ORG_TABLES) await db[m].deleteMany({ where: w });
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: { in: USERS } } });
}
async function residue(): Promise<Record<string, number>> {
  const w = { organizationId: { in: ORGS } };
  const left: Record<string, number> = {};
  for (const m of ORG_TABLES) left[m] = await db[m].count({ where: w });
  left.auditLog = await db.auditLog.count({ where: { OR: [{ organizationId: { in: ORGS } }, { entityId: { startsWith: P } }] } });
  left.organization = await db.organization.count({ where: { id: { in: ORGS } } });
  left.user = await db.user.count({ where: { id: { in: USERS } } });
  return Object.fromEntries(Object.entries(left).filter(([, n]) => n !== 0));
}

const now = () => new Date();
async function seed() {
  await db.user.create({ data: { id: ENG, name: ENG, email: `${ENG}@example.invalid`, passwordHash: "NOT-A-REAL-HASH", updatedAt: now() } });
  for (const id of ORGS) await db.organization.create({ data: { id, name: id, slug: id, updatedAt: now() } });
  const site = (id: string, org: string) => db.industrialSite.create({ data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: now() } });
  await site(S1, ORG); await site(S2, ORG); await site(SB, ORG_B);
  await db.organizationMember.create({ data: { organizationId: ORG, userId: ENG, role: "ENGINEER", status: "ACTIVE" } });
  await db.userSite.create({ data: { userId: ENG, siteId: S1, organizationId: ORG, role: "SITE_VIEWER", status: "ACTIVE" } });
  const asset = (id: string, org: string, siteId: string) => db.industrialAsset.create({ data: { id, organizationId: org, siteId, name: `${id}-name` } });
  await asset(A1, ORG, S1); await asset(A2, ORG, S2); await asset(AB, ORG_B, SB);
  const fm = (id: string, org: string) => db.industrialFailureMode.create({ data: { id, organizationId: org, name: id, nameNorm: id, description: "d", severity: "HIGH" } });
  await fm(FM, ORG); await fm(FM_B, ORG_B);
}

let seq = 0;
/** A fresh case at the given (visible) scope. */
async function freshCase(scope: { siteId: string | null; assetId: string | null }): Promise<string> {
  const id = `${P}case-${++seq}`;
  await db.industrialEngineeringCase.create({ data: {
    id, organizationId: ORG, title: `E1C-ORIGINAL-${seq}`, titleNorm: `e1c-original-${seq}`, diagnosis: `E1C-DIAG-${seq}`,
    symptoms: [], keywords: [], siteId: scope.siteId, assetId: scope.assetId,
  } });
  return id;
}
const rowOf = (id: string) => db.industrialEngineeringCase.findFirst({ where: { id } });

type Res = { status: number; text: string; json: Row };
async function settle(res: Response): Promise<Res> {
  const text = await res.text();
  let json: Row = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body */ }
  return { status: res.status, text, json };
}
const req = (method: string, path: string, body?: unknown) =>
  new NextRequest(new URL(path, "http://localhost"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: `hermes_at=t:${ENG}`, "x-test-org": ORG },
  });
const patchCase = (id: string, body: unknown): Promise<Res> =>
  (caseIdRoute.PATCH as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
    req("PATCH", `/api/knowledge/cases/${id}`, body), { params: Promise.resolve({ id }) },
  ).then(settle);
const createCaseReq = (body: unknown): Promise<Res> =>
  (casesRoute.POST as (r: NextRequest) => Promise<Response>)(req("POST", "/api/knowledge/cases", body)).then(settle);

const connect = async (application_name: string) => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name });
  await c.connect();
  return c;
};

interface WaitEvidence { label: string; waiterPid: number; waitEventType: string | null; waitEvent: string | null; query: string; ungrantedLocks: { locktype: string; mode: string }[] }

function record(e: WaitEvidence): void {
  const out = process.env.E1_EVIDENCE_OUT;
  if (!out) return;
  fs.appendFileSync(out, JSON.stringify({ ...e, query: e.query.replace(/\s+/g, " ").slice(0, 400) }) + "\n");
}

/**
 * Poll PostgreSQL until some backend is blocked BY `blockerPid`, or fail at the deadline. The wait is
 * decided from observed lock state; the pause between polls is pacing only.
 */
async function waitUntilBlockedBy(label: string, blockerPid: number, settled: () => boolean, deadlineMs = 20000): Promise<WaitEvidence> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (settled()) throw new Error(`${label}: T1 finished without ever waiting on T2`);
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
      const evidence: WaitEvidence = {
        label, waiterPid: Number(hit.pid), waitEventType: hit.wait_event_type, waitEvent: hit.wait_event,
        query: String(hit.query), ungrantedLocks: locks.rows,
      };
      record(evidence);
      return evidence;
    }
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`${label}: deadline — T1 was never observed waiting on T2`);
}

/**
 * One race: T2 runs `t2Sql` inside an open transaction (holding the lock), T1 is the real request, the
 * wait is proven, then T2 is committed or rolled back and T1's result returned.
 */
async function race(
  label: string,
  t2Sql: { text: string; values: unknown[] },
  finish: "commit" | "rollback",
  t1: () => Promise<Res>,
): Promise<{ res: Res; evidence: WaitEvidence }> {
  const t2 = await connect(T2_APP);
  let open = false;
  try {
    const pid = Number((await t2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await t2.query("BEGIN");
    open = true;
    const upd = await t2.query(t2Sql.text, t2Sql.values);
    expect(upd.rowCount).toBe(1);                                  // T2 holds the row lock, uncommitted

    let done = false;
    const pending = t1().finally(() => { done = true; });
    const evidence = await waitUntilBlockedBy(label, pid, () => done);
    expect(done).toBe(false);                                      // still blocked when the evidence was taken

    await t2.query(finish === "commit" ? "COMMIT" : "ROLLBACK");
    open = false;
    return { res: await pending, evidence };
  } finally {
    if (open) await t2.query("ROLLBACK").catch(() => undefined);
    await t2.end();
  }
}

const moveAsset = (assetId: string, siteId: string) => ({ text: `UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, values: [siteId, assetId] });
const deactivateSite = (siteId: string) => ({ text: `UPDATE "IndustrialSite" SET "status" = 'INACTIVE' WHERE "id" = $1`, values: [siteId] });
const moveCase = (id: string, siteId: string | null, assetId: string | null) => ({ text: `UPDATE ${CASES} SET "siteId" = $1, "assetId" = $2 WHERE "id" = $3`, values: [siteId, assetId, id] });

/** Restores the fixture rows the hostile transactions committed. */
async function restoreFixtures() {
  await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [S1, A1]);
  await monitor.query(`UPDATE "IndustrialAsset" SET "siteId" = $1 WHERE "id" = $2`, [S2, A2]);
  await monitor.query(`UPDATE "IndustrialSite" SET "status" = 'ACTIVE' WHERE "organizationId" = $1`, [ORG]);
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

describe("e1 case authorization race — update", () => {
  it("e1-00 baseline: the engineer may patch a visible S1 case, and the stored row changes", async () => {
    const id = await freshCase({ siteId: S1, assetId: A1 });
    const r = await patchCase(id, { title: "E1C-BASELINE" });
    expect(r.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "E1C-BASELINE", siteId: S1, assetId: A1 });
  });

  it("e1-R1 the case's OWN site is moved to hidden S2 and committed → 0 rows written, 404, no leak", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    const { res, evidence } = await race("R1", moveCase(id, S2, null), "commit", () => patchCase(id, { title: "E1C-T1" }));
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.ungrantedLocks.length).toBeGreaterThan(0);
    expect(res.status).toBe(404);
    const row = await rowOf(id);
    expect(row).toMatchObject({ siteId: S2, assetId: null });
    expect(row?.title).not.toBe("E1C-T1");
    expect(res.text).not.toContain("E1C-ORIGINAL");
    expect(res.text).not.toContain(S2);
  });

  it("e1-R2 the same race rolled back → T1 proceeds and writes exactly once", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    const { res, evidence } = await race("R2", moveCase(id, S2, null), "rollback", () => patchCase(id, { title: "E1C-AFTER-R2" }));
    expect(evidence.waitEventType).toBe("Lock");
    expect(res.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "E1C-AFTER-R2", siteId: S1, assetId: null });
  });

  it("e1-R3 asset-only case: the ASSET is moved to hidden S2 and committed → no write at all, 404", async () => {
    const id = await freshCase({ siteId: null, assetId: A1 });
    try {
      const { res, evidence } = await race("R3", moveAsset(A1, S2), "commit", () => patchCase(id, { title: "E1C-T1-R3" }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(evidence.ungrantedLocks.length).toBeGreaterThan(0);
      expect(res.status).toBe(404);
      const row = await rowOf(id);
      expect(row).toMatchObject({ siteId: null, assetId: A1 });        // untouched
      expect(row?.title).toMatch(/^E1C-ORIGINAL-/);
      expect(row?.diagnosis).toMatch(/^E1C-DIAG-/);                    // no field of the case changed
      expect(res.text).not.toContain("E1C-ORIGINAL");
      expect(res.text).not.toContain(S2);
    } finally { await restoreFixtures(); }
  });

  it("e1-R3b the same asset race rolled back → T1 proceeds and writes exactly once", async () => {
    const id = await freshCase({ siteId: null, assetId: A1 });
    const { res, evidence } = await race("R3b", moveAsset(A1, S2), "rollback", () => patchCase(id, { title: "E1C-AFTER-R3B" }));
    expect(evidence.waitEventType).toBe("Lock");
    expect(res.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "E1C-AFTER-R3B", siteId: null, assetId: A1 });
    expect(await db.industrialAsset.findFirst({ where: { id: A1 } })).toMatchObject({ siteId: S1 });
  });

  it("e1-R4 site+asset case: the asset is moved so the pair no longer agrees → no write, 404", async () => {
    const id = await freshCase({ siteId: S1, assetId: A1 });
    try {
      const { res, evidence } = await race("R4", moveAsset(A1, S2), "commit", () => patchCase(id, { title: "E1C-T1-R4" }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(res.status).toBe(404);
      const row = await rowOf(id);
      expect(row).toMatchObject({ siteId: S1, assetId: A1 });
      expect(row?.title).toMatch(/^E1C-ORIGINAL-/);
    } finally { await restoreFixtures(); }
  });

  it("e1-R5 the authoritative SITE is deactivated mid-request → no write, 404", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    try {
      const { res, evidence } = await race("R5", deactivateSite(S1), "commit", () => patchCase(id, { title: "E1C-T1-R5" }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(evidence.ungrantedLocks.length).toBeGreaterThan(0);
      expect(res.status).toBe(404);
      const row = await rowOf(id);
      expect(row).toMatchObject({ siteId: S1, assetId: null });
      expect(row?.title).toMatch(/^E1C-ORIGINAL-/);
    } finally { await restoreFixtures(); }
  });

  it("e1-R5b site deactivation rolled back → the valid write succeeds exactly once", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    const { res, evidence } = await race("R5b", deactivateSite(S1), "rollback", () => patchCase(id, { title: "E1C-AFTER-R5B" }));
    expect(evidence.waitEventType).toBe("Lock");
    expect(res.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ title: "E1C-AFTER-R5B", siteId: S1 });
    expect(await db.industrialSite.findFirst({ where: { id: S1 } })).toMatchObject({ status: "ACTIVE" });
  });

  it("e1-R6 a FOREIGN-organisation replacement of the asset's site is refused uniformly", async () => {
    const id = await freshCase({ siteId: null, assetId: A1 });
    try {
      // The asset is re-pointed at organisation B's site: the asset is still "this organisation's" by
      // column, but its site is not, so the case is no longer writable.
      const { res, evidence } = await race("R6", moveAsset(A1, SB), "commit", () => patchCase(id, { title: "E1C-T1-R6" }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: "Not found or update failed" });     // same body as a missing case
      const row = await rowOf(id);
      expect(row?.title).toMatch(/^E1C-ORIGINAL-/);
      expect(res.text).not.toContain(SB);
    } finally { await restoreFixtures(); }
  });

  it("e1-R7 a patch that MOVES the case onto an asset which is being moved away is refused, nothing written", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    try {
      const { res, evidence } = await race("R7", moveAsset(A1, S2), "commit", () => patchCase(id, { assetId: A1 }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(res.status).toBe(404);
      expect(await rowOf(id)).toMatchObject({ siteId: S1, assetId: null });
    } finally { await restoreFixtures(); }
  });
});

describe("e1 case authorization race — create", () => {
  const created = () => db.industrialEngineeringCase.findMany({ where: { organizationId: ORG, title: { startsWith: "E1C-NEW" } } });

  it("e1-C1 the referenced asset moves to an unauthorized site while the create waits → no case, no audit", async () => {
    audit.events = [];
    try {
      const { res, evidence } = await race("C1", moveAsset(A1, S2), "commit", () => createCaseReq({ title: "E1C-NEW-C1", assetId: A1 }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ error: "Site or asset not found" });
      expect(await created()).toHaveLength(0);
      expect(audit.events).toHaveLength(0);                                  // no misleading audit event
    } finally { await restoreFixtures(); }
  });

  it("e1-C2 the same create race rolled back → exactly ONE valid case, with the validated scope", async () => {
    audit.events = [];
    const { res, evidence } = await race("C2", moveAsset(A1, S2), "rollback", () => createCaseReq({ title: "E1C-NEW-C2", assetId: A1 }));
    expect(evidence.waitEventType).toBe("Lock");
    expect(res.status).toBe(201);
    const rows = await db.industrialEngineeringCase.findMany({ where: { organizationId: ORG, title: "E1C-NEW-C2" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ siteId: null, assetId: A1, organizationId: ORG });
    expect(audit.events.map((e) => e.action)).toEqual(["knowledge.case.created"]);
  });

  it("e1-C3 the referenced SITE is deactivated while the create waits → no case, no audit", async () => {
    audit.events = [];
    try {
      const { res, evidence } = await race("C3", deactivateSite(S1), "commit", () => createCaseReq({ title: "E1C-NEW-C3", siteId: S1 }));
      expect(evidence.waitEventType).toBe("Lock");
      expect(res.status).toBe(404);
      expect(await db.industrialEngineeringCase.findMany({ where: { title: "E1C-NEW-C3" } })).toHaveLength(0);
      expect(audit.events).toHaveLength(0);
    } finally { await restoreFixtures(); }
  });

  it("e1-C4 a FOREIGN-organisation failureModeId cannot be attached (create or patch), nothing written", async () => {
    const create = await createCaseReq({ title: "E1C-NEW-C4", siteId: S1, failureModeId: FM_B });
    expect(create.status).toBe(404);
    expect(create.json).toEqual({ error: "Failure mode not found" });
    expect(await db.industrialEngineeringCase.findMany({ where: { title: "E1C-NEW-C4" } })).toHaveLength(0);

    const ok = await createCaseReq({ title: "E1C-NEW-C4-OK", siteId: S1, failureModeId: FM });
    expect(ok.status).toBe(201);
    const id = String((ok.json.case as Row).id);
    const patchForeign = await patchCase(id, { failureModeId: FM_B });
    expect(patchForeign.status).toBe(404);
    expect(await rowOf(id)).toMatchObject({ failureModeId: FM });
    const patchMissing = await patchCase(id, { failureModeId: `${P}no-such-fm` });
    expect({ status: patchMissing.status, json: patchMissing.json }).toEqual({ status: patchForeign.status, json: patchForeign.json });
  });

  /**
   * `IndustrialAsset.siteId` is a plain foreign key to `IndustrialSite(id)` with no composite constraint
   * tying it to the same organisation, so an asset of organisation B STANDING ON one of this actor's
   * ACTIVE sites is a legal database state. The asset lock therefore has to carry the organisation
   * predicate itself: a site check alone would accept that asset, because its site IS in scope.
   */
  it("e1-C6 a FOREIGN-organisation asset standing on the actor's own ACTIVE site is still refused", async () => {
    const foreignOnOurSite = `${P}ab-on-s1`;
    await db.industrialAsset.create({ data: { id: foreignOnOurSite, organizationId: ORG_B, siteId: S1, name: `${foreignOnOurSite}-name` } });
    try {
      const create = await createCaseReq({ title: "E1C-NEW-C6", assetId: foreignOnOurSite });
      expect(create.status).toBe(404);
      expect(create.json).toEqual({ error: "Site or asset not found" });
      expect(await db.industrialEngineeringCase.findMany({ where: { title: "E1C-NEW-C6" } })).toHaveLength(0);

      const id = await freshCase({ siteId: S1, assetId: null });
      const patch = await patchCase(id, { assetId: foreignOnOurSite });
      expect(patch.status).toBe(404);
      expect(await rowOf(id)).toMatchObject({ siteId: S1, assetId: null });   // nothing written
      // And the same answer as for an asset that does not exist at all.
      const missing = await patchCase(id, { assetId: `${P}no-such-asset` });
      expect({ status: missing.status, json: missing.json }).toEqual({ status: patch.status, json: patch.json });
    } finally {
      await db.industrialAsset.deleteMany({ where: { id: foreignOnOurSite } });
    }
  });

  it("e1-C5 a PATCH body that is not a JSON object is a controlled 400, never a 500", async () => {
    const id = await freshCase({ siteId: S1, assetId: null });
    for (const body of ["null", "[]", '"x"', "7", "not json at all"]) {
      const res = await (caseIdRoute.PATCH as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
        new NextRequest(new URL(`/api/knowledge/cases/${id}`, "http://localhost"), {
          method: "PATCH", body,
          headers: { "content-type": "application/json", cookie: `hermes_at=t:${ENG}`, "x-test-org": ORG },
        }), { params: Promise.resolve({ id }) },
      ).then(settle);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
      expect(res.json).toEqual({ error: "Request body must be a JSON object" });
    }
    expect((await rowOf(id))?.title).toMatch(/^E1C-ORIGINAL-/);
  });
});

describe("e1 teardown", () => {
  it("e1-Z no fixture, blocked backend or open test transaction remains", async () => {
    const open = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1`, [T2_APP]);
    expect(open.rows[0].n).toBe(0);
    const idleInTx = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()`);
    expect(idleInTx.rows[0].n).toBe(0);
    const blocked = await monitor.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`);
    expect(blocked.rows[0].n).toBe(0);

    await purge();
    expect(await residue()).toEqual({});
  });
});
