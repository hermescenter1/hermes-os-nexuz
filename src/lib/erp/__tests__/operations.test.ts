/**
 * HRIS-0.5B — ERP operational data layer.
 *
 * Covers: tenant scope and bounded lists; financials null (never 0) for callers
 * without compensation access; utilization INSUFFICIENT_DATA with Team Size as a
 * real count; totals and KPIs computed by database aggregates (groupBy, count,
 * aggregate, bounded raw measures) rather than capped row scans; the completedAt
 * state machine for tasks and work orders; approval decisions (once, reason,
 * server-side decider, version, idempotency); audit rows written in the same
 * transaction, with rollback when the audit write fails.
 *
 * Prisma is replaced by an in-memory fake with transaction rollback. The real
 * operations module runs against it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

const state = vi.hoisted(() => ({
  prisma: null as null | Record<string, unknown>,
  tables: {} as Record<string, Row[]>,
  members: [] as Array<{ organizationId: string; userId: string; status: string }>,
  failAudit: false,
  lowStock: 0,
  teamSize: 0,
  taskDuration: { measured: 0, skipped: 0, avg_hours: null as number | null },
  workOrderDuration: { measured: 0, skipped: 0, avg_hours: null as number | null },
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => state.prisma,
}));

import { ApprovalDecisionSchema, ProjectCreateSchema, ProjectListQuerySchema, TaskListQuerySchema } from "../ops-schemas";
import { listTasks, PROJECT_TRANSITIONS } from "../operations";
import type { ErpCtx } from "../db";
import type { ErpScope } from "../tenant";
import {
  createProject,
  decideApproval,
  getErpKpiReport,
  getErpOverview,
  getProjectById,
  listProjectCosts,
  listProjectMilestones,
  listProjects,
  updateProject,
  updateTask,
  updateWorkOrder,
  TASK_TRANSITIONS,
  WORK_ORDER_TRANSITIONS,
} from "../operations";

const OWNER: ErpScope = { userId: "u-owner", organizationId: "org-A", memberId: "m-1", role: "OWNER", canViewCompensation: true };
const MEMBER: ErpScope = { userId: "u-member", organizationId: "org-A", memberId: "m-2", role: "MEMBER", canViewCompensation: false };

/** Keys are padded to the 22-character minimum; the padding keeps distinct test keys distinct. */
const ctx = (scope: ErpScope, idempotencyKey: string | null = null): ErpCtx => ({
  scope,
  correlationId: "corr-1",
  idempotencyKey: idempotencyKey === null ? null : idempotencyKey.padEnd(24, "0"),
});

/** Simple where-matcher: equality, null, {not: null}, {lt: Date}, {contains}, {in}. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (typeof cond === "object" && cond !== null) {
      const c = cond as Record<string, unknown>;
      if ("not" in c) return c.not === null ? value !== null && value !== undefined : value !== c.not;
      if ("lt" in c) return value instanceof Date && value.getTime() < (c.lt as Date).getTime();
      if ("contains" in c) return String(value).includes(String(c.contains));
      if ("in" in c) return (c.in as unknown[]).includes(value);
      if ("notIn" in c) return !(c.notIn as unknown[]).includes(value);
      return false;
    }
    return value === cond;
  });
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) row[k] = Number(row[k]) + Number((v as { increment: number }).increment);
    else row[k] = v;
  }
}

function tableDelegate(name: string) {
  const table = () => state.tables[name];
  return {
    // Reads return copies, as a database read does: a later write must not change an earlier snapshot.
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const hit = table().find(r => matches(r, where));
      return hit ? { ...hit } : null;
    }),
    findMany: vi.fn<(args: unknown) => Promise<Row[]>>(async () => table().map(r => ({ ...r }))),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = { id: `${name}-${table().length + 1}`, version: 1, createdAt: new Date(), updatedAt: new Date(), ...data } as Row;
      table().push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      let count = 0;
      for (const r of table()) {
        if (matches(r, where)) {
          applyData(r, data);
          count += 1;
        }
      }
      return { count };
    }),
    count: vi.fn<(args: unknown) => Promise<number>>(async () => 0),
    groupBy: vi.fn<(args: unknown) => Promise<Array<Record<string, unknown>>>>(async () => []),
    aggregate: vi.fn<(args: unknown) => Promise<Record<string, unknown>>>(async () => ({ _sum: { budget: null, actualCost: null } })),
  };
}

const MODELS = [
  "erpProject", "erpProjectMilestone", "erpProjectCost", "erpTask", "erpTaskComment", "erpTeam", "erpTeamMember",
  "erpInventoryItem", "erpInventoryMovement", "erpWorkOrder", "erpWorkOrderActivity", "erpApprovalRequest",
  "erpApprovalStep", "erpOperationalKpi",
];

/** Installs the fake. Tables are real arrays; $transaction restores them when the callback throws. */
function installPrisma() {
  state.tables = { auditLog: [], idempotencyKey: [] };
  for (const m of MODELS) state.tables[m] = [];
  state.tables.organizationMember = [];
  state.members = [{ organizationId: "org-A", userId: "u-member", status: "ACTIVE" }];
  state.failAudit = false;
  state.lowStock = 0;
  state.teamSize = 0;
  state.taskDuration = { measured: 0, skipped: 0, avg_hours: null };
  state.workOrderDuration = { measured: 0, skipped: 0, avg_hours: null };

  const models: Record<string, ReturnType<typeof tableDelegate>> = {};
  for (const m of MODELS) models[m] = tableDelegate(m);

  const prisma: Record<string, unknown> = {
    ...models,
    organizationMember: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => state.members.find(m => matches(m as unknown as Row, where)) ?? null),
      findMany: vi.fn(async () => []),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failAudit) throw new Error("audit write failed");
        state.tables.auditLog.push(data as Row);
        return data;
      }),
    },
    idempotencyKey: {
      findUnique: vi.fn(async ({ where }: { where: { organizationId_operation_keyHash: Where } }) => {
        const key = where.organizationId_operation_keyHash;
        return state.tables.idempotencyKey.find(r => matches(r, key)) ?? null;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Row }) => {
        state.tables.idempotencyKey.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const backup: Record<string, Row[]> = {};
      for (const k of Object.keys(state.tables)) backup[k] = structuredClone(state.tables[k]);
      try {
        return await fn(prisma);
      } catch (err) {
        for (const k of Object.keys(state.tables)) state.tables[k].splice(0, state.tables[k].length, ...backup[k]);
        throw err;
      }
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("quantity")) return [{ n: state.lowStock }];
      if (sql.includes("DISTINCT")) return [{ n: state.teamSize }];
      if (sql.includes('"ErpTask"')) return [{ ...state.taskDuration }];
      if (sql.includes('"ErpWorkOrder"')) return [{ ...state.workOrderDuration }];
      return [];
    }),
  };
  state.prisma = prisma;
  return prisma;
}

