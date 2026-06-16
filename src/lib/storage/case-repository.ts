/**
 * Case repository (Phase 11B).
 *
 * Two implementations behind one factory:
 *  - session: in-process globalThis store (V1 default, no database)
 *  - database: real Prisma/PostgreSQL, loaded dynamically; degrades to the
 *    session store whenever the client is unavailable (no DATABASE_URL or the
 *    client was never generated) so the app never crashes.
 *
 * The factory picks by storage mode. Existing Brain/Case Explorer code is not
 * rewired — this is the persistence seam the Studios and API routes call.
 */

import { getStorageMode } from "./storage-mode";
import { getPrisma } from "@/lib/db/prisma";
import type { Repository, StoredCase, CaseStatus } from "./types";

export type CaseCreate = Omit<StoredCase, "id" | "createdAt" | "updatedAt"> & {
  status?: CaseStatus;
};

const now = () => new Date().toISOString();

/* ---------------- session implementation ---------------- */
function createSessionCaseRepo(): Repository<StoredCase, CaseCreate> {
  const g = globalThis as unknown as { __hermesCaseDrafts?: StoredCase[] };
  g.__hermesCaseDrafts ??= [];
  const buf = g.__hermesCaseDrafts;

  return {
    async list() {
      return [...buf];
    },
    async get(id) {
      return buf.find((c) => c.id === id) ?? null;
    },
    async findByTitle(title) {
      const t = title.trim().toLowerCase();
      return buf.find((c) => c.title.trim().toLowerCase() === t) ?? null;
    },
    async create(input) {
      const rec: StoredCase = {
        ...input,
        status: input.status ?? "draft",
        id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((c) => c.id === id);
      if (i < 0) return null;
      buf[i] = { ...buf[i], ...patch, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((c) => c.id === id);
      if (i < 0) return false;
      buf.splice(i, 1);
      return true;
    },
  };
}

/* ---------------- database implementation ---------------- */
// Loose row type — we never statically import Prisma types so the session
// build needs no generated client.
type CaseModel = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
  delete: (a: unknown) => Promise<unknown>;
};

function rowToCase(r: Record<string, unknown>): StoredCase {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    vendor: String(r.vendor ?? ""),
    domain: String(r.domain ?? ""),
    problem: String(r.problem ?? ""),
    rootCause: String(r.rootCause ?? ""),
    secondaryCauses: (r.secondaryCauses as string[]) ?? [],
    verificationSteps: (r.verificationSteps as string[]) ?? [],
    correctiveActions: (r.correctiveActions as string[]) ?? [],
    safetyNotes: String(r.safetyNotes ?? ""),
    tags: (r.tags as string[]) ?? [],
    confidence: Number(r.confidence ?? 0),
    status: (r.status as CaseStatus) ?? "draft",
    createdAt: r.createdAt ? new Date(r.createdAt as string).toISOString() : now(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string).toISOString() : now(),
  };
}

function createDatabaseCaseRepo(): Repository<StoredCase, CaseCreate> {
  const fallback = createSessionCaseRepo();
  async function model(): Promise<CaseModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).engineeringCase as CaseModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        const rows = await m.findMany({ orderBy: { createdAt: "desc" } });
        return rows.map(rowToCase);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        const r = await m.findUnique({ where: { id } });
        return r ? rowToCase(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async findByTitle(title) {
      const m = await model();
      if (!m) return fallback.findByTitle!(title);
      try {
        const r = await m.findFirst({ where: { title } });
        return r ? rowToCase(r) : null;
      } catch {
        return fallback.findByTitle!(title);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        const r = await m.create({ data: { ...input, status: input.status ?? "draft" } });
        return rowToCase(r);
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        const r = await m.update({ where: { id }, data: patch });
        return rowToCase(r);
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

export function caseRepository(): Repository<StoredCase, CaseCreate> {
  return getStorageMode() === "database"
    ? createDatabaseCaseRepo()
    : createSessionCaseRepo();
}
