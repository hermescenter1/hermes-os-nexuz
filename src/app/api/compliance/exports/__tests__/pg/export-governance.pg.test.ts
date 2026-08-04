import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 Part G (+ hardening) — real-PostgreSQL rehearsal. Proves against the
 * actual DB: lifecycle CHECK; one ACTIVE job per parent; atomic single-use token;
 * the composite parent-tuple binding (org/subject mismatch rejected, parent delete
 * RESTRICTED for a governed child); the token composite binding; governed-shape and
 * approval CHECKs; token cascade.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97g";

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
  });
  afterAll(cleanup);

  // A GOVERNED job (all binding columns non-null, satisfying the composite FK + CHECKs).
  const insGoverned = (p: Pg, id: string, lifecycle: string, parent: string | null, approved = true) =>
    p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","approvedBy","approvedAt","createdAt","updatedAt")
       VALUES ($1,'${TAG}@x.com','PENDING',$2,$3,'${TAG}-org','${TAG}-user','USER',$3, ${approved ? "'a'" : "NULL"}, ${approved ? "now()" : "NULL"}, now(), now())`,
      id, lifecycle, parent);

  it("the hardening migration + governed/approval CHECKs exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_export_binding_integrity%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname IN ('DataExportRequest_governed_check','DataExportRequest_approval_check','DataExportRequest_parent_tuple_fkey','ExportDownloadToken_binding_fkey') ORDER BY conname`);
    expect(chk.length).toBe(4);
  });

  it("the lifecycle CHECK rejects an unknown value", async () => {
    const p = await db();
    await expect(p.$executeRawUnsafe(`INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"createdAt","updatedAt") VALUES ('${TAG}-bad','${TAG}@x.com','PENDING','NONSENSE',now(),now())`)).rejects.toBeTruthy();
  });

  it("a governed job at AUTHORISED without approval evidence is rejected (approval CHECK)", async () => {
    const p = await db();
    await expect(insGoverned(p, `${TAG}-noappr`, "AUTHORISED", null, false)).rejects.toBeTruthy();
  });

  it("a governed job claiming a foreign org/user is rejected by the composite FK (Finding 6)", async () => {
    const p = await db();
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","organizationId","userId","subjectClass","idempotencyKey","createdAt","updatedAt")
       VALUES ('${TAG}-mm','${TAG}@x.com','PENDING','REQUESTED','${TAG}-pr','${TAG}-org','someone-else','USER','${TAG}-pr',now(),now())`)).rejects.toBeTruthy();
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

  it("a download token is consumed atomically ONCE, and a foreign-tuple token is rejected", async () => {
    const p = await db();
    await insGoverned(p, `${TAG}-tok`, "READY", null);
    // Foreign token binding (subject mismatch) rejected by the composite token FK.
    await expect(p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-tbad','${TAG}-tok','${TAG}-h0','not-the-subject','${TAG}-org',now()+interval '1 hour',now())`)).rejects.toBeTruthy();
    // Correctly-bound token.
    await p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ('${TAG}-t1','${TAG}-tok','${TAG}-h1','${TAG}-user','${TAG}-org',now()+interval '1 hour',now())`);
    const consume = () => p.$executeRawUnsafe(`UPDATE "ExportDownloadToken" SET "usedAt"=now() WHERE "tokenHash"='${TAG}-h1' AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()`);
    const settled = await Promise.allSettled([consume(), consume(), consume(), consume()]);
    const affected = settled.reduce((n, s) => n + (s.status === "fulfilled" ? (s.value as number) : 0), 0);
    expect(affected).toBe(1);
    // Deleting the export cascades its token.
    await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id='${TAG}-tok'`);
    expect((await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE id='${TAG}-t1'`))[0].c).toBe(0);
  });
});