const d = (name: string) => (state.prisma as Record<string, unknown>)[name] as ReturnType<typeof tableDelegate>;
const auditRows = () => state.tables.auditLog;

const projectRow = (over: Record<string, unknown> = {}): Row => ({
  id: "p-1",
  organizationId: "org-A",
  name: "Line 4 upgrade",
  description: null,
  status: "ACTIVE",
  startDate: null,
  endDate: null,
  budget: 5000,
  actualCost: 1200,
  crmAccountId: null,
  crmOpportunityId: null,
  managerId: null,
  createdBy: "u-owner",
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  version: 1,
  ...over,
} as Row);

const taskRow = (over: Record<string, unknown> = {}): Row => ({
  id: "t-1",
  organizationId: "org-A",
  projectId: null,
  teamId: null,
  assigneeId: null,
  createdBy: "u-owner",
  title: "Calibrate sensor",
  description: null,
  status: "IN_PROGRESS",
  priority: "MEDIUM",
  dueDate: null,
  completedAt: null,
  estimatedHours: null,
  actualHours: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  version: 1,
  ...over,
} as Row);

const woRow = (over: Record<string, unknown> = {}): Row => ({
  id: "wo-1",
  organizationId: "org-A",
  projectId: null,
  teamId: null,
  title: "Replace belt",
  description: null,
  status: "IN_PROGRESS",
  priority: "MEDIUM",
  assigneeId: null,
  createdBy: "u-owner",
  dueDate: null,
  completedAt: null,
  completionNote: null,
  requiresApproval: false,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  version: 1,
  ...over,
} as Row);

const approvalRow = (over: Record<string, unknown> = {}): Row => ({
  id: "a-1",
  organizationId: "org-A",
  projectId: null,
  workOrderId: null,
  requestedBy: "u-member",
  title: "Spend approval",
  description: null,
  status: "PENDING",
  decidedAt: null,
  decidedBy: null,
  decision: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  version: 1,
  ...over,
} as Row);

beforeEach(() => {
  state.prisma = null;
});

// ── Tenant scope and bounded lists ───────────────────────────────────────────

describe("tenant scope and bounded lists", () => {
  it("every project list query carries the caller's organization and fetches one probe row beyond the limit", async () => {
    installPrisma();
    await listProjects(ctx(OWNER), { limit: 100, status: "ACTIVE" });
    const args = d("erpProject").findMany.mock.calls[0][0] as { where: Record<string, unknown>; take: number };
    expect(args.where).toMatchObject({ organizationId: "org-A", deletedAt: null, status: "ACTIVE" });
    expect(args.take).toBe(101);
  });

  it("a missing or foreign project is NOT_FOUND (404), never an empty success", async () => {
    installPrisma();
    await expect(getProjectById(ctx(OWNER), "p-foreign")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    const args = d("erpProject").findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ id: "p-foreign", organizationId: "org-A", deletedAt: null });
  });

  it("a database that is not available fails closed with a generic 503", async () => {
    state.prisma = null;
    await expect(listProjects(ctx(OWNER), { limit: 50 })).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
  });
});

