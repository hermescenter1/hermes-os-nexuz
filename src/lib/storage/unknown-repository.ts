/**
 * Unknown analysis repository (Phase 11B; PHASE 90B tenant ownership).
 * Session + Prisma database impls. Supports status transitions (resolved /
 * converted / library) used by the Unknown Analysis Center.
 *
 * PHASE 90B: an UnknownAnalysis row carries the raw user query that could not be
 * classified — tenant-private input. It is now owner-scoped exactly like
 * AnalysisRecord/EngineeringCase: ownership enforced IN THE QUERY (ownerWhere),
 * owner derived only from the authenticated session (`resolveBrainOwner`), legacy
 * NULL-owner rows QUARANTINED. `owner` MUST come from `resolveBrainOwner()`;
 * passing null sees NOTHING (impossible-sentinel predicate), never another
 * tenant's rows.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner, Repository, StoredUnknown, UnknownStatus } from "./types";
import { ownerWhere, ownerCanRead, ownerAttribution, MAX_OWNED_ROWS } from "./owner-scope";

export type UnknownCreate = Omit<StoredUnknown, "id" | "createdAt" | "updatedAt"> & {
  status?: UnknownStatus;
};

const now = () => new Date().toISOString();

function createSessionUnknownRepo(owner: BrainOwner | null): Repository<StoredUnknown, UnknownCreate> {
  const g = globalThis as unknown as { __hermesUnknownRows?: StoredUnknown[] };
  g.__hermesUnknownRows ??= [];
  const buf = g.__hermesUnknownRows;

  // PHASE 90B: the session ring is shared process state, so the same owner
  // predicate that scopes the SQL query is applied here in memory.
  return {
    async list() {
      return buf.filter((u) => ownerCanRead(u, owner)).slice(0, MAX_OWNED_ROWS);
    },
    async get(id) {
      const row = buf.find((u) => u.id === id);
      return row && ownerCanRead(row, owner) ? row : null;
    },
    async create(input) {
      const rec: StoredUnknown = {
        ...input,
        ...ownerAttribution(owner),
        status: input.status ?? "open",
        id: `unknown-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      if (buf.length > MAX_OWNED_ROWS) buf.length = MAX_OWNED_ROWS;
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((u) => u.id === id && ownerCanRead(u, owner));
      if (i < 0) return null;
      const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredUnknown>;
      void _u; void _o; // owner attribution is never patchable
      buf[i] = { ...buf[i], ...safe, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((u) => u.id === id && ownerCanRead(u, owner));
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

type UnknownModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
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
    userId: r.userId === undefined || r.userId === null ? null : String(r.userId),
    organizationId:
      r.organizationId === undefined || r.organizationId === null ? null : String(r.organizationId),
  };
}

function createDatabaseUnknownRepo(owner: BrainOwner | null): Repository<StoredUnknown, UnknownCreate> {
  const fallback = createSessionUnknownRepo(owner);
  async function model(): Promise<UnknownModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).unknownAnalysis as UnknownModel) : null;
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
        ).map(rowToUnknown);
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
        return r ? rowToUnknown(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        // Attribution applied AFTER caller input so it can never be overridden.
        return rowToUnknown(
          await m.create({ data: { ...input, status: input.status ?? "open", ...ownerAttribution(owner) } })
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
        const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredUnknown>;
        void _u; void _o; // owner attribution is never patchable
        return rowToUnknown(await m.update({ where: { id }, data: safe }));
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
export function unknownRepository(owner: BrainOwner | null = null): Repository<StoredUnknown, UnknownCreate> {
  return getStorageMode() === "database"
    ? createDatabaseUnknownRepo(owner)
    : createSessionUnknownRepo(owner);
}
