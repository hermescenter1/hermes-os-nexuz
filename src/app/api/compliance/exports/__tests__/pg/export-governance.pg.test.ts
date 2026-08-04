import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 Part G — real-PostgreSQL rehearsal. Proves against the actual DB:
 *   - the migration is recorded and the lifecycle CHECK rejects unknown values;
 *   - one ACTIVE export job per parent PrivacyRequest (partial unique index);
 *   - a download token is consumed atomically once under concurrency;
 *   - token rows cascade from the owning export; the parent FK is SET NULL and
 *     the export evidence is preserved.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97g";

type Pg = { $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>; $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T> };
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }
async function cleanup() {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "ExportDownloadToken" WHERE "exportRequestId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id LIKE '${TAG}%' OR email LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id LIKE '${TAG}%'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part G PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,metadata,"createdAt","updatedAt") VALUES ('${TAG}-pr','DATA_EXPORT','APPROVED','${TAG}@x.com','en','{}'::jsonb,now(),now())`);
  });
  afterAll(cleanup);

  // organizationId is left NULL — it carries a pre-existing FK to Organization and
  // these tests exercise the parent/token relationships, not org ownership.
  const insExport = (p: Pg, id: string, lifecycle: string, parent: string | null) =>
    p.$executeRawUnsafe(`INSERT INTO "DataExportRequest" (id,email,status,lifecycle,"privacyRequestId","createdAt","updatedAt")
      VALUES ($1,'${TAG}@x.com','PENDING',$2,$3,now(),now())`, id, lifecycle, parent);

  it("the migration is recorded and the lifecycle CHECK rejects an unknown value", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_governed_subject_export%' AND finished_at IS NOT NULL`);
    expect(mig.length).toBeGreaterThanOrEqual(1);
    await expect(insExport(p, `${TAG}-bad`, "NONSENSE", null)).rejects.toBeTruthy();
  });

  it("at most one ACTIVE export job per parent (partial unique)", async () => {
    const p = await db();
    await insExport(p, `${TAG}-a1`, "REQUESTED", `${TAG}-pr`);
    await expect(insExport(p, `${TAG}-a2`, "AUTHORISED", `${TAG}-pr`)).rejects.toBeTruthy();
    // A terminal job for the same parent is allowed (outside the index).
    await insExport(p, `${TAG}-a3`, "CANCELLED", `${TAG}-pr`);
    const active = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "DataExportRequest" WHERE "privacyRequestId"='${TAG}-pr' AND lifecycle IN ('REQUESTED','AUTHORISED','COLLECTING','REDACTING','PACKAGING','READY')`);
    expect(active[0].c).toBe(1);
  });

  it("a download token is consumed atomically ONCE under concurrency", async () => {
    const p = await db();
    await insExport(p, `${TAG}-tok`, "READY", null);
    await p.$executeRawUnsafe(
      `INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","subjectUserId","organizationId","expiresAt","createdAt")
       VALUES ($1,$2,$3,'subj-1','org-A', now() + interval '1 hour', now())`,
      `${TAG}-t1`, `${TAG}-tok`, `${TAG}-hash`);
    const consume = () => p.$executeRawUnsafe(`UPDATE "ExportDownloadToken" SET "usedAt"=now() WHERE "tokenHash"='${TAG}-hash' AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > now()`);
    const settled = await Promise.allSettled([consume(), consume(), consume(), consume()]);
    const affected = settled.reduce((n, s) => n + (s.status === "fulfilled" ? (s.value as number) : 0), 0);
    expect(affected).toBe(1); // exactly one redemption wins
    const used = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE "tokenHash"='${TAG}-hash' AND "usedAt" IS NOT NULL`);
    expect(used[0].c).toBe(1);
  });

  it("tokens cascade from the export; the parent FK is SET NULL and evidence is preserved", async () => {
    const p = await db();
    // A fresh parent + a terminal child (outside the active-parent unique index).
    await p.$executeRawUnsafe(`INSERT INTO "PrivacyRequest" (id,"requestType",status,email,locale,metadata,"createdAt","updatedAt") VALUES ('${TAG}-pr2','DATA_EXPORT','APPROVED','${TAG}2@x.com','en','{}'::jsonb,now(),now())`);
    await insExport(p, `${TAG}-c1`, "CANCELLED", `${TAG}-pr2`);
    await p.$executeRawUnsafe(`INSERT INTO "ExportDownloadToken" (id,"exportRequestId","tokenHash","expiresAt","createdAt") VALUES ('${TAG}-ct','${TAG}-c1','${TAG}-chash', now() + interval '1 hour', now())`);

    // Deleting the parent nulls the child link but preserves the export evidence.
    await p.$executeRawUnsafe(`DELETE FROM "PrivacyRequest" WHERE id='${TAG}-pr2'`);
    const after = await p.$queryRawUnsafe<{ pr: string | null }[]>(`SELECT "privacyRequestId" pr FROM "DataExportRequest" WHERE id='${TAG}-c1'`);
    expect(after.length).toBe(1);   // export preserved
    expect(after[0].pr).toBeNull(); // parent link SET NULL

    // Deleting the export cascades its token.
    await p.$executeRawUnsafe(`DELETE FROM "DataExportRequest" WHERE id='${TAG}-c1'`);
    const tok = await p.$queryRawUnsafe<{ c: number }[]>(`SELECT count(*)::int c FROM "ExportDownloadToken" WHERE id='${TAG}-ct'`);
    expect(tok[0].c).toBe(0);
  });
});
