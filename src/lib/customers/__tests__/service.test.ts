/**
 * A tenant's customers — behaviour of the data layer.
 *
 * The fake database records every call, so the properties that matter are
 * asserted on what the DATABASE WAS ASKED: every read and write carries the
 * caller's organization; another tenant's record is NOT FOUND; a foreign
 * cursor is refused before it can position a page; every write audits through
 * the transaction client; stale versions are refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ calls: [] as Array<{ input: Record<string, unknown>; client: unknown }>, fail: false }));
vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEventOrThrow: async (input: Record<string, unknown>, client: unknown) => {
    audit.calls.push({ input, client });
    if (audit.fail) throw new Error("audit store down");
  },
}));

import {
  addInteraction,
  createCustomer,
  CustomerError,
  eligibleOwners,
  getCustomer,
  linkableProjects,
  linkedProjects,
  listCustomers,
  listInteractions,
  setProjectLink,
  updateCustomer,
  type CustomerDb,
} from "../service";

type Row = Record<string, unknown>;
const ORG = "org-a";
const OTHER = "org-b";
const ctx = { organizationId: ORG, userId: "u-manager", correlationId: "corr-1" };
const NOW = Date.parse("2026-10-13T09:00:00Z");

/** Minimal Prisma-ish matcher: equality, null, {in}, {not}, {lt}, {gte}, {equals,mode}, OR. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Record<string, unknown>[]).some(c => matches(row, c));
    const v = row[k];
    if (cond === null) return v === null || v === undefined;
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
    if (typeof cond === "object" && cond !== null) {
      const c = cond as Record<string, unknown>;
      if ("in" in c) return (c.in as unknown[]).includes(v);
      if ("not" in c) return c.not === null ? v !== null && v !== undefined : v !== c.not;
      if ("lt" in c) return v instanceof Date && v.getTime() < (c.lt as Date).getTime();
      if ("gte" in c) return v instanceof Date && v.getTime() >= (c.gte as Date).getTime();
      if ("equals" in c) return String(v ?? "").toLowerCase() === String(c.equals).toLowerCase();
      if ("contains" in c) return String(v ?? "").toLowerCase().includes(String(c.contains).toLowerCase());
      if ("gt" in c) return String(v) > String(c.gt);
    }
    return v === cond;
  });
}

function fakeDb() {
  const calls: Array<{ model: string; op: string; args: Record<string, unknown> }> = [];
  const state = {
    parties: [] as Row[],
    interactions: [] as Row[],
    members: [
      { organizationId: ORG, userId: "u-manager", status: "ACTIVE", role: "MANAGER" },
      { organizationId: ORG, userId: "u-viewer", status: "ACTIVE", role: "VIEWER" },
      { organizationId: OTHER, userId: "u-foreign", status: "ACTIVE", role: "OWNER" },
    ] as Row[],
    projects: [] as Row[],
    costs: [] as Row[],
    seq: 0,
  };
  const delegate = (model: string, rows: () => Row[]) => ({
    async findFirst(args: Record<string, unknown>) {
      calls.push({ model, op: "findFirst", args });
      // A COPY, as Prisma returns: a later write must not rewrite what was read.
      const hit = rows().find(r => matches(r, (args.where ?? {}) as Record<string, unknown>));
      return hit ? { ...hit } : null;
    },
    async findMany(args: Record<string, unknown>) {
      calls.push({ model, op: "findMany", args });
      let out = rows().filter(r => matches(r, (args.where ?? {}) as Record<string, unknown>));
      out = [...out].sort((a, b) => String(a.displayName ?? a.id).localeCompare(String(b.displayName ?? b.id)));
      const cursor = (args.cursor as { id?: string } | undefined)?.id;
      if (cursor) out = out.slice(out.findIndex(r => r.id === cursor) + ((args.skip as number) ?? 0));
      return out.slice(0, (args.take as number) ?? out.length).map(r => ({ ...r }));
    },
    async create(args: Record<string, unknown>) {
      calls.push({ model, op: "create", args });
      const row = { id: `${model}-${++state.seq}`, version: 1, archivedAt: null, lastInteractionAt: null, createdAt: new Date(NOW), updatedAt: new Date(NOW), ...(args.data as Row) };
      rows().push(row);
      return { ...row };
    },
    async updateMany(args: Record<string, unknown>) {
      calls.push({ model, op: "updateMany", args });
      const hit = rows().filter(r => matches(r, args.where as Record<string, unknown>));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    },
  });
  const tx = {
    party: delegate("party", () => state.parties),
    partyInteraction: delegate("partyInteraction", () => state.interactions),
    organizationMember: delegate("organizationMember", () => state.members),
    erpProject: delegate("erpProject", () => state.projects),
  };
  const db = {
    ...tx,
    user: { async findMany() { return [{ id: "u-manager", name: "Mina Manager" }]; } },
    erpProjectCost: {
      async groupBy(args: Record<string, unknown>) {
        calls.push({ model: "erpProjectCost", op: "groupBy", args });
        const hit = state.costs.filter(r => matches(r, args.where as Record<string, unknown>));
        const by = new Map<string, number>();
        for (const c of hit) by.set(String(c.currency), (by.get(String(c.currency)) ?? 0) + Number(c.amount));
        return [...by].map(([currency, amount]) => ({ currency, _sum: { amount } }));
      },
    },
    async $transaction<T>(fn: (t: typeof tx) => Promise<T>) {
      calls.push({ model: "$", op: "transaction", args: {} });
      return fn(tx);
    },
  } as unknown as CustomerDb;
  return { db, calls, state, tx };
}

const party = (over: Row = {}): Row => ({
  id: `p-${Math.random().toString(36).slice(2, 8)}`,
  organizationId: ORG,
  kind: "CUSTOMER",
  status: "ACTIVE",
  displayName: "Sepahan Steel",
  version: 1,
  archivedAt: null,
  lastInteractionAt: null,
  nextActionAt: null,
  followUpOwnerId: null,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
  ...over,
});

/** Every query sent to a tenant table must name the caller's organization. */
function expectScoped(calls: ReturnType<typeof fakeDb>["calls"]) {
  for (const c of calls) {
    if (!["party", "partyInteraction", "erpProject", "erpProjectCost"].includes(c.model)) continue;
    const where = (c.args.where ?? (c.op === "create" ? c.args.data : undefined)) as Record<string, unknown> | undefined;
    expect(where?.organizationId, `${c.model}.${c.op}`).toBe(ORG);
  }
}