// ── Totals and KPIs: database aggregates over the whole organization ─────────

describe("totals are computed by database aggregates, not capped row scans", () => {
  it("an organization with no operational rows gets null, computed from counts and groupBy", async () => {
    installPrisma();
    expect(await getErpOverview(ctx(OWNER))).toBeNull();
    expect(d("erpProject").groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["status"], where: { organizationId: "org-A", deletedAt: null } }),
    );
    expect(d("erpProject").findMany).not.toHaveBeenCalled();
  });

  it("owner overview: budget and actual come from aggregate(_sum), status counts from groupBy, no uncapped scan", async () => {
    installPrisma();
    d("erpProject").groupBy.mockResolvedValue([{ status: "ACTIVE", _count: { _all: 2 } }]);
    d("erpTask").groupBy.mockResolvedValue([{ status: "BLOCKED", _count: { _all: 3 } }]);
    d("erpWorkOrder").groupBy.mockResolvedValue([{ status: "COMPLETED", _count: { _all: 1 } }, { status: "OPEN", _count: { _all: 4 } }]);
    d("erpApprovalRequest").groupBy.mockResolvedValue([{ status: "PENDING", _count: { _all: 5 } }]);
    d("erpInventoryItem").count.mockResolvedValue(7);
    d("erpOperationalKpi").count.mockResolvedValue(1);
    d("erpTask").count.mockResolvedValue(2);
    d("erpProject").aggregate.mockResolvedValue({ _sum: { budget: 5000, actualCost: 1200 } });
    state.lowStock = 3;
    state.teamSize = 4;

    const overview = await getErpOverview(ctx(OWNER));
    expect(overview).not.toBeNull();
    expect(overview).toMatchObject({
      activeProjects: 2,
      overdueTasks: 2,
      openWorkOrders: 4,
      inventoryWarnings: 3,
      pendingApprovals: 5,
      totalBudget: 5000,
      totalActualCost: 1200,
      financialsVisible: true,
      teamSize: 4,
    });
    expect(d("erpProject").aggregate).toHaveBeenCalledWith(expect.objectContaining({ _sum: { budget: true, actualCost: true } }));
    expect(d("erpTask").groupBy).toHaveBeenCalled();
    // The only findMany calls are the bounded recent lists, never a whole-table read.
    for (const name of ["erpProject", "erpTask", "erpWorkOrder", "erpApprovalRequest", "erpOperationalKpi"]) {
      for (const [args] of d(name).findMany.mock.calls as unknown as Array<[{ take?: number }]>) {
        expect(args.take ?? 0).toBeLessThanOrEqual(8);
      }
    }
  });

  it("a non-owner overview has null money, financialsVisible false, and never reads money aggregates", async () => {
    installPrisma();
    d("erpProject").groupBy.mockResolvedValue([{ status: "ACTIVE", _count: { _all: 1 } }]);
    const overview = await getErpOverview(ctx(MEMBER));
    expect(overview).toMatchObject({ totalBudget: null, totalActualCost: null, financialsVisible: false });
    expect(d("erpProject").aggregate).not.toHaveBeenCalled();
  });

  it("overdue tasks count open work only: the query excludes DONE and CANCELLED tasks", async () => {
    installPrisma();
    d("erpProject").groupBy.mockResolvedValue([{ status: "ACTIVE", _count: { _all: 1 } }]);
    await getErpOverview(ctx(OWNER));
    const overdue = d("erpTask").count.mock.calls
      .map(([args]) => args as { where: Record<string, unknown> })
      .find(args => "dueDate" in args.where);
    expect(overdue?.where.status).toEqual({ notIn: ["DONE", "CANCELLED"] });
    expect(overdue?.where.completedAt).toBeUndefined();
  });

  it("recent activity is the latest events across all types, not one type's list", async () => {
    installPrisma();
    d("erpProject").groupBy.mockResolvedValue([{ status: "ACTIVE", _count: { _all: 1 } }]);
    d("erpTask").findMany.mockResolvedValueOnce([{ id: "t-1", title: "Old task", completedAt: new Date("2026-01-01T00:00:00.000Z") }]);
    d("erpApprovalRequest").findMany.mockResolvedValueOnce([
      { id: "a-1", title: "New approval", status: "APPROVED", decidedAt: new Date("2026-02-01T00:00:00.000Z") },
    ]);
    const overview = await getErpOverview(ctx(OWNER));
    expect(overview?.recentActivity.map(e => e.type)).toEqual(["approval_decided", "task_completed"]);
    expect(overview?.recentActivity[0].description).toBe("Approval approved: New approval");
    expect(d("erpTask").findMany.mock.calls[0][0]).toMatchObject({ take: 8 });
    expect(d("erpApprovalRequest").findMany.mock.calls[0][0]).toMatchObject({ take: 8 });
  });

  it("utilization is null with INSUFFICIENT_DATA; team size is the real distinct member count", async () => {
    installPrisma();
    d("erpTask").groupBy.mockResolvedValue([{ status: "TODO", _count: { _all: 9 } }]);
    state.teamSize = 4;
    const overview = await getErpOverview(ctx(OWNER));
    expect(overview?.resourceUtilization).toBeNull();
    expect(overview?.utilizationStatus).toBe("INSUFFICIENT_DATA");
    expect(overview?.teamSize).toBe(4);
  });

  it("the KPI report is null when the organization has no KPI rows", async () => {
    installPrisma();
    expect(await getErpKpiReport(ctx(OWNER))).toBeNull();
  });

  it("the KPI report keeps the latest 20 rows only and says so, and never invents a utilization", async () => {
    installPrisma();
    d("erpOperationalKpi").count.mockResolvedValue(30);
    d("erpOperationalKpi").findMany.mockResolvedValue([]);
    const report = await getErpKpiReport(ctx(OWNER));
    expect(report?.kpisLimit).toBe(20);
    expect(report?.resourceUtilization).toBeNull();
    expect(report?.utilizationStatus).toBe("INSUFFICIENT_DATA");
    const args = d("erpOperationalKpi").findMany.mock.calls[0][0] as { take: number };
    expect(args.take).toBe(20);
  });

  it("a missing KPI card is null, never 0", async () => {
    installPrisma();
    d("erpOperationalKpi").count.mockResolvedValue(1);
    d("erpOperationalKpi").findFirst.mockResolvedValue(null);
    const report = await getErpKpiReport(ctx(OWNER));
    expect(report?.projectCompletionRate).toBeNull();
    expect(report?.budgetVariance).toBeNull();
  });

  it("completion duration skips rows without completedAt and reports how many were skipped", async () => {
    installPrisma();
    d("erpOperationalKpi").count.mockResolvedValue(1);
    d("erpOperationalKpi").findFirst.mockResolvedValue(null);
    state.taskDuration = { measured: 2, skipped: 1, avg_hours: 12.5 };
    const report = await getErpKpiReport(ctx(OWNER));
    expect(report?.completionDurations.tasks).toEqual({ averageHours: 12.5, measuredRows: 2, skippedRows: 1 });
    const sql = (state.prisma as { $queryRaw: { mock: { calls: unknown[][] } } }).$queryRaw.mock.calls
      .map(c => (c[0] as unknown as string[]).join("?"))
      .find(s => s.includes('"ErpTask"')) ?? "";
    expect(sql).toContain("\"completedAt\" IS NULL");
    expect(sql).toContain("\"status\" = 'DONE'");
  });

  it("a non-owner's KPI report has null budget variance and hides FINANCE rows", async () => {
    installPrisma();
    d("erpOperationalKpi").count.mockResolvedValue(2);
    d("erpOperationalKpi").findFirst.mockImplementation(async ({ where }: { where: Where }) =>
      where.category === "FINANCE" ? { id: "k-f", category: "FINANCE", name: "Budget Variance", value: 12, createdAt: new Date(), updatedAt: new Date() } as Row : null,
    );
    d("erpOperationalKpi").findMany.mockResolvedValue([
      { id: "k-f", category: "FINANCE", name: "Budget Variance", value: 12, target: 5, unit: "%", projectId: null, periodStart: null, periodEnd: null, createdAt: new Date(), updatedAt: new Date() } as Row,
    ]);
    const report = await getErpKpiReport(ctx(MEMBER));
    expect(report?.financialsVisible).toBe(false);
    expect(report?.budgetVariance).toBeNull();
    expect(report?.kpis[0]).toMatchObject({ value: null, target: null });
  });
});

