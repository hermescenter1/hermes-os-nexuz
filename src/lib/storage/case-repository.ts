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
import type { BrainOwner, Repository, StoredCase, CaseStatus } from "./types";
import { ownerWhere, ownerCanRead, ownerAttribution, MAX_OWNED_ROWS, MAX_PUBLISHED_ROWS } from "./owner-scope";

export type CaseCreate = Omit<StoredCase, "id" | "createdAt" | "updatedAt"> & {
  status?: CaseStatus;
};

const now = () => new Date().toISOString();

/* ---------------- session implementation ---------------- */
function createSessionCaseRepo(owner: BrainOwner | null): Repository<StoredCase, CaseCreate> {
  const g = globalThis as unknown as { __hermesCaseDrafts?: StoredCase[] };
  g.__hermesCaseDrafts ??= [];
  const buf = g.__hermesCaseDrafts;

  // PHASE 90: the session ring is shared process state, so the same owner
  // predicate that scopes the SQL queries is applied here in memory.
  return {
    async list() {
      return buf.filter((c) => ownerCanRead(c, owner)).slice(0, MAX_OWNED_ROWS);
    },
    async get(id) {
      const row = buf.find((c) => c.id === id);
      return row && ownerCanRead(row, owner) ? row : null;
    },
    async findByTitle(title) {
      const t = title.trim().toLowerCase();
      return (
        buf.find(
          (c) =>
            c.title.trim().toLowerCase() === t &&
            c.status !== "published" && // never dedupe onto published content
            ownerCanRead(c, owner),
        ) ?? null
      );
    },
    async create(input) {
      const rec: StoredCase = {
        ...input,
        ...ownerAttribution(owner),
        status: input.status ?? "draft",
        id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now(),
        updatedAt: now(),
      };
      buf.unshift(rec);
      return rec;
    },
    async update(id, patch) {
      const i = buf.findIndex((c) => c.id === id && ownerCanRead(c, owner));
      if (i < 0) return null;
      const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredCase>;
      void _u; void _o; // owner attribution is never patchable
      buf[i] = { ...buf[i], ...safe, updatedAt: now() };
      return buf[i];
    },
    async delete(id) {
      const i = buf.findIndex((c) => c.id === id && ownerCanRead(c, owner));
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
    userId: r.userId === undefined || r.userId === null ? null : String(r.userId),
    organizationId:
      r.organizationId === undefined || r.organizationId === null ? null : String(r.organizationId),
  };
}

function createDatabaseCaseRepo(owner: BrainOwner | null): Repository<StoredCase, CaseCreate> {
  const fallback = createSessionCaseRepo(owner);
  async function model(): Promise<CaseModel | null> {
    const db = await getPrisma();
    return db ? ((db as Record<string, unknown>).engineeringCase as CaseModel) : null;
  }
  return {
    async list() {
      const m = await model();
      if (!m) return fallback.list();
      try {
        // PHASE 90: tenant-scoped and bounded — no unbounded private read.
        const rows = await m.findMany({
          where: ownerWhere(owner),
          orderBy: { createdAt: "desc" },
          take: MAX_OWNED_ROWS,
        });
        return rows.map(rowToCase);
      } catch {
        return fallback.list();
      }
    },
    async get(id) {
      const m = await model();
      if (!m) return fallback.get(id);
      try {
        // findFirst + owner predicate: a foreign id is indistinguishable from
        // a missing one, so existence is never disclosed.
        const r = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        return r ? rowToCase(r) : null;
      } catch {
        return fallback.get(id);
      }
    },
    async findByTitle(title) {
      const m = await model();
      if (!m) return fallback.findByTitle!(title);
      try {
        // PHASE 90: dedupe never resolves to a PUBLISHED case. The save-case
        // flow updates whatever findByTitle returns, so without this a client-
        // supplied title colliding with curated published content would silently
        // overwrite it and flip it back to draft.
        const r = await m.findFirst({
          where: { title, status: { not: "published" }, ...ownerWhere(owner) },
        });
        return r ? rowToCase(r) : null;
      } catch {
        return fallback.findByTitle!(title);
      }
    },
    async create(input) {
      const m = await model();
      if (!m) return fallback.create(input);
      try {
        // Attribution applied last so caller input can never override it.
        const r = await m.create({
          data: { ...input, status: input.status ?? "draft", ...ownerAttribution(owner) },
        });
        return rowToCase(r);
      } catch {
        return fallback.create(input);
      }
    },
    async update(id, patch) {
      const m = await model();
      if (!m) return fallback.update(id, patch);
      try {
        // PHASE 90: Prisma `update` requires a unique where, so ownership is
        // proven by an owner-scoped precheck first; a foreign id yields null
        // (the same result as a missing id) and no write occurs.
        const owned = await m.findFirst({ where: { id, ...ownerWhere(owner) } });
        if (!owned) return null;
        const { userId: _u, organizationId: _o, ...safe } = patch as Partial<StoredCase>;
        void _u; void _o; // owner attribution is never patchable
        const r = await m.update({ where: { id }, data: safe });
        return rowToCase(r);
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
 * PHASE 90 — the PUBLISHED corpus, deliberately NOT tenant-scoped.
 *
 * Publishing a case is the act that makes it public knowledge, so the public
 * knowledge graph and the published-corpus bridge read every published row
 * regardless of owner — exactly the behavior that existed before Phase 90.
 * This is a separate, explicitly-named function so that "unscoped" is always a
 * deliberate call-site decision and never an accident of a default argument.
 * Draft / review / private rows are unreachable through it.
 */
export async function listPublishedCases(): Promise<StoredCase[]> {
  if (getStorageMode() !== "database") {
    const g = globalThis as unknown as { __hermesCaseDrafts?: StoredCase[] };
    return (g.__hermesCaseDrafts ?? []).filter((c) => c.status === "published");
  }
  const db = await getPrisma();
  const m = db ? ((db as Record<string, unknown>).engineeringCase as CaseModel | undefined) : undefined;
  if (!m) {
    const g = globalThis as unknown as { __hermesCaseDrafts?: StoredCase[] };
    return (g.__hermesCaseDrafts ?? []).filter((c) => c.status === "published");
  }
  try {
    const rows = await m.findMany({
      where: { status: "published" },
      orderBy: { createdAt: "desc" },
      take: MAX_PUBLISHED_ROWS,
    });
    return rows.map(rowToCase);
  } catch {
    const g = globalThis as unknown as { __hermesCaseDrafts?: StoredCase[] };
    return (g.__hermesCaseDrafts ?? []).filter((c) => c.status === "published");
  }
}

/**
 * PHASE 90 — owner-scoped. `owner` MUST come from `resolveBrainOwner()`
 * (session-derived). Null sees only the legacy NULL-owner pool.
 */
export function caseRepository(owner: BrainOwner | null = null): Repository<StoredCase, CaseCreate> {
  return getStorageMode() === "database"
    ? createDatabaseCaseRepo(owner)
    : createSessionCaseRepo(owner);
}
