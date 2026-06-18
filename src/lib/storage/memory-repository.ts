/**
 * Engineering Memory repository (Phase 18A).
 *
 * Dual session/database implementations behind two factories:
 *  - `memoryRepository()` — full CRUD for EngineeringMemory records
 *  - `feedbackRepository()` — append-only feedback tied to a memory record
 *
 * Both degrade safely to in-process session stores when the database is
 * unavailable (no DATABASE_URL, Prisma client not generated, or query error).
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredMemory, StoredMemoryFeedback, MemoryOutcome } from "./types";

export type MemoryCreate = Omit<StoredMemory, "id" | "createdAt" | "updatedAt">;
export type FeedbackCreate = Omit<StoredMemoryFeedback, "id" | "createdAt">;

export interface FeedbackRepo {
  create(input: FeedbackCreate): Promise<StoredMemoryFeedback>;
  listByMemoryId(memoryId: string): Promise<StoredMemoryFeedback[]>;
}

const now = () => new Date().toISOString();

// ---- EngineeringMemory: session store ----

function createSessionMemoryRepo(): Repository<StoredMemory, MemoryCreate> {
  const g = globalThis as unknown as { __hermesEngineeringMemory?: StoredMemory[] };
  g.__hermesEngineeringMemory ??= [];
  const buf = g.__hermesEngineeringMemory;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((m) => m.id === id) ?? null;
    },
    async create(input) {
      const rec: StoredMemory = {
        ...input,
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((m) => m.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((m) => m.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      // Cascade-delete feedback (no FK in session mode)
      const fb = globalThis as unknown as { __hermesMemoryFeedback?: StoredMemoryFeedback[] };
      if (fb.__hermesMemoryFeedback) {
        fb.__hermesMemoryFeedback = fb.__hermesMemoryFeedback.filter((f) => f.memoryId !== id);
      }
      return true;
    },
  };
}

// ---- EngineeringMemory: database store ----

type MemoryModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToMemory(r: Record<string, unknown>): StoredMemory {
  return {
    id: String(r.id),
    query: String(r.query ?? ""),
    domain: String(r.domain ?? ""),
    analysisSummary: String(r.analysisSummary ?? ""),
    confidence: Number(r.confidence ?? 0),
    relatedCaseIds: (r.relatedCaseIds as string[]) ?? [],
    relatedDocumentIds: (r.relatedDocumentIds as string[]) ?? [],
    outcome: (r.outcome as MemoryOutcome) ?? "unknown",
    ...(r.notes != null ? { notes: String(r.notes) } : {}),
    // Phase 19A: propagate projectId when present
    ...(r.projectId != null ? { projectId: String(r.projectId) } : {}),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseMemoryRepo(): Repository<StoredMemory, MemoryCreate> {
  const fallback = createSessionMemoryRepo();

  async function model(): Promise<MemoryModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).engineeringMemory as MemoryModel) : null;
  }

  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map(rowToMemory);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToMemory(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToMemory(await m.create({ data: input }));
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        const r = await m.update({ where: { id }, data: patch });
        return rowToMemory(r);
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

export function memoryRepository(): Repository<StoredMemory, MemoryCreate> {
  return getStorageMode() === "database"
    ? createDatabaseMemoryRepo()
    : createSessionMemoryRepo();
}

// ---- MemoryFeedback: session store ----

function createSessionFeedbackRepo(): FeedbackRepo {
  const g = globalThis as unknown as { __hermesMemoryFeedback?: StoredMemoryFeedback[] };
  g.__hermesMemoryFeedback ??= [];
  const buf = g.__hermesMemoryFeedback;

  return {
    async create(input) {
      const rec: StoredMemoryFeedback = {
        ...input,
        id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
      };
      buf.push(rec);
      return rec;
    },
    async listByMemoryId(memoryId) {
      return buf.filter((f) => f.memoryId === memoryId);
    },
  };
}

// ---- MemoryFeedback: database store ----

type FeedbackModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToFeedback(r: Record<string, unknown>): StoredMemoryFeedback {
  return {
    id: String(r.id),
    memoryId: String(r.memoryId ?? ""),
    outcome: (r.outcome as MemoryOutcome) ?? "unknown",
    ...(r.notes != null ? { notes: String(r.notes) } : {}),
    ...(r.submittedBy != null ? { submittedBy: String(r.submittedBy) } : {}),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
  };
}

function createDatabaseFeedbackRepo(): FeedbackRepo {
  const fallback = createSessionFeedbackRepo();

  async function model(): Promise<FeedbackModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).memoryFeedback as FeedbackModel) : null;
  }

  return {
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToFeedback(await m.create({ data: input }));
      } catch {
        return fallback.create(input);
      }
    },
    async listByMemoryId(memoryId) {
      const m = await model();
      if (!m) return fallback.listByMemoryId(memoryId);
      try {
        return (
          await m.findMany({ where: { memoryId }, orderBy: { createdAt: "asc" } })
        ).map(rowToFeedback);
      } catch {
        return fallback.listByMemoryId(memoryId);
      }
    },
  };
}

export function feedbackRepository(): FeedbackRepo {
  return getStorageMode() === "database"
    ? createDatabaseFeedbackRepo()
    : createSessionFeedbackRepo();
}
