/**
 * Analysis record repository (Phase 11B). Session ring + Prisma database impl.
 * The live Brain pipeline still uses the in-process analysisMemory; this repo
 * is the durable history seam used by the /api/analysis route.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner, Repository, StoredAnalysis } from "./types";
import { ownerWhere, ownerCanRead, ownerAttribution, MAX_OWNED_ROWS } from "./owner-scope";

export type AnalysisCreate = Omit<StoredAnalysis, "id" | "createdAt">;

const now = () => new Date().toISOString();

function createSessionAnalysisRepo(owner: BrainOwner | null): Repository<StoredAnalysis, AnalysisCreate> {
  const g = globalThis as unknown as { __hermesAnalysisRows?: StoredAnalysis[] };
  g.__hermesAnalysisRows ??= [];
  const buf = g.__hermesAnalysisRows;

  return {
    // PHASE 90: the session ring is shared process state, so the same owner
    // predicate that scopes the SQL query is applied here in memory.
    async list() {
      return buf.filter((a) => ownerCanRead(a, owner)).slice(0, MAX_OWNED_ROWS);
    },
    async get(id) {
      const row = buf.find((a) => a.id === id);
      return row && ownerCanRead(row, owner) ? row : null;
    },
    async create(input) {
      const rec: StoredAnalysis = {
        ...input,
        ...ownerAttribution(owner),
        id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
      };
      buf.unshift(rec);
      if (buf.length > 200) buf.length = 200;
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((a) => a.id === id && ownerCanRead(a, owner));
      if (i < 0) return null;
      // Owner attribution is never patchable.
      const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredAnalysis>;
      void _u; void _o;
      buf[i] = { ...buf[i], ...safe };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((a) => a.id === id && ownerCanRead(a, owner));
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

type AnalysisModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
};

function rowToAnalysis(r: Record<string, unknown>): StoredAnalysis {
  return {
    id: String(r.id),
    query: String(r.query ?? ""),
    locale: String(r.locale ?? ""),
    mode: String(r.mode ?? ""),
    domains: (r.domains as string[]) ?? [],
    vendors: (r.vendors as string[]) ?? [],
    cases: (r.cases as string[]) ?? [],
    knowledge: (r.knowledge as string[]) ?? [],
    confidence: Number(r.confidence ?? 0),
    riskLevel: String(r.riskLevel ?? ""),
    isUnknown: Boolean(r.isUnknown),
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    userId: r.userId === undefined || r.userId === null ? null : String(r.userId),
    organizationId:
      r.organizationId === undefined || r.organizationId === null ? null : String(r.organizationId),
  };
}

function createDatabaseAnalysisRepo(owner: BrainOwner | null): Repository<StoredAnalysis, AnalysisCreate> {
  const fallback = createSessionAnalysisRepo(owner);
  async function model(): Promise<AnalysisModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).analysisRecord as AnalysisModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        // PHASE 90: ownership is enforced IN the query — never fetched
        // globally and filtered afterwards.
        return (
          await m.findMany({
            where: ownerWhere(owner),
            orderBy: { createdAt: "desc" },
            take: MAX_OWNED_ROWS,
          })
        ).map(rowToAnalysis);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        // findFirst (not findUnique) so the owner predicate is part of the
        // lookup: a foreign id simply does not match, yielding the same
        // "not found" as a non-existent id — no existence disclosure.
        const r = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        return r ? rowToAnalysis(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        // Attribution is applied AFTER the caller's data, so a caller cannot
        // override the owner by spreading request input into `input`.
        return rowToAnalysis(await m.create({ data: { ...input, ...ownerAttribution(owner) } }));
      } catch {
        return fallback.create(input);
      }
    },
    // Analysis records are append-only history; update/delete degrade to session.
    async update(id, patch) {
      return fallback.update(id, patch);
    },
    async delete(id) {
      return fallback.delete(id);
    },
  };
}

/**
 * PHASE 90 — the repository is now owner-scoped. `owner` MUST come from
 * `resolveBrainOwner()` (session-derived); passing null yields a repository
 * that can only see the legacy NULL-owner pool, never another tenant's rows.
 */
export function analysisRepository(owner: BrainOwner | null = null): Repository<StoredAnalysis, AnalysisCreate> {
  return getStorageMode() === "database"
    ? createDatabaseAnalysisRepo(owner)
    : createSessionAnalysisRepo(owner);
}