beforeEach(() => {
  audit.calls = [];
  audit.fail = false;
});

describe("isolation", () => {
  it("never returns another organization's customer — it is NOT FOUND", async () => {
    const { db, state, calls } = fakeDb();
    const foreign = party({ organizationId: OTHER, displayName: "Foreign Co" });
    state.parties.push(foreign);
    await expect(getCustomer(ctx, String(foreign.id), { db, nowMs: NOW })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(updateCustomer(ctx, String(foreign.id), { expectedVersion: 1, status: "INACTIVE" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addInteraction(ctx, String(foreign.id), { kind: "CALL", occurredAt: "2026-10-13T08:00:00Z", summary: "x" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(foreign.status).toBe("ACTIVE");
    expectScoped(calls);
  });

  it("lists only the caller's organization, and every query carries it", async () => {
    const { db, state, calls } = fakeDb();
    state.parties.push(party({ displayName: "Mine" }), party({ organizationId: OTHER, displayName: "Theirs" }));
    const page = await listCustomers(ctx, {}, { db, nowMs: NOW });
    expect(page.items.map(c => c.displayName)).toEqual(["Mine"]);
    expectScoped(calls);
  });

  it("refuses a cursor from another organization BEFORE it can position a page", async () => {
    const { db, state, calls } = fakeDb();
    const foreign = party({ organizationId: OTHER, displayName: "Zeta Foreign" });
    state.parties.push(party({ displayName: "Alpha" }), foreign);
    await expect(listCustomers(ctx, { cursor: String(foreign.id) }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "INVALID_CURSOR", status: 400 });
    expect(calls.filter(c => c.model === "party" && c.op === "findMany")).toHaveLength(0);
  });

  it("will not make a member of ANOTHER organization the follow-up owner", async () => {
    const { db } = fakeDb();
    await expect(createCustomer(ctx, { displayName: "New Co", followUpOwnerId: "u-foreign" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "OWNER_NOT_ELIGIBLE", status: 422 });
  });

  it("will not make a member who may not see customers the follow-up owner", async () => {
    const { db } = fakeDb();
    await expect(createCustomer(ctx, { displayName: "New Co", followUpOwnerId: "u-viewer" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "OWNER_NOT_ELIGIBLE" });
  });
});

describe("search, filters and pagination", () => {
  it("pages with a cursor and reports hasMore", async () => {
    const { db, state } = fakeDb();
    for (const n of ["A", "B", "C", "D", "E"]) state.parties.push(party({ id: `p-${n}`, displayName: `Customer ${n}` }));
    const first = await listCustomers(ctx, { limit: 2 }, { db, nowMs: NOW });
    expect(first.items.map(c => c.displayName)).toEqual(["Customer A", "Customer B"]);
    expect(first).toMatchObject({ hasMore: true, nextCursor: "p-B" });
    const second = await listCustomers(ctx, { limit: 2, cursor: "p-B" }, { db, nowMs: NOW });
    expect(second.items.map(c => c.displayName)).toEqual(["Customer C", "Customer D"]);
    const last = await listCustomers(ctx, { limit: 2, cursor: "p-D" }, { db, nowMs: NOW });
    expect(last).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("searches name, legal name, email and phone, case-insensitively", async () => {
    const { db, state, calls } = fakeDb();
    state.parties.push(party({ displayName: "Sepahan Steel" }), party({ displayName: "Other", email: "buyer@SEPAHAN.ir" }), party({ displayName: "Nope" }));
    const page = await listCustomers(ctx, { q: "sepahan" }, { db, nowMs: NOW });
    expect(page.items).toHaveLength(2);
    const where = calls.find(c => c.model === "party" && c.op === "findMany")!.args.where as { OR: unknown[] };
    expect(where.OR).toHaveLength(4);
  });

  it("filters overdue follow-ups, my customers, and archived ones apart", async () => {
    const { db, state } = fakeDb();
    state.parties.push(
      party({ displayName: "Late", nextActionAt: new Date(NOW - 86_400_000), followUpOwnerId: "u-manager" }),
      party({ displayName: "Soon", nextActionAt: new Date(NOW + 86_400_000) }),
      party({ displayName: "Gone", archivedAt: new Date(NOW) }),
    );
    expect((await listCustomers(ctx, { followUp: "overdue" }, { db, nowMs: NOW })).items.map(c => c.displayName)).toEqual(["Late"]);
    expect((await listCustomers(ctx, { owner: "me" }, { db, nowMs: NOW })).items.map(c => c.displayName)).toEqual(["Late"]);
    expect((await listCustomers(ctx, {}, { db, nowMs: NOW })).items.map(c => c.displayName)).toEqual(["Late", "Soon"]);
    expect((await listCustomers(ctx, { archived: "only" }, { db, nowMs: NOW })).items.map(c => c.displayName)).toEqual(["Gone"]);
  });

  it("states the follow-up of each customer and names its owner", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ displayName: "Late", nextActionAt: new Date(NOW - 1), followUpOwnerId: "u-manager" }));
    const [c] = (await listCustomers(ctx, {}, { db, nowMs: NOW })).items;
    expect(c).toMatchObject({ followUp: "overdue", followUpOwnerName: "Mina Manager" });
  });
});

describe("create", () => {
  it("creates in the caller's organization and audits through the transaction client", async () => {
    const { db, calls, tx } = fakeDb();
    const c = await createCustomer(ctx, { displayName: "Isfahan Pipes", email: "info@pipes.ir", followUpOwnerId: "u-manager" }, { db, nowMs: NOW });
    expect(c).toMatchObject({ displayName: "Isfahan Pipes", status: "ACTIVE", followUpOwnerName: "Mina Manager", version: 1 });
    const created = calls.find(c2 => c2.op === "create")!.args.data as Row;
    expect(created).toMatchObject({ organizationId: ORG, kind: "CUSTOMER", createdBy: "u-manager" });
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0].client).toBe(tx);
    expect(audit.calls[0].input).toMatchObject({ action: "customer.create", organizationId: ORG, entityType: "Party" });
    // Contact details never go into the audit trail.
    expect(JSON.stringify(audit.calls[0].input)).not.toContain("info@pipes.ir");
  });

  it("refuses a second active customer with the same name, in any letter case", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1", displayName: "Sepahan Steel" }));
    await expect(createCustomer(ctx, { displayName: "SEPAHAN STEEL" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "DUPLICATE_NAME", detail: { existingId: "p-1" } });
  });

  it("allows the name of another organization's customer", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ organizationId: OTHER, displayName: "Sepahan Steel" }));
    await expect(createCustomer(ctx, { displayName: "Sepahan Steel" }, { db, nowMs: NOW })).resolves.toMatchObject({ displayName: "Sepahan Steel" });
  });

  it("commits nothing when the audit write fails", async () => {
    const { db } = fakeDb();
    audit.fail = true;
    await expect(createCustomer(ctx, { displayName: "X" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("never leaks a driver message", async () => {
    const { db } = fakeDb();
    (db as unknown as { $transaction: () => Promise<never> }).$transaction = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    };
    const err = await createCustomer(ctx, { displayName: "X" }, { db, nowMs: NOW }).catch(e => e as CustomerError);
    expect(err).toBeInstanceOf(CustomerError);
    expect(JSON.stringify(err)).not.toContain("10.0.0.5");
  });
});

describe("update", () => {
  it("updates with the version in the WHERE clause and bumps it", async () => {
    const { db, state, calls } = fakeDb();
    state.parties.push(party({ id: "p-1", version: 3 }));
    const c = await updateCustomer(ctx, "p-1", { expectedVersion: 3, status: "INACTIVE" }, { db, nowMs: NOW });
    expect(c).toMatchObject({ status: "INACTIVE", version: 4 });
    const upd = calls.find(c2 => c2.op === "updateMany")!.args as { where: Row; data: Row };
    expect(upd.where).toMatchObject({ organizationId: ORG, id: "p-1", version: 3 });
    expect(audit.calls[0].input).toMatchObject({ action: "customer.update", metadata: { changed: ["status"], status: { from: "ACTIVE", to: "INACTIVE" } } });
  });

  it("refuses a stale version and writes nothing", async () => {
    const { db, state, calls } = fakeDb();
    state.parties.push(party({ id: "p-1", version: 5 }));
    await expect(updateCustomer(ctx, "p-1", { expectedVersion: 4, status: "INACTIVE" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "VERSION_CONFLICT", detail: { currentVersion: 5 } });
    expect(calls.some(c => c.op === "updateMany")).toBe(false);
    expect(audit.calls).toHaveLength(0);
  });

  it("archives instead of deleting, keeps an archived customer read-only, and restores it", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }));
    const archived = await updateCustomer(ctx, "p-1", { expectedVersion: 1, archived: true }, { db, nowMs: NOW });
    expect(archived.archivedAt).not.toBeNull();
    await expect(updateCustomer(ctx, "p-1", { expectedVersion: 2, phone: "021" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "ARCHIVED" });
    const restored = await updateCustomer(ctx, "p-1", { expectedVersion: 2, archived: false }, { db, nowMs: NOW });
    expect(restored.archivedAt).toBeNull();
    expect(audit.calls.map(a => a.input.action)).toEqual(["customer.archive", "customer.restore"]);
  });

  it("clears the next-action note together with its date", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1", nextActionAt: new Date(NOW), nextActionNote: "send quote" }));
    const c = await updateCustomer(ctx, "p-1", { expectedVersion: 1, nextActionAt: null }, { db, nowMs: NOW });
    expect(c).toMatchObject({ nextActionAt: null, nextActionNote: null, followUp: "none" });
  });

  it("does not let a rename collide with another active customer", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1", displayName: "One" }), party({ id: "p-2", displayName: "Two" }));
    await expect(updateCustomer(ctx, "p-2", { expectedVersion: 1, displayName: "one" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
  });
});

describe("interactions", () => {
  it("appends, moves lastInteractionAt FORWARD only, and audits without the summary", async () => {
    const { db, state } = fakeDb();
    const p = party({ id: "p-1", lastInteractionAt: new Date("2026-10-12T10:00:00Z") });
    state.parties.push(p);
    await addInteraction(ctx, "p-1", { kind: "CALL", occurredAt: "2026-10-13T08:00:00Z", summary: "Discussed the pipe tender" }, { db, nowMs: NOW });
    expect((p.lastInteractionAt as Date).toISOString()).toBe("2026-10-13T08:00:00.000Z");
    // An OLDER contact recorded later does not move it back.
    const out = await addInteraction(ctx, "p-1", { kind: "EMAIL", occurredAt: "2026-10-01T08:00:00Z", summary: "Old email" }, { db, nowMs: NOW });
    expect((p.lastInteractionAt as Date).toISOString()).toBe("2026-10-13T08:00:00.000Z");
    expect(out.lastInteractionAt).toBe("2026-10-13T08:00:00.000Z");
    expect(state.interactions).toHaveLength(2);
    expect(state.interactions.every(i => i.organizationId === ORG && i.recordedBy === "u-manager")).toBe(true);
    expect(JSON.stringify(audit.calls.map(a => a.input))).not.toContain("pipe tender");
  });

  it("refuses a contact dated in the future", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }));
    await expect(addInteraction(ctx, "p-1", { kind: "CALL", occurredAt: "2026-10-14T09:00:00Z", summary: "x" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "OCCURRED_IN_FUTURE", status: 422 });
  });

  it("refuses to log a contact on an archived customer", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1", archivedAt: new Date(NOW) }));
    await expect(addInteraction(ctx, "p-1", { kind: "NOTE", occurredAt: "2026-10-13T08:00:00Z", summary: "x" }, { db, nowMs: NOW })).rejects.toMatchObject({ code: "ARCHIVED" });
  });

  it("lists newest first and refuses a cursor from another customer", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }), party({ id: "p-2", displayName: "Two" }));
    state.interactions.push({ id: "i-other", organizationId: ORG, partyId: "p-2", occurredAt: new Date(NOW), summary: "x", kind: "CALL" });
    await expect(listInteractions(ctx, "p-1", { cursor: "i-other" }, { db })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
});