// ── Empty states and financials ──────────────────────────────────────────────

describe("financials are null for callers without compensation access, never 0", () => {
  it("a non-owner sees budget and actual cost as null, not the stored value", async () => {
    installPrisma();
    d("erpProject").findMany.mockResolvedValueOnce([projectRow()]);
    const [project] = (await listProjects(ctx(MEMBER), { limit: 50 })).items;
    expect(project.budget).toBeNull();
    expect(project.actualCost).toBeNull();
    expect(project.financialsVisible).toBe(false);
  });

  it("an owner sees the real budget and actual cost", async () => {
    installPrisma();
    d("erpProject").findMany.mockResolvedValueOnce([projectRow()]);
    const [project] = (await listProjects(ctx(OWNER), { limit: 50 })).items;
    expect(project).toMatchObject({ budget: 5000, actualCost: 1200, financialsVisible: true });
  });

  it("a non-owner's project detail has null cost lines and does not query them", async () => {
    installPrisma();
    d("erpProject").findFirst.mockResolvedValueOnce(projectRow({ costs: [] }));
    const detail = await getProjectById(ctx(MEMBER), "p-1");
    expect(d("erpProject").findFirst.mock.calls[0][0]).not.toHaveProperty("include.costs");
    expect(detail.costs).toBeNull();
  });

  it("a non-owner cannot set a budget on create; nothing is written", async () => {
    installPrisma();
    await expect(createProject(ctx(MEMBER, "key-1"), { name: "X", budget: 100 })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(d("erpProject").create).not.toHaveBeenCalled();
  });
});

// ── completedAt state machine ────────────────────────────────────────────────

describe("task and work order completion state machine", () => {
  it("entering DONE sets completedAt to now, in the same audited transaction", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "IN_PROGRESS" }));
    const before = Date.now();
    const updated = await updateTask(ctx(OWNER), "t-1", { version: 1, status: "DONE" });
    expect(updated.status).toBe("DONE");
    expect(updated.completedAt).not.toBeNull();
    expect(new Date(updated.completedAt as string).getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(auditRows()).toHaveLength(1);
  });

  it("a repeated DONE request keeps the original completedAt", async () => {
    installPrisma();
    const original = new Date("2026-02-01T10:00:00Z");
    state.tables.erpTask.push(taskRow({ status: "DONE", completedAt: original, version: 2 }));
    const updated = await updateTask(ctx(OWNER), "t-1", { version: 2, status: "DONE" });
    expect(updated.completedAt).toBe(original.toISOString());
  });

  it("reopening clears completedAt", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "DONE", completedAt: new Date("2026-02-01T10:00:00Z"), version: 2 }));
    const updated = await updateTask(ctx(OWNER), "t-1", { version: 2, status: "IN_PROGRESS" });
    expect(updated.completedAt).toBeNull();
  });

  it("a work order completes once and reopens by clearing completedAt", async () => {
    installPrisma();
    state.tables.erpWorkOrder.push(woRow({ status: "IN_PROGRESS" }));
    const done = await updateWorkOrder(ctx(OWNER), "wo-1", { version: 1, status: "COMPLETED" });
    expect(done.completedAt).not.toBeNull();
    const reopened = await updateWorkOrder(ctx(OWNER), "wo-1", { version: 2, status: "IN_PROGRESS" });
    expect(reopened.completedAt).toBeNull();
  });

  it("an invalid transition is refused with 422 and writes nothing", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "TODO" }));
    await expect(updateTask(ctx(OWNER), "t-1", { version: 1, status: "DONE" })).rejects.toMatchObject({ status: 422, code: "INVALID_REQUEST" });
    expect(d("erpTask").updateMany).not.toHaveBeenCalled();
    expect(auditRows()).toHaveLength(0);
  });

  it("the transition tables are explicit: DONE cannot go to CANCELLED, COMPLETED cannot go to OPEN", () => {
    expect(TASK_TRANSITIONS.DONE).not.toContain("CANCELLED");
    expect(WORK_ORDER_TRANSITIONS.COMPLETED).not.toContain("OPEN");
  });

  it("a stale version is refused with 409 before any write, and no audit row is written", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "IN_PROGRESS", version: 3 }));
    await expect(updateTask(ctx(OWNER), "t-1", { version: 2, status: "DONE" })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    expect(d("erpTask").updateMany).not.toHaveBeenCalled();
    expect(auditRows()).toHaveLength(0);
  });

  it("the audit row carries before/after status and completedAt, the actor, the reason and the correlation id", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "IN_PROGRESS" }));
    await updateTask(ctx(OWNER), "t-1", { version: 1, status: "DONE", reason: "Verified on the line" });
    const [row] = auditRows();
    expect(row).toMatchObject({ userId: "u-owner", organizationId: "org-A", correlationId: "corr-1", action: "erp.task.update" });
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.reason).toBe("Verified on the line");
    expect(metadata.before).toMatchObject({ status: "IN_PROGRESS", completedAt: null });
    expect((metadata.after as Record<string, unknown>).status).toBe("DONE");
    expect((metadata.after as Record<string, unknown>).completedAt).not.toBeNull();
  });

  it("an audit failure rolls the status change back: nothing is persisted", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "IN_PROGRESS", version: 1 }));
    state.failAudit = true;
    await expect(updateTask(ctx(OWNER), "t-1", { version: 1, status: "DONE" })).rejects.toThrow("audit write failed");
    const row = state.tables.erpTask[0];
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.completedAt).toBeNull();
    expect(row.version).toBe(1);
  });
});

