import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getDocumentObjectStorage } from "./object-storage";
import { documentTextChunkRepository } from "./chunk-repository";

/**
 * F-2 FU-F2-R2-3 — removal of a deleted document's stored files.
 *
 * WHAT IS AND IS NOT TRANSACTIONAL
 * The Document row, its DocumentTextChunk rows and ONE `DocumentStorageCleanup`
 * outbox row are written in a single database transaction
 * (`TenantDocumentRepository.deleteWithStorageCleanup`). Object storage is not
 * part of that transaction and this module never pretends it is: the files are
 * removed AFTER the commit, from the outbox row, and a failed removal leaves the
 * row PENDING to be retried. Nothing is lost if the process dies between the
 * commit and the removal — the row is the durable record of what must go.
 *
 * WHAT GETS REMOVED
 * Only keys under `documents/<documentId>/` — the original upload and the
 * extracted text (`documents/<id>/extracted.txt`, included even when the row
 * had not recorded it yet, so a processing run racing the delete cannot leave
 * its output behind). A key outside that prefix is never enqueued and, if one
 * somehow reached a row, never deleted. Each attempt also re-deletes the
 * document's chunks, which catches chunks a concurrent processing run inserted
 * after the delete committed (there is no chunk → document foreign key yet;
 * FU-F2-R2-2).
 *
 * RETRY
 * Removal is idempotent: an object that is already absent counts as removed.
 * A row is claimed atomically (conditional update on its current
 * `nextAttemptAt`) and pushed CLAIM_LEASE_MS into the future while it runs, so
 * two passes never process it at once and a crashed pass is retried after the
 * lease. A failure records a stable code and backs off exponentially, capped.
 * Passes run inline after each delete (the new row, then a few due rows of the
 * SAME organization) and from POST /api/documents/storage-cleanup (worker token
 * or platform admin) for everything else.
 */

export type DocumentStorageCleanupStatus = "PENDING" | "DONE";

export interface DocumentStorageCleanupRow {
  id: string;
  organizationId: string;
  documentId: string;
  objectKeys: string[];
  status: DocumentStorageCleanupStatus;
  attempts: number;
  lastErrorCode: string | null;
  nextAttemptAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type CleanupOutcome = "done" | "pending" | "not_claimed";

export interface CleanupPassResult {
  claimed: number;
  done: number;
  retrying: number;
}

export const CLAIM_LEASE_MS = 5 * 60_000;
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 60 * 60_000;
export const CLEANUP_PASS_MAX = 200;

const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_KEY_LENGTH = 512;

export function documentObjectPrefix(documentId: string): string {
  return `documents/${documentId}/`;
}

/** True only for a plain key strictly under this document's own prefix. */
export function isKeyWithinDocumentPrefix(key: string, documentId: string): boolean {
  if (!DOCUMENT_ID.test(documentId)) return false;
  if (typeof key !== "string" || key.length > MAX_KEY_LENGTH) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  const prefix = documentObjectPrefix(documentId);
  if (!key.startsWith(prefix) || key.length === prefix.length) return false;
  return key
    .slice(prefix.length)
    .split("/")
    .every((part) => part.length > 0 && part !== "." && part !== "..");
}

/**
 * The keys to remove for a document: its original and its extracted text, plus
 * the canonical extracted-text key. Keys outside the document's prefix are
 * dropped and counted, never deleted.
 */
export function cleanupKeysFor(doc: {
  id: string;
  storageKey?: string | null;
  extractedTextKey?: string | null;
}): { keys: string[]; skipped: number } {
  if (!DOCUMENT_ID.test(doc.id)) return { keys: [], skipped: 0 };
  const candidates = [doc.storageKey, doc.extractedTextKey].filter(
    (k): k is string => typeof k === "string" && k.length > 0
  );
  const keys = new Set<string>();
  let skipped = 0;
  for (const key of candidates) {
    if (isKeyWithinDocumentPrefix(key, doc.id)) keys.add(key);
    else skipped += 1;
  }
  keys.add(`${documentObjectPrefix(doc.id)}extracted.txt`);
  return { keys: [...keys].sort(), skipped };
}

/** Exponential back-off after the n-th failed attempt (n ≥ 1), capped. */
export function retryDelayMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(n - 1, 20));
}

/* ---------------- stores ---------------- */

