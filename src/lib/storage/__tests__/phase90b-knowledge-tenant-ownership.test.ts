import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BrainOwner, Repository } from "../types";
import { memoryRepository } from "../memory-repository";
import { unknownRepository } from "../unknown-repository";
import { projectRepository } from "../project-repository";

/**
 * PHASE 90B — tenant ownership across the knowledge surface
 * (EngineeringMemory / UnknownAnalysis / Project), plus the memory/knowledge-
 * graph services, and the durable audit tenancy fields.
 *
 * The SAME adversarial matrix is asserted against BOTH the session store and a
 * fake-Prisma database store, proving the two backends have identical isolation
 * semantics (a Phase 90B requirement).
 */

const ALICE: BrainOwner = { userId: "u-alice", orgId: "org-a" };
const BOB: BrainOwner = { userId: "u-bob", orgId: "org-b" };
/** Same org as Alice, different user — an org colleague. */
const ANNA: BrainOwner = { userId: "u-anna", orgId: "org-a" };
/** No organization at all. */
const SOLO: BrainOwner = { userId: "u-solo", orgId: null };

type StoreKey =
  | "__hermesEngineeringMemory"
  | "__hermesUnknownRows"
  | "__hermesProjects"
  | "__hermesMemoryFeedback"
  | "__hermesAudit";

function resetStores(): void {
  const g = globalThis as unknown as Record<StoreKey, unknown[]>;
  g.__hermesEngineeringMemory = [];
  g.__hermesUnknownRows = [];
  g.__hermesProjects = [];
  g.__hermesMemoryFeedback = [];
  g.__hermesAudit = [];
}

/** A row of `store` seeded directly, bypassing attribution (a legacy row). */
function seedLegacyInto(store: StoreKey, row: Record<string, unknown>): void {
  const g = globalThis as unknown as Record<StoreKey, Record<string, unknown>[]>;
  g[store].unshift({
    ...row,
    id: "legacy-x",
    createdAt: new Date("2019-01-01").toISOString(),
    updatedAt: new Date("2019-01-01").toISOString(),
    userId: null,
    organizationId: null,
  });
}

/**
 * The adversarial ownership matrix, run through the Repository interface only,
 * so it is backend-agnostic (session or fake-Prisma).
 */
async function assertOwnershipMatrix<T extends { id: string; userId?: string | null; organizationId?: string | null }>(opts: {
  make: (owner: BrainOwner | null) => Repository<T, Record<string, unknown>>;
  draft: Record<string, unknown>;
  patch: Record<string, unknown>;
  seedLegacy: () => void;
}): Promise<void> {
  const { make, draft, patch, seedLegacy } = opts;

  // create attributes the server-derived owner
  const mine = await make(ALICE).create(draft);
  expect(mine.userId).toBe("u-alice");
  expect(mine.organizationId).toBe("org-a");

  // a caller cannot forge attribution through the payload
  const forged = await make(ALICE).create({ ...draft, userId: "u-bob", organizationId: "org-b" });
  expect(forged.userId, "server context wins over client input").toBe("u-alice");
  expect(forged.organizationId).toBe("org-a");

  // same-tenant + org colleague read; cross-tenant + no-org denied
  expect(await make(ALICE).get(mine.id)).not.toBeNull();
  expect(await make(ANNA).get(mine.id), "org colleague may read").not.toBeNull();
  expect(await make(BOB).get(mine.id), "cross-tenant read must fail").toBeNull();
  expect(await make(SOLO).get(mine.id), "no-org user must not read").toBeNull();

  // cross-tenant list invisibility
  expect((await make(BOB).list()).some((r) => r.id === mine.id), "cross-tenant list").toBe(false);
  expect((await make(ALICE).list()).some((r) => r.id === mine.id), "own list").toBe(true);

  // cross-tenant update / delete denied
  expect(await make(BOB).update(mine.id, patch), "cross-tenant update").toBeNull();
  expect(await make(BOB).delete(mine.id), "cross-tenant delete").toBe(false);

  // an inaccessible id is indistinguishable from a missing one (no existence leak)
  expect(await make(BOB).get(mine.id)).toEqual(await make(BOB).get("does-not-exist"));

  // owner attribution is never patchable
  const patched = await make(ALICE).update(mine.id, { ...patch, userId: "u-bob", organizationId: "org-b" });
  expect(patched?.userId).toBe("u-alice");
  expect(patched?.organizationId).toBe("org-a");

  // legacy NULL-owner rows are quarantined from every ordinary caller
  seedLegacy();
  for (const who of [ALICE, BOB, SOLO, null]) {
    expect((await make(who).list()).some((r) => r.id === "legacy-x"), "legacy list").toBe(false);
    expect(await make(who).get("legacy-x"), "legacy get").toBeNull();
  }
  for (const who of [ALICE, BOB]) {
    expect(await make(who).update("legacy-x", patch), "legacy update").toBeNull();
    expect(await make(who).delete("legacy-x"), "legacy delete").toBe(false);
  }

  // a null owner (unauthenticated context) sees NOTHING — never everything
  expect(await make(null).list(), "null owner list is empty").toEqual([]);
  expect(await make(null).get(mine.id), "null owner get is null").toBeNull();
}