// ── Approval decisions ───────────────────────────────────────────────────────

describe("approval decisions", () => {
  const decide = (c: ErpCtx, input: { version: number; status: "APPROVED" | "REJECTED"; reason: string }) =>
    decideApproval(c, "a-1", input);

  it("a PENDING request is decided once, by the server-side user, with the reason stored", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    const outcome = await decide(ctx(OWNER, "key-approve-1"), { version: 1, status: "APPROVED", reason: "Budget confirmed" });
    expect(outcome.kind).toBe("created");
    expect(outcome.value).toMatchObject({ status: "APPROVED", decidedBy: "u-owner", decision: "Budget confirmed", version: 2 });
    expect(outcome.value?.decidedAt).not.toBeNull();
  });

  it("a second decision on the same request is refused with 409 and writes no second audit row", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    await decide(ctx(OWNER, "key-a"), { version: 1, status: "APPROVED", reason: "ok" });
    await expect(decide(ctx(OWNER, "key-b"), { version: 2, status: "REJECTED", reason: "changed my mind" })).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
    });
    expect(auditRows()).toHaveLength(1);
    expect(state.tables.erpApprovalRequest[0].status).toBe("APPROVED");
  });

  it("a stale version is refused with 409 and no audit row is written", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow({ version: 3 }));
    await expect(decide(ctx(OWNER, "key-s"), { version: 2, status: "APPROVED", reason: "ok" })).rejects.toMatchObject({ status: 409 });
    expect(auditRows()).toHaveLength(0);
  });

  it("the same idempotency key with the same payload replays the stored result without writing again", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    const first = await decide(ctx(OWNER, "key-r"), { version: 1, status: "REJECTED", reason: "Out of policy" });
    const replay = await decide(ctx(OWNER, "key-r"), { version: 1, status: "REJECTED", reason: "Out of policy" });
    expect(first.kind).toBe("created");
    expect(replay.kind).toBe("replayed");
    expect(replay.value).toMatchObject({ id: "a-1", status: "REJECTED" });
    expect(auditRows()).toHaveLength(1);
  });

  it("the same idempotency key with a different payload is refused", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    await decide(ctx(OWNER, "key-x"), { version: 1, status: "REJECTED", reason: "Out of policy" });
    await expect(decide(ctx(OWNER, "key-x"), { version: 1, status: "APPROVED", reason: "Out of policy" })).rejects.toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("a decision without an Idempotency-Key is refused with 400 and nothing is written", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    await expect(decide(ctx(OWNER, null), { version: 1, status: "APPROVED", reason: "ok" })).rejects.toMatchObject({ status: 400 });
    expect(state.tables.erpApprovalRequest[0].status).toBe("PENDING");
  });

  it("an audit failure rolls the decision back: the request stays PENDING", async () => {
    installPrisma();
    state.tables.erpApprovalRequest.push(approvalRow());
    state.failAudit = true;
    await expect(decide(ctx(OWNER, "key-rb"), { version: 1, status: "APPROVED", reason: "ok" })).rejects.toThrow("audit write failed");
    expect(state.tables.erpApprovalRequest[0]).toMatchObject({ status: "PENDING", decidedBy: null, version: 1 });
    expect(state.tables.idempotencyKey).toHaveLength(0);
  });

  it("the request schema requires a non-empty reason and refuses a client-supplied decider", () => {
    expect(ApprovalDecisionSchema.safeParse({ version: 1, status: "APPROVED" }).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({ version: 1, status: "APPROVED", reason: "   " }).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({ version: 1, status: "APPROVED", reason: "ok", decidedBy: "u-other" }).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({ version: 1, status: "CANCELLED", reason: "ok" }).success).toBe(false);
    expect(ApprovalDecisionSchema.safeParse({ version: 1, status: "REJECTED", reason: "ok" }).success).toBe(true);
  });
});

