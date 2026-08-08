import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 Part G (+ hardening + delivery finalisation) — real-PostgreSQL rehearsal.
 * Proves against the actual DB: lifecycle CHECK; one ACTIVE job per parent; atomic
 * single-use token; the composite parent-tuple binding (org/subject mismatch
 * rejected, parent delete RESTRICTED for a governed child); governed-shape and
 * approval CHECKs; token cascade; AND the delivery-finalisation constraints —
 * parentless rows may hold only REVIEW_REQUIRED/FAILED/CANCELLED, a READY/EXPIRED/
 * REVOKED job requires durable package evidence (packageKey/contentHash/packageHash/
 * schemaVersion/expiresAt/completedAt), and every token must be fully bound
 * (organization + subject non-null, SHA-256 tokenHash).
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97g";
const HEX64 = "a".repeat(64);
const HEX64B = "b".repeat(64);

type Pg = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T> };
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }
async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ExportDownloadToken" WHERE "exportRequestId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "OrganizationMember" WHERE "userId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part G PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ('${TAG}-org','O','${TAG}-slug','{}'::jsonb,now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ('${TAG}-user','U','${TAG}@x.com','x',now())`);
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,"userId","organizationId","identityVerifiedAt",metadata,"createdAt","updatedAt")
      VALUES ('${TAG}-pr','DATA_EXPORT','APPROVED','${TAG}@x.com','en','${TAG}-user','${TAG}-org',now(),'{}'::jsonb,now(),now())`);
    // A second parent for the fully-evidenced READY / token tests (the first parent
    // already carries an active REQUESTED child, so it cannot host a second active job).
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,"userId","organizationId","identityVerifiedAt",metadata,"createdAt","updatedAt")
      VALUES ('${TAG}-pr2','DATA_EXPORT','APPROVED','${TAG}@x.com','en','${TAG}-user','${TAG}-org',now(),'{}'::jsonb,now(),now())`);
  });
  afterAll(cleanup);

  // A GOVERNED job (all binding columns non-null, satisfying the composite FK + CHECKs).
  const insGoverned = (p: Pg, id: string, lifecycle: string, parent: string | null, approved = true) =>
    p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","createdAt","updatedAt")
       VALUES ($1,'${TAG}@x.com','PENDING',$2,$3,'${TAG}-org','${TAG}-user','USER',$3, ${approved ? "'a'" : "NULL"}, ${approved ? "now()" : "NULL"}, now(), now())`,
      id, lifecycle, parent);

  // A fully-evidenced governed READY job (durable package evidence present).
  const insGovernedReady = (p: Pg, id: string, parent: string) =>
    p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","packageKey","contentHash","packageHash","schemaVersion","expiresAt","completedAt","createdAt","updatedAt")
       VALUES ($1,'${TAG}@x.com','PENDING','READY',$2,'${TAG}-org','${TAG}-user','USER',$2,'a',now(),'exports/'||$1||'/package.json','${HEX64}','${HEX64B}','1.0',now()+interval '1 hour',now(),now(),now())`,
      id, parent);

  // A legacy-style parentless row (all governance columns null).
  const insLegacy = (p: Pg, id: string, lifecycle: string) =>
    p.$executeRawUnsafe(`INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"createdAt","updatedAt") VALUES ($1,'${TAG}@x.com','PENDING',$2,now(),now())`, id, lifecycle);

  it("the delivery-finalisation migration + new constraints exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_export_delivery_finalisation%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN (
      'DataExportRequest_parentless_state_check','DataExportRequest_package_evidence_check',
      'DataExportRequest_content_hash_format_check','DataExportRequest_package_hash_format_check',
      'DataExportRequest_package_key_shape_check','ExportDownloadToken_binding_check') ORDER BY conname`);
    expect(chk.length).toBe(6);
  });

  it("the lifecycle CHECK rejects an unknown value", async () => {
    const p = await db();
    await expect(p.$executeRawUnsafe(`INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"createdAt","updatedAt") VALUES ('${TAG}-bad','${TAG}@x.com','PENDING','NONSENSE',now(),now())`)).rejects.toBeTruthy();
  });

  it("a governed job at AUTHORISED without approval evidence is rejected (approval CHECK)", async () => {
    const p = await db();
    await expect(insGoverned(p, `${TAG}-noappr`, "AUTHORISED", `${TAG}-pr2`, false)).rejects.toBeTruthy();
  });

  it("a governed job claiming a foreign org/user is rejected by the composite FK (Finding 6)", async () => {
    const p = await db();
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","createdAt","updatedAt")
       VALUES ('${TAG}-mm','${TAG}@x.com','PENDING','REQUESTED','${TAG}-pr','${TAG}-org','someone-else','USER','${TAG}-pr',now(),now())`)).rejects.toBeTruthy();
  });

  it("a PARENTLESS active/READY governed row is rejected (PARENTLESS_ACTIVE_EXPORT_JOB=0)", async () => {
    const p = await db();
    await expect(insGoverned(p, `${TAG}-pl-req`, "REQUESTED", null)).rejects.toBeTruthy();
    await expect(insGoverned(p, `${TAG}-pl-rdy`, "READY", null)).rejects.toBeTruthy();
  });

  it("a PARENTLESS legacy REVIEW_REQUIRED / FAILED / CANCELLED row remains valid", async () => {
    const p = await db();
    await insLegacy(p, `${TAG}-lg-rev`, "REVIEW_REQUIRED");
    await insLegacy(p, `${TAG}-lg-fail`, "FAILED");
    await insLegacy(p, `${TAG}-lg-canc`, "CANCELLED");
    const c = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "DataExportRequest" WHERE id LIKE '${TAG}-lg-%'`);
    expect(c[0].c).toBe(3);
  });

  it("a READY job WITHOUT durable package evidence is rejected (READY_EXPORT_WITHOUT_PACKAGE_EVIDENCE=0)", async () => {
    const p = await db();
    // Governed READY, but packageHash omitted → package-evidence CHECK rejects.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","packageKey","contentHash","schemaVersion","expiresAt","completedAt","createdAt","updatedAt")
       VALUES ('${TAG}-noev','${TAG}@x.com','PENDING','READY','${TAG}-pr2','${TAG}-org','${TAG}-user','USER','${TAG}-pr2','a',now(),'exports/${TAG}-noev/package.json','${HEX64}','1.0',now()+interval '1 hour',now(),now(),now())`)).rejects.toBeTruthy();
    // A non-hex contentHash is rejected by the format CHECK.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","packageKey","contentHash","packageHash","schemaVersion","expiresAt","completedAt","createdAt","updatedAt")
       VALUES ('${TAG}-badhash','${TAG}@x.com','PENDING','READY','${TAG}-pr2','${TAG}-org','${TAG}-user','USER','${TAG}-pr2','a',now(),'exports/${TAG}-badhash/package.json','NOT-A-HASH','${HEX64B}','1.0',now()+interval '1 hour',now(),now(),now())`)).rejects.toBeTruthy();
  });

  it("at most one ACTIVE governed job per parent; deleting the parent is RESTRICTED", async () => {
    const p = await db();
    await insGoverned(p, `${TAG}-a1`, "REQUESTED", `${TAG}-pr`, false);
    await expect(insGoverned(p, `${TAG}-a2`, "AUTHORISED", `${TAG}-pr`)).rejects.toBeTruthy(); // active-parent unique
    // A governed child RESTRICTS deletion of its parent (no orphan).
    await expect(p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id='${TAG}-pr'`)).rejects.toBeTruthy();
    const still = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "DataExportRequest" WHERE id='${TAG}-a1'`);
    expect(still[0].c).toBe(1);
  });

  it("a fully-evidenced READY job is accepted; its bound token consumes ONCE and cascades", async () => {
    const p = await db();
    await insGovernedReady(p, `${TAG}-rdy`, `${TAG}-pr2`);
    // A token with a NULL organization is rejected (NULL_ORGANIZATION_EXPORT_TOKEN=0).
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-tno','${TAG}-rdy','${HEX64}','${TAG}-user',NULL,now()+interval '1 hour',now())`)).rejects.toBeTruthy();
    // A token with a NULL subject is rejected (NULL_SUBJECT_EXPORT_TOKEN=0).
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-tns','${TAG}-rdy','${HEX64}',NULL,'${TAG}-org',now()+interval '1 hour',now())`)).rejects.toBeTruthy();
    // A non-hex tokenHash is rejected.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-tbh','${TAG}-rdy','not-a-hash','${TAG}-user','${TAG}-org',now()+interval '1 hour',now())`)).rejects.toBeTruthy();
    // A foreign subject binding is rejected by the composite token FK.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-tfs','${TAG}-rdy','${HEX64B}','not-the-subject','${TAG}-org',now()+interval '1 hour',now())`)).rejects.toBeTruthy();
    // A correctly-bound token.
    await p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-t1','${TAG}-rdy','${HEX64}','${TAG}-user','${TAG}-org',now()+interval '1 hour',now())`);
    const consume = () => p.$executeRawUnsafe(`UPDATE "ExportDownloadToken" SET "usedAt"=now() WHERE "tokenHash"='${HEX64}' AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()`);
    const settled = await Promise.allSettled([consume(), consume(), consume(), consume()]);
    const affected = settled.reduce((n, s) => n + (s.status === "fulfilled" ? (s.value as number) : 0), 0);
    expect(affected).toBe(1);
    // Deleting the export cascades its token.
    await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id='${TAG}-rdy'`);
    expect((await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE id='${TAG}-t1'`))[0].c).toBe(0);
  });
});
