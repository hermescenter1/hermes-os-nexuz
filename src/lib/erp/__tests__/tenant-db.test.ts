/**
 * HRIS-0.5 — ERP tenant data layer, against an in-memory Prisma double.
 *
 * The double honours `where` equality, unique constraints (P2002 with the same
 * meta shape as Prisma), and interactive transactions with real rollback. The
 * functions under test are the production ones; only the database is fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Obj = Record<string, unknown> & { id: string };
type Tables = Record<string, Obj[]>;

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => fake.db,
}));

import {
  addTeamMember,
  createResource,
  createTeam,
  getTeam,
  listResources,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
  updateResource,
  type ErpCtx,
} from "@/lib/erp/db";
import type { ErpScope } from "@/lib/erp/tenant";

const UNIQUE: Record<string, string[][]> = {
  idempotencyKey: [["organizationId", "operation", "keyHash"]],
  erpTeamMember: [["teamId", "userId"]],
};

function createFakeDb(seed: Partial<Tables> = {}) {
  let tables: Tables = {
    erpTeam: [],
    erpTeamMember: [],
    erpResource: [],
    organizationMember: [],
    auditLog: [],
    idempotencyKey: [],
    ...seed,
  } as Tables;
  let seq = 0;

  const matches = (row: Obj, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "organizationId_operation_keyHash") return true; // handled by findUnique
      return row[k] === v;
    });

  const delegate = (name: string) => ({
    findMany: async (args: { where?: Record<string, unknown>; take?: number; cursor?: { id: string }; skip?: number } = {}) => {
      let rows = tables[name].filter(r => matches(r, args.where)).map(r => ({ ...r }));
      // Keyset continuation as Prisma does it: start after the cursor row, skipping it when `skip` is 1.
      if (args.cursor) {
        const at = rows.findIndex(r => r.id === args.cursor?.id);
        rows = at < 0 ? [] : rows.slice(at + (args.skip ?? 0));
      }
      return args.take ? rows.slice(0, args.take) : rows;
    },
    findFirst: async (args: { where?: Record<string, unknown> } = {}) => {
      const row = tables[name].find(r => matches(r, args.where));
      return row ? { ...row } : null;
    },
    findUnique: async (args: { where: { organizationId_operation_keyHash?: Record<string, unknown> } }) => {
      const key = args.where.organizationId_operation_keyHash;
      if (!key) return null;
      const row = tables[name].find(
        r => r.organizationId === key.organizationId && r.operation === key.operation && r.keyHash === key.keyHash,
      );
      return row ? { ...row } : null;
    },
    create: async (args: { data: Record<string, unknown> }) => {
      const row: Obj = {
        id: `${name}-${++seq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        joinedAt: new Date(),
        version: 1,
        isAvailable: true,
        currency: "USD",
        availability: 100,
        ...args.data,
      } as Obj;
      for (const cols of UNIQUE[name] ?? []) {
        const clash = tables[name].some(r => cols.every(c => r[c] === row[c]));
        if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: cols } });
      }
      tables[name].push(row);
      return { ...row };
    },
    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of tables[name]) {
        if (!matches(row, args.where)) continue;
        for (const [k, v] of Object.entries(args.data)) {
          if (v && typeof v === "object" && "increment" in (v as object)) {
            row[k] = (row[k] as number) + (v as { increment: number }).increment;
          } else {
            row[k] = v;
          }
        }
        count += 1;
      }
      return { count };
    },
    deleteMany: async (args: { where: Record<string, unknown> }) => {
      const before = tables[name].length;
      tables[name] = tables[name].filter(r => !matches(r, args.where));
      return { count: before - tables[name].length };
    },
    count: async (args: { where?: Record<string, unknown> } = {}) => tables[name].filter(r => matches(r, args.where)).length,
  });

  const delegates = {
    erpTeam: delegate("erpTeam"),
    erpTeamMember: delegate("erpTeamMember"),
    erpResource: delegate("erpResource"),
    organizationMember: delegate("organizationMember"),
    auditLog: delegate("auditLog"),
    idempotencyKey: delegate("idempotencyKey"),
  };
  const client = {
    ...delegates,
    $transaction: async <R>(fn: (tx: unknown) => Promise<R>): Promise<R> => {
      const snapshot = structuredClone(tables);
      try {
        return await fn(client);
      } catch (err) {
        tables = snapshot;
        throw err;
      }
    },
  };
  return { client, tables: () => tables };
}

const scopeFor = (over: Partial<ErpScope> = {}): ErpScope => ({
  userId: "admin-a",
  organizationId: "org-A",
  memberId: "mem-admin-a",
  role: "ADMIN",
  canViewCompensation: false,
  ...over,
});

const ctxFor = (over: Partial<ErpCtx> = {}, scope: Partial<ErpScope> = {}): ErpCtx => ({
  scope: scopeFor(scope),
  correlationId: "corr-test-1",
  idempotencyKey: "IDEMPOTENCY-KEY-0001-ABCDEF",
  ...over,
});

let db: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  db = createFakeDb({
    organizationMember: [
      { id: "m-a1", organizationId: "org-A", userId: "user-a1", status: "ACTIVE", role: "ENGINEER" },
      { id: "m-b1", organizationId: "org-B", userId: "user-b1", status: "ACTIVE", role: "ENGINEER" },
      { id: "m-a2", organizationId: "org-A", userId: "user-a2", status: "SUSPENDED", role: "ENGINEER" },
    ] as Obj[],
  });
  fake.db = db.client;
});

describe("createTeam — org scope, idempotency, audit atomicity", () => {
  it("persists the team under the caller's organization and audits it in the same org", async () => {
    const out = await createTeam(ctxFor(), { name: "Line 4", description: null, capacity: 5 });
    expect(out.kind).toBe("created");
    const team = db.tables().erpTeam[0];
    expect(team.organizationId).toBe("org-A");
    expect(team.version).toBe(1);
    const audit = db.tables().auditLog[0];
    expect(audit.organizationId).toBe("org-A");
    expect(audit.correlationId).toBe("corr-test-1");
    expect(audit.action).toBe("erp.team.create");
  });

  it("stores only the SHA-256 of the key, never the raw key", async () => {
    await createTeam(ctxFor(), { name: "Line 4" });
    const row = db.tables().idempotencyKey[0];
    expect(JSON.stringify(row)).not.toContain("IDEMPOTENCY-KEY-0001-ABCDEF");
    expect(String(row.keyHash)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("replays the same result for the same key and payload without a second write", async () => {
    const first = await createTeam(ctxFor(), { name: "Line 4" });
    const second = await createTeam(ctxFor(), { name: "Line 4" });
    expect(db.tables().erpTeam).toHaveLength(1);
    expect(second.kind).toBe("replayed");
    expect(second.value?.id).toBe(first.kind === "created" ? first.value.id : "");
  });

  it("refuses the same key with a different payload (409, no write)", async () => {
    await createTeam(ctxFor(), { name: "Line 4" });
    await expect(createTeam(ctxFor(), { name: "Line 5" })).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(db.tables().erpTeam).toHaveLength(1);
  });

  it("scopes the key per organization: another tenant can use the same raw key", async () => {
    await createTeam(ctxFor(), { name: "Line 4" });
    await createTeam(ctxFor({}, { userId: "admin-b", organizationId: "org-B", memberId: "mem-b" }), { name: "Line 4" });
    expect(db.tables().erpTeam.map(t => t.organizationId).sort()).toEqual(["org-A", "org-B"]);
  });

  it("requires an Idempotency-Key on create (400, no write)", async () => {
    await expect(createTeam(ctxFor({ idempotencyKey: null }), { name: "Line 4" })).rejects.toMatchObject({
      status: 400,
      code: "IDEMPOTENCY_KEY_INVALID",
    });
    expect(db.tables().erpTeam).toHaveLength(0);
  });

  it("rolls back the team AND its key when the audit write fails", async () => {
    const original = db.client.auditLog.create;
    db.client.auditLog.create = async () => {
      throw new Error("audit sink down");
    };
    await expect(createTeam(ctxFor(), { name: "Line 4" })).rejects.toThrow("audit sink down");
    db.client.auditLog.create = original;
    expect(db.tables().erpTeam).toHaveLength(0);
    expect(db.tables().idempotencyKey).toHaveLength(0);
  });

  it("resolves a concurrent duplicate as a replay of the winner, leaving one team", async () => {
    // Request A has already committed key K -> team T1.
    const winner = await createTeam(ctxFor(), { name: "Line 4" });
    // Request B's pre-check reads a stale null, then loses the unique insert.
    const realFind = db.client.idempotencyKey.findUnique;
    let calls = 0;
    db.client.idempotencyKey.findUnique = async args => {
      calls += 1;
      return calls === 1 ? null : realFind(args);
    };
    const loser = await createTeam(ctxFor(), { name: "Line 4" });
    expect(db.tables().erpTeam).toHaveLength(1);
    expect(loser.kind).toBe("replayed");
    expect(loser.value?.id).toBe(winner.kind === "created" ? winner.value.id : "");
  });

  it("recognises the duplicate when a driver adapter reports the model instead of meta.target", async () => {
    // @prisma/adapter-pg (PostgreSQL 16, verified in the rehearsal) reports
    // meta.modelName, not meta.target. The loser must still replay, not fail.
    const winner = await createTeam(ctxFor(), { name: "Line 5" });
    const realFind = db.client.idempotencyKey.findUnique;
    const realCreate = db.client.idempotencyKey.create;
    let calls = 0;
    db.client.idempotencyKey.findUnique = async args => {
      calls += 1;
      return calls === 1 ? null : realFind(args);
    };
    db.client.idempotencyKey.create = async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { modelName: "IdempotencyKey" } });
    };
    try {
      const loser = await createTeam(ctxFor(), { name: "Line 5" });
      expect(loser.kind).toBe("replayed");
      expect(loser.value?.id).toBe(winner.kind === "created" ? winner.value.id : "");
    } finally {
      db.client.idempotencyKey.findUnique = realFind;
      db.client.idempotencyKey.create = realCreate;
    }
    expect(db.tables().erpTeam.filter(t => t.name === "Line 5")).toHaveLength(1);
  });
});

describe("tenant isolation for teams", () => {
  beforeEach(() => {
    db.tables().erpTeam.push(
      { id: "t-a", organizationId: "org-A", name: "A team", description: null, leadId: null, capacity: 1, version: 1, createdAt: new Date("2026-01-02"), updatedAt: new Date() } as Obj,
      { id: "t-b", organizationId: "org-B", name: "B team", description: null, leadId: null, capacity: 1, version: 1, createdAt: new Date("2026-01-03"), updatedAt: new Date() } as Obj,
      { id: "t-null", organizationId: null, name: "Legacy unassigned", description: null, leadId: null, capacity: 1, version: 1, createdAt: new Date("2026-01-04"), updatedAt: new Date() } as Obj,
    );
  });

  it("lists only the caller's organization and never null-scope rows", async () => {
    const page = await listTeams(ctxFor(), { limit: 50 });
    expect(page.items.map(t => t.id)).toEqual(["t-a"]);
  });

  it("team detail reports the database member count of its own organization, not the list length", async () => {
    db.tables().erpTeamMember.push(
      { id: "tm-1", organizationId: "org-A", teamId: "t-a", userId: "user-a1", role: "member", availability: 100, joinedAt: new Date("2026-01-05") } as Obj,
      { id: "tm-2", organizationId: "org-A", teamId: "t-a", userId: "user-a2", role: "lead", availability: 80, joinedAt: new Date("2026-01-06") } as Obj,
      { id: "tm-x", organizationId: "org-B", teamId: "t-a", userId: "user-b1", role: "member", availability: 100, joinedAt: new Date("2026-01-07") } as Obj,
    );
    const team = await getTeam(ctxFor(), "t-a");
    expect(team.memberCount).toBe(2);
    expect(team.members.items.map(m => m.id)).toEqual(["tm-1", "tm-2"]);
    expect(team.members).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("member pages continue from the cursor: hasMore and nextCursor walk the list without gaps or repeats", async () => {
    db.tables().erpTeamMember.push(
      { id: "tm-p1", organizationId: "org-A", teamId: "t-a", userId: "user-p1", role: "member", availability: 100, joinedAt: new Date("2026-01-05") } as Obj,
      { id: "tm-p2", organizationId: "org-A", teamId: "t-a", userId: "user-p2", role: "member", availability: 100, joinedAt: new Date("2026-01-06") } as Obj,
      { id: "tm-p3", organizationId: "org-A", teamId: "t-a", userId: "user-p3", role: "member", availability: 100, joinedAt: new Date("2026-01-07") } as Obj,
    );
    const first = await listTeamMembers(ctxFor(), "t-a", { limit: 2 });
    expect(first.items.map(m => m.id)).toEqual(["tm-p1", "tm-p2"]);
    expect(first).toMatchObject({ hasMore: true, nextCursor: "tm-p2" });
    const second = await listTeamMembers(ctxFor(), "t-a", { limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items.map(m => m.id)).toEqual(["tm-p3"]);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("a cursor that is not a member of this team is refused (400) and walks nothing", async () => {
    await expect(listTeamMembers(ctxFor(), "t-a", { limit: 2, cursor: "tm-from-another-team" })).rejects.toMatchObject({ status: 400 });
  });

  it("a team of another organization has no member page at all (404)", async () => {
    await expect(listTeamMembers(ctxFor(), "t-b", { limit: 50 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("removing a member twice: the first removal audits once, the second answers removed:false and writes nothing", async () => {
    db.tables().erpTeamMember.push(
      { id: "tm-r", organizationId: "org-A", teamId: "t-a", userId: "user-r", role: "member", availability: 100, joinedAt: new Date("2026-01-05") } as Obj,
    );
    const auditBefore = db.tables().auditLog.length;
    await expect(removeTeamMember(ctxFor(), "t-a", "user-r")).resolves.toEqual({ removed: true });
    await expect(removeTeamMember(ctxFor(), "t-a", "user-r")).resolves.toEqual({ removed: false });
    expect(db.tables().auditLog.length - auditBefore).toBe(1);
  });

  it("answers NOT_FOUND for another organization's team, the same as an unknown id", async () => {
    await expect(getTeam(ctxFor(), "t-b")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(getTeam(ctxFor(), "t-null")).rejects.toMatchObject({ status: 404 });
    await expect(getTeam(ctxFor(), "missing")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an update of another organization's team (404) and changes nothing", async () => {
    await expect(updateTeam(ctxFor(), "t-b", { version: 1, name: "Hijack" })).rejects.toMatchObject({ status: 404 });
    expect(db.tables().erpTeam.find(t => t.id === "t-b")?.name).toBe("B team");
  });

  it("refuses removing a member from another organization's team (404)", async () => {
    db.tables().erpTeamMember.push({ id: "tm-b", teamId: "t-b", organizationId: "org-B", userId: "user-b1", role: "member", availability: 100, joinedAt: new Date() } as Obj);
    await expect(removeTeamMember(ctxFor(), "t-b", "user-b1")).rejects.toMatchObject({ status: 404 });
    expect(db.tables().erpTeamMember).toHaveLength(1);
  });

  it("rejects a malformed cursor instead of walking another tenant's ordering", async () => {
    await expect(listTeams(ctxFor(), { limit: 50, cursor: "t-b" })).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
  });
});

describe("optimistic concurrency on teams", () => {
  beforeEach(() => {
    db.tables().erpTeam.push({ id: "t-a", organizationId: "org-A", name: "A team", description: null, leadId: null, capacity: 1, version: 3, createdAt: new Date(), updatedAt: new Date() } as Obj);
  });

  it("refuses a stale write with 409 and leaves the row untouched", async () => {
    await expect(updateTeam(ctxFor(), "t-a", { version: 2, name: "Stale" })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(db.tables().erpTeam[0].name).toBe("A team");
    expect(db.tables().erpTeam[0].version).toBe(3);
  });

  it("applies a current write, increments version atomically and audits field names", async () => {
    const out = await updateTeam(ctxFor(), "t-a", { version: 3, name: "Renamed", capacity: 7 });
    expect(out.name).toBe("Renamed");
    expect(out.version).toBe(4);
    const audit = db.tables().auditLog.at(-1);
    expect(audit?.action).toBe("erp.team.update");
    expect((audit?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual(["capacity", "name"]);
  });
});

describe("team membership is limited to ACTIVE members of the same organization", () => {
  beforeEach(() => {
    db.tables().erpTeam.push({ id: "t-a", organizationId: "org-A", name: "A team", description: null, leadId: null, capacity: 1, version: 1, createdAt: new Date(), updatedAt: new Date() } as Obj);
  });

  it("accepts an ACTIVE member of this organization", async () => {
    const out = await addTeamMember(ctxFor(), "t-a", { userId: "user-a1", role: "member", availability: 100 });
    expect(out.kind).toBe("created");
    expect(db.tables().erpTeamMember[0].organizationId).toBe("org-A");
  });

  it("refuses a user who belongs only to another organization (422)", async () => {
    await expect(addTeamMember(ctxFor({ idempotencyKey: "KEY-CROSS-ORG-00000001" }), "t-a", { userId: "user-b1", role: "member", availability: 100 })).rejects.toMatchObject({
      status: 422,
      code: "MEMBER_NOT_IN_ORGANIZATION",
    });
    expect(db.tables().erpTeamMember).toHaveLength(0);
  });

  it("refuses a SUSPENDED member of this organization (422)", async () => {
    await expect(addTeamMember(ctxFor({ idempotencyKey: "KEY-SUSPENDED-000000001" }), "t-a", { userId: "user-a2", role: "member", availability: 100 })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("maps a lost membership race onto the unique constraint as 409, not an outage", async () => {
    await addTeamMember(ctxFor({ idempotencyKey: "KEY-RACE-MEMBER-00000001" }), "t-a", { userId: "user-a1", role: "member", availability: 100 });
    // Stale pre-check: the existing row is invisible to this request's read.
    const realFind = db.client.erpTeamMember.findFirst;
    db.client.erpTeamMember.findFirst = async () => null;
    try {
      await expect(addTeamMember(ctxFor({ idempotencyKey: "KEY-RACE-MEMBER-00000002" }), "t-a", { userId: "user-a1", role: "member", availability: 100 })).rejects.toMatchObject({
        status: 409,
        code: "ALREADY_MEMBER",
      });
    } finally {
      db.client.erpTeamMember.findFirst = realFind;
    }
    expect(db.tables().erpTeamMember).toHaveLength(1);
  });

  it("the duplicate check is organization-scoped, like every other read in the write", async () => {
    const realFind = db.client.erpTeamMember.findFirst;
    const seen: Array<{ where?: Record<string, unknown> }> = [];
    db.client.erpTeamMember.findFirst = async (args: { where?: Record<string, unknown> } = {}) => {
      seen.push(args);
      return realFind(args);
    };
    try {
      await addTeamMember(ctxFor({ idempotencyKey: "KEY-SCOPED-DUP-000000001" }), "t-a", { userId: "user-a1", role: "member", availability: 100 });
    } finally {
      db.client.erpTeamMember.findFirst = realFind;
    }
    expect(seen).toHaveLength(1);
    expect(seen[0].where).toMatchObject({ organizationId: "org-A", teamId: "t-a", userId: "user-a1" });
  });

  it("refuses a duplicate membership (409)", async () => {
    await addTeamMember(ctxFor({ idempotencyKey: "KEY-DUP-MEMBER-00000001" }), "t-a", { userId: "user-a1", role: "member", availability: 100 });
    await expect(addTeamMember(ctxFor({ idempotencyKey: "KEY-DUP-MEMBER-00000002" }), "t-a", { userId: "user-a1", role: "member", availability: 100 })).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_MEMBER",
    });
  });
});

describe("resources — compensation is a separate permission", () => {
  it("refuses to write costRate without view_erp_compensation (403, no write)", async () => {
    await expect(createResource(ctxFor(), { name: "Welder", type: "HUMAN", costRate: 42.5 })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(db.tables().erpResource).toHaveLength(0);
  });

  it("an OWNER writes costRate, but the audit row never contains its value", async () => {
    await createResource(ctxFor({}, { role: "OWNER", canViewCompensation: true }), { name: "Welder", type: "HUMAN", costRate: 987.65 });
    const audit = db.tables().auditLog.at(-1);
    expect((audit?.metadata as { changedFields: string[] }).changedFields).toContain("costRate");
    expect(JSON.stringify(audit)).not.toContain("987.65");
  });

  it("an ADMIN listing resources never receives costRate, even when stored", async () => {
    db.tables().erpResource.push({ id: "r-a", organizationId: "org-A", name: "Lathe", type: "EQUIPMENT", description: null, costRate: 55.5, currency: "USD", isAvailable: true, projectId: null, workOrderId: null, version: 1, createdAt: new Date(), updatedAt: new Date() } as Obj);
    const page = await listResources(ctxFor(), { limit: 50 });
    expect(page.items[0].costRate).toBeNull();
    expect(page.items[0].financialsVisible).toBe(false);
  });

  it("an OWNER listing resources receives costRate", async () => {
    db.tables().erpResource.push({ id: "r-a", organizationId: "org-A", name: "Lathe", type: "EQUIPMENT", description: null, costRate: 55.5, currency: "USD", isAvailable: true, projectId: null, workOrderId: null, version: 1, createdAt: new Date(), updatedAt: new Date() } as Obj);
    const page = await listResources(ctxFor({}, { role: "OWNER", canViewCompensation: true }), { limit: 50 });
    expect(page.items[0].costRate).toBe(55.5);
    expect(page.items[0].financialsVisible).toBe(true);
  });

  it("hides null-scope resources from every organization", async () => {
    db.tables().erpResource.push({ id: "r-null", organizationId: null, name: "Orphan", type: "TOOL", description: null, costRate: null, currency: "USD", isAvailable: true, projectId: null, workOrderId: null, version: 1, createdAt: new Date(), updatedAt: new Date() } as Obj);
    const page = await listResources(ctxFor(), { limit: 50 });
    expect(page.items.map(r => r.id)).not.toContain("r-null");
  });

  it("applies a resource update only at the current version", async () => {
    db.tables().erpResource.push({ id: "r-a", organizationId: "org-A", name: "Lathe", type: "EQUIPMENT", description: null, costRate: null, currency: "USD", isAvailable: true, projectId: null, workOrderId: null, version: 2, createdAt: new Date(), updatedAt: new Date() } as Obj);
    await expect(updateResource(ctxFor(), "r-a", { version: 1, isAvailable: false })).rejects.toMatchObject({ status: 409 });
    const out = await updateResource(ctxFor(), "r-a", { version: 2, isAvailable: false });
    expect(out.version).toBe(3);
    expect(out.isAvailable).toBe(false);
  });
});