// ── Writes: version, membership, idempotency and audit ───────────────────────

describe("writes: version, membership, idempotency and audit", () => {
  it("an assignee who is not an active member of the organization is refused with 422", async () => {
    installPrisma();
    state.tables.erpTask.push(taskRow({ status: "TODO", version: 1 }));
    await expect(updateTask(ctx(OWNER), "t-1", { version: 1, assigneeId: "u-outsider" })).rejects.toMatchObject({
      status: 422,
      code: "MEMBER_NOT_IN_ORGANIZATION",
    });
    expect(d("erpTask").updateMany).not.toHaveBeenCalled();
  });

  it("a create without an Idempotency-Key is refused with 400 and nothing is written", async () => {
    installPrisma();
    await expect(createProject(ctx(OWNER, null), { name: "X" })).rejects.toMatchObject({ status: 400, code: "IDEMPOTENCY_KEY_INVALID" });
    expect(d("erpProject").create).not.toHaveBeenCalled();
  });

  it("audit metadata names the changed fields but never stores a cost value", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ version: 1, budget: 5000 }));
    await updateProject(ctx(OWNER), "p-1", { version: 1, budget: 9000 });
    expect(auditRows()).toHaveLength(1);
    const metadata = auditRows()[0].metadata as Record<string, unknown>;
    expect(metadata.changedFields).toEqual(["budget"]);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("9000");
    expect(serialized).not.toContain("5000");
  });
});

