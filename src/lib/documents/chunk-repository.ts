/**
 * Document text-chunk repository (Phase 16C).
 *
 * Same two-implementations-behind-one-factory shape as every other
 * repository in this codebase, adapted to how chunks are actually used:
 * always read/replaced as a whole batch per document, never CRUD'd one at
 * a time like a Case/Document row. Hence a specialized interface
 * (`listByDocumentId`/`deleteByDocumentId`/`createMany`) rather than the
 * generic `Repository<T,TCreate>` shape.
 *
 * Covers `DocumentTextChunk` ONLY — the pre-embedding chunk text store
 * (see types.ts). Never touches `DocumentChunk` (the pgvector table) or
 * its `embedding` column; that stays exactly where Phase 14C put it, raw
 * SQL through `vector-store-pgvector.ts`.
 */

import { getStorageMode } from "@/lib/storage/storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { DocumentTextChunk } from "./types";

export type DocumentTextChunkCreate = Omit<
  DocumentTextChunk,
  "id" | "createdAt" | "updatedAt" | "status"
> & {
  status?: string;
};

export interface DocumentTextChunkRepository {
  list(): Promise<DocumentTextChunk[]>;
  listByDocumentId(documentId: string): Promise<DocumentTextChunk[]>;
  /** Returns the number of rows removed. */
  deleteByDocumentId(documentId: string): Promise<number>;
  createMany(chunks: DocumentTextChunkCreate[]): Promise<DocumentTextChunk[]>;
}

const now = () => new Date().toISOString();

/* ---------------- session implementation ---------------- */
function createSessionChunkRepo(): DocumentTextChunkRepository {
  const g = globalThis as unknown as { __hermesDocumentTextChunks?: DocumentTextChunk[] };
  g.__hermesDocumentTextChunks ??= [];
  const buf = g.__hermesDocumentTextChunks;

  return {
    async list() {
      return [...buf];
    },
    async listByDocumentId(documentId) {
      return buf.filter((c) => c.documentId === documentId).sort((a, b) => a.position - b.position);
    },
    async deleteByDocumentId(documentId) {
      const before = buf.length;
      const kept = buf.filter((c) => c.documentId !== documentId);
      buf.length = 0;
      buf.push(...kept);
      return before - buf.length;
    },
    async createMany(chunks) {
      const ts = now();
      const recs: DocumentTextChunk[] = chunks.map((c, i) => ({
        ...c,
        status: c.status ?? "chunked",
        id: `chunk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: ts,
        updatedAt: ts,
      }));
      buf.push(...recs);
      return recs;
    },
  };
}

/* ---------------- database implementation ---------------- */
// Loose row type — we never statically import Prisma types so the session
// build needs no generated client.
type ChunkModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  createMany: (a: unknown) => Promise<{ count: number }>;
};

function rowToChunk(r: Record<string, unknown>): DocumentTextChunk {
  return {
    id: String(r.id),
    documentId: String(r.documentId ?? ""),
    position: Number(r.position ?? 0),
    text: String(r.text ?? ""),
    charCount: Number(r.charCount ?? 0),
    ...(r.tokenCount !== null && r.tokenCount !== undefined
      ? { tokenCount: Number(r.tokenCount) }
      : {}),
    ...(r.contentHash ? { contentHash: String(r.contentHash) } : {}),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    status: String(r.status ?? "chunked"),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseChunkRepo(): DocumentTextChunkRepository {
  const fallback = createSessionChunkRepo();
  async function model(): Promise<ChunkModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).documentTextChunk as ChunkModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: [{ documentId: "asc" }, { position: "asc" }] })).map(
          rowToChunk
        );
      } catch {
        return fallback.list();
      }
    },
    async listByDocumentId(documentId) {
      const m = await model();
      if (!m) return fallback.listByDocumentId(documentId);
      try {
        return (
          await m.findMany({ where: { documentId }, orderBy: { position: "asc" } })
        ).map(rowToChunk);
      } catch {
        return fallback.listByDocumentId(documentId);
      }
    },
    async deleteByDocumentId(documentId) {
      const m = await model();
      if (!m) return fallback.deleteByDocumentId(documentId);
      try {
        const { count } = await m.deleteMany({ where: { documentId } });
        return count;
      } catch {
        return fallback.deleteByDocumentId(documentId);
      }
    },
    async createMany(chunks) {
      const m = await model();
      if (!m) return fallback.createMany(chunks);
      // Rows are fully built CLIENT-SIDE (id/timestamps included) before
      // the single INSERT, deliberately — Prisma's `createMany()` returns
      // only `{ count }`, never the inserted rows, and looping individual
      // `create()` calls would risk a partial failure mid-batch (some
      // chunks already committed) before falling back to the session
      // store, which would then duplicate them. One atomic statement with
      // pre-built rows avoids both problems entirely.
      const ts = now();
      const rows: DocumentTextChunk[] = chunks.map((c, i) => ({
        ...c,
        status: c.status ?? "chunked",
        id: `chunk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: ts,
        updatedAt: ts,
      }));
      try {
        await m.createMany({ data: rows });
        return rows;
      } catch {
        return fallback.createMany(chunks);
      }
    },
  };
}

export function documentTextChunkRepository(): DocumentTextChunkRepository {
  return getStorageMode() === "database" ? createDatabaseChunkRepo() : createSessionChunkRepo();
}
