import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "@/lib/db/prisma";

/**
 * Phase 97 Part D — real-PostgreSQL rehearsal for the governed legal-document
 * lifecycle migration. Proves against the ACTUAL catalog/constraints:
 *   - the migration is recorded and the new columns/indexes/FK exist;
 *   - the single-effective-version partial unique index (NULLS NOT DISTINCT)
 *     rejects a second published version for the same owner/type/locale
 *     (including GLOBAL, organizationId NULL);
 *   - owner-scoped version uniqueness rejects a duplicate (type, version, locale,
 *     org) — including two GLOBAL rows;
 *   - the supersededById self-FK exists.
 *
 * Runs only under a PostgreSQL rehearsal config in CI; excluded from the unit run.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit97d";

type Pg = {
  $queryRawUnsafe: <T = unknown>(sql: string, ...a: unknown[]) => Promise<T>;
  legalDocument: { create: (a: unknown) => Promise<{ id: string }>; deleteMany: (a: unknown) => Promise<{ count: number }> };
};
async function db(): Promise<Pg> { const p = await getPrisma(); if (!p) throw new Error("PG rehearsal requires a real Prisma client"); return p as unknown as Pg; }
async function cleanup() { const p = await db(); await p.legalDocument.deleteMany({ where: { title: { startsWith: TAG } } }); }

const base = (over: Record<string, unknown>) => ({
  documentType: "TERMS_OF_SERVICE", version: "1.0", title: `${TAG} doc`, content: "b", locale: "en",
  updatedAt: new Date(), ...over,
});

it("integration database is configured (guards against a silent all-skip pass)", () => { expect(PG_ENABLED).toBe(true); });

describe.skipIf(!PG_ENABLED)("Phase 97 Part D PG — legal-document lifecycle", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("the migration is recorded as applied", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase97_legal_document_lifecycle%' AND finished_at IS NOT NULL`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("new columns, indexes and the supersession FK exist", async () => {
    const p = await db();
    const cols = await p.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='LegalDocument' AND column_name IN ('lifecycle','approvedBy','publishedBy','withdrawnAt','supersededById')`);
    expect(cols.length).toBe(5);
    const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename='LegalDocument' AND indexname IN ('LegalDocument_effective_key','LegalDocument_owner_version_key')`);
    expect(idx.map((r) => r.indexname).sort()).toEqual(["LegalDocument_effective_key", "LegalDocument_owner_version_key"]);
    const fk = await p.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname='LegalDocument_supersededById_fkey' AND contype='f'`);
    expect(fk.length).toBe(1);
  });

  it("rejects a SECOND effective (published) GLOBAL version for the same type/locale", async () => {
    const p = await db();
    await p.legalDocument.create({ data: base({ version: "1.0", isPublished: true, lifecycle: "PUBLISHED", organizationId: null }) });
    await expect(
      p.legalDocument.create({ data: base({ version: "2.0", isPublished: true, lifecycle: "PUBLISHED", organizationId: null }) }),
    ).rejects.toBeTruthy(); // partial unique effective index (NULLS NOT DISTINCT)
  });

  it("rejects a duplicate (type, version, locale) for GLOBAL rows (owner-version uniqueness)", async () => {
    const p = await db();
    await p.legalDocument.create({ data: base({ version: "9.9", title: `${TAG} u`, isPublished: false, lifecycle: "DRAFT", organizationId: null }) });
    await expect(
      p.legalDocument.create({ data: base({ version: "9.9", title: `${TAG} u2`, isPublished: false, lifecycle: "DRAFT", organizationId: null }) }),
    ).rejects.toBeTruthy();
  });
});
