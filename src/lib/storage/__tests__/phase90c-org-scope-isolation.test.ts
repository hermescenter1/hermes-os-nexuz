import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveOrgScope } from "../brain-owner";
import { memoryRepository } from "../memory-repository";
import type { BrainOwner, Repository } from "../types";

/**
 * PHASE 90B — organization-context isolation (the merge-blocker fix).
 *
 * Ownership scope is resolved by COUNTING active memberships, never by picking
 * an arbitrary one, and a row is only ever reachable from its exact active-org
 * context (org rows) or by its own user (personal, org-less rows). Ambiguous
 * contexts (>1 active membership, no server-authenticated active org) fail
 * closed: they see nothing and cannot write.
 *
 * The same matrix is asserted against the session store AND a fake-Prisma
 * database store, proving identical isolation semantics in both backends.
 */

const ALICE_A: BrainOwner = { userId: "u-alice", orgId: "org-a" };
const ALICE_B: BrainOwner = { userId: "u-alice", orgId: "org-b" };
const ALICE_P: BrainOwner = { userId: "u-alice", orgId: null };
const ANNA_A: BrainOwner = { userId: "u-anna", orgId: "org-a" };
const BOB_B: BrainOwner = { userId: "u-bob", orgId: "org-b" };
const AMBIGUOUS: BrainOwner = { userId: "u-alice", orgId: null, ambiguous: true };

const MEMORY_DRAFT = {
  query: "turbine vibration",
  domain: "drives",
  analysisSummary: "s",
  confidence: 80,
  relatedCaseIds: [],
  relatedDocumentIds: [],
  outcome: "unknown" as const,
};

/* ───────────────────── resolveOrgScope (pure) ───────────────────── */

describe("90B — resolveOrgScope: count-based, never arbitrary", () => {
  it("0 active memberships => personal", () => {
    expect(resolveOrgScope({ activeOrgIds: [], activeOrgHint: null })).toEqual({ orgId: null, ambiguous: false });
  });
  it("exactly 1 active membership => that org", () => {
    expect(resolveOrgScope({ activeOrgIds: ["org-a"], activeOrgHint: null })).toEqual({ orgId: "org-a", ambiguous: false });
  });
  it("de-duplicates repeated active org ids => single org", () => {
    expect(resolveOrgScope({ activeOrgIds: ["org-a", "org-a"], activeOrgHint: null })).toEqual({ orgId: "org-a", ambiguous: false });
  });
  it(">1 active, no active-org hint => AMBIGUOUS (fail closed)", () => {
    expect(resolveOrgScope({ activeOrgIds: ["org-a", "org-b"], activeOrgHint: null })).toEqual({ orgId: null, ambiguous: true });
  });
  it(">1 active, active-org hint the user actually holds => that org", () => {
    expect(resolveOrgScope({ activeOrgIds: ["org-a", "org-b"], activeOrgHint: "org-b" })).toEqual({ orgId: "org-b", ambiguous: false });
  });
  it(">1 active, hint the user does NOT hold => AMBIGUOUS (hint never trusted blindly)", () => {
    expect(resolveOrgScope({ activeOrgIds: ["org-a", "org-b"], activeOrgHint: "org-c" })).toEqual({ orgId: null, ambiguous: true });
  });
});

/* ───────────────────── resolveBrainOwner (integration) ───────────────────── */

const USER = { id: "u-alice", email: "a@b.c", name: "A", role: "engineer" as const };

async function resolveWith(user: unknown, activeOrgIds: string[] | null): Promise<BrainOwner | null> {
  vi.resetModules();
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => user }));
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () =>
      activeOrgIds === null
        ? null
        : { organizationMember: { findMany: async () => activeOrgIds.map((id) => ({ organizationId: id })) } },
  }));
  const { resolveBrainOwner } = await import("../brain-owner");
  return resolveBrainOwner();
}

