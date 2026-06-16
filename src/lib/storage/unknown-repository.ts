/**
 * Unknown analysis repository (Phase 11B). Session + Prisma database impls.
 * Supports status transitions (resolved / converted / library) used by the
 * Unknown Analysis Center.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredUnknown, UnknownStatus } from "./types";

export type UnknownCreate = Omit<StoredUnknown, "id" | "createdAt" | "updatedAt"> & {
  status?: UnknownStatus;
};

const now = () => new Date().toISOString();

function createSessionUnknownRepo(): Repository<StoredUnknown, UnknownCreate> {
  const g = globalThis as unknown as { __hermesUnknownRows?: StoredUnknown[] };
  g.__hermesUnknownRows ??= [];
  const buf = g.__hermesUnknownRows;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((u) => u.id === id) ?? null;
    },
    async create(input) {
      const rec: StoredUnknown = {
        ...input,
        status: input.status ?? "open",
        id: `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((u) => u.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((u) => u.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

type UnknownModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<unknown>;
};

function rowToUnknown(r: Record<string, unknown>): StoredUnknown {
  return {
    id: String(r.id),
    query: String(r.query ?? ""),
    locale: String(r.locale ?? ""),
    confidence: Number(r.confidence ?? 0),
    suggestedDomains: (r.suggestedDomains as string[]) ?? [],
    suggestedVendors: (r.suggestedVendors as string[]) ?? [],
    status: (r.status as UnknownStatus) ?? "open",
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseUnknownRepo(): Repository<StoredUnknown, UnknownCreate> {
  const fallback = createSessionUnknownRepo();
  async function model(): Promise<UnknownModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).unknownAnalysis as UnknownModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: { createdAt: "desc" } })).map(rowToUnknown);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToUnknown(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToUnknown(await m.create({ data: { ...input, status: input.status ?? "open" } }));
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        return rowToUnknown(await m.update({ where: { id }, data: patch }));
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

export function unknownRepository(): Repository<StoredUnknown, UnknownCreate> {
  return getStorageMode() === "database"
    ? createDatabaseUnknownRepo()
    : createSessionUnknownRepo();
}
