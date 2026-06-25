// Phase 68 — ERP DB layer (Prisma + mock fallback)

import { getPrisma } from "@/lib/db/prisma";
import {
  MOCK_PROJECTS, MOCK_PROJECTS_FULL, MOCK_TASKS, MOCK_TEAMS, MOCK_TEAMS_FULL,
  MOCK_RESOURCES, MOCK_INVENTORY, MOCK_INVENTORY_FULL, MOCK_WORK_ORDERS,
  MOCK_WORK_ORDERS_FULL, MOCK_APPROVALS, MOCK_APPROVALS_FULL, MOCK_KPIS,
  ACTIVE_PROJECTS, OVERDUE_TASKS, OPEN_WO, PENDING_APPROVALS, LOW_STOCK_ITEMS,
  MOCK_PROJECT_COSTS,
} from "./mock-data";
import type {
  ErpProject, ErpProjectFull, ErpTask, ErpTeam, ErpTeamFull,
  ErpResource, ErpInventoryItem, ErpInventoryItemFull, ErpWorkOrder,
  ErpWorkOrderFull, ErpApprovalRequest, ErpApprovalRequestFull,
  ErpOperationalKpi, ErpOverview, ErpKpiReport,
} from "./types";

type AnyM = Record<string, (...a: unknown[]) => Promise<unknown>>;

async function m() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    proj:  d.erpProject        as AnyM | undefined,
    task:  d.erpTask           as AnyM | undefined,
    team:  d.erpTeam           as AnyM | undefined,
    res:   d.erpResource       as AnyM | undefined,
    inv:   d.erpInventoryItem  as AnyM | undefined,
    wo:    d.erpWorkOrder      as AnyM | undefined,
    apr:   d.erpApprovalRequest as AnyM | undefined,
    kpi:   d.erpOperationalKpi as AnyM | undefined,
  };
}

const iso = (v: unknown): string => v instanceof Date ? v.toISOString() : String(v);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ts  = (r: any): any => ({ ...r, createdAt: iso(r.createdAt), updatedAt: r.updatedAt ? iso(r.updatedAt) : undefined });

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getErpOverview(): Promise<ErpOverview> {
  try {
    const db = await m();
    if (db?.proj && db?.task && db?.wo && db?.apr) {
      const [projects, tasks, workOrders, approvals, inv, kpis] = await Promise.all([
        db.proj.findMany({ where: { deletedAt: null } } as never),
        db.task.findMany({ where: { deletedAt: null } } as never),
        db.wo.findMany({ where: { deletedAt: null } } as never),
        db.apr.findMany() as Promise<ErpApprovalRequest[]>,
        db.inv?.findMany({ where: { deletedAt: null } } as never),
        db.kpi?.findMany({ orderBy: { createdAt: "desc" }, take: 8 } as never),
      ]) as [ErpProject[], ErpTask[], ErpWorkOrder[], ErpApprovalRequest[], ErpInventoryItem[], ErpOperationalKpi[]];

      return buildOverview(projects, tasks, workOrders, approvals, inv ?? [], kpis ?? []);
    }
  } catch { /* fallthrough */ }

  return buildOverview(MOCK_PROJECTS, MOCK_TASKS, MOCK_WORK_ORDERS, MOCK_APPROVALS, MOCK_INVENTORY, MOCK_KPIS);
}