describe("90B — resolveBrainOwner: server-authoritative org context", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/db/prisma");
    vi.resetModules();
  });

  it("no active membership => personal", async () => {
    expect(await resolveWith(USER, [])).toEqual({ userId: "u-alice", orgId: null, ambiguous: false });
  });
  it("membership in org-a only => org-a", async () => {
    expect(await resolveWith(USER, ["org-a"])).toEqual({ userId: "u-alice", orgId: "org-a", ambiguous: false });
  });
  it("org-a suspended (now 0 active) => personal — loses org access", async () => {
    // A suspended membership never appears in the ACTIVE set, so it degrades to
    // personal: the former org's rows become unreachable.
    expect(await resolveWith(USER, [])).toEqual({ userId: "u-alice", orgId: null, ambiguous: false });
  });
  it("member of org-a AND org-b, no active-org => AMBIGUOUS (fail closed)", async () => {
    expect(await resolveWith(USER, ["org-a", "org-b"])).toEqual({ userId: "u-alice", orgId: null, ambiguous: true });
  });
  it("database unavailable => personal (narrowest; never widens)", async () => {
    expect(await resolveWith(USER, null)).toEqual({ userId: "u-alice", orgId: null, ambiguous: false });
  });
  it("unauthenticated => null", async () => {
    expect(await resolveWith(null, [])).toBeNull();
  });
  it("getCurrentUser throwing => null (never throws)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => { throw new Error("boom"); } }));
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
    const { resolveBrainOwner } = await import("../brain-owner");
    expect(await resolveBrainOwner()).toBeNull();
  });
});

/* ───────────────────── repo org-context matrix (session + DB parity) ───────────────────── */

type MemRepo = Repository<{ id: string; userId?: string | null; organizationId?: string | null }, Record<string, unknown>>;

async function orgContextScenarios(make: (o: BrainOwner) => MemRepo): Promise<void> {
  // An ORG row created under org-a is unreachable from the SAME user's org-b
  // context — the cross-org merge-blocker leak is closed.
  const orgRow = await make(ALICE_A).create({ ...MEMORY_DRAFT, query: "org-a secret" });
  expect(orgRow.organizationId).toBe("org-a");
  expect(await make(ALICE_B).get(orgRow.id), "org-a row from org-b context").toBeNull();
  expect((await make(ALICE_B).list()).some((r) => r.id === orgRow.id), "org-b list").toBe(false);
  expect(await make(ALICE_B).update(orgRow.id, { analysisSummary: "x" }), "org-b update").toBeNull();
  expect(await make(ALICE_B).delete(orgRow.id), "org-b delete").toBe(false);
  expect(await make(ALICE_A).get(orgRow.id), "same org context").not.toBeNull();
  expect(await make(ANNA_A).get(orgRow.id), "org colleague").not.toBeNull();

  // A PERSONAL (org-less) row is visible only to its own user — not to org
  // colleagues, not to other users — but visible in that user's own org context.
  const personalRow = await make(ALICE_P).create({ ...MEMORY_DRAFT, query: "alice personal" });
  expect(personalRow.organizationId).toBeNull();
  expect(await make(ALICE_P).get(personalRow.id), "creator, personal context").not.toBeNull();
  expect(await make(ALICE_A).get(personalRow.id), "creator, org context sees own personal").not.toBeNull();
  expect(await make(ANNA_A).get(personalRow.id), "org colleague cannot see personal").toBeNull();
  expect(await make(BOB_B).get(personalRow.id), "other user").toBeNull();

  // AMBIGUOUS context: reads nothing, writes fail closed.
  expect((await make(AMBIGUOUS).list()).length, "ambiguous list").toBe(0);
  expect(await make(AMBIGUOUS).get(orgRow.id), "ambiguous get").toBeNull();
  expect(await make(AMBIGUOUS).get(personalRow.id), "ambiguous get personal").toBeNull();
  // Message-based (not instanceof): the DB parity path re-imports owner-scope
  // under vi.resetModules, so it throws a different module instance of the class.
  await expect(make(AMBIGUOUS).create({ ...MEMORY_DRAFT }), "ambiguous create fails closed").rejects.toThrow(
    /[Aa]mbiguous/,
  );
}

describe("90B — memory repository org-context matrix — SESSION store", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
  });
  it("enforces org/personal/ambiguous scope", async () => {
    await orgContextScenarios((o) => memoryRepository(o) as unknown as MemRepo);
  });
});

