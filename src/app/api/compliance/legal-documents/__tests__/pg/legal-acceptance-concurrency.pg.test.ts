import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { publishLegalDocumentForScope } from "@/lib/compliance/db";

/**
 * Phase 97 Part D hardening — real-PostgreSQL rehearsal for the publication and
 * acceptance races. Proves against the ACTUAL database:
 *   - the lifecycle CHECK constraint rejects an unknown value;
 *   - the active-governed partial unique index enforces one active AUTHENTICATED_WEB
 *     acceptance per document+user, allows a new one after withdrawal, and holds
 *     under CONCURRENT inserts (exactly one active row survives);
 *   - publishLegalDocumentForScope refuses a future-effective target
 *     (NOT_EFFECTIVE_YET) without superseding the current effective version.
 *
 * Runs only under a PostgreSQL rehearsal config in CI; excluded from the unit run.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97dh";

type Pg = {
  $executeRawUnsafe: (sql: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(sql: string, ...a: unknown[]) => Promise<T>;
};
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }

async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "LegalAcceptance" WHERE "correlationId" LIKE '${TAG}%' OR "legalDocumentId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "LegalDocument" WHERE title LIKE '${TAG}%' OR id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id = '${TAG}-user'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part D hardening PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ('${TAG}-user','U','${TAG}@example.com','x',now())`);
    await p.$executeRawUnsafe(`INSERT INTO "LegalDocument" (id,"documentType",version,title,content,locale,"isPublished",lifecycle,"organizationId","createdAt","updatedAt")
      VALUES ('${TAG}-doc','PRIVACY_POLICY','1.0','${TAG} doc','b','en',true,'PUBLISHED',NULL,now(),now())`);
  });
  afterAll(cleanup);

  it("the hardening migration is recorded and the lifecycle CHECK exists", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_legal_publication_acceptance_races%' AND finished_at IS NOT NULL`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(`SELECT conname FROM pg_constraint WHERE conname='LegalDocument_lifecycle_check'`);
    expect(chk.length).toBe(1);
  });

  it("the lifecycle CHECK rejects an unknown value (UNKNOWN_LEGAL_DOCUMENT_LIFECYCLE_AT_DB=0)", async () => {
    const p = await db();
    await expect(
      p.$executeRawUnsafe(`INSERT INTO "LegalDocument" (id,"documentType",version,title,content,locale,lifecycle,"createdAt","updatedAt")
        VALUES ('${TAG}-bad','PRIVACY_POLICY','9.9','${TAG} bad','b','en','BOGUS',now(),now())`),
    ).rejects.toBeTruthy();
  });

  it("one active governed acceptance per doc+user; a new one is allowed after withdrawal", async () => {
    const p = await db();
    const ins = (id: string) => p.$executeRawUnsafe(
      `INSERT INTO "LegalAcceptance" (id,"legalDocumentId","userId",locale,"sourceClass","documentType","documentVersion","createdAt")
       VALUES ($1,'${TAG}-doc','${TAG}-user','en','AUTHENTICATED_WEB','PRIVACY_POLICY','1.0',now())`, id);
    await ins(`${TAG}-a1`);
    await expect(ins(`${TAG}-a2`)).rejects.toBeTruthy();           // duplicate active governed → rejected
    await p.$executeRawUnsafe(`UPDATE "LegalAcceptance" SET "withdrawnAt"=now() WHERE id='${TAG}-a1'`);
    await ins(`${TAG}-a3`);                                        // allowed after withdrawal
    const active = await p.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int c FROM "LegalAcceptance" WHERE "legalDocumentId"='${TAG}-doc' AND "userId"='${TAG}-user' AND "withdrawnAt" IS NULL AND "sourceClass"='AUTHENTICATED_WEB'`);
    expect(active[0].c).toBe(1);
  });

  it("holds under CONCURRENT inserts — exactly one active row (CONCURRENT_LEGAL_ACCEPTANCE_IDEMPOTENCY=PASS)", async () => {
    const p = await db();
    await p.$executeRawUnsafe(`DELETE FROM "LegalAcceptance" WHERE "legalDocumentId"='${TAG}-doc'`);
    const attempts = Array.from({ length: 6 }, (_, i) => p.$executeRawUnsafe(
      `INSERT INTO "LegalAcceptance" (id,"legalDocumentId","userId",locale,"sourceClass","documentType","documentVersion","correlationId","createdAt")
       VALUES ($1,'${TAG}-doc','${TAG}-user','en','AUTHENTICATED_WEB','PRIVACY_POLICY','1.0',$2,now())`, `${TAG}-c${i}`, `${TAG}-cid${i}`));
    const settled = await Promise.allSettled(attempts);
    const ok = settled.filter((s) => s.status === "fulfilled").length;
    expect(ok).toBe(1); // the partial-unique index admits exactly one active row
    const active = await p.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int c FROM "LegalAcceptance" WHERE "legalDocumentId"='${TAG}-doc' AND "userId"='${TAG}-user' AND "withdrawnAt" IS NULL AND "sourceClass"='AUTHENTICATED_WEB'`);
    expect(active[0].c).toBe(1);
  });

  it("publishLegalDocumentForScope refuses a future-effective target without superseding the current version", async () => {
    const p = await db();
    // current effective v1 + a future-effective, approved v2 (TERMS/en, global).
    await p.$executeRawUnsafe(`INSERT INTO "LegalDocument" (id,"documentType",version,title,content,locale,"isPublished",lifecycle,"organizationId","createdAt","updatedAt")
      VALUES ('${TAG}-t1','TERMS_OF_SERVICE','1.0','${TAG} t1','b','en',true,'PUBLISHED',NULL,now(),now())`);
    await p.$executeRawUnsafe(`INSERT INTO "LegalDocument" (id,"documentType",version,title,content,locale,"isPublished",lifecycle,"effectiveDate","organizationId","createdAt","updatedAt")
      VALUES ('${TAG}-t2','TERMS_OF_SERVICE','2.0','${TAG} t2','b','en',false,'SCHEDULED', now() + interval '1 day', NULL,now(),now())`);

    const res = await publishLegalDocumentForScope({ id: `${TAG}-t2`, organizationScope: null, actorId: "x" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("NOT_EFFECTIVE_YET");
    // v1 remains the current effective version (no gap, not superseded).
    const v1 = await p.$queryRawUnsafe<{ lifecycle: string; isPublished: boolean }[]>(`SELECT lifecycle, "isPublished" FROM "LegalDocument" WHERE id='${TAG}-t1'`);
    expect(v1[0].lifecycle).toBe("PUBLISHED");
    expect(v1[0].isPublished).toBe(true);
  });
});