const MEMORY_DRAFT = {
  query: "turbine vibration",
  domain: "drives",
  analysisSummary: "s",
  confidence: 80,
  relatedCaseIds: [],
  relatedDocumentIds: [],
  outcome: "unknown" as const,
};
const UNKNOWN_DRAFT = {
  query: "unclassified fault",
  locale: "en",
  confidence: 0.3,
  suggestedDomains: [],
  suggestedVendors: [],
  status: "open" as const,
};
const PROJECT_DRAFT = { name: "Line A upgrade", description: "d", status: "active" as const };

describe("90B — session store: knowledge-surface repositories are tenant-scoped", () => {
  beforeEach(() => resetStores());

  it("EngineeringMemory repository enforces the full ownership matrix", async () => {
    await assertOwnershipMatrix({
      make: (o) => memoryRepository(o) as unknown as Repository<{ id: string; userId?: string | null; organizationId?: string | null }, Record<string, unknown>>,
      draft: MEMORY_DRAFT,
      patch: { analysisSummary: "updated-by-test" },
      seedLegacy: () => seedLegacyInto("__hermesEngineeringMemory", MEMORY_DRAFT),
    });
  });

  it("UnknownAnalysis repository enforces the full ownership matrix", async () => {
    await assertOwnershipMatrix({
      make: (o) => unknownRepository(o) as unknown as Repository<{ id: string; userId?: string | null; organizationId?: string | null }, Record<string, unknown>>,
      draft: UNKNOWN_DRAFT,
      patch: { status: "resolved" },
      seedLegacy: () => seedLegacyInto("__hermesUnknownRows", UNKNOWN_DRAFT),
    });
  });

  it("Project repository enforces the full ownership matrix", async () => {
    await assertOwnershipMatrix({
      make: (o) => projectRepository(o) as unknown as Repository<{ id: string; userId?: string | null; organizationId?: string | null }, Record<string, unknown>>,
      draft: PROJECT_DRAFT,
      patch: { description: "updated-by-test" },
      seedLegacy: () => seedLegacyInto("__hermesProjects", PROJECT_DRAFT),
    });
  });
});

/* ─────────────────────────── fake-Prisma DB parity ─────────────────────────── */

/** Minimal Prisma-model fake that honours the owner `where` predicate exactly
 *  as PostgreSQL would, so the DB code path is exercised without a database. */