describe("projects", () => {
  it("links only a project of the caller's organization", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }));
    state.projects.push({ id: "prj-foreign", organizationId: OTHER, partyId: null, deletedAt: null });
    await expect(setProjectLink(ctx, "p-1", { projectId: "prj-foreign", linked: true }, { db })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND", status: 404 });
    expect(state.projects[0].partyId).toBeNull();
  });

  it("links, refuses to steal a project linked elsewhere, and unlinks with an audit each time", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }), party({ id: "p-2", displayName: "Two" }));
    state.projects.push({ id: "prj-1", organizationId: ORG, partyId: null, deletedAt: null });
    await setProjectLink(ctx, "p-1", { projectId: "prj-1", linked: true }, { db });
    expect(state.projects[0].partyId).toBe("p-1");
    await expect(setProjectLink(ctx, "p-2", { projectId: "prj-1", linked: true }, { db })).rejects.toMatchObject({ code: "PROJECT_LINKED_ELSEWHERE" });
    await setProjectLink(ctx, "p-1", { projectId: "prj-1", linked: false }, { db });
    expect(state.projects[0].partyId).toBeNull();
    expect(audit.calls.map(a => a.input.action)).toEqual(["customer.project.link", "customer.project.unlink"]);
  });

  it("reports linked projects and their recorded cost PER CURRENCY, never summed across", async () => {
    const { db, state, calls } = fakeDb();
    state.parties.push(party({ id: "p-1" }));
    state.projects.push(
      { id: "prj-1", organizationId: ORG, partyId: "p-1", deletedAt: null, name: "Line 2", status: "ACTIVE" },
      { id: "prj-2", organizationId: ORG, partyId: "p-1", deletedAt: null, name: "Line 3", status: "PLANNED" },
    );
    state.costs.push(
      { organizationId: ORG, projectId: "prj-1", currency: "IRR", amount: 1000 },
      { organizationId: ORG, projectId: "prj-2", currency: "IRR", amount: 500 },
      { organizationId: ORG, projectId: "prj-2", currency: "EUR", amount: 7 },
    );
    const out = await linkedProjects(ctx, "p-1", { db });
    expect(out.projects.map(p => p.name).sort()).toEqual(["Line 2", "Line 3"]);
    expect(out.recordedCost).toEqual(expect.arrayContaining([{ currency: "IRR", amount: 1500 }, { currency: "EUR", amount: 7 }]));
    expectScoped(calls);
  });
});