function makeFakeMemoryModel(rows: Record<string, unknown>[]) {
  const match = (row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === "OR") { if (!Array.isArray(v) || !v.some((c) => match(row, c as Record<string, unknown>))) return false; }
      else if (k === "AND") { if (!Array.isArray(v) || !v.every((c) => match(row, c as Record<string, unknown>))) return false; }
      else if ((row[k] ?? null) !== v) return false;
    }
    return true;
  };
  let seq = 0;
  return {
    async findMany(a: Record<string, unknown> = {}) {
      let out = rows.filter((r) => match(r, a.where as Record<string, unknown>));
      if (typeof a.take === "number") out = out.slice(0, a.take);
      return out.map((r) => ({ ...r }));
    },
    async findFirst(a: Record<string, unknown>) { const r = rows.find((x) => match(x, a.where as Record<string, unknown>)); return r ? { ...r } : null; },
    async create(a: { data: Record<string, unknown> }) { seq += 1; const rec = { id: `db-${seq}`, createdAt: new Date(2000, 0, seq).toISOString(), updatedAt: new Date(2000, 0, seq).toISOString(), ...a.data }; rows.push(rec); return { ...rec }; },
    async update(a: { where: { id: string }; data: Record<string, unknown> }) { const i = rows.findIndex((x) => x.id === a.where.id); if (i < 0) throw new Error("not found"); rows[i] = { ...rows[i], ...a.data }; return { ...rows[i] }; },
    async delete(a: { where: { id: string } }) { const i = rows.findIndex((x) => x.id === a.where.id); if (i < 0) throw new Error("not found"); const [d] = rows.splice(i, 1); return d; },
  };
}

describe("90B — memory repository org-context matrix — DATABASE store (parity)", () => {
  let rows: Record<string, unknown>[];
  beforeEach(() => {
    rows = [];
    vi.resetModules();
    // One stable model instance so its id sequence is monotonic across calls.
    const model = makeFakeMemoryModel(rows);
    vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database", isDatabaseMode: () => true }));
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => ({ engineeringMemory: model }) }));
  });
  afterEach(() => {
    vi.doUnmock("@/lib/storage/storage-mode");
    vi.doUnmock("@/lib/db/prisma");
    vi.resetModules();
  });
  it("enforces org/personal/ambiguous scope identically to the session store", async () => {
    const { memoryRepository: dbMemoryRepository } = await import("../memory-repository");
    await orgContextScenarios((o) => dbMemoryRepository(o) as unknown as MemRepo);
  });
});

/* ───────────────────── service + graph (org context) ───────────────────── */

describe("90B — services honour org context", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
    (globalThis as Record<string, unknown>).__hermesMemoryFeedback = [];
    (globalThis as Record<string, unknown>).__hermesProjects = [];
  });

  it("feedback on a memory from another org context returns null (no cross-org mutation)", async () => {
    const { createEngineeringMemory, addMemoryFeedback, getEngineeringMemory } = await import("@/lib/memory/memory-service");
    const mem = await createEngineeringMemory({ ...MEMORY_DRAFT }, ALICE_A);

    expect(await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "failed", submittedBy: "u-alice" }, ALICE_B), "org-b feedback").toBeNull();
    expect(await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "failed", submittedBy: "u-alice" }, AMBIGUOUS), "ambiguous feedback").toBeNull();
    expect((await getEngineeringMemory(mem.id, ALICE_A))?.outcome, "outcome untouched").toBe("unknown");

    expect(await addMemoryFeedback(mem.id, { memoryId: mem.id, outcome: "success", submittedBy: "u-alice" }, ALICE_A), "same-org feedback").not.toBeNull();
  });

  it("getSimilarMemories / search cannot rank another org's memory", async () => {
    const { createEngineeringMemory, searchEngineeringMemories } = await import("@/lib/memory/memory-service");
    await createEngineeringMemory({ ...MEMORY_DRAFT, query: "orga turbine" }, ALICE_A);
    const fromOrgB = await searchEngineeringMemories("turbine", {}, ALICE_B);
    expect(fromOrgB.some((m) => m.query === "orga turbine"), "org-b cannot see org-a memory").toBe(false);
    expect(await searchEngineeringMemories("turbine", {}, AMBIGUOUS), "ambiguous ranks nothing").toEqual([]);
  });

  it("the knowledge graph is empty in an ambiguous context and org-scoped otherwise", async () => {
    const { createEngineeringMemory } = await import("@/lib/memory/memory-service");
    const { createProject } = await import("@/lib/memory/project-service");
    const { getKnowledgeGraph } = await import("@/lib/services/knowledge-graph-service");

    await createProject({ name: "orga-proj", description: "d", status: "active" }, ALICE_A);
    await createEngineeringMemory({ ...MEMORY_DRAFT, query: "orga-mem" }, ALICE_A);

    const ambiguousGraph = await getKnowledgeGraph(AMBIGUOUS);
    expect(ambiguousGraph.summary.nodesByType.memory, "ambiguous graph memory").toBe(0);
    expect(ambiguousGraph.summary.nodesByType.project, "ambiguous graph project").toBe(0);

    const orgBGraph = await getKnowledgeGraph(ALICE_B);
    expect(orgBGraph.summary.nodesByType.memory, "org-b cannot see org-a memory").toBe(0);

    const orgAGraph = await getKnowledgeGraph(ALICE_A);
    expect(orgAGraph.summary.nodesByType.memory, "own org graph").toBe(1);
  });
});

