import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getPrisma } from "@/lib/db/prisma";
import { documentRepositoryForOrganization } from "@/lib/documents/document-repository";

/**
 * F-2 — REAL PostgreSQL proof of document tenant ownership.
 *
 * Runs only under the PostgreSQL vitest config (HERMES_STORAGE_MODE=database +
 * DATABASE_URL on a migrated database). Proves, against the real constraint
 * added by 20260925120000_f2_document_tenant_fk:
 *
 *   - the foreign key rejects a Document whose tenantId names no Organization,
 *     and still admits an unassigned (NULL) row;
 *   - ON DELETE RESTRICT: an Organization that owns documents cannot be deleted;
 *   - the organization-scoped repository filters IN SQL — a foreign or NULL row
 *     is not found, not updated and not deleted.
 *
 * The repository silently falls back to the in-process session store when a
 * database call fails, so every repository assertion here is cross-checked
 * with raw SQL: a fallback would pass the repository call but fail the SQL
 * read. Every row this suite writes is prefixed `f2pg-` and removed before and
 * after.
 */

const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const PREFIX = "f2pg-";
const ORG_A = `${PREFIX}org-a`;
const ORG_B = `${PREFIX}org-b`;
const ORG_EMPTY = `${PREFIX}org-empty`;

type Raw = {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(sql: string, ...args: unknown[]) => Promise<T>;
};

async function db(): Promise<Raw> {
  const client = await getPrisma();
  if (!client) throw new Error("F-2 PG test requires a real Prisma client");
  return client as unknown as Raw;
}

async function cleanup(): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(`DELETE FROM "DocumentTextChunk" WHERE id LIKE '${PREFIX}%'`);
  await c.$executeRawUnsafe(`DELETE FROM "Document" WHERE id LIKE '${PREFIX}%' OR "tenantId" LIKE '${PREFIX}%'`);
  // Cleanup rows RESTRICT their organization, so they go first.
  await c.$executeRawUnsafe(`DELETE FROM "DocumentStorageCleanup" WHERE "organizationId" LIKE '${PREFIX}%'`);
  await c.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${PREFIX}%'`);
}

async function mkOrganization(id: string): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(
    `INSERT INTO "Organization" (id, name, slug, "updatedAt") VALUES ($1, $1, $1, now())`,
    id
  );
}

async function mkDocument(id: string, tenantId: string | null): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(
    `INSERT INTO "Document" (id, title, "sourceType", "originalFilename", "mimeType", "sizeBytes", "storageKey", "tenantId", "updatedAt")
     VALUES ($1, $1, 'manual', 'f2.txt', 'text/plain', 1, $2, $3, now())`,
    id,
    `documents/${id}/original.txt`,
    tenantId
  );
}

async function row(id: string): Promise<{ tenantId: string | null; title: string; uploadedBy: string | null } | null> {
  const c = await db();
  const rows = await c.$queryRawUnsafe<Array<{ tenantId: string | null; title: string; uploadedBy: string | null }>>(
    `SELECT "tenantId", title, "uploadedBy" FROM "Document" WHERE id = $1`,
    id
  );
  return rows[0] ?? null;
}

/** The PostgreSQL SQLSTATE of a rejected raw statement (23503 = foreign_key_violation). */
async function sqlState(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    const e = err as { code?: string; meta?: { code?: string }; message?: string };
    return e.meta?.code ?? (/\b(23\d{3})\b/.exec(e.message ?? "")?.[1] ?? e.code ?? "unknown");
  }
}