function buildOverview(
  projects: ErpProject[], tasks: ErpTask[], workOrders: ErpWorkOrder[],
  approvals: ErpApprovalRequest[], inv: ErpInventoryItem[], kpis: ErpOperationalKpi[]
): ErpOverview {
  const now = new Date().toISOString();
  const byProjStatus = { PLANNED: 0, ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 };
  projects.forEach(p => { byProjStatus[p.status] = (byProjStatus[p.status] ?? 0) + 1; });

  const byTaskStatus = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, REVIEW: 0, DONE: 0, CANCELLED: 0 };
  tasks.forEach(t => { byTaskStatus[t.status] = (byTaskStatus[t.status] ?? 0) + 1; });

  const byWoStatus = { OPEN: 0, ASSIGNED: 0, IN_PROGRESS: 0, WAITING_APPROVAL: 0, COMPLETED: 0, CANCELLED: 0 };
  workOrders.forEach(w => { byWoStatus[w.status] = (byWoStatus[w.status] ?? 0) + 1; });

  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalActual = projects.reduce((s, p) => s + p.actualCost, 0);
  const lowStock    = inv.filter(i => i.quantity <= i.reorderLevel);
  const overdue     = tasks.filter(t => t.dueDate && iso(t.dueDate) < now && !t.completedAt);
  const pending     = approvals.filter(a => a.status === "PENDING");
  const openWo      = workOrders.filter(w => !["COMPLETED","CANCELLED"].includes(w.status));

  const totalRes     = 8;
  const usedRes      = tasks.filter(t => t.assigneeId).length;
  const utilization  = totalRes > 0 ? Math.min(100, Math.round((usedRes / totalRes) * 100)) : 0;

  const recent = [
    ...tasks.filter(t => t.completedAt).slice(0, 3).map(t => ({ type: "task_completed", description: `Task completed: ${t.title}`, createdAt: t.completedAt! })),
    ...workOrders.filter(w => w.completedAt).slice(0, 2).map(w => ({ type: "work_order_completed", description: `Work order completed: ${w.title}`, createdAt: w.completedAt! })),
    ...approvals.filter(a => a.decidedAt).slice(0, 2).map(a => ({ type: "approval_decided", description: `Approval ${a.status.toLowerCase()}: ${a.title}`, createdAt: a.decidedAt! })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map(r => ({ ...r, createdAt: iso(r.createdAt) }));

  return {
    activeProjects:     byProjStatus.ACTIVE,
    overdueTasks:       overdue.length,
    openWorkOrders:     openWo.length,
    inventoryWarnings:  lowStock.length,
    pendingApprovals:   pending.length,
    totalBudget,
    totalActualCost:    totalActual,
    resourceUtilization: utilization,
    recentActivity:     recent,
    projectsByStatus:   byProjStatus,
    tasksByStatus:      byTaskStatus,
    workOrdersByStatus: byWoStatus,
    kpiSummary:         kpis.slice(0, 6),
  };
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(status?: string): Promise<ErpProject[]> {
  try {
    const db = await m();
    if (db?.proj) {
      const where = status ? { status, deletedAt: null } : { deletedAt: null };
      const rows = await db.proj.findMany({ where, orderBy: { updatedAt: "desc" } } as never) as ErpProject[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return status ? MOCK_PROJECTS.filter(p => p.status === status) : [...MOCK_PROJECTS];
}

export async function getProjectById(id: string): Promise<ErpProjectFull | null> {
  try {
    const db = await m();
    if (db?.proj) {
      const row = await db.proj.findFirst({
        where:   { id, deletedAt: null },
        include: { milestones: true, tasks: { where: { deletedAt: null } }, workOrders: { where: { deletedAt: null } }, costs: true },
      } as never) as ErpProjectFull | null;
      if (row) return ts(row) as ErpProjectFull;
    }
  } catch { /* fallthrough */ }
  return MOCK_PROJECTS_FULL.find(p => p.id === id) ?? null;
}

export async function createProject(data: {
  name: string; description?: string | null; status?: string;
  startDate?: string | null; endDate?: string | null; budget?: number | null;
  crmAccountId?: string | null; managerId?: string | null; createdBy?: string | null;
}): Promise<ErpProject | null> {
  try {
    const db = await m();
    if (db?.proj) {
      const row = await db.proj.create({ data: { ...data, updatedAt: new Date() } } as never) as ErpProject;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function updateProject(id: string, data: Partial<{
  name: string; description: string | null; status: string;
  endDate: string | null; budget: number | null;
}>): Promise<ErpProject | null> {
  try {
    const db = await m();
    if (db?.proj) {
      const row = await db.proj.update({ where: { id }, data: { ...data, updatedAt: new Date() } } as never) as ErpProject;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(projectId?: string, status?: string): Promise<ErpTask[]> {
  try {
    const db = await m();
    if (db?.task) {
      const where: Record<string, unknown> = { deletedAt: null };
      if (projectId) where.projectId = projectId;
      if (status)    where.status    = status;
      const rows = await db.task.findMany({ where, orderBy: { updatedAt: "desc" } } as never) as ErpTask[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let list = MOCK_TASKS;
  if (projectId) list = list.filter(t => t.projectId === projectId);
  if (status)    list = list.filter(t => t.status === status);
  return list;
}

export async function getTaskById(id: string): Promise<(ErpTask & { comments: import("./types").ErpTaskComment[] }) | null> {
  try {
    const db = await m();
    if (db?.task) {
      const row = await db.task.findFirst({
        where: { id, deletedAt: null }, include: { comments: { orderBy: { createdAt: "asc" } } },
      } as never) as (ErpTask & { comments: import("./types").ErpTaskComment[] }) | null;
      if (row) return ts(row) as typeof row;
    }
  } catch { /* fallthrough */ }
  const task = MOCK_TASKS.find(t => t.id === id);
  return task ? { ...task, comments: [] } : null;
}

export async function createTask(data: {
  title: string; description?: string | null; priority?: string;
  projectId?: string | null; teamId?: string | null; assigneeId?: string | null;
  dueDate?: string | null; estimatedHours?: number | null; createdBy?: string | null;
}): Promise<ErpTask | null> {
  try {
    const db = await m();
    if (db?.task) {
      const row = await db.task.create({ data: { ...data, updatedAt: new Date() } } as never) as ErpTask;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function updateTask(id: string, data: Partial<{
  title: string; status: string; priority: string;
  assigneeId: string | null; dueDate: string | null;
}>): Promise<ErpTask | null> {
  try {
    const db = await m();
    if (db?.task) {
      const row = await db.task.update({ where: { id }, data: { ...data, updatedAt: new Date() } } as never) as ErpTask;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<ErpTeam[]> {
  try {
    const db = await m();
    if (db?.team) {
      const rows = await db.team.findMany({ orderBy: { createdAt: "desc" } } as never) as ErpTeam[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return MOCK_TEAMS;
}

export async function getTeamById(id: string): Promise<ErpTeamFull | null> {
  try {
    const db = await m();
    if (db?.team) {
      const row = await db.team.findUnique({
        where: { id }, include: { members: true },
      } as never) as ErpTeamFull | null;
      if (row) return ts(row) as ErpTeamFull;
    }
  } catch { /* fallthrough */ }
  return MOCK_TEAMS_FULL.find(t => t.id === id) ?? null;
}

export async function createTeam(data: {
  name: string; description?: string | null; leadId?: string | null; capacity?: number;
}): Promise<ErpTeam | null> {
  try {
    const db = await m();
    if (db?.team) {
      const row = await db.team.create({ data: { ...data, updatedAt: new Date() } } as never) as ErpTeam;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Resources ─────────────────────────────────────────────────────────────────

export async function getResources(type?: string): Promise<ErpResource[]> {
  try {
    const db = await m();
    if (db?.res) {
      const where = type ? { type } : {};
      const rows = await db.res.findMany({ where, orderBy: { createdAt: "desc" } } as never) as ErpResource[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  return type ? MOCK_RESOURCES.filter(r => r.type === type) : MOCK_RESOURCES;
}

export async function createResource(data: {
  name: string; type: string; description?: string | null;
  costRate?: number | null; projectId?: string | null;
}): Promise<ErpResource | null> {
  try {
    const db = await m();
    if (db?.res) {
      const row = await db.res.create({ data: { ...data, updatedAt: new Date() } } as never) as ErpResource;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export async function getInventory(category?: string): Promise<ErpInventoryItem[]> {
  try {
    const db = await m();
    if (db?.inv) {
      const where: Record<string, unknown> = { deletedAt: null };
      if (category) where.category = category;
      const rows = await db.inv.findMany({ where, orderBy: { name: "asc" } } as never) as ErpInventoryItem[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let list = MOCK_INVENTORY.filter(i => !i.deletedAt);
  if (category) list = list.filter(i => i.category === category);
  return list;
}

export async function getInventoryById(id: string): Promise<ErpInventoryItemFull | null> {
  try {
    const db = await m();
    if (db?.inv) {
      const row = await db.inv.findFirst({
        where:   { id, deletedAt: null },
        include: { movements: { orderBy: { createdAt: "desc" }, take: 20 } },
      } as never) as ErpInventoryItemFull | null;
      if (row) return ts(row) as ErpInventoryItemFull;
    }
  } catch { /* fallthrough */ }
  return MOCK_INVENTORY_FULL.find(i => i.id === id) ?? null;
}

export async function updateInventory(id: string, data: Partial<{
  quantity: number; reserved: number; reorderLevel: number; location: string | null;
}>): Promise<ErpInventoryItem | null> {
  try {
    const db = await m();
    if (db?.inv) {
      const row = await db.inv.update({ where: { id }, data: { ...data, updatedAt: new Date() } } as never) as ErpInventoryItem;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Work Orders ───────────────────────────────────────────────────────────────

export async function getWorkOrders(status?: string, projectId?: string): Promise<ErpWorkOrder[]> {
  try {
    const db = await m();
    if (db?.wo) {
      const where: Record<string, unknown> = { deletedAt: null };
      if (status)    where.status    = status;
      if (projectId) where.projectId = projectId;
      const rows = await db.wo.findMany({ where, orderBy: { updatedAt: "desc" } } as never) as ErpWorkOrder[];
      return rows.map(ts);
    }
  } catch { /* fallthrough */ }
  let list = MOCK_WORK_ORDERS.filter(w => !w.deletedAt);
  if (status)    list = list.filter(w => w.status === status);
  if (projectId) list = list.filter(w => w.projectId === projectId);
  return list;
}

export async function getWorkOrderById(id: string): Promise<ErpWorkOrderFull | null> {
  try {
    const db = await m();
    if (db?.wo) {
      const row = await db.wo.findFirst({
        where:   { id, deletedAt: null },
        include: { activities: { orderBy: { createdAt: "asc" } } },
      } as never) as ErpWorkOrderFull | null;
      if (row) return ts(row) as ErpWorkOrderFull;
    }
  } catch { /* fallthrough */ }
  return MOCK_WORK_ORDERS_FULL.find(w => w.id === id) ?? null;
}

export async function createWorkOrder(data: {
  title: string; description?: string | null; priority?: string;
  projectId?: string | null; teamId?: string | null;
  dueDate?: string | null; requiresApproval?: boolean; createdBy?: string | null;
}): Promise<ErpWorkOrder | null> {
  try {
    const db = await m();
    if (db?.wo) {
      const row = await db.wo.create({ data: { ...data, updatedAt: new Date() } } as never) as ErpWorkOrder;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function updateWorkOrder(id: string, data: Partial<{
  status: string; priority: string; assigneeId: string | null;
  completionNote: string | null;
}>): Promise<ErpWorkOrder | null> {
  try {
    const db = await m();
    if (db?.wo) {
      const row = await db.wo.update({ where: { id }, data: { ...data, updatedAt: new Date() } } as never) as ErpWorkOrder;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovals(status?: string): Promise<ErpApprovalRequestFull[]> {
  try {
    const db = await m();
    if (db?.apr) {
      const where = status ? { status } : {};
      const rows = await db.apr.findMany({
        where, include: { steps: { orderBy: { order: "asc" } } }, orderBy: { createdAt: "desc" },
      } as never) as ErpApprovalRequestFull[];
      return rows.map(r => ts(r) as ErpApprovalRequestFull);
    }
  } catch { /* fallthrough */ }
  let list = MOCK_APPROVALS_FULL;
  if (status) list = list.filter(a => a.status === status);
  return list;
}

export async function updateApproval(id: string, data: {
  status: string; decision?: string | null; decidedBy?: string | null;
}): Promise<ErpApprovalRequest | null> {
  try {
    const db = await m();
    if (db?.apr) {
      const row = await db.apr.update({
        where: { id }, data: { ...data, decidedAt: new Date(), updatedAt: new Date() },
      } as never) as ErpApprovalRequest;
      return ts(row);
    }
  } catch { /* fallthrough */ }
  return null;
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export async function getErpKpiReport(): Promise<ErpKpiReport> {
  try {
    const db = await m();
    if (db?.kpi) {
      const rows = await db.kpi.findMany({ orderBy: { createdAt: "desc" } } as never) as ErpOperationalKpi[];
      if (rows.length > 0) return buildKpiReport(rows);
    }
  } catch { /* fallthrough */ }
  return buildKpiReport(MOCK_KPIS);
}

function buildKpiReport(kpis: ErpOperationalKpi[]): ErpKpiReport {
  const get = (cat: string, name: string) => kpis.find(k => k.category === cat && k.name.includes(name))?.value ?? 0;
  return {
    projectCompletionRate:   get("PROJECTS",   "Completion"),
    taskThroughput:          get("TASKS",      "Throughput"),
    workOrderCompletionRate: get("OPERATIONS", "Completion"),
    inventoryRisk:           get("INVENTORY",  "Risk"),
    resourceUtilization:     get("RESOURCES",  "Utilization"),
    budgetVariance:          get("FINANCE",    "Variance"),
    scheduleVariance:        get("SCHEDULE",   "Variance"),
    approvalCycleTime:       get("APPROVALS",  "Cycle"),
    kpis,
  };
}