// ── Child collections, database aggregates and project dates ─────────────────

describe("project detail: first pages, database totals, cost lines only for owners", () => {
  it("totals come from the database over the whole project, not from the first page of rows", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    d("erpTask").count.mockResolvedValueOnce(120).mockResolvedValueOnce(45);
    d("erpProjectCost").aggregate.mockResolvedValueOnce({ _sum: { amount: 9300 } });
    const detail = await getProjectById(ctx(OWNER), "p-1");
    expect(detail.taskSummary).toEqual({ total: 120, done: 45 });
    expect(detail.costTotal).toBe(9300);
    expect(d("erpTask").count.mock.calls.every(([args]) => (args as { where: Record<string, unknown> }).where.organizationId === "org-A")).toBe(true);
  });

  it("a page reports hasMore and nextCursor when more rows exist beyond the first page, and never returns the extra row", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    const milestones = Array.from({ length: 51 }, (_, i) => ({
      id: `ms-${String(i).padStart(2, "0")}`, projectId: "p-1", organizationId: "org-A", name: `M${i}`, description: null,
      dueDate: null, completedAt: null, createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    }));
    d("erpProjectMilestone").findMany.mockResolvedValueOnce(milestones);
    const detail = await getProjectById(ctx(OWNER), "p-1");
    expect(detail.milestones.items).toHaveLength(50);
    expect(detail.milestones).toMatchObject({ hasMore: true, nextCursor: "ms-49" });
    expect(d("erpProjectMilestone").findMany.mock.calls[0][0]).toMatchObject({ take: 51 });
  });

  it("a non-owner's detail never queries cost lines or money aggregates", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    const detail = await getProjectById(ctx(MEMBER), "p-1");
    expect(detail.costs).toBeNull();
    expect(detail.costTotal).toBeNull();
    expect(d("erpProjectCost").findMany).not.toHaveBeenCalled();
    expect(d("erpProjectCost").aggregate).not.toHaveBeenCalled();
  });
});

describe("child collections: cursor continuation, parent ownership, compensation", () => {
  it("continues a milestone list from the cursor row of the same project", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    state.tables.erpProjectMilestone.push(
      { id: "ms-1", projectId: "p-1", organizationId: "org-A", name: "A", description: null, dueDate: null, completedAt: null, createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) },
    );
    d("erpProjectMilestone").findFirst.mockResolvedValueOnce({ id: "ms-1" });
    const page = await listProjectMilestones(ctx(OWNER), "p-1", { limit: 10, cursor: "ms-1" });
    expect(d("erpProjectMilestone").findMany.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: { id: "ms-1" }, skip: 1, take: 11 });
    expect(page.hasMore).toBe(false);
  });

  it("a cursor that is not a row of this project is refused with 400", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    d("erpProjectMilestone").findFirst.mockResolvedValueOnce(null);
    await expect(listProjectMilestones(ctx(OWNER), "p-1", { limit: 10, cursor: "ms-elsewhere" })).rejects.toMatchObject({ status: 400 });
  });

  it("a project of another organization has no milestones page (404)", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ organizationId: "org-B" }));
    await expect(listProjectMilestones(ctx(OWNER), "p-1", { limit: 10 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("cost lines are refused (403) to a caller without compensation access, with no query", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow());
    await expect(listProjectCosts(ctx(MEMBER), "p-1", { limit: 10 })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(d("erpProjectCost").findMany).not.toHaveBeenCalled();
  });
});

describe("project dates: an end date is never before its start date", () => {
  it("create refuses endDate before startDate", () => {
    const parsed = ProjectCreateSchema.safeParse({ name: "X", startDate: "2026-06-10", endDate: "2026-06-01" });
    expect(parsed.success).toBe(false);
  });

  it("create accepts an end date equal to the start date", () => {
    const parsed = ProjectCreateSchema.safeParse({ name: "X", startDate: "2026-06-10", endDate: "2026-06-10" });
    expect(parsed.success).toBe(true);
  });

  it("update refuses an end date before the stored start date (422) and writes nothing", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ version: 1, startDate: new Date("2026-06-10T00:00:00.000Z") }));
    await expect(updateProject(ctx(OWNER), "p-1", { version: 1, endDate: "2026-06-01" })).rejects.toMatchObject({ status: 422 });
    expect(d("erpProject").updateMany).not.toHaveBeenCalled();
  });
});

