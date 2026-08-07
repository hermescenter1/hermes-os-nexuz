import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 Part I — real-PostgreSQL rehearsal. Proves against the actual DB: the
 * closed lifecycle/review CHECKs; the approval CHECKs (APPROVED/ACTIVE requires
 * attribution AND positively-complete reviews); Organization FK integrity
 * (unknown org rejected, org delete RESTRICTED); and the composite tenant-safe
 * relation FKs (a DataTransfer can never link a foreign-tenant Subprocessor or
 * ProcessingActivity, nor an org-less ProcessingActivity, even with valid ids).
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97i";
const ORG_A = `${TAG}-orgA`, ORG_B = `${TAG}-orgB`;

type Pg = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T> };
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }
async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "DataTransfer" WHERE id LIKE '${TAG}%' OR "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Subprocessor" WHERE id LIKE '${TAG}%' OR "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "ProcessingActivity" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part I PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    for (const org of [ORG_A, ORG_B]) {
      await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ($1,'O',$2,'{}'::jsonb,now(),now())`, org, `${org}-slug`);
    }
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paA','P','p','consent','${ORG_A}',now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","organizationId","createdAt","updatedAt") VALUES ('${TAG}-paB','P','p','consent','${ORG_B}',now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "ProcessingActivity" (id,name,purpose,"legalBasis","createdAt","updatedAt") VALUES ('${TAG}-paN','P','p','consent',now(),now())`); // org NULL
  });
  afterAll(cleanup);

  const insSub = (p: Pg, id: string, org: string, opts: { lifecycle?: string; reviewed?: boolean; approved?: boolean } = {}) =>
    p.$executeRawUnsafe(
      `INSERT INTO "Subprocessor" (id,"organizationId",name,lifecycle,"contractReviewStatus","privacyReviewStatus","securityReviewStatus","approvedBy","approvedAt","updatedAt")
       VALUES ($1,$2,'V',$3, ${opts.reviewed ? "'APPROVED','APPROVED','APPROVED'" : "'REVIEW_REQUIRED','REVIEW_REQUIRED','REVIEW_REQUIRED'"},
         ${opts.approved ? "'a', now()" : "NULL, NULL"}, now())`,
      id, org, opts.lifecycle ?? "DRAFT");

  it("the migration + governed constraints and composite-FK targets exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%subprocessor_transfer_governance%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'Subprocessor_lifecycle_check','Subprocessor_review_status_check','Subprocessor_approval_check','Subprocessor_organizationId_fkey',
      'DataTransfer_lifecycle_check','DataTransfer_review_status_check','DataTransfer_approval_check','DataTransfer_organizationId_fkey',
      'DataTransfer_subprocessor_tuple_fkey','DataTransfer_processing_activity_tuple_fkey') ORDER BY conname`);
    expect(chk.length).toBe(10);
    const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE indexname IN ('Subprocessor_id_org_key','ProcessingActivity_id_org_key')`);
    expect(idx.length).toBe(2);
  });

  it("closed lifecycle + review vocabularies are enforced", async () => {
    const p = await db();
    await expect(insSub(p, `${TAG}-bad1`, ORG_A, { lifecycle: "NONSENSE" })).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "Subprocessor" (id,"organizationId",name,"contractReviewStatus","updatedAt") VALUES ('${TAG}-bad2','${ORG_A}','V','MAYBE',now())`)).rejects.toBeTruthy();
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataTransfer" (id,"organizationId","transferMechanismStatus","updatedAt") VALUES ('${TAG}-bad3','${ORG_A}','ADEQUATE',now())`)).rejects.toBeTruthy();
  });

  it("APPROVED/ACTIVE requires attribution AND positively-complete reviews (UNREVIEWED_*_APPROVAL=0)", async () => {
    const p = await db();
    // Approved without attribution → rejected; approved without reviews → rejected.
    await expect(insSub(p, `${TAG}-noattr`, ORG_A, { lifecycle: "APPROVED", reviewed: true, approved: false })).rejects.toBeTruthy();
    await expect(insSub(p, `${TAG}-norev`, ORG_A, { lifecycle: "APPROVED", reviewed: false, approved: true })).rejects.toBeTruthy();
    await insSub(p, `${TAG}-ok`, ORG_A, { lifecycle: "APPROVED", reviewed: true, approved: true }); // fully-gated row accepted
    // Transfer: APPROVED without CONFIGURED mechanism → rejected.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataTransfer" (id,"organizationId",lifecycle,"legalReviewStatus","riskReviewStatus","approvedBy","approvedAt","updatedAt")
       VALUES ('${TAG}-tnomech','${ORG_A}','APPROVED','APPROVED','APPROVED','a',now(),now())`)).rejects.toBeTruthy();
  });

  it("organization FK integrity: unknown org rejected; org delete RESTRICTED", async () => {
    const p = await db();
    await expect(insSub(p, `${TAG}-noorg`, `${TAG}-ghost`)).rejects.toBeTruthy();
    await insSub(p, `${TAG}-keep`, ORG_B);
    await expect(p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id='${ORG_B}'`)).rejects.toBeTruthy();
  });

  it("composite FKs reject foreign-tenant and org-less relations even with valid ids (CROSS_TENANT_TRANSFER_RELATION=0)", async () => {
    const p = await db();
    await insSub(p, `${TAG}-spA`, ORG_A);
    await insSub(p, `${TAG}-spB`, ORG_B);
    const insTr = (id: string, org: string, sp: string | null, pa: string | null) => p.$executeRawUnsafe(
      `INSERT INTO "DataTransfer" (id,"organizationId","subprocessorId","processingActivityId","updatedAt") VALUES ($1,$2,$3,$4,now())`,
      id, org, sp, pa);
    // Org A transfer → org B subprocessor: valid id, wrong tenant → REJECTED.
    await expect(insTr(`${TAG}-x1`, ORG_A, `${TAG}-spB`, null)).rejects.toBeTruthy();
    // Org A transfer → org B ProcessingActivity → REJECTED.
    await expect(insTr(`${TAG}-x2`, ORG_A, null, `${TAG}-paB`)).rejects.toBeTruthy();
    // An org-less ProcessingActivity can never be referenced (NULL never equals).
    await expect(insTr(`${TAG}-x3`, ORG_A, null, `${TAG}-paN`)).rejects.toBeTruthy();
    // Same-org links are accepted; deleting a linked subprocessor is RESTRICTED.
    await insTr(`${TAG}-okT`, ORG_A, `${TAG}-spA`, `${TAG}-paA`);
    await expect(p.$executeRawUnsafe(`DELETE FROM "Subprocessor" WHERE id='${TAG}-spA'`)).rejects.toBeTruthy();
  });
});