function makeFakeModel(rows: Record<string, unknown>[]) {
  const matchWhere = (row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === "OR") {
        if (!Array.isArray(v) || !v.some((cl) => matchWhere(row, cl as Record<string, unknown>))) return false;
      } else if (k === "AND") {
        if (!Array.isArray(v) || !v.every((cl) => matchWhere(row, cl as Record<string, unknown>))) return false;
      } else if (v !== null && typeof v === "object" && "not" in (v as object)) {
        if (row[k] === (v as { not: unknown }).not) return false;
      } else if ((row[k] ?? null) !== v) {
        return false;
      }
    }
    return true;
  };
  let seq = 0;
  return {
    async findMany(args: Record<string, unknown> = {}) {
      let out = rows.filter((r) => matchWhere(r, args.where as Record<string, unknown>));
      if ((args.orderBy as { createdAt?: string })?.createdAt === "desc") {
        out = [...out].sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
      }
      if (typeof args.take === "number") out = out.slice(0, args.take);
      return out.map((r) => ({ ...r }));
    },
    async findFirst(args: Record<string, unknown>) {
      const r = rows.find((x) => matchWhere(x, args.where as Record<string, unknown>));
      return r ? { ...r } : null;
    },
    async create(args: { data: Record<string, unknown> }) {
      seq += 1;
      const rec = {
        id: (args.data.id as string) ?? `db-${seq}`,
        createdAt: (args.data.createdAt as string) ?? new Date(2000, 0, seq).toISOString(),
        updatedAt: (args.data.updatedAt as string) ?? new Date(2000, 0, seq).toISOString(),
        ...args.data,
      };
      rows.push(rec);
      return { ...rec };
    },
    async update(args: { where: { id: string }; data: Record<string, unknown> }) {
      const i = rows.findIndex((x) => x.id === args.where.id);
      if (i < 0) throw new Error("Record to update not found");
      rows[i] = { ...rows[i], ...args.data, updatedAt: new Date().toISOString() };
      return { ...rows[i] };
    },
    async delete(args: { where: { id: string } }) {
      const i = rows.findIndex((x) => x.id === args.where.id);
      if (i < 0) throw new Error("Record to delete not found");
      const [d] = rows.splice(i, 1);
      return d;
    },
  };
}

describe("90B — database parity: the fake-Prisma path enforces the same matrix", () => {
  let rows: Record<string, unknown>[];

  beforeEach(() => {
    resetStores();
    rows = [];
    vi.resetModules();
    vi.doMock("@/lib/storage/storage-mode", () => ({
      getStorageMode: () => "database",
      isDatabaseMode: () => true,
    }));
    // One stable model instance per collection so id sequences stay monotonic
    // across the many getPrisma() calls a single matrix run makes.
    const engineeringMemory = makeFakeModel(rows);
    const unknownAnalysis = makeFakeModel(rows);
    const project = makeFakeModel(rows);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ engineeringMemory, unknownAnalysis, project }),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/storage/storage-mode");
    vi.doUnmock("@/lib/db/prisma");
    vi.resetModules();
  });

  it("EngineeringMemory database path matches the session semantics exactly", async () => {
    const { memoryRepository: dbMemoryRepository } = await import("../memory-repository");
    await assertOwnershipMatrix({
      make: (o) => dbMemoryRepository(o) as unknown as Repository<{ id: string; userId?: string | null; organizationId?: string | null }, Record<string, unknown>>,
      draft: MEMORY_DRAFT,
      patch: { analysisSummary: "updated-by-test" },
      seedLegacy: () =>
        rows.unshift({
          ...MEMORY_DRAFT,
          id: "legacy-x",
          createdAt: new Date("2019-01-01").toISOString(),
          updatedAt: new Date("2019-01-01").toISOString(),
          userId: null,
          organizationId: null,
        }),
    });
  });
});

/* ─────────────────────────── memory-service layer ─────────────────────────── */

