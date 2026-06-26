// Phase 70 — CMMS data access layer (Prisma + deterministic mock fallback)

import type {
  MaintenancePlan, MaintenanceSchedule, MaintenanceTask,
  MaintenanceFailure, MaintenanceDowntime, MaintenanceSparePart,
  MaintenanceTechnician, MaintenanceTeam, MaintenanceWorkCenter,
  MaintenanceCost, MaintenanceChecklist, MaintenanceCalendarEvent,
  FailureCode, MaintenanceHistory, MaintenanceComment, MaintenanceApproval,
  MaintenanceNotification, CmmsDashboard,
} from "./types";
import {
  MOCK_PLANS, MOCK_SCHEDULES_DATA, MOCK_TASKS, MOCK_FAILURES, MOCK_DOWNTIME,
  MOCK_SPARE_PARTS, MOCK_TECHNICIANS, MOCK_TEAMS, MOCK_WORK_CENTERS,
  MOCK_COSTS, MOCK_CALENDAR, MOCK_FAILURE_CODES, MOCK_HISTORY, MOCK_COMMENTS,
  MOCK_APPROVALS, MOCK_NOTIFICATIONS,
} from "./mock-data";
import { computeKpis, computeDowntimeTrend } from "./kpi";

function ts(rows: unknown[]): unknown[] {
  return rows.map(r => {
    const obj = r as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
  });
}

let prisma: typeof import("@prisma/client").PrismaClient.prototype | null = null;
async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!prisma) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
    } catch { return null; }
  }
  return prisma;
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function getPlans(type?: string, active?: boolean): Promise<MaintenancePlan[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenancePlan.findMany({
        where: {
          ...(type   ? { maintenanceType: type as never }   : {}),
          ...(active !== undefined ? { isActive: active } : {}),
        },
        include: { _count: { select: { tasks: true, schedules: true } } },
        orderBy: { nextDueAt: "asc" },
      });
      return ts(rows) as MaintenancePlan[];
    } catch { /* fall through */ }
  }
  let data = MOCK_PLANS;
  if (type)   data = data.filter(p => p.maintenanceType === type);
  if (active !== undefined) data = data.filter(p => p.isActive === active);
  return data;
}

export async function getPlanById(id: string): Promise<MaintenancePlan | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenancePlan.findUnique({
        where: { id },
        include: { _count: { select: { tasks: true, schedules: true } } },
      });
      return row ? (ts([row])[0] as MaintenancePlan) : null;
    } catch { /* fall through */ }
  }
  return MOCK_PLANS.find(p => p.id === id) ?? null;
}

export async function createPlan(data: Partial<MaintenancePlan>): Promise<MaintenancePlan | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenancePlan.create({ data: data as never });
      return ts([row])[0] as MaintenancePlan;
    } catch { /* fall through */ }
  }
  return null;
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export async function getSchedules(status?: string): Promise<MaintenanceSchedule[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceSchedule.findMany({
        where: status ? { status: status as never } : {},
        orderBy: { scheduledDate: "asc" },
      });
      return ts(rows) as MaintenanceSchedule[];
    } catch { /* fall through */ }
  }
  const data = MOCK_SCHEDULES_DATA;
  return status ? data.filter(s => s.status === status) : data;
}

// ── Tasks / Work Orders ───────────────────────────────────────────────────────

export async function getTasks(
  status?: string, type?: string, priority?: string, assetId?: string,
): Promise<MaintenanceTask[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceTask.findMany({
        where: {
          deletedAt: null,
          ...(status   ? { status:          status   as never } : {}),
          ...(type     ? { maintenanceType: type     as never } : {}),
          ...(priority ? { priority:        priority as never } : {}),
          ...(assetId  ? { assetId }                           : {}),
        },
        orderBy: [{ priority: "desc" }, { scheduledDate: "asc" }],
      });
      return ts(rows) as MaintenanceTask[];
    } catch { /* fall through */ }
  }
  let data = MOCK_TASKS.filter(t => !t.deletedAt);
  if (status)   data = data.filter(t => t.status          === status);
  if (type)     data = data.filter(t => t.maintenanceType === type);
  if (priority) data = data.filter(t => t.priority        === priority);
  if (assetId)  data = data.filter(t => t.assetId         === assetId);
  return data;
}

export async function getTaskById(id: string): Promise<MaintenanceTask | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceTask.findUnique({ where: { id } });
      return row ? (ts([row])[0] as MaintenanceTask) : null;
    } catch { /* fall through */ }
  }
  return MOCK_TASKS.find(t => t.id === id) ?? null;
}

export async function createTask(data: Partial<MaintenanceTask>): Promise<MaintenanceTask | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceTask.create({ data: data as never });
      return ts([row])[0] as MaintenanceTask;
    } catch { /* fall through */ }
  }
  return null;
}