describe("form choices (slice G2)", () => {
  it("offers only active members of THIS organization who may see customers, by name", async () => {
    const { db, state, calls } = fakeDb();
    state.members.push(
      { organizationId: ORG, userId: "u-owner", status: "ACTIVE", role: "OWNER" },
      { organizationId: ORG, userId: "u-gone", status: "SUSPENDED", role: "ADMIN" },
    );
    const owners = await eligibleOwners(ctx, { db });
    const ids = owners.map(o => o.userId).sort();
    expect(ids).toEqual(["u-manager", "u-owner"]);
    expect(ids).not.toContain("u-viewer");
    expect(ids).not.toContain("u-foreign");
    const q = calls.find(c => c.model === "organizationMember" && c.op === "findMany")!.args as { where: Record<string, unknown>; take: number };
    expect(q.where).toMatchObject({ organizationId: ORG, status: "ACTIVE" });
    expect(q.take).toBe(100);
  });

  it("offers only this organization's free projects and the ones already linked here", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-1" }), party({ id: "p-2", displayName: "Two" }));
    state.projects.push(
      { id: "prj-free", organizationId: ORG, partyId: null, deletedAt: null, name: "Free" },
      { id: "prj-mine", organizationId: ORG, partyId: "p-1", deletedAt: null, name: "Mine" },
      { id: "prj-theirs", organizationId: ORG, partyId: "p-2", deletedAt: null, name: "Theirs" },
      { id: "prj-foreign", organizationId: OTHER, partyId: null, deletedAt: null, name: "Foreign" },
    );
    const out = await linkableProjects(ctx, "p-1", { db });
    expect(out.map(p => [p.id, p.linked]).sort()).toEqual([
      ["prj-free", false],
      ["prj-mine", true],
    ]);
  });

  it("refuses to list projects for another organization's customer", async () => {
    const { db, state } = fakeDb();
    state.parties.push(party({ id: "p-x", organizationId: OTHER }));
    await expect(linkableProjects(ctx, "p-x", { db })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
