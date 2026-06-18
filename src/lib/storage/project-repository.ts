/**
 * Project repository (Phase 19A).
 *
 * Dual session/database implementations behind a single factory:
 *   `projectRepository()` — full CRUD for Project records.
 *
 * Degrades safely to an in-process session store when the database is
 * unavailable — identical pattern to memory-repository.ts.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredProject, ProjectStatus } from "./types";

export type ProjectCreate = {
  name: string;
  description: string;
  status?: ProjectStatus;
};

const now = () => new Date().toISOString();

// ---- Project: session store ----

function createSessionProjectRepo(): Repository<StoredProject, ProjectCreate> {
  const g = globalThis as unknown as { __hermesProjects?: StoredProject[] };
  g.__hermesProjects ??= [];
  const buf = g.__hermesProjects;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((p) => p.id === id) ?? null;
    },
    async create(input) {
      const rec: StoredProject = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        description: input.description,
        status: input.status ?? "active",
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((p) => p.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((p) => p.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

// ---- Project: database store ----

type ProjectModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
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
  };
}

function createDatabaseProjectRepo(): Repository<StoredProject, ProjectCreate> {
  const fallback = createSessionProjectRepo();

  async function model(): Promise<ProjectModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).project as ProjectModel) : null;
  }

  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: { createdAt: "desc" } })).map(rowToProject);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToProject(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToProject(
          await m.create({
            data: {
              name: input.name,
              description: input.description,
              status: input.status ?? "active",
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
        const r = await m.update({ where: { id }, data: patch });
        return rowToProject(r);
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

export function projectRepository(): Repository<StoredProject, ProjectCreate> {
  return getStorageMode() === "database"
    ? createDatabaseProjectRepo()
    : createSessionProjectRepo();
}