export async function updateTask(id: string, data: Partial<MaintenanceTask>): Promise<MaintenanceTask | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceTask.update({ where: { id }, data: data as never });
      return ts([row])[0] as MaintenanceTask;
    } catch { /* fall through */ }
  }
  return null;
}

// ── Failures ──────────────────────────────────────────────────────────────────

export async function getFailures(severity?: string, category?: string): Promise<MaintenanceFailure[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceFailure.findMany({
        where: {
          ...(severity ? { severity: severity as never } : {}),
          ...(category ? { category: category as never } : {}),
        },
        include: { causes: true, correctiveActions: true },
        orderBy: { occurredAt: "desc" },
      });
      return ts(rows) as MaintenanceFailure[];
    } catch { /* fall through */ }
  }
  let data = MOCK_FAILURES;
  if (severity) data = data.filter(f => f.severity === severity);
  if (category) data = data.filter(f => f.category === category);
  return data;
}

export async function getFailureById(id: string): Promise<MaintenanceFailure | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceFailure.findUnique({
        where: { id },
        include: { causes: true, correctiveActions: true },
      });
      return row ? (ts([row])[0] as MaintenanceFailure) : null;
    } catch { /* fall through */ }
  }
  return MOCK_FAILURES.find(f => f.id === id) ?? null;
}

export async function createFailure(data: Partial<MaintenanceFailure>): Promise<MaintenanceFailure | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceFailure.create({ data: data as never });
      return ts([row])[0] as MaintenanceFailure;
    } catch { /* fall through */ }
  }
  return null;
}

// ── Downtime ──────────────────────────────────────────────────────────────────

export async function getDowntime(assetId?: string, reason?: string): Promise<MaintenanceDowntime[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceDowntime.findMany({
        where: {
          ...(assetId ? { assetId } : {}),
          ...(reason  ? { reason: reason as never } : {}),
        },
        orderBy: { startedAt: "desc" },
      });
      return ts(rows) as MaintenanceDowntime[];
    } catch { /* fall through */ }
  }
  let data = MOCK_DOWNTIME;
  if (assetId) data = data.filter(d => d.assetId === assetId);
  if (reason)  data = data.filter(d => d.reason  === reason);
  return data;
}

export async function createDowntime(data: Partial<MaintenanceDowntime>): Promise<MaintenanceDowntime | null> {
  const db = await getDb();
  if (db) {
    try {
      const row = await db.maintenanceDowntime.create({ data: data as never });
      return ts([row])[0] as MaintenanceDowntime;
    } catch { /* fall through */ }
  }
  return null;
}

// ── Checklists ────────────────────────────────────────────────────────────────

export async function getChecklists(taskId?: string, isTemplate?: boolean): Promise<MaintenanceChecklist[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceChecklist.findMany({
        where: {
          ...(taskId     ? { taskId }              : {}),
          ...(isTemplate !== undefined ? { isTemplate } : {}),
        },
        include: { items: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      return ts(rows) as MaintenanceChecklist[];
    } catch { /* fall through */ }
  }
  return []; // No mock checklists for brevity
}

// ── Spare Parts ───────────────────────────────────────────────────────────────

export async function getSpareParts(category?: string, lowStock?: boolean): Promise<MaintenanceSparePart[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceSparePart.findMany({
        where: {
          isActive: true,
          ...(category ? { category } : {}),
        },
        orderBy: { name: "asc" },
      });
      const parts = ts(rows) as MaintenanceSparePart[];
      return lowStock ? parts.filter(p => p.stockQty <= p.minStockQty) : parts;
    } catch { /* fall through */ }
  }
  let data = MOCK_SPARE_PARTS.filter(p => p.isActive);
  if (category) data = data.filter(p => p.category === category);
  if (lowStock)  data = data.filter(p => p.stockQty <= p.minStockQty);
  return data;
}

// ── Costs ─────────────────────────────────────────────────────────────────────

export async function getCosts(taskId?: string, category?: string): Promise<MaintenanceCost[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceCost.findMany({
        where: {
          ...(taskId   ? { taskId }   : {}),
          ...(category ? { category } : {}),
        },
        orderBy: { date: "desc" },
      });
      return ts(rows) as MaintenanceCost[];
    } catch { /* fall through */ }
  }
  let data = MOCK_COSTS;
  if (taskId)   data = data.filter(c => c.taskId   === taskId);
  if (category) data = data.filter(c => c.category === category);
  return data;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function getCalendarEvents(
  from?: string, to?: string,
): Promise<MaintenanceCalendarEvent[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceCalendar.findMany({
        where: {
          ...(from ? { startDate: { gte: new Date(from) } } : {}),
          ...(to   ? { endDate:   { lte: new Date(to)   } } : {}),
        },
        orderBy: { startDate: "asc" },
      });
      return ts(rows) as MaintenanceCalendarEvent[];
    } catch { /* fall through */ }
  }
  return MOCK_CALENDAR;
}

