import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { getChunkVectorStore, type ChunkSearchScope } from "@/lib/documents/chunk-vector-store";
import { DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS } from "@/lib/documents/config";

/**
 * F-1 — REAL PostgreSQL proof that the document-chunk search is confined to
 * the caller's tenant IN SQL (R1–R3 of docs/industrial/f1-document-rag-
 * remediation-plan.md). Runs only under the PostgreSQL vitest config
 * (HERMES_STORAGE_MODE=database + DATABASE_URL on a migrated pgvector DB).
 *
 * Every row this suite writes is prefixed `f1pg-` and removed before and after.
 */

const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const PREFIX = "f1pg-";
const ORG_A = `${PREFIX}org-a`;
const ORG_B = `${PREFIX}org-b`;
const CANARY_B = "F1PG-CANARY-B tenant b confidential text";

type Raw = {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(sql: string, ...args: unknown[]) => Promise<T>;
};

async function db(): Promise<Raw> {
  const client = await getPrisma();
  if (!client) throw new Error("F-1 PG test requires a real Prisma client");
  return client as unknown as Raw;
}

/** One-hot unit vector in the real column dimension: identical vectors score 1. */
function unit(hot: number): number[] {
  return Array.from({ length: DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS }, (_, i) => (i === hot ? 1 : 0));
}

async function cleanup(): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(`DELETE FROM "DocumentTextChunk" WHERE id LIKE '${PREFIX}%'`);
  await c.$executeRawUnsafe(`DELETE FROM "Document" WHERE id LIKE '${PREFIX}%'`);
}

async function mkDocument(id: string, tenantId: string | null): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(
    `INSERT INTO "Document" (id, title, "sourceType", "originalFilename", "mimeType", "sizeBytes", "storageKey", "tenantId", "updatedAt")
     VALUES ($1, $1, 'manual', 'f1.txt', 'text/plain', 1, $2, $3, now())`,
    id,
    `documents/${id}/original.txt`,
    tenantId
  );
}

async function mkEmbeddedChunk(id: string, documentId: string, text: string): Promise<void> {
  const c = await db();
  await c.$executeRawUnsafe(
    `INSERT INTO "DocumentTextChunk" (id, "documentId", position, text, "charCount", "updatedAt")
     VALUES ($1, $2, 0, $3, $4, now())`,
    id,
    documentId,
    text,
    text.length
  );
  const stored = await getChunkVectorStore().setEmbedding(id, unit(0), "f1pg-unit");
  if (!stored) throw new Error("setEmbedding failed — is the database migrated with pgvector?");
}

// NOT skipped: the suite must never pass by silently skipping every test.
it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("F-1 PG — DocumentTextChunk search is tenant-scoped in SQL", () => {
  const savedProvider = process.env.DOCUMENT_EMBEDDINGS_PROVIDER;

  beforeAll(async () => {
    // The real column is vector(1536); the openai provider declares 1536 dims.
    // No embedding API is called — vectors are written directly.
    delete process.env.DOCUMENT_EMBEDDINGS_PROVIDER;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (savedProvider === undefined) delete process.env.DOCUMENT_EMBEDDINGS_PROVIDER;
    else process.env.DOCUMENT_EMBEDDINGS_PROVIDER = savedProvider;
  });

  beforeEach(async () => {
    await cleanup();
    await mkDocument(`${PREFIX}doc-a`, ORG_A);
    await mkDocument(`${PREFIX}doc-b`, ORG_B);
    await mkDocument(`${PREFIX}doc-null`, null);
    await mkEmbeddedChunk(`${PREFIX}chunk-a`, `${PREFIX}doc-a`, "tenant a text");
    await mkEmbeddedChunk(`${PREFIX}chunk-b`, `${PREFIX}doc-b`, CANARY_B);
    await mkEmbeddedChunk(`${PREFIX}chunk-null`, `${PREFIX}doc-null`, `${CANARY_B} legacy`);
    // orphan: parent Document row does not exist (no FK prevents this)
    await mkEmbeddedChunk(`${PREFIX}chunk-orphan`, `${PREFIX}doc-missing`, `${CANARY_B} orphan`);
  });

  afterEach(cleanup);

  const search = (scope: ChunkSearchScope, documentId?: string) =>
    getChunkVectorStore().search(unit(0), 50, scope, documentId);

  const ownIds = (rows: { chunk: { id: string } }[]) =>
    rows.map((r) => r.chunk.id).filter((id) => id.startsWith(PREFIX));

  it("R1: scope A returns tenant A's chunk and never tenant B's", async () => {
    const rows = await search({ orgId: ORG_A });
    expect(ownIds(rows)).toEqual([`${PREFIX}chunk-a`]);
    expect(JSON.stringify(rows)).not.toContain("F1PG-CANARY-B");
  });

  it("R1 (reverse): scope B returns only tenant B's chunk", async () => {
    expect(ownIds(await search({ orgId: ORG_B }))).toEqual([`${PREFIX}chunk-b`]);
  });

  it("R2: a NULL-tenant document's chunk is returned for no scope", async () => {
    for (const orgId of [ORG_A, ORG_B]) {
      expect(ownIds(await search({ orgId }))).not.toContain(`${PREFIX}chunk-null`);
    }
  });

  it("R3: an orphan chunk (no parent Document row) is returned for no scope", async () => {
    for (const orgId of [ORG_A, ORG_B]) {
      expect(ownIds(await search({ orgId }))).not.toContain(`${PREFIX}chunk-orphan`);
    }
  });

  it("the documentId filter cannot reach another tenant's document", async () => {
    expect(ownIds(await search({ orgId: ORG_A }, `${PREFIX}doc-b`))).toEqual([]);
    expect(ownIds(await search({ orgId: ORG_A }, `${PREFIX}doc-a`))).toEqual([`${PREFIX}chunk-a`]);
  });

  it("an unknown tenant and an unusable scope both return nothing", async () => {
    expect(ownIds(await search({ orgId: `${PREFIX}org-unknown` }))).toEqual([]);
    expect(await search({ orgId: "" })).toEqual([]);
    expect(await search(null as unknown as ChunkSearchScope)).toEqual([]);
  });

  it("an orgId value shaped like SQL is bound as a parameter, not interpolated", async () => {
    const rows = await search({ orgId: `' OR '1'='1` });
    expect(ownIds(rows)).toEqual([]);
  });
});
