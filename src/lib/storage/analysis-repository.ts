/**
 * Analysis record repository (Phase 11B). Session ring + Prisma database impl.
 * The live Brain pipeline still uses the in-process analysisMemory; this repo
 * is the durable history seam used by the /api/analysis route.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredAnalysis } from "./types";

export type AnalysisCreate = Omit<StoredAnalysis, "id" | "createdAt">;

const now = () => new Date().toISOString();

function createSessionAnalysisRepo(): Repository<StoredAnalysis, AnalysisCreate> {
  const g = globalThis as unknown as { __hermesAnalysisRows?: StoredAnalysis[] };
  g.__hermesAnalysisRows ??= [];
  const buf = g.__hermesAnalysisRows;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((a) => a.id === id) ?? null;
    },
    async create(input) {
      const rec: StoredAnalysis = {
        ...input,
        id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
      };
      buf.unshift(rec);
      if (buf.length > 200) buf.length = 200;
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((a) => a.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((a) => a.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

type AnalysisModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
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
  };
}

function createDatabaseAnalysisRepo(): Repository<StoredAnalysis, AnalysisCreate> {
  const fallback = createSessionAnalysisRepo();
  async function model(): Promise<AnalysisModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).analysisRecord as AnalysisModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map(rowToAnalysis);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToAnalysis(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToAnalysis(await m.create({ data: input }));
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

export function analysisRepository(): Repository<StoredAnalysis, AnalysisCreate> {
  return getStorageMode() === "database"
    ? createDatabaseAnalysisRepo()
    : createSessionAnalysisRepo();
}