// ── History ───────────────────────────────────────────────────────────────────

export async function getHistory(taskId?: string, limit = 50): Promise<MaintenanceHistory[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceHistory.findMany({
        where: taskId ? { taskId } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return ts(rows) as MaintenanceHistory[];
    } catch { /* fall through */ }
  }
  const data = taskId ? MOCK_HISTORY.filter(h => h.taskId === taskId) : MOCK_HISTORY;
  return data.slice(0, limit);
}

// ── Technicians ───────────────────────────────────────────────────────────────

export async function getTechnicians(): Promise<MaintenanceTechnician[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceTechnician.findMany({ orderBy: { name: "asc" } });
      return ts(rows) as MaintenanceTechnician[];
    } catch { /* fall through */ }
  }
  return MOCK_TECHNICIANS;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<MaintenanceTeam[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceTeam.findMany({ orderBy: { name: "asc" } });
      return ts(rows) as MaintenanceTeam[];
    } catch { /* fall through */ }
  }
  return MOCK_TEAMS;
}

// ── Work Centers ──────────────────────────────────────────────────────────────

export async function getWorkCenters(): Promise<MaintenanceWorkCenter[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceWorkCenter.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      return ts(rows) as MaintenanceWorkCenter[];
    } catch { /* fall through */ }
  }
  return MOCK_WORK_CENTERS.filter(wc => wc.isActive);
}

// ── Failure Codes ─────────────────────────────────────────────────────────────

export async function getFailureCodes(): Promise<FailureCode[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.failureCode.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
      });
      return ts(rows) as FailureCode[];
    } catch { /* fall through */ }
  }
  return MOCK_FAILURE_CODES.filter(fc => fc.isActive);
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<MaintenanceComment[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceComment.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc" },
      });
      return ts(rows) as MaintenanceComment[];
    } catch { /* fall through */ }
  }
  return MOCK_COMMENTS.filter(c => c.taskId === taskId);
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovals(taskId?: string): Promise<MaintenanceApproval[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceApproval.findMany({
        where: taskId ? { taskId } : {},
        orderBy: { createdAt: "desc" },
      });
      return ts(rows) as MaintenanceApproval[];
    } catch { /* fall through */ }
  }
  return taskId ? MOCK_APPROVALS.filter(a => a.taskId === taskId) : MOCK_APPROVALS;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(userId?: string): Promise<MaintenanceNotification[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.maintenanceNotification.findMany({
        where: {
          ...(userId ? { userId } : {}),
          isRead: false,
        },
        orderBy: { sentAt: "desc" },
      });
      return ts(rows) as MaintenanceNotification[];
    } catch { /* fall through */ }
  }
  const data = userId ? MOCK_NOTIFICATIONS.filter(n => n.userId === userId) : MOCK_NOTIFICATIONS;
  return data.filter(n => !n.isRead);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboard(): Promise<CmmsDashboard> {
  const [tasks, failures, downtime, plans] = await Promise.all([
    getTasks(),
    getFailures(),
    getDowntime(),
    getPlans(),
  ]);

  void plans; // used for future plan compliance

  const kpis = computeKpis(tasks, failures, downtime);
  const downtimeTrend = computeDowntimeTrend(downtime);

  const tasksByStatus: Record<string, number> = {};
  const tasksByType:   Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};

  for (const t of tasks) {
    tasksByStatus[t.status]           = (tasksByStatus[t.status]           ?? 0) + 1;
    tasksByType[t.maintenanceType]    = (tasksByType[t.maintenanceType]    ?? 0) + 1;
    tasksByPriority[t.priority]       = (tasksByPriority[t.priority]       ?? 0) + 1;
  }

  const now = Date.now();
  const recentTasks  = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const recentFailures = [...failures]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);
  const upcomingTasks = tasks
    .filter(t => {
      const sd = t.scheduledDate ? new Date(t.scheduledDate).getTime() : 0;
      return sd >= now && ["PLANNED","SCHEDULED"].includes(t.status);
    })
    .sort((a, b) => {
      const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
      const db2 = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
      return da - db2;
    })
    .slice(0, 5);

  const costTrend: { month: string; amount: number }[] = [];

  return {
    kpis,
    tasksByStatus,
    tasksByType,
    tasksByPriority,
    recentTasks,
    recentFailures,
    upcomingTasks,
    downtimeTrend,
    costTrend,
  };
}