// NOT skipped: the suite must never pass by silently skipping every test.
it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("F-2 PG — Document.tenantId foreign key", () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    await mkOrganization(ORG_A);
    await mkOrganization(ORG_B);
    await mkOrganization(ORG_EMPTY);
  });

  it("the constraint is the one the migration declares: RESTRICT on delete, CASCADE on update", async () => {
    const c = await db();
    const rows = await c.$queryRawUnsafe<Array<{ confdeltype: string; confupdtype: string; target: string }>>(
      `SELECT confdeltype::text, confupdtype::text, confrelid::regclass::text AS target
         FROM pg_constraint WHERE conname = 'Document_tenantId_fkey'`
    );
    expect(rows).toEqual([{ confdeltype: "r", confupdtype: "c", target: `"Organization"` }]);
    const idx = await c.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Document' AND indexname = 'Document_tenantId_createdAt_idx'`
    );
    expect(idx).toHaveLength(1);
  });

  it("rejects a Document whose tenantId names no Organization (23503)", async () => {
    expect(await sqlState(() => mkDocument(`${PREFIX}doc-ghost`, `${PREFIX}org-does-not-exist`))).toBe("23503");
    expect(await row(`${PREFIX}doc-ghost`)).toBeNull();
  });

  it("admits an unassigned (NULL tenantId) Document and a correctly owned one", async () => {
    await mkDocument(`${PREFIX}doc-null`, null);
    await mkDocument(`${PREFIX}doc-a`, ORG_A);
    expect((await row(`${PREFIX}doc-null`))?.tenantId).toBeNull();
    expect((await row(`${PREFIX}doc-a`))?.tenantId).toBe(ORG_A);
  });

  it("RESTRICT: an Organization that owns documents cannot be deleted; its documents survive", async () => {
    await mkDocument(`${PREFIX}doc-a`, ORG_A);
    const c = await db();
    expect(await sqlState(() => c.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id = $1`, ORG_A))).toBe("23503");
    const orgs = await c.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "Organization" WHERE id = $1`,
      ORG_A
    );
    expect(orgs[0].n).toBe(1);
    expect((await row(`${PREFIX}doc-a`))?.tenantId).toBe(ORG_A);
  });

  it("an Organization with no documents is still deletable (positive control)", async () => {
    const c = await db();
    expect(await c.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id = $1`, ORG_EMPTY)).toBe(1);
  });
});

describe.skipIf(!PG_ENABLED)("F-2 PG — the organization-scoped repository filters in SQL", () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    await mkOrganization(ORG_A);
    await mkOrganization(ORG_B);
    await mkDocument(`${PREFIX}doc-a`, ORG_A);
    await mkDocument(`${PREFIX}doc-b`, ORG_B);
    await mkDocument(`${PREFIX}doc-null`, null);
  });

  it("create() writes the fixed organization and the uploader to the real row", async () => {
    const created = await documentRepositoryForOrganization(ORG_A).create({
      title: `${PREFIX}created`,
      sourceType: "manual",
      originalFilename: "c.txt",
      mimeType: "text/plain",
      sizeBytes: 1,
      storageProvider: "local",
      storageKey: "",
      metadata: { tags: [] },
      chunkCount: 0,
      status: "uploaded",
      uploadedBy: "user-f2pg",
    });
    const stored = await row(created.id);
    expect(stored).toEqual({ tenantId: ORG_A, title: `${PREFIX}created`, uploadedBy: "user-f2pg" });
    const c = await db();
    await c.$executeRawUnsafe(`DELETE FROM "Document" WHERE id = $1`, created.id);
  });

  it("listPage() and get() return only the organization's own rows", async () => {
    const repoA = documentRepositoryForOrganization(ORG_A);
    const listed = (await repoA.listPage({ limit: 100 })).documents
      .map((d) => d.id)
      .filter((id) => id.startsWith(PREFIX));
    expect(listed).toEqual([`${PREFIX}doc-a`]);
    expect((await repoA.get(`${PREFIX}doc-a`))?.id).toBe(`${PREFIX}doc-a`);
    expect(await repoA.get(`${PREFIX}doc-b`)).toBeNull();
    expect(await repoA.get(`${PREFIX}doc-null`)).toBeNull();
  });

  it("update() cannot touch a foreign or unassigned row, and cannot move an owned one", async () => {
    const repoA = documentRepositoryForOrganization(ORG_A);
    expect(await repoA.update(`${PREFIX}doc-b`, { title: "hijacked" })).toBeNull();
    expect(await repoA.update(`${PREFIX}doc-null`, { title: "hijacked" })).toBeNull();
    expect((await row(`${PREFIX}doc-b`))?.title).toBe(`${PREFIX}doc-b`);
    expect((await row(`${PREFIX}doc-null`))?.title).toBe(`${PREFIX}doc-null`);

    // A smuggled ownership key (bypassing the type) is stripped, not applied.
    const smuggled = { title: "renamed", tenantId: ORG_B } as unknown as { title: string };
    const updated = await repoA.update(`${PREFIX}doc-a`, smuggled);
    expect(updated?.title).toBe("renamed");
    expect(await row(`${PREFIX}doc-a`)).toMatchObject({ tenantId: ORG_A, title: "renamed" });
  });

  it("listPage() keyset-pages the organization's rows in SQL: each once, newest first, never another tenant's", async () => {
    const c = await db();
    // Five more rows for A with IDENTICAL createdAt, so the id tie-break is exercised.
    for (let i = 0; i < 5; i += 1) {
      await c.$executeRawUnsafe(
        `INSERT INTO "Document" (id, title, "sourceType", "originalFilename", "mimeType", "sizeBytes", "storageKey", "tenantId", "createdAt", "updatedAt")
         VALUES ($1, $1, 'manual', 'f2.txt', 'text/plain', 1, 'k', $2, TIMESTAMP '2026-01-01 00:00:00', now())`,
        `${PREFIX}page-${i}`,
        ORG_A
      );
    }
    const { decodeDocumentListCursor } = await import("@/lib/documents/list-cursor");
    const repoA = documentRepositoryForOrganization(ORG_A);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await repoA.listPage({ limit: 2, cursor: cursor ? decodeDocumentListCursor(cursor) : null });
      seen.push(...page.documents.map((d) => d.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    const mine = seen.filter((id) => id.startsWith(PREFIX));
    expect(mine.sort()).toEqual(
      [`${PREFIX}doc-a`, ...[0, 1, 2, 3, 4].map((i) => `${PREFIX}page-${i}`)].sort()
    );
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).not.toContain(`${PREFIX}doc-b`);
    expect(seen).not.toContain(`${PREFIX}doc-null`);
    // Tie-broken by id DESC within the shared timestamp.
    const tied = seen.filter((id) => id.startsWith(`${PREFIX}page-`));
    expect(tied).toEqual([4, 3, 2, 1, 0].map((i) => `${PREFIX}page-${i}`));
  });

  it("stats() aggregates the organization's rows in SQL, independent of paging", async () => {
    const c = await db();
    await c.$executeRawUnsafe(`UPDATE "Document" SET status = 'indexed' WHERE id = $1`, `${PREFIX}doc-a`);
    await mkDocument(`${PREFIX}doc-a2`, ORG_A);
    await c.$executeRawUnsafe(`UPDATE "Document" SET status = 'failed' WHERE id = $1`, `${PREFIX}doc-a2`);
    await mkDocument(`${PREFIX}doc-a3`, ORG_A); // stays 'uploaded'
    await c.$executeRawUnsafe(`UPDATE "Document" SET status = 'failed' WHERE id = $1`, `${PREFIX}doc-b`);
    await c.$executeRawUnsafe(`UPDATE "Document" SET status = 'indexed' WHERE id = $1`, `${PREFIX}doc-null`);

    const repoA = documentRepositoryForOrganization(ORG_A);
    expect(await repoA.stats()).toEqual({ total: 3, indexed: 1, failed: 1 });
    // Paging never changes the figures.
    expect((await repoA.listPage({ limit: 1 })).documents).toHaveLength(1);
    expect(await repoA.stats()).toEqual({ total: 3, indexed: 1, failed: 1 });
    expect(await documentRepositoryForOrganization(ORG_B).stats()).toEqual({ total: 1, indexed: 0, failed: 1 });
  });

  it("delete() cannot remove a foreign or unassigned row", async () => {
    const repoA = documentRepositoryForOrganization(ORG_A);
    expect(await repoA.delete(`${PREFIX}doc-b`)).toBe(false);
    expect(await repoA.delete(`${PREFIX}doc-null`)).toBe(false);
    expect(await row(`${PREFIX}doc-b`)).not.toBeNull();
    expect(await row(`${PREFIX}doc-null`)).not.toBeNull();
    expect(await repoA.delete(`${PREFIX}doc-a`)).toBe(true);
    expect(await row(`${PREFIX}doc-a`)).toBeNull();
  });
});

describe.skipIf(!PG_ENABLED)("F-2 PG — FU-F2-R2-3: transactional delete + storage cleanup outbox", () => {
  let tempDir: string;
  const savedDir = process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR;
  const savedProvider = process.env.HERMES_DOCUMENT_STORAGE_PROVIDER;

  const onDisk = (key: string) =>
    fs
      .access(path.join(tempDir, key))
      .then(() => true)
      .catch(() => false);

  async function storedDoc(id: string, org: string) {
    const c = await db();
    await mkDocument(id, org);
    await c.$executeRawUnsafe(
      `UPDATE "Document" SET "storageKey" = $2, "extractedTextKey" = $3 WHERE id = $1`,
      id,
      `documents/${id}/original.pdf`,
      `documents/${id}/extracted.txt`
    );
    for (const key of [`documents/${id}/original.pdf`, `documents/${id}/extracted.txt`]) {
      await fs.mkdir(path.dirname(path.join(tempDir, key)), { recursive: true });
      await fs.writeFile(path.join(tempDir, key), "bytes");
    }
    await c.$executeRawUnsafe(
      `INSERT INTO "DocumentTextChunk" (id, "documentId", position, text, "charCount", "updatedAt")
       VALUES ($1, $2, 0, 'chunk', 5, now())`,
      `${PREFIX}chunk-${id}`,
      id
    );
  }

  async function count(sql: string, ...args: unknown[]): Promise<number> {
    const c = await db();
    const r = await c.$queryRawUnsafe<Array<{ n: number }>>(sql, ...args);
    return r[0].n;
  }

  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "f2pg-storage-"));
    process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
    delete process.env.HERMES_DOCUMENT_STORAGE_PROVIDER;
    await mkOrganization(ORG_A);
    await mkOrganization(ORG_B);
  });
  afterEach(async () => {
    if (savedDir === undefined) delete process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR;
    else process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = savedDir;
    if (savedProvider === undefined) delete process.env.HERMES_DOCUMENT_STORAGE_PROVIDER;
    else process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = savedProvider;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("one transaction removes the Document and its chunks and records one PENDING outbox row", async () => {
    const id = `${PREFIX}del-1`;
    await storedDoc(id, ORG_A);
    const result = await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id);
    expect(result).toMatchObject({ deleted: true, skippedKeys: 0 });
    expect(await row(id)).toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM "DocumentTextChunk" WHERE "documentId" = $1`, id)).toBe(0);
    const c = await db();
    const outbox = await c.$queryRawUnsafe<Array<{ organizationId: string; status: string; objectKeys: string[] }>>(
      `SELECT "organizationId", status::text, "objectKeys" FROM "DocumentStorageCleanup" WHERE "documentId" = $1`,
      id
    );
    expect(outbox).toEqual([
      {
        organizationId: ORG_A,
        status: "PENDING",
        objectKeys: [`documents/${id}/extracted.txt`, `documents/${id}/original.pdf`],
      },
    ]);
    // Storage is untouched until the post-commit step runs.
    expect(await onDisk(`documents/${id}/original.pdf`)).toBe(true);
  });

  it("ATOMIC: if the outbox insert fails, the Document and its chunks are NOT deleted", async () => {
    const id = `${PREFIX}del-atomic`;
    await storedDoc(id, ORG_A);
    const c = await db();
    // A pre-existing row for the same documentId makes the in-transaction insert
    // violate the unique index — a real failure inside the transaction.
    await c.$executeRawUnsafe(
      `INSERT INTO "DocumentStorageCleanup" (id, "organizationId", "documentId", "objectKeys", "updatedAt")
       VALUES ($1, $2, $3, ARRAY[]::text[], now())`,
      `${PREFIX}dsc-conflict`,
      ORG_A,
      id
    );
    await expect(documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id)).rejects.toBeTruthy();
    expect(await row(id)).not.toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM "DocumentTextChunk" WHERE "documentId" = $1`, id)).toBe(1);
  });

  it("another organization's document is neither deleted nor enqueued", async () => {
    const id = `${PREFIX}del-foreign`;
    await storedDoc(id, ORG_B);
    expect(await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id)).toEqual({ deleted: false });
    expect(await row(id)).not.toBeNull();
    expect(await count(`SELECT count(*)::int AS n FROM "DocumentStorageCleanup" WHERE "documentId" = $1`, id)).toBe(0);
  });

  it("the post-commit run removes both objects and marks the row DONE", async () => {
    const id = `${PREFIX}del-run`;
    await storedDoc(id, ORG_A);
    const result = (await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { runDocumentStorageCleanup } = await import("@/lib/documents/storage-cleanup");
    expect(await runDocumentStorageCleanup(result.cleanupId)).toBe("done");
    expect(await onDisk(`documents/${id}/original.pdf`)).toBe(false);
    expect(await onDisk(`documents/${id}/extracted.txt`)).toBe(false);
    expect(
      await count(`SELECT count(*)::int AS n FROM "DocumentStorageCleanup" WHERE "documentId" = $1 AND status = 'DONE'`, id)
    ).toBe(1);
  });

  it("a failed removal stays PENDING on PG with a code and back-off; a later pass completes it", async () => {
    const id = `${PREFIX}del-retry`;
    await storedDoc(id, ORG_A);
    const blocker = path.join(tempDir, `documents/${id}/extracted.txt`);
    await fs.rm(blocker);
    await fs.mkdir(blocker, { recursive: true });
    await fs.writeFile(path.join(blocker, "lock"), "x");
    const result = (await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { runDocumentStorageCleanup, runDocumentStorageCleanupPass } = await import("@/lib/documents/storage-cleanup");
    expect(await runDocumentStorageCleanup(result.cleanupId)).toBe("pending");
    const c = await db();
    const [pending] = await c.$queryRawUnsafe<Array<{ status: string; attempts: number; lastErrorCode: string; nextAttemptAt: Date }>>(
      `SELECT status::text, attempts, "lastErrorCode", "nextAttemptAt" FROM "DocumentStorageCleanup" WHERE "documentId" = $1`,
      id
    );
    expect(pending).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "storage_remove_failed" });
    await fs.rm(blocker, { recursive: true, force: true });
    const later = new Date(new Date(pending.nextAttemptAt).getTime() + 1);
    expect(await runDocumentStorageCleanupPass({ limit: 10, organizationId: ORG_A, now: later })).toEqual({
      claimed: 1,
      done: 1,
      retrying: 0,
    });
    expect(await onDisk(`documents/${id}/original.pdf`)).toBe(false);
  });

  it("concurrent passes claim a due row exactly once (atomic conditional update)", async () => {
    const id = `${PREFIX}del-race`;
    await storedDoc(id, ORG_A);
    await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id);
    const { runDocumentStorageCleanupPass } = await import("@/lib/documents/storage-cleanup");
    const now = new Date(Date.now() + 1000);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => runDocumentStorageCleanupPass({ limit: 10, organizationId: ORG_A, now }))
    );
    expect(results.reduce((a, r) => a + r.claimed, 0)).toBe(1);
    expect(results.reduce((a, r) => a + r.done, 0)).toBe(1);
  });

  it("RESTRICT: an organization with a pending cleanup cannot be deleted", async () => {
    const id = `${PREFIX}del-restrict`;
    await storedDoc(id, ORG_A);
    await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id);
    const c = await db();
    expect(await sqlState(() => c.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id = $1`, ORG_A))).toBe("23503");
  });
});