describe("90B — memory-service enforces tenant scope (feedback BOLA closed)", () => {
  beforeEach(() => resetStores());

  it("addMemoryFeedback on another tenant's memory returns null (no cross-tenant mutation)", async () => {
    const { createEngineeringMemory, addMemoryFeedback, getEngineeringMemory } = await import(
      "@/lib/memory/memory-service"
    );

    const mem = await createEngineeringMemory({ ...MEMORY_DRAFT }, ALICE);
    expect(mem.userId).toBe("u-alice");

    // Bob cannot append feedback to Alice's memory → 404 (null), and Alice's
    // outcome is NOT mutated.
    const asBob = await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "failed", submittedBy: "u-bob" }, BOB);
    expect(asBob, "cross-tenant feedback must be denied").toBeNull();
    expect((await getEngineeringMemory(mem.id, ALICE))?.outcome).toBe("unknown");

    // Alice can, and the parent outcome is mirrored.
    const asAlice = await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "success", submittedBy: "u-alice" }, ALICE);
    expect(asAlice).not.toBeNull();
    expect((await getEngineeringMemory(mem.id, ALICE))?.outcome).toBe("success");
  });

  it("getEngineeringMemory and search only ever see the caller's own memories", async () => {
    const { createEngineeringMemory, getEngineeringMemory, searchEngineeringMemories } = await import(
      "@/lib/memory/memory-service"
    );

    const alice = await createEngineeringMemory({ ...MEMORY_DRAFT, query: "alice turbine" }, ALICE);
    await createEngineeringMemory({ ...MEMORY_DRAFT, query: "bob compressor" }, BOB);

    expect(await getEngineeringMemory(alice.id, BOB), "cross-tenant get").toBeNull();
    expect(await getEngineeringMemory(alice.id, ALICE)).not.toBeNull();

    const aliceHits = await searchEngineeringMemories("turbine", {}, ALICE);
    expect(aliceHits.some((m) => m.query === "alice turbine"), "ranks own memory").toBe(true);
    expect(aliceHits.some((m) => m.query === "bob compressor"), "search is tenant-scoped").toBe(false);

    const bobHits = await searchEngineeringMemories("turbine", {}, BOB);
    expect(bobHits.some((m) => m.query === "alice turbine"), "Bob cannot rank Alice's memory").toBe(false);

    // Anonymous / null scope ranks nothing.
    expect(await searchEngineeringMemories("turbine", {}, null)).toEqual([]);
  });
});

/* ─────────────────────────── knowledge-graph service ─────────────────────────── */

describe("90B — knowledge graph is built only from the caller's tenant", () => {
  beforeEach(() => resetStores());

  it("a tenant's graph never contains another tenant's projects or memories", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const { createProject } = await import("@/lib/memory/project-service");
    const { getKnowledgeGraph } = await import("@/lib/services/knowledge-graph-service");

    await createProject({ ...PROJECT_DRAFT, name: "alice-proj" }, ALICE);
    await createProject({ ...PROJECT_DRAFT, name: "bob-proj" }, BOB);
    await createEngineeringMemory({ ...MEMORY_DRAFT, query: "alice-mem" }, ALICE);
    await createEngineeringMemory({ ...MEMORY_DRAFT, query: "bob-mem" }, BOB);

    const aliceGraph = await getKnowledgeGraph(ALICE);
    expect(aliceGraph.summary.nodesByType.memory, "only Alice's one memory").toBe(1);
    expect(aliceGraph.summary.nodesByType.project, "only Alice's one project").toBe(1);
    expect(aliceGraph.nodes.some((n) => JSON.stringify(n).includes("bob-")), "no Bob nodes in Alice's graph").toBe(false);

    // A null/anonymous scope produces an empty graph, never the global one.
    const anonGraph = await getKnowledgeGraph(null);
    expect(anonGraph.summary.nodesByType.memory).toBe(0);
    expect(anonGraph.summary.nodesByType.project).toBe(0);
  });
});

/* ─────────────────────────── durable audit tenancy ─────────────────────────── */

describe("90B — audit events carry tenant scope, outcome and correlation id", () => {
  beforeEach(() => resetStores());

  it("recordAuditEvent persists organizationId / outcome / correlationId", async () => {
    const { recordAuditEvent, listAuditEvents } = await import("@/lib/audit/audit-service");

    await recordAuditEvent({
      userId: "u-alice",
      organizationId: "org-a",
      action: "case.created",
      entityType: "case",
      entityId: "case-1",
      outcome: "success",
      correlationId: "req-abc123",
      metadata: { title: "t" },
    });

    const { events } = await listAuditEvents(5);
    const ev = events.find((e) => e.entityId === "case-1");
    expect(ev).toBeTruthy();
    expect(ev?.organizationId).toBe("org-a");
    expect(ev?.outcome).toBe("success");
    expect(ev?.correlationId).toBe("req-abc123");
  });

  it("a legacy event with no tenancy fields degrades to null (not undefined)", async () => {
    const { recordAuditEvent, listAuditEvents } = await import("@/lib/audit/audit-service");
    await recordAuditEvent({ userId: "u-x", action: "case.updated", entityType: "case", entityId: "case-legacy" });
    const ev = (await listAuditEvents(5)).events.find((e) => e.entityId === "case-legacy");
    expect(ev?.organizationId).toBeNull();
    expect(ev?.outcome).toBeNull();
    expect(ev?.correlationId).toBeNull();
  });
});