interface CleanupStore {
  get(id: string): Promise<DocumentStorageCleanupRow | null>;
  /** Due PENDING rows, oldest first; optionally one organization only. */
  listDue(opts: { limit: number; organizationId?: string; now: Date }): Promise<DocumentStorageCleanupRow[]>;
  /** Atomic claim: succeeds only if the row is still PENDING with this nextAttemptAt. */
  claim(row: DocumentStorageCleanupRow, now: Date): Promise<boolean>;
  markDone(id: string, now: Date): Promise<void>;
  markRetry(id: string, attempts: number, code: string, nextAttemptAt: Date): Promise<void>;
}

function sessionRows(): DocumentStorageCleanupRow[] {
  const g = globalThis as unknown as { __hermesDocumentStorageCleanups?: DocumentStorageCleanupRow[] };
  g.__hermesDocumentStorageCleanups ??= [];
  return g.__hermesDocumentStorageCleanups;
}

/** Session-mode insert, used by the session document repository's delete. */
export function createSessionCleanupRow(input: {
  organizationId: string;
  documentId: string;
  objectKeys: string[];
}): DocumentStorageCleanupRow {
  const rows = sessionRows();
  if (rows.some((r) => r.documentId === input.documentId)) {
    throw new Error("a cleanup row already exists for this document");
  }
  const ts = new Date().toISOString();
  const row: DocumentStorageCleanupRow = {
    id: `dsc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    organizationId: input.organizationId,
    documentId: input.documentId,
    objectKeys: [...input.objectKeys],
    status: "PENDING",
    attempts: 0,
    lastErrorCode: null,
    nextAttemptAt: ts,
    claimedAt: null,
    completedAt: null,
    createdAt: ts,
  };
  rows.push(row);
  return row;
}

/** Snapshots, never the live row: a claim must compare against what was READ. */
const snapshot = (r: DocumentStorageCleanupRow): DocumentStorageCleanupRow => ({ ...r, objectKeys: [...r.objectKeys] });

const sessionStore: CleanupStore = {
  async get(id) {
    const r = sessionRows().find((row) => row.id === id);
    return r ? snapshot(r) : null;
  },
  async listDue({ limit, organizationId, now }) {
    return sessionRows()
      .filter((r) => r.status === "PENDING" && Date.parse(r.nextAttemptAt) <= now.getTime())
      .filter((r) => !organizationId || r.organizationId === organizationId)
      .sort((a, b) => Date.parse(a.nextAttemptAt) - Date.parse(b.nextAttemptAt))
      .slice(0, limit)
      .map(snapshot);
  },
  async claim(row, now) {
    const live = sessionRows().find((r) => r.id === row.id);
    if (!live || live.status !== "PENDING" || live.nextAttemptAt !== row.nextAttemptAt) return false;
    live.claimedAt = now.toISOString();
    live.nextAttemptAt = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
    return true;
  },
  async markDone(id, now) {
    const live = sessionRows().find((r) => r.id === id);
    if (!live) return;
    live.status = "DONE";
    live.completedAt = now.toISOString();
    live.lastErrorCode = null;
  },
  async markRetry(id, attempts, code, nextAttemptAt) {
    const live = sessionRows().find((r) => r.id === id);
    if (!live) return;
    live.attempts = attempts;
    live.lastErrorCode = code;
    live.nextAttemptAt = nextAttemptAt.toISOString();
  },
};

type CleanupModel = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

function rowFromDb(r: Record<string, unknown>): DocumentStorageCleanupRow {
  return {
    id: String(r.id),
    organizationId: String(r.organizationId),
    documentId: String(r.documentId),
    objectKeys: Array.isArray(r.objectKeys) ? (r.objectKeys as unknown[]).map(String) : [],
    status: r.status === "DONE" ? "DONE" : "PENDING",
    attempts: Number(r.attempts ?? 0),
    lastErrorCode: r.lastErrorCode ? String(r.lastErrorCode) : null,
    nextAttemptAt: iso(r.nextAttemptAt) ?? new Date(0).toISOString(),
    claimedAt: iso(r.claimedAt),
    completedAt: iso(r.completedAt),
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
  };
}

/**
 * Insert the outbox row INSIDE the caller's interactive transaction (`tx`), so
 * it commits or rolls back with the Document and chunk deletes. Never falls
 * back: a failure must abort the transaction.
 */
export async function createCleanupRowInTransaction(
  tx: unknown,
  input: { organizationId: string; documentId: string; objectKeys: string[] }
): Promise<DocumentStorageCleanupRow> {
  const model = (tx as Record<string, unknown>).documentStorageCleanup as CleanupModel | undefined;
  if (!model) throw new Error("transaction client has no documentStorageCleanup delegate");
  const created = await model.create({
    data: {
      organizationId: input.organizationId,
      documentId: input.documentId,
      objectKeys: input.objectKeys,
    },
  });
  return rowFromDb(created);
}

function databaseStore(model: CleanupModel): CleanupStore {
  return {
    async get(id) {
      const r = await model.findUnique({ where: { id } });
      return r ? rowFromDb(r) : null;
    },
    async listDue({ limit, organizationId, now }) {
      const rows = await model.findMany({
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: now },
          ...(organizationId ? { organizationId } : {}),
        },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
      });
      return rows.map(rowFromDb);
    },
    async claim(row, now) {
      const { count } = await model.updateMany({
        where: { id: row.id, status: "PENDING", nextAttemptAt: new Date(row.nextAttemptAt) },
        data: { claimedAt: now, nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
      });
      return count === 1;
    },
    async markDone(id, now) {
      await model.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "DONE", completedAt: now, lastErrorCode: null },
      });
    },
    async markRetry(id, attempts, code, nextAttemptAt) {
      await model.updateMany({
        where: { id, status: "PENDING" },
        data: { attempts, lastErrorCode: code, nextAttemptAt },
      });
    },
  };
}

async function store(): Promise<CleanupStore> {
  if (getStorageMode() !== "database") return sessionStore;
  const db = await getPrisma();
  if (!db) return sessionStore;
  return databaseStore((db as Record<string, unknown>).documentStorageCleanup as CleanupModel);
}

/* ---------------- execution ---------------- */

/** Removes the row's objects and re-deletes its chunks. Throws a stable code. */
async function executeRow(row: DocumentStorageCleanupRow): Promise<void> {
  const storage = getDocumentObjectStorage();
  for (const key of row.objectKeys) {
    if (!isKeyWithinDocumentPrefix(key, row.documentId)) continue; // never outside the prefix
    try {
      await storage.remove(key);
    } catch {
      throw new CleanupError(storage.provider === "local" ? "storage_remove_failed" : "storage_provider_unavailable");
    }
  }
  try {
    await documentTextChunkRepository().deleteByDocumentId(row.documentId);
  } catch {
    throw new CleanupError("chunk_delete_failed");
  }
}

class CleanupError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function runClaimed(s: CleanupStore, row: DocumentStorageCleanupRow, now: Date): Promise<"done" | "pending"> {
  try {
    await executeRow(row);
    await s.markDone(row.id, new Date());
    return "done";
  } catch (err) {
    const attempts = row.attempts + 1;
    const code = err instanceof CleanupError ? err.code : "cleanup_failed";
    await s.markRetry(row.id, attempts, code, new Date(now.getTime() + retryDelayMs(attempts)));
    return "pending";
  }
}

/** Run one row now (used right after the delete commits). */
export async function runDocumentStorageCleanup(id: string, now: Date = new Date()): Promise<CleanupOutcome> {
  const s = await store();
  const row = await s.get(id);
  if (!row) return "not_claimed";
  if (row.status === "DONE") return "done";
  if (Date.parse(row.nextAttemptAt) > now.getTime()) return "not_claimed";
  if (!(await s.claim(row, now))) return "not_claimed";
  return runClaimed(s, row, now);
}

/**
 * Retry due rows. With `organizationId` the pass touches that organization's
 * rows only (the inline pass after a tenant's delete); without it, all due
 * rows (the worker endpoint). Returns counts only — never ids or keys.
 */
export async function runDocumentStorageCleanupPass(opts: {
  limit: number;
  organizationId?: string;
  now?: Date;
}): Promise<CleanupPassResult> {
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(CLEANUP_PASS_MAX, Math.floor(opts.limit)));
  const s = await store();
  const due = await s.listDue({ limit, organizationId: opts.organizationId, now });
  const result: CleanupPassResult = { claimed: 0, done: 0, retrying: 0 };
  for (const row of due) {
    if (!(await s.claim(row, now))) continue;
    result.claimed += 1;
    if ((await runClaimed(s, row, now)) === "done") result.done += 1;
    else result.retrying += 1;
  }
  return result;
}
