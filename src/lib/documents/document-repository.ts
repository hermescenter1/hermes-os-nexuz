/**
 * Document repository (Phase 16A).
 *
 * Same two-implementations-behind-one-factory shape as every other
 * repository in this codebase (`case-repository.ts`, `knowledge-repository
 * .ts`):
 *  - session: in-process globalThis store (default, no database)
 *  - database: real Prisma/PostgreSQL, loaded dynamically; degrades to the
 *    session store whenever the client is unavailable, so the app never
 *    crashes.
 *
 * This repository covers the `Document` row (metadata, status, storage
 * pointers) ONLY — it never touches the `embedding` column. Chunk-level
 * access stays exactly where Phase 14C put it: raw SQL through
 * `src/lib/rag/vector-store-pgvector.ts`. Nothing calls this repository yet
 * (no upload route exists — Phase 16B).
 */

import { getStorageMode } from "@/lib/storage/storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository } from "@/lib/storage/types";
import type { Document, DocumentMetadata, DocumentStatus } from "./types";

// Note: "status" is omitted from the base type (not just intersected back
// in as optional) because `Omit<Document, ...> & { status?: DocumentStatus }`
// alone would NOT make it optional — intersecting a required property with
// an optional one of the same type still requires it. Removing it from the
// Omit first is what actually makes `status` optional here.
export type DocumentCreate = Omit<Document, "id" | "createdAt" | "updatedAt" | "status"> & {
  status?: DocumentStatus;
};

const now = () => new Date().toISOString();

/* ---------------- session implementation ---------------- */
function createSessionDocumentRepo(): Repository<Document, DocumentCreate> {
  const g = globalThis as unknown as { __hermesDocumentDrafts?: Document[] };
  g.__hermesDocumentDrafts ??= [];
  const buf = g.__hermesDocumentDrafts;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((d) => d.id === id) ?? null;
    },
    async findByTitle(title) {
      const t = title.trim().toLowerCase();
      return buf.find((d) => d.title.trim().toLowerCase() === t) ?? null;
    },
    async create(input) {
      const rec: Document = {
        ...input,
        status: input.status ?? "uploaded",
        id: `document-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((d) => d.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((d) => d.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

/* ---------------- database implementation ---------------- */
// Loose row type — we never statically import Prisma types so the session
// build needs no generated client.
type DocumentModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<unknown>;
};

function rowToDocument(r: Record<string, unknown>): Document {
  const metadata = (r.metadata as DocumentMetadata | undefined) ?? { tags: [] };
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    sourceType: String(r.sourceType ?? "factory_knowledge") as Document["sourceType"],
    originalFilename: String(r.originalFilename ?? ""),
    mimeType: String(r.mimeType ?? ""),
    sizeBytes: Number(r.sizeBytes ?? 0),
    storageProvider: String(r.storageProvider ?? "local") as Document["storageProvider"],
    storageKey: String(r.storageKey ?? ""),
    ...(r.extractedTextKey ? { extractedTextKey: String(r.extractedTextKey) } : {}),
    ...(r.contentHash ? { contentHash: String(r.contentHash) } : {}),
    metadata: { ...metadata, tags: metadata.tags ?? [] },
    status: (r.status as DocumentStatus) ?? "uploaded",
    ...(r.error ? { error: String(r.error) } : {}),
    chunkCount: Number(r.chunkCount ?? 0),
    ...(r.uploadedBy ? { uploadedBy: String(r.uploadedBy) } : {}),
    ...(r.tenantId ? { tenantId: String(r.tenantId) } : {}),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseDocumentRepo(): Repository<Document, DocumentCreate> {
  const fallback = createSessionDocumentRepo();
  async function model(): Promise<DocumentModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).document as DocumentModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        const rows = await m.findMany({ orderBy: { createdAt: "desc" } });
        return rows.map(rowToDocument);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToDocument(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async findByTitle(title) {
      const m = await model();
      if (!m) return fallback.findByTitle!(title);
      try {
        const r = await m.findFirst({ where: { title } });
        return r ? rowToDocument(r) : null;
      } catch {
        return fallback.findByTitle!(title);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        const r = await m.create({ data: { ...input, status: input.status ?? "uploaded" } });
        return rowToDocument(r);
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        const r = await m.update({ where: { id }, data: patch });
        return rowToDocument(r);
      } catch {
        return fallback.update(id, patch);
      }
    },
    async delete(id) {
      const m = await model();
      if (!m) return fallback.delete(id);
      try {
        await m.delete({ where: { id } });
        return true;
      } catch {
        return fallback.delete(id);
      }
    },
  };
}

export function documentRepository(): Repository<Document, DocumentCreate> {
  return getStorageMode() === "database"
    ? createDatabaseDocumentRepo()
    : createSessionDocumentRepo();
}
