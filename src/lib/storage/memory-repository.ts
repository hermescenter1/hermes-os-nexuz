/**
 * Engineering Memory repository (Phase 18A; PHASE 90B tenant ownership).
 *
 * Dual session/database implementations behind two factories:
 *  - `memoryRepository(owner)` — full CRUD for EngineeringMemory records
 *  - `feedbackRepository()` — append-only feedback tied to a memory record
 *
 * PHASE 90B: EngineeringMemory stores explicitly-saved Brain analyses (raw
 * query text + summaries) and is now tenant-owned exactly like AnalysisRecord /
 * EngineeringCase. Ownership is enforced IN THE QUERY (ownerWhere) — never by
 * post-fetch filtering — and the owner is ALWAYS derived from the authenticated
 * server session (see `resolveBrainOwner`); no caller may pass a userId/orgId in
 * a request body. Legacy NULL-owner rows are QUARANTINED: invisible to every
 * ordinary read/write/delete. `owner` MUST come from `resolveBrainOwner()`;
 * passing null yields a repository that can see NOTHING (ownerWhere(null) is an
 * impossible-sentinel predicate), never another tenant's rows.
 *
 * MemoryFeedback carries no owner column of its own — it inherits tenant scope
 * through its parent memory: the service layer (memory-service.ts) resolves the
 * parent through this owner-scoped repository before creating or listing
 * feedback, so a foreign memory id is a 404, not a mutation.
 *
 * Both degrade safely to in-process session stores when the database is
 * unavailable (no DATABASE_URL, Prisma client not generated, or query error).
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner, Repository, StoredMemory, StoredMemoryFeedback, MemoryOutcome } from "./types";
import { ownerWhere, ownerCanRead, ownerAttribution, MAX_OWNED_ROWS } from "./owner-scope";

export type MemoryCreate = Omit<StoredMemory, "id" | "createdAt" | "updatedAt">;
export type FeedbackCreate = Omit<StoredMemoryFeedback, "id" | "createdAt">;

export interface FeedbackRepo {
  create(input: FeedbackCreate): Promise<StoredMemoryFeedback>;
  listByMemoryId(memoryId: string): Promise<StoredMemoryFeedback[]>;
}

const now = () => new Date().toISOString();

// ---- EngineeringMemory: session store ----

function createSessionMemoryRepo(owner: BrainOwner | null): Repository<StoredMemory, MemoryCreate> {
  const g = globalThis as unknown as { __hermesEngineeringMemory?: StoredMemory[] };
  g.__hermesEngineeringMemory ??= [];
  const buf = g.__hermesEngineeringMemory;

  return {
    // PHASE 90B: the session ring is shared process state, so the same owner
    // predicate that scopes the SQL query is applied here in memory.
    async list() {
      return buf.filter((m) => ownerCanRead(m, owner)).slice(0, MAX_OWNED_ROWS);
    },
    async get(id) {
      const row = buf.find((m) => m.id === id);
      return row && ownerCanRead(row, owner) ? row : null;
    },
    async create(input) {
      const rec: StoredMemory = {
        ...input,
        ...ownerAttribution(owner),
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      if (buf.length > MAX_OWNED_ROWS) buf.length = MAX_OWNED_ROWS;
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((m) => m.id === id && ownerCanRead(m, owner));
      if (i < 0) return null;
      const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredMemory>;
      void _u; void _o; // owner attribution is never patchable
      buf[i] = { ...buf[i], ...safe, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((m) => m.id === id && ownerCanRead(m, owner));
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
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
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
    userId: r.userId === undefined || r.userId === null ? null : String(r.userId),
    organizationId:
      r.organizationId === undefined || r.organizationId === null ? null : String(r.organizationId),
  };
}

function createDatabaseMemoryRepo(owner: BrainOwner | null): Repository<StoredMemory, MemoryCreate> {
  const fallback = createSessionMemoryRepo(owner);

  async function model(): Promise<MemoryModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).engineeringMemory as MemoryModel) : null;
  }

  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        // PHASE 90B: ownership is enforced IN the query and bounded — never
        // fetched globally and filtered afterwards.
        return (
          await m.findMany({
            where: ownerWhere(owner),
            orderBy: { createdAt: "desc" },
            take: MAX_OWNED_ROWS,
          })
        ).map(rowToMemory);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        // findFirst (not findUnique) so the owner predicate is part of the
        // lookup: a foreign id is indistinguishable from a missing one.
        const r = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        return r ? rowToMemory(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        // Attribution applied AFTER caller input so it can never be overridden.
        return rowToMemory(await m.create({ data: { ...input, ...ownerAttribution(owner) } }));
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        // Prisma `update` needs a unique where, so prove ownership with an
        // owner-scoped precheck; a foreign id yields null (same as missing).
        const owned = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        if (!owned) return null;
        const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredMemory>;
        void _u; void _o; // owner attribution is never patchable
        return rowToMemory(await m.update({ where: { id }, data: safe }));
      } catch {
        return fallback.update(id, patch);
      }
    },
    async delete(id) {
      const m = await model();
      if (!m) return fallback.delete(id);
      try {
        const owned = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        if (!owned) return false;
        await m.delete({ where: { id } });
        return true;
      } catch {
        return fallback.delete(id);
      }
    },
  };
}

/**
 * PHASE 90B — owner-scoped. `owner` MUST come from `resolveBrainOwner()`
 * (session-derived). Null sees NOTHING (impossible-sentinel predicate), never
 * another tenant's rows and never the quarantined legacy pool.
 */
export function memoryRepository(owner: BrainOwner | null = null): Repository<StoredMemory, MemoryCreate> {
  return getStorageMode() === "database"
    ? createDatabaseMemoryRepo(owner)
    : createSessionMemoryRepo(owner);
}

// ---- MemoryFeedback: session store ----
// Feedback has no owner column; tenant scope is inherited from the parent memory
// (the service resolves the parent through the owner-scoped memoryRepository
// before creating or listing feedback).

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
