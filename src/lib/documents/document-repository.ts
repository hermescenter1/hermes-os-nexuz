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
import { encodeDocumentListCursor, isAfterCursor, type DocumentListCursor } from "./list-cursor";
import { documentTextChunkRepository, deleteDocumentChunksInTransaction } from "./chunk-repository";
import {
  cleanupKeysFor,
  createCleanupRowInTransaction,
  createSessionCleanupRow,
} from "./storage-cleanup";

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
    ...(r.lastProcessedAt
      ? { lastProcessedAt: new Date(r.lastProcessedAt as string).toISOString() }
      : {}),
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

/* ---------------- F-2: tenant-scoped access ---------------- */

/**
 * F-2 — every route-facing read and write goes through this scoped view.
 *
 * The organization is fixed when the view is created (the caller passes the
 * server-resolved org from `requireOrgActor`, never a request value). Every
 * query filters on `tenantId` IN the query itself, so a document owned by
 * another organization — or by none (NULL `tenantId`) — is simply not found:
 * the routes answer 404 and have no side effect.
 *
 * Ownership is not patchable: `tenantId`, `uploadedBy` and identity fields
 * are stripped from every update, so no route can move a document between
 * organizations. Reassignment is a manual, audited operator procedure only
 * (docs/industrial/f2-document-tenant-ownership-proposal.md, D-F2-5).
 *
 * The unscoped `documentRepository()` above stays for the internal pipeline
 * (processing/embedding by an id a route has ALREADY resolved through this
 * view); route handlers must not use it.
 */

export type TenantDocumentCreate = Omit<DocumentCreate, "tenantId" | "uploadedBy"> & {
  uploadedBy: string;
};

export type TenantDocumentPatch = Partial<
  Omit<Document, "id" | "tenantId" | "uploadedBy" | "createdAt" | "updatedAt">
>;

export interface TenantDocumentRepository {
  readonly organizationId: string;
  /** One page, newest first (`createdAt DESC, id DESC`); see list-cursor.ts. */
  listPage(options?: { limit?: number; cursor?: DocumentListCursor | null }): Promise<TenantDocumentPage>;
  /** Whole-library figures for this organization, independent of paging. */
  stats(): Promise<TenantDocumentStats>;
  get(id: string): Promise<Document | null>;
  create(input: TenantDocumentCreate): Promise<Document>;
  update(id: string, patch: TenantDocumentPatch): Promise<Document | null>;
  /**
   * Row-only delete. Does NOT remove chunks or stored files — the document
   * routes use `deleteWithStorageCleanup` instead.
   */
  delete(id: string): Promise<boolean>;
  /**
   * F-2 FU-F2-R2-3 — delete this organization's document, its chunks and
   * enqueue the removal of its stored files, atomically. In database mode the
   * three writes share ONE transaction and never fall back to the session
   * store: a failure throws and nothing is deleted. The files are removed
   * afterwards, from the returned cleanup row (see storage-cleanup.ts).
   */
  deleteWithStorageCleanup(id: string): Promise<TenantDocumentDeletion>;
}

export type TenantDocumentDeletion =
  | { deleted: false }
  | { deleted: true; cleanupId: string; skippedKeys: number };

export interface TenantDocumentStats {
  total: number;
  indexed: number;
  failed: number;
}

function statsFrom(statuses: Iterable<{ status: string; count: number }>): TenantDocumentStats {
  const stats: TenantDocumentStats = { total: 0, indexed: 0, failed: 0 };
  for (const { status, count } of statuses) {
    stats.total += count;
    if (status === "indexed") stats.indexed += count;
    if (status === "failed") stats.failed += count;
  }
  return stats;
}

export interface TenantDocumentPage {
  documents: Document[];
  /** Opaque cursor for the next page, or `null` when this page is the last. */
  nextCursor: string | null;
}

export const TENANT_DOCUMENT_LIST_DEFAULT = 50;
export const TENANT_DOCUMENT_LIST_MAX = 100;

function clampListLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
    return TENANT_DOCUMENT_LIST_DEFAULT;
  }
  return Math.min(TENANT_DOCUMENT_LIST_MAX, Math.floor(limit));
}