/* ───────────────── repo: create fails closed for a null / ambiguous owner ───────────────── */

describe("90B — repo create fails closed for a non-writable owner (no unattributed row)", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__hermesEngineeringMemory = [];
  });
  it("null owner throws OwnerContextUnavailable; ambiguous throws Ambiguous; nothing is written", async () => {
    const store = () => (globalThis as Record<string, unknown>).__hermesEngineeringMemory as unknown[];
    await expect(memoryRepository(null).create({ ...MEMORY_DRAFT }), "null owner").rejects.toThrow(/unavailable/i);
    await expect(memoryRepository(AMBIGUOUS).create({ ...MEMORY_DRAFT }), "ambiguous owner").rejects.toThrow(/[Aa]mbiguous/);
    expect(store().length, "no unattributed / misattributed row written").toBe(0);
  });
});

/* ─────────── route: write fails closed with a distinguishable code (no row, no audit) ─────────── */

const CASES_ENV = ["DATABASE_URL", "HERMES_STORAGE_MODE"] as const;

function casesPostReq(): Request {
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Fail-closed case", vendor: "v" }),
  });
}

async function assertNoCaseWriteNoAudit(): Promise<void> {
  const { listAuditEvents } = await import("@/lib/audit/audit-service");
  const events = (await listAuditEvents(10)).events;
  expect(events.some((e) => e.action === "case.created"), "no case.created audit").toBe(false);
  const drafts = (globalThis as Record<string, unknown>).__hermesCaseDrafts as unknown[];
  expect(drafts.length, "no case row written").toBe(0);
}

function restoreCasesEnv(saved: Record<string, string | undefined>): void {
  for (const k of CASES_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
}

describe("90B — cases POST => 409 ACTIVE_ORGANIZATION_REQUIRED in an ambiguous org context", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of CASES_ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    (globalThis as Record<string, unknown>).__hermesCaseDrafts = [];
    (globalThis as Record<string, unknown>).__hermesAudit = [];
    vi.resetModules();
    // Authenticated authoring user who is an ACTIVE member of TWO orgs with no
    // active-org selected → resolveBrainOwner resolves an AMBIGUOUS context.
    vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u-alice", email: "a@b.c", name: "A", role: "admin" }) }));
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => ({ organizationMember: { findMany: async () => [{ organizationId: "org-a" }, { organizationId: "org-b" }] } }) }));
  });
  afterEach(() => {
    restoreCasesEnv(saved);
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/db/prisma");
    vi.resetModules();
  });
  it("returns 409 with a stable code, writes no row and records no audit", async () => {
    const { POST } = await import("@/app/api/cases/route");
    const res = await POST(casesPostReq());
    expect(res.status, "ambiguous => 409").toBe(409);
    expect((await res.json()).code).toBe("ACTIVE_ORGANIZATION_REQUIRED");
    await assertNoCaseWriteNoAudit();
  });
});

describe("90B — cases POST => 503 OWNER_CONTEXT_UNAVAILABLE when the owner cannot be resolved", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of CASES_ENV) { saved[k] = process.env[k]; delete process.env[k]; }
    (globalThis as Record<string, unknown>).__hermesCaseDrafts = [];
    (globalThis as Record<string, unknown>).__hermesAudit = [];
    vi.resetModules();
    // The auth gate passes (getCurrentUser returns a user) but the SECOND owner
    // resolution fails (resolveBrainOwner → null) — a transient session/membership
    // failure. The write must fail closed, not create an owner-less row.
    vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u-alice", email: "a@b.c", name: "A", role: "admin" }) }));
    vi.doMock("@/lib/storage/brain-owner", () => ({ resolveBrainOwner: async () => null }));
  });
  afterEach(() => {
    restoreCasesEnv(saved);
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/storage/brain-owner");
    vi.resetModules();
  });
  it("returns 503 with a stable code, writes no row and records no audit", async () => {
    const { POST } = await import("@/app/api/cases/route");
    const res = await POST(casesPostReq());
    expect(res.status, "owner unavailable => 503").toBe(503);
    expect((await res.json()).code).toBe("OWNER_CONTEXT_UNAVAILABLE");
    await assertNoCaseWriteNoAudit();
  });
});