// ── Top-level lists: cursor pages, never a silent cap ────────────────────────

describe("top-level lists are cursor-paged: hasMore and nextCursor, never a silent cap", () => {
  it("a page holds at most the requested rows, reports hasMore and nextCursor, and never returns the probe row", async () => {
    installPrisma();
    d("erpProject").findMany.mockResolvedValueOnce([projectRow({ id: "p-3" }), projectRow({ id: "p-2" }), projectRow({ id: "p-1" })]);
    const page = await listProjects(ctx(OWNER), { limit: 2 });
    expect(d("erpProject").findMany.mock.calls[0][0]).toMatchObject({ take: 3, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(page.items.map(p => p.id)).toEqual(["p-3", "p-2"]);
    expect(page).toMatchObject({ hasMore: true, nextCursor: "p-2" });
  });

  it("the last page reports hasMore false and a null cursor", async () => {
    installPrisma();
    d("erpTask").findMany.mockResolvedValueOnce([taskRow({ id: "t-1" })]);
    const page = await listTasks(ctx(OWNER), { limit: 2 });
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
    expect(page.items).toHaveLength(1);
  });

  it("a cursor continues after its own row inside the same list filter", async () => {
    installPrisma();
    d("erpProject").findFirst.mockResolvedValueOnce(projectRow({ id: "p-2" }));
    d("erpProject").findMany.mockResolvedValueOnce([projectRow({ id: "p-1" })]);
    const page = await listProjects(ctx(OWNER), { limit: 2, cursor: "p-2", status: "ACTIVE" });
    expect(d("erpProject").findFirst.mock.calls[0][0]).toMatchObject({
      where: { id: "p-2", organizationId: "org-A", deletedAt: null, status: "ACTIVE" },
    });
    expect(d("erpProject").findMany.mock.calls[0][0]).toMatchObject({ cursor: { id: "p-2" }, skip: 1, take: 3 });
    expect(page).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("a cursor that is not a row of this list is refused with 400 before any page is read", async () => {
    installPrisma();
    d("erpProject").findFirst.mockResolvedValueOnce(null);
    await expect(listProjects(ctx(OWNER), { limit: 2, cursor: "p-foreign" })).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    expect(d("erpProject").findMany).not.toHaveBeenCalled();
  });

  it("the request schemas bound every list: a limit above 100 and an over-long cursor are refused", () => {
    expect(ProjectListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(TaskListQuerySchema.safeParse({ cursor: "x".repeat(65) }).success).toBe(false);
    expect(TaskListQuerySchema.safeParse({ limit: 100, cursor: "t-1" }).success).toBe(true);
  });
});

describe("project status state machine", () => {
  it("every project status has an explicit transition entry and none is a self-loop", () => {
    expect(Object.keys(PROJECT_TRANSITIONS).sort()).toEqual(["ACTIVE", "CANCELLED", "COMPLETED", "ON_HOLD", "PLANNED"]);
    for (const [from, targets] of Object.entries(PROJECT_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  it("an allowed change is applied in the audited transaction", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ status: "ACTIVE", version: 1 }));
    const updated = await updateProject(ctx(OWNER), "p-1", { version: 1, status: "COMPLETED" });
    expect(updated.status).toBe("COMPLETED");
    expect(auditRows()).toHaveLength(1);
  });

  it("a jump the table does not allow is refused with 422 and writes nothing", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ status: "PLANNED", version: 1 }));
    await expect(updateProject(ctx(OWNER), "p-1", { version: 1, status: "COMPLETED" })).rejects.toMatchObject({ status: 422, code: "INVALID_REQUEST" });
    expect(d("erpProject").updateMany).not.toHaveBeenCalled();
    expect(auditRows()).toHaveLength(0);
  });

  it("the same status is a no-op rather than a refusal", async () => {
    installPrisma();
    state.tables.erpProject.push(projectRow({ status: "ON_HOLD", version: 1 }));
    const updated = await updateProject(ctx(OWNER), "p-1", { version: 1, status: "ON_HOLD" });
    expect(updated.status).toBe("ON_HOLD");
  });

  it("a project is created only in an initial state", () => {
    expect(ProjectCreateSchema.safeParse({ name: "X", status: "PLANNED" }).success).toBe(true);
    expect(ProjectCreateSchema.safeParse({ name: "X", status: "ACTIVE" }).success).toBe(true);
    expect(ProjectCreateSchema.safeParse({ name: "X", status: "COMPLETED" }).success).toBe(false);
  });
});