/** Rows are fetched with `take: limit + 1`; the extra row only proves a next page exists. */
function toPage(rows: Document[], limit: number): TenantDocumentPage {
  const documents = rows.slice(0, limit);
  const last = documents[documents.length - 1];
  return {
    documents,
    nextCursor:
      rows.length > limit && last ? encodeDocumentListCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

function newestFirst(a: Document, b: Document): number {
  const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Drops ownership and identity keys even if a caller smuggles them in via a cast. */
function stripOwnership(patch: TenantDocumentPatch): TenantDocumentPatch {
  const rest: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  for (const key of ["id", "tenantId", "uploadedBy", "createdAt", "updatedAt"]) delete rest[key];
  return rest as TenantDocumentPatch;
}

function sessionDocumentBuffer(): Document[] {
  const g = globalThis as unknown as { __hermesDocumentDrafts?: Document[] };
  g.__hermesDocumentDrafts ??= [];
  return g.__hermesDocumentDrafts;
}

function createSessionTenantDocumentRepo(organizationId: string): TenantDocumentRepository {
  const base = createSessionDocumentRepo();
  const owned = (id: string) =>
    sessionDocumentBuffer().find((d) => d.id === id && d.tenantId === organizationId) ?? null;

  return {
    organizationId,
    async listPage(options) {
      const limit = clampListLimit(options?.limit);
      const cursor = options?.cursor ?? null;
      const rows = sessionDocumentBuffer()
        .filter((d) => d.tenantId === organizationId)
        .filter((d) => !cursor || isAfterCursor(d, cursor))
        .sort(newestFirst)
        .slice(0, limit + 1);
      return toPage(rows, limit);
    },
    async stats() {
      return statsFrom(
        sessionDocumentBuffer()
          .filter((d) => d.tenantId === organizationId)
          .map((d) => ({ status: d.status, count: 1 }))
      );
    },
    async get(id) {
      return owned(id);
    },
    async create(input) {
      return base.create({ ...input, tenantId: organizationId });
    },
    async update(id, patch) {
      if (!owned(id)) return null;
      return base.update(id, stripOwnership(patch));
    },
    async delete(id) {
      if (!owned(id)) return false;
      return base.delete(id);
    },
    async deleteWithStorageCleanup(id) {
      const doc = owned(id);
      if (!doc) return { deleted: false };
      const { keys, skipped } = cleanupKeysFor(doc);
      // Single-threaded in-process store: these steps cannot interleave.
      await documentTextChunkRepository().deleteByDocumentId(id);
      await base.delete(id);
      const row = createSessionCleanupRow({ organizationId, documentId: id, objectKeys: keys });
      return { deleted: true, cleanupId: row.id, skippedKeys: skipped };
    },
  };
}

type TenantDocumentModel = DocumentModel & {
  updateMany: (a: unknown) => Promise<{ count: number }>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  groupBy: (a: unknown) => Promise<Array<{ status: string; _count: { _all: number } }>>;
};

function createDatabaseTenantDocumentRepo(organizationId: string): TenantDocumentRepository {
  const fallback = createSessionTenantDocumentRepo(organizationId);
  async function model(): Promise<TenantDocumentModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).document as TenantDocumentModel) : null;
  }
  return {
    organizationId,
    async listPage(options) {
      const m = await model();
      if (!m) return fallback.listPage(options);
      const limit = clampListLimit(options?.limit);
      const cursor = options?.cursor ?? null;
      try {
        // Keyset on the cursor's VALUES, inside the same tenant-filtered query:
        // no row is looked up by the cursor, so it cannot probe other tenants.
        const after = cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {};
        const rows = await m.findMany({
          where: { tenantId: organizationId, ...after },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        });
        return toPage(rows.map(rowToDocument), limit);
      } catch {
        return fallback.listPage(options);
      }
    },
    async stats() {
      const m = await model();
      if (!m) return fallback.stats();
      try {
        // One aggregate per status, filtered by tenantId in the same query and
        // served by the ("tenantId", "createdAt") index — never a row list.
        const groups = await m.groupBy({
          by: ["status"],
          where: { tenantId: organizationId },
          _count: { _all: true },
        });
        return statsFrom(groups.map((g) => ({ status: g.status, count: g._count._all })));
      } catch {
        return fallback.stats();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findFirst({ where: { id, tenantId: organizationId } });
        return r ? rowToDocument(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        const r = await m.create({
          data: { ...input, tenantId: organizationId, status: input.status ?? "uploaded" },
        });
        return rowToDocument(r);
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        const { count } = await m.updateMany({
          where: { id, tenantId: organizationId },
          data: stripOwnership(patch),
        });
        // `update()` on the unscoped repository THROWS for a missing row and so
        // reaches the session fallback; `updateMany` reports 0 instead. Keep
        // that path: a row that fell back to the session store at create()
        // must still receive its storageKey. The fallback is tenant-filtered
        // too, so this can never reach another organization's document.
        if (count === 0) return fallback.update(id, patch);
        const r = await m.findFirst({ where: { id, tenantId: organizationId } });
        return r ? rowToDocument(r) : null;
      } catch {
        return fallback.update(id, patch);
      }
    },
    async delete(id) {
      const m = await model();
      if (!m) return fallback.delete(id);
      try {
        const { count } = await m.deleteMany({ where: { id, tenantId: organizationId } });
        // Same parity as update(): a row only the session fallback holds.
        return count > 0 ? true : fallback.delete(id);
      } catch {
        return fallback.delete(id);
      }
    },
    async deleteWithStorageCleanup(id) {
      const db = await getPrisma();
      if (!db) return fallback.deleteWithStorageCleanup(id);
      const client = db as unknown as {
        $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
      };
      // No try/catch → no session fallback: a failed transaction deletes
      // nothing and the route answers 500; the caller may simply retry.
      return client.$transaction(async (tx) => {
        const docs = (tx as Record<string, unknown>).document as TenantDocumentModel;
        const row = await docs.findFirst({ where: { id, tenantId: organizationId } });
        if (!row) return { deleted: false as const };
        const doc = rowToDocument(row);
        const { keys, skipped } = cleanupKeysFor(doc);
        await deleteDocumentChunksInTransaction(tx, id);
        const { count } = await docs.deleteMany({ where: { id, tenantId: organizationId } });
        if (count !== 1) return { deleted: false as const }; // raced with another delete
        const cleanup = await createCleanupRowInTransaction(tx, {
          organizationId,
          documentId: id,
          objectKeys: keys,
        });
        return { deleted: true as const, cleanupId: cleanup.id, skippedKeys: skipped };
      });
    },
  };
}

/**
 * The tenant-scoped document view for one organization. Throws on a missing
 * or blank organization id: there is no "all organizations" view.
 */
export function documentRepositoryForOrganization(organizationId: string): TenantDocumentRepository {
  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    throw new TypeError("documentRepositoryForOrganization requires a non-empty organization id");
  }
  return getStorageMode() === "database"
    ? createDatabaseTenantDocumentRepo(organizationId)
    : createSessionTenantDocumentRepo(organizationId);
}
