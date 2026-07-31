/**
 * Project repository (Phase 19A; PHASE 90B tenant ownership).
 *
 * Dual session/database implementations behind a single factory:
 *   `projectRepository(owner)` — full CRUD for Project records.
 *
 * PHASE 90B: engineering Project records (name/description) are tenant-owned
 * exactly like AnalysisRecord/EngineeringCase. Ownership is enforced IN THE
 * QUERY (ownerWhere), the owner is derived only from the authenticated session
 * (`resolveBrainOwner`), and legacy NULL-owner rows are QUARANTINED. `owner` MUST
 * come from `resolveBrainOwner()`; passing null sees NOTHING, never another
 * tenant's rows. This is what keeps the knowledge graph (built from projects +
 * memories) tenant-isolated.
 *
 * Degrades safely to an in-process session store when the database is
 * unavailable — identical pattern to memory-repository.ts.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner, Repository, StoredProject, ProjectStatus } from "./types";
import { ownerWhere, ownerCanRead, ownerAttribution, MAX_OWNED_ROWS } from "./owner-scope";

export type ProjectCreate = {
  name: string;
  description: string;
  status?: ProjectStatus;
};

const now = () => new Date().toISOString();

// ---- Project: session store ----

function createSessionProjectRepo(owner: BrainOwner | null): Repository<StoredProject, ProjectCreate> {
  const g = globalThis as unknown as { __hermesProjects?: StoredProject[] };
  g.__hermesProjects ??= [];
  const buf = g.__hermesProjects;

  // PHASE 90B: the session ring is shared process state, so the same owner
  // predicate that scopes the SQL query is applied here in memory.
  return {
    async list() {
      return buf.filter((p) => ownerCanRead(p, owner)).slice(0, MAX_OWNED_ROWS);
    },
    async get(id) {
      const row = buf.find((p) => p.id === id);
      return row && ownerCanRead(row, owner) ? row : null;
    },
    async create(input) {
      const rec: StoredProject = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        description: input.description,
        status: input.status ?? "active",
        ...ownerAttribution(owner),
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      if (buf.length > MAX_OWNED_ROWS) buf.length = MAX_OWNED_ROWS;
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((p) => p.id === id && ownerCanRead(p, owner));
      if (i < 0) return null;
      const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredProject>;
      void _u; void _o; // owner attribution is never patchable
      buf[i] = { ...buf[i], ...safe, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((p) => p.id === id && ownerCanRead(p, owner));
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

// ---- Project: database store ----

type ProjectModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToProject(r: Record<string, unknown>): StoredProject {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    status: (r.status as ProjectStatus) ?? "active",
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
    userId: r.userId === undefined || r.userId === null ? null : String(r.userId),
    organizationId:
      r.organizationId === undefined || r.organizationId === null ? null : String(r.organizationId),
  };
}

function createDatabaseProjectRepo(owner: BrainOwner | null): Repository<StoredProject, ProjectCreate> {
  const fallback = createSessionProjectRepo(owner);

  async function model(): Promise<ProjectModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).project as ProjectModel) : null;
  }

  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        // PHASE 90B: tenant-scoped and bounded — no unbounded global read.
        return (
          await m.findMany({
            where: ownerWhere(owner),
            orderBy: { createdAt: "desc" },
            take: MAX_OWNED_ROWS,
          })
        ).map(rowToProject);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        // findFirst + owner predicate: a foreign id is indistinguishable from a
        // missing one, so existence is never disclosed.
        const r = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        return r ? rowToProject(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        // Attribution applied AFTER caller input so it can never be overridden.
        return rowToProject(
          await m.create({
            data: {
              name: input.name,
              description: input.description,
              status: input.status ?? "active",
              ...ownerAttribution(owner),
            },
          })
        );
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        const owned = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        if (!owned) return null;
        const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredProject>;
        void _u; void _o; // owner attribution is never patchable
        return rowToProject(await m.update({ where: { id }, data: safe }));
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
 * (session-derived). Null sees NOTHING, never another tenant's rows.
 */
export function projectRepository(owner: BrainOwner | null = null): Repository<StoredProject, ProjectCreate> {
  return getStorageMode() === "database"
    ? createDatabaseProjectRepo(owner)
    : createSessionProjectRepo(owner);
}
