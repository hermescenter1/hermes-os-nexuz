/**
 * Knowledge article repository (Phase 11B). Session + Prisma database impls
 * behind one factory; database degrades to session when Prisma is absent.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredArticle, ArticleStatus } from "./types";

export type ArticleCreate = Omit<StoredArticle, "id" | "createdAt" | "updatedAt"> & {
  status?: ArticleStatus;
};

const now = () => new Date().toISOString();

function createSessionKnowledgeRepo(): Repository<StoredArticle, ArticleCreate> {
  const g = globalThis as unknown as { __hermesArticleDrafts?: StoredArticle[] };
  g.__hermesArticleDrafts ??= [];
  const buf = g.__hermesArticleDrafts;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((a) => a.id === id) ?? null;
    },
    async findByTitle(title) {
      const t = title.trim().toLowerCase();
      return buf.find((a) => a.title.trim().toLowerCase() === t) ?? null;
    },
    async create(input) {
      const rec: StoredArticle = {
        ...input,
        status: input.status ?? "draft",
        id: `article-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((a) => a.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
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

type ArticleModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<unknown>;
};

function rowToArticle(r: Record<string, unknown>): StoredArticle {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    domain: String(r.domain ?? ""),
    vendor: r.vendor ? String(r.vendor) : undefined,
    summary: String(r.summary ?? ""),
    content: String(r.content ?? ""),
    failureModes: (r.failureModes as string[]) ?? [],
    diagnosticGuidance: (r.diagnosticGuidance as string[]) ?? [],
    verificationSteps: (r.verificationSteps as string[]) ?? [],
    correctiveActions: (r.correctiveActions as string[]) ?? [],
    safetyNotes: String(r.safetyNotes ?? ""),
    tags: (r.tags as string[]) ?? [],
    confidence: Number(r.confidence ?? 0),
    status: (r.status as ArticleStatus) ?? "draft",
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseKnowledgeRepo(): Repository<StoredArticle, ArticleCreate> {
  const fallback = createSessionKnowledgeRepo();
  async function model(): Promise<ArticleModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).knowledgeArticle as ArticleModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        return (await m.findMany({ orderBy: { createdAt: "desc" } })).map(rowToArticle);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToArticle(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async findByTitle(title) {
      const m = await model();
      if (!m) return fallback.findByTitle!(title);
      try {
        const r = await m.findFirst({ where: { title } });
        return r ? rowToArticle(r) : null;
      } catch {
        return fallback.findByTitle!(title);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        return rowToArticle(await m.create({ data: { ...input, status: input.status ?? "draft" } }));
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        return rowToArticle(await m.update({ where: { id }, data: patch }));
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

export function knowledgeRepository(): Repository<StoredArticle, ArticleCreate> {
  return getStorageMode() === "database"
    ? createDatabaseKnowledgeRepo()
    : createSessionKnowledgeRepo();
}
