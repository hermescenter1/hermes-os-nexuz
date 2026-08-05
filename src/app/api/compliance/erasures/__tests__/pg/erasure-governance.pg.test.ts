import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { createErasureJobForParent, approveErasurePlanForOrg } from "@/lib/compliance/erasure-db";
import { buildErasurePlan } from "@/lib/compliance/erasure-planner";

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
  await p.$executeRawUnsafe(`DELETE FROM "RetentionPolicy" WHERE id LIKE '${TAG}%'`);
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

  // A GOVERNED job (all binding columns non-null), optionally at a plan/approved
  // state. Approved rows carry the approval binding (approvedPlanHash = planHash,
  // approvedPlanVersion = planVersion) required by the approval-binding CHECK.
  const insGoverned = (p: Pg, id: string, lifecycle: string, parent: string | null, opts: { approved?: boolean; plan?: boolean; execIdem?: boolean; planHash?: string; planJson?: string; approvedPlanHash?: string } = {}) =>
    p.$executeRawUnsafe(
      `INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey",
         "approvedBy","approvedAt","approvedPlanHash","approvedPlanVersion","planJson","planHash","planVersion","plannedAt","plannedBy","executionIdempotencyKey","createdAt","updatedAt")
       VALUES ($1,'${TAG}@x.com','PENDING',$2,$3,'${ORG}','${USER}','USER',$3,
         ${opts.approved ? "'a'" : "NULL"}, ${opts.approved ? "now()" : "NULL"},
         ${opts.approved && opts.plan ? `'${opts.approvedPlanHash ?? opts.planHash ?? HEX}'` : "NULL"}, ${opts.approved && opts.plan ? "1" : "NULL"},
         ${opts.plan ? `$4::jsonb` : "NULL"}, ${opts.plan ? `'${opts.planHash ?? HEX}'` : "NULL"}, ${opts.plan ? "1" : "NULL"}, ${opts.plan ? "now()" : "NULL"}, ${opts.plan ? "'p'" : "NULL"},
         ${opts.execIdem ? "'k'" : "NULL"}, now(), now())`,
      ...(opts.plan ? [id, lifecycle, parent, opts.planJson ?? "{}"] : [id, lifecycle, parent]));

  const insLegacy = (p: Pg, id: string, lifecycle: string) =>
    p.$executeRawUnsafe(`INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"createdAt","updatedAt") VALUES ($1,'${TAG}@x.com','PENDING',$2,now(),now())`, id, lifecycle);

  it("the migrations + governed constraints exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE (migration_name LIKE '%governed_subject_erasure%' OR migration_name LIKE '%erasure_approval_binding%') AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(2);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'DataDeletionRequest_lifecycle_check','DataDeletionRequest_parentless_state_check','DataDeletionRequest_governed_check',
      'DataDeletionRequest_approval_check','DataDeletionRequest_plan_evidence_check','DataDeletionRequest_execution_idem_check',
      'DataDeletionRequest_plan_hash_format_check','DataDeletionRequest_parent_tuple_fkey',
      'DataDeletionRequest_plan_attribution_check','DataDeletionRequest_approved_plan_binding_check') ORDER BY conname`);
    expect(chk.length).toBe(10);
    const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE indexname='RetentionPolicy_live_selection_key'`);
    expect(idx.length).toBe(1);
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

  /** A REAL canonical (empty-items) plan whose recomputed hash matches storage —
   *  the approval transaction strictly re-parses and re-hashes the persisted snapshot. */
  function realPlanFor(jobId: string) {
    const { plan, planHash } = buildErasurePlan({
      jobId, privacyRequestId: PR, organizationId: ORG, subjectClass: "USER", subjectId: USER,
      planVersion: 1, now: new Date("2026-06-01T00:00:00.000Z"), collected: [], holds: [], policies: [],
    });
    return { planJson: JSON.stringify(plan), planHash };
  }

  it("approval requires the exact plan version (STALE_ERASURE_PLAN_APPROVAL=0), then concurrent approval yields exactly one APPROVED", async () => {
    const p = await db();
    const { planJson, planHash } = realPlanFor(`${TAG}-rev`);
    await insGoverned(p, `${TAG}-rev`, "IN_REVIEW", `${PR}`, { plan: true, planHash, planJson });
    // Wrong expectedPlanVersion is a closed denial.
    const wrongVersion = await approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: planHash, expectedPlanVersion: 2, now: new Date() });
    expect(wrongVersion.ok).toBe(false);
    // Wrong expectedPlanHash is a closed denial.
    const wrongHash = await approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: "0".repeat(64), expectedPlanVersion: 1, now: new Date() });
    expect(wrongHash.ok).toBe(false);
    // Concurrent correct approvals: exactly one wins the row lock and commits.
    const [a, b] = await Promise.all([
      approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: planHash, expectedPlanVersion: 1, now: new Date() }),
      approveErasurePlanForOrg({ id: `${TAG}-rev`, organizationId: ORG, actorId: "owner", expectedPlanHash: planHash, expectedPlanVersion: 1, now: new Date() }),
    ]);
    expect([a, b].filter((r) => r.ok).length).toBe(1);
    const row = await p.$queryRawUnsafe<{ lifecycle: string; approvedPlanHash: string | null; approvedPlanVersion: number | null }[]>(
      `SELECT lifecycle,"approvedPlanHash","approvedPlanVersion" FROM "DataDeletionRequest" WHERE id='${TAG}-rev'`);
    expect(row[0].lifecycle).toBe("APPROVED");
    expect(row[0].approvedPlanHash).toBe(planHash);   // committed approval binding
    expect(row[0].approvedPlanVersion).toBe(1);
  });

  it("plan attribution + approved-plan binding CHECKs reject incomplete/mismatched rows", async () => {
    const p = await db();
    // PLAN_READY without plannedBy → plan_attribution_check.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataDeletionRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","planJson","planHash","planVersion","plannedAt","createdAt","updatedAt")
       VALUES ('${TAG}-noattr','${TAG}@x.com','PENDING','PLAN_READY','${PR}','${ORG}','${USER}','USER','${PR}','{}'::jsonb,'${HEX}',1,now(),now(),now())`)).rejects.toBeTruthy();
    // APPROVED whose approvedPlanHash differs from planHash → approved_plan_binding_check.
    await expect(insGoverned(p, `${TAG}-mismatch`, "APPROVED", `${PR}`, { plan: true, approved: true, planHash: HEX, approvedPlanHash: "b".repeat(64) })).rejects.toBeTruthy();
  });

  it("at most ONE live (enabled+APPROVED) retention policy per (org, dataClass, targetResource)", async () => {
    const p = await db();
    const insPolicy = (id: string, approvalState: string, enabled: boolean) => p.$executeRawUnsafe(
      `INSERT INTO "RetentionPolicy" (id,"organizationId",name,"dataClass","targetResource","approvalState",enabled,"updatedAt")
       VALUES ($1,'${ORG}','P','consent','consent_records',$2,$3,now())`, id, approvalState, enabled);
    await insPolicy(`${TAG}-pol1`, "APPROVED", true);
    // A second LIVE policy for the same tuple is rejected by the unique index.
    await expect(insPolicy(`${TAG}-pol2`, "APPROVED", true)).rejects.toBeTruthy();
    // A draft/pending or disabled duplicate remains allowed (not live).
    await insPolicy(`${TAG}-pol3`, "PENDING_REVIEW", true);
    await insPolicy(`${TAG}-pol4`, "APPROVED", false);
  });
});
