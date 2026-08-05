import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { createErasureJobForParent, approveErasurePlanForOrg } from "@/lib/compliance/erasure-db";

/**
 * Phase 97 Part H — real-PostgreSQL rehearsal. Proves against the actual DB: the
 * closed lifecycle CHECK; the composite parent-tuple binding (foreign org/user
 * rejected, parent delete RESTRICTED); parentless-state, plan-evidence, approval,
 * execution-idempotency and planHash-format CHECKs; one ACTIVE governed job per
 * parent; and — via the ACTUAL persistence functions on independent connections —
 * concurrent child creation and concurrent approval binding.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97h";
const ORG = `${TAG}-org`, USER = `${TAG}-user`, PR = `${TAG}-pr`;
const HEX = "a".repeat(64);

type Pg = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T> };
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }
// Delete by organizationId too: createErasureJobForParent assigns a random UUID id
// (not TAG-prefixed), so id-only cleanup would leak an active job onto the parent.
async function deleteJobs(p: Pg) {
  await p.$executeRawUnsafe(`DELETE FROM "DataDeletionRequest" WHERE id LIKE '${TAG}%' OR "organizationId" = '${ORG}' OR "privacyRequestId" = '${PR}'`);
}
async function cleanup() {
  const p = await db();
  await deleteJobs(p);
  await p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part H PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ('${ORG}','O','${TAG}-slug','{}'::jsonb,now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ('${USER}','U','${TAG}@x.com','x',now())`);
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,"userId","organizationId","identityVerifiedAt",metadata,"createdAt","updatedAt")
      VALUES ('${PR}','DATA_DELETION','APPROVED','${TAG}@x.com','en','${USER}','${ORG}',now(),'{}'::jsonb,now(),now())`);
  });
  afterAll(cleanup);
  beforeEach(async () => { await deleteJobs(await db()); });

  // A GOVERNED job (all binding columns non-null), optionally at a plan/approved state.
  const insGoverned = (p: Pg, id: string, lifecycle: string, parent: string | null, opts: { approved?: boolean; plan?: boolean; execIdem?: boolean; planHash?: string } = {}) =>
    p.$executeRawUnsafe(
      `INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey",
         "approvedBy","approvedAt","planJson","planHash","planVersion","plannedAt","plannedBy","executionIdempotencyKey","createdAt","updatedAt")
       VALUES ($1,'${TAG}@x.com','PENDING',$2,$3,'${ORG}','${USER}','USER',$3,
         ${opts.approved ? "'a'" : "NULL"}, ${opts.approved ? "now()" : "NULL"},
         ${opts.plan ? "'{}'::jsonb" : "NULL"}, ${opts.plan ? `'${opts.planHash ?? HEX}'` : "NULL"}, ${opts.plan ? "1" : "NULL"}, ${opts.plan ? "now()" : "NULL"}, ${opts.plan ? "'p'" : "NULL"},
         ${opts.execIdem ? "'k'" : "NULL"}, now(), now())`,
      id, lifecycle, parent);

  const insLegacy = (p: Pg, id: string, lifecycle: string) =>
    p.$executeRawUnsafe(`INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"createdAt","updatedAt") VALUES ($1,'${TAG}@x.com','PENDING',$2,now(),now())`, id, lifecycle);

  it("the migration + governed constraints exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%governed_subject_erasure%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'DataDeletionRequest_lifecycle_check','DataDeletionRequest_parentless_state_check','DataDeletionRequest_governed_check',
      'DataDeletionRequest_approval_check','DataDeletionRequest_plan_evidence_check','DataDeletionRequest_execution_idem_check',
      'DataDeletionRequest_plan_hash_format_check','DataDeletionRequest_parent_tuple_fkey') ORDER BY conname`);
    expect(chk.length).toBe(8);
  });

  it("the lifecycle CHECK rejects an unknown value", async () => {
    const p = await db();
    await expect(insLegacy(p, `${TAG}-bad`, "NONSENSE")).rejects.toBeTruthy();
  });

  it("a legacy parentless REVIEW_REQUIRED/FAILED/CANCELLED row is valid; an active parentless row is rejected", async () => {
    const p = await db();
    await insLegacy(p, `${TAG}-lg1`, "REVIEW_REQUIRED");
    await insLegacy(p, `${TAG}-lg2`, "FAILED");
    await expect(insLegacy(p, `${TAG}-lg3`, "PLANNING")).rejects.toBeTruthy();   // parentless active
    await expect(insLegacy(p, `${TAG}-lg4`, "APPROVED")).rejects.toBeTruthy();
  });

  it("a governed job claiming a foreign org/user is rejected by the composite FK", async () => {
    const p = await db();
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","createdAt","updatedAt")
       VALUES ('${TAG}-mm','${TAG}@x.com','PENDING','REQUESTED','${PR}','${ORG}','someone-else','USER','${PR}',now(),now())`)).rejects.toBeTruthy();
  });

  it("a plan-bearing state without a plan snapshot / bad planHash / missing approval / missing exec key is rejected", async () => {
    const p = await db();
    await expect(insGoverned(p, `${TAG}-noplan`, "PLAN_READY", `${PR}`, { plan: false })).rejects.toBeTruthy();       // plan-evidence
    await expect(insGoverned(p, `${TAG}-badhash`, "PLAN_READY", `${PR}`, { plan: true, planHash: "NOT-HEX" })).rejects.toBeTruthy(); // plan-hash format
    await expect(insGoverned(p, `${TAG}-noappr`, "APPROVED", `${PR}`, { plan: true, approved: false })).rejects.toBeTruthy();       // approval
    await expect(insGoverned(p, `${TAG}-noidem`, "EXECUTION_PENDING", `${PR}`, { plan: true, approved: true, execIdem: false })).rejects.toBeTruthy(); // execution-idem
  });

  it("at most one ACTIVE governed job per parent; deleting the parent is RESTRICTED", async () => {
    const p = await db();
    await insGoverned(p, `${TAG}-a1`, "REQUESTED", `${PR}`);
    await expect(insGoverned(p, `${TAG}-a2`, "PLANNING", `${PR}`)).rejects.toBeTruthy();   // active-parent unique
    await expect(p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id='${PR}'`)).rejects.toBeTruthy();
    const still = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "DataDeletionRequest" WHERE id='${TAG}-a1'`);
    expect(still[0].c).toBe(1);
  });

  it("concurrent child creation yields exactly one active job (DUPLICATE_ACTIVE_ERASURE_JOB=0)", async () => {
    const parentObj = { id: PR, organizationId: ORG, userId: USER, email: `${TAG}@x.com`, locale: "en" };
    const [a, b] = await Promise.all([
      createErasureJobForParent({ parent: parentObj, actorId: "actor" }),
      createErasureJobForParent({ parent: parentObj, actorId: "actor" }),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBe(1);
    const p = await db();
    const active = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "DataDeletionRequest" WHERE "privacyRequestId"='${PR}' AND "lifecycle" IN ('REQUESTED','PLANNING','PLAN_READY','IN_REVIEW','APPROVED','EXECUTION_PENDING','EXECUTING')`);
    expect(active[0].c).toBe(1);
  });

  it("concurrent approval binding yields exactly one APPROVED (CONCURRENT_ERASURE_APPROVAL_RACE=0)", async () => {
    const p = await db();
    await insGoverned(p, `${TAG}-rev`, "IN_REVIEW", `${PR}`, { plan: true, planHash: HEX });
    const [a, b] = await Promise.all([
      approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: HEX, now: new Date() }),
      approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: HEX, now: new Date() }),
    ]);
    expect([a, b].filter((r) => r.ok).length).toBe(1);
    const row = await p.$queryRawUnsafe<{ lifecycle: string }[]>(`SELECT lifecycle FROM "DataDeletionRequest" WHERE id='${TAG}-rev'`);
    expect(row[0].lifecycle).toBe("APPROVED");
  });
});
