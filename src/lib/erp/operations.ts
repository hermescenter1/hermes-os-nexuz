/**
 * ERP operational data access (HRIS-0.5B): projects, tasks, inventory, work
 * orders, approvals, KPIs and the overview.
 *
 * Tenant rules:
 *   - every Prisma query carries `organizationId` from the resolved ErpCtx; the
 *     child tables that carry the column are filtered on it as well;
 *   - a row whose organizationId is NULL matches no query here (fail closed);
 *   - a foreign or missing record is NOT_FOUND (404), never a different status;
 *   - cross-entity references in a body (project, team, assignee, manager) are
 *     checked inside the write transaction against the same organization.
 *
 * Compensation (financialsVisible): budget, actual cost, project cost lines,
 * unit cost, budget variance and every money total are returned only to OWNER
 * (`canViewCompensation`). For other callers those fields are `null` (never 0)
 * and the response carries `financialsVisible: false`. The value is decided here
 * on the server; no client input can widen it.
 *
 * Totals and KPIs are computed by the database (count, groupBy, aggregate and
 * one bounded SQL count per raw measure) over the whole organization. Only the
 * "recent" lists are bounded with `take`; the UI states that they are limited.
 *
 * Completion state machine (tasks and work orders): see TASK_TRANSITIONS and
 * WORK_ORDER_TRANSITIONS. completedAt is set on the first entry into the
 * completed status, kept on a repeated completed request, and cleared on reopen.
 * Historical rows are not backfilled, and duration metrics skip rows whose
 * completedAt is null (the skipped count is reported).
 *
 * Approval decisions: PENDING -> APPROVED | REJECTED only, once, with a reason,
 * a version check, and an idempotency key. The decider is the server-side user.
 *
 * Errors: a database failure surfaces as ErpError 503 SERVICE_UNAVAILABLE via
 * erpFailure(); no Prisma message ever leaves this module.
 */

import { getPrisma } from "@/lib/db/prisma";
import { runIdempotentWrite, type IdempotencyDelegate, type IdempotentSuccess } from "@/lib/idempotency/transactional";
import type { ErpCtx } from "./db";
import { ErpError } from "./tenant";
import { CHILD_DETAIL_PAGE, cursorArgs, pageOf, type ChildListQuery, type ChildPage } from "./pagination";
import type {
  ApprovalDecisionInput,
  ApprovalListQuery,
  InventoryCreateInput,
  InventoryListQuery,
  InventoryUpdateInput,
  ProjectCreateInput,
  ProjectListQuery,
  ProjectUpdateInput,
  TaskCreateInput,
  TaskListQuery,
  TaskUpdateInput,
  WorkOrderCreateInput,
  WorkOrderListQuery,
  WorkOrderUpdateInput,
} from "./ops-schemas";
import type {
  ErpApprovalRequest,
  ErpApprovalStatus,
  ErpApprovalStep,
  ErpInventoryItem,
  ErpInventoryMovement,
  ErpOperationalKpi,
  ErpOverview,
  ErpProject,
  ErpProjectCost,
  ErpProjectMilestone,
  ErpProjectStatus,
  ErpTask,
  ErpTaskComment,
  ErpTaskPriority,
  ErpTaskStatus,
  ErpWorkOrder,
  ErpWorkOrderActivity,
  ErpWorkOrderStatus,
} from "./types";

// ── View types (financial and utilization fields are nullable by design) ─────

/** A project as seen by this caller. `budget` and `actualCost` are null unless financialsVisible. */
export interface ErpProjectView extends Omit<ErpProject, "actualCost"> {
  actualCost: number | null;
  financialsVisible: boolean;
}

export interface ErpProjectFullView extends ErpProjectView {
  /** First page of each child collection. Use the project's child GET routes to continue. */
  milestones: ChildPage<ErpProjectMilestone>;
  tasks: ChildPage<ErpTask>;
  workOrders: ChildPage<ErpWorkOrder>;
  /** Cost lines: null (not an empty page) when the caller cannot see financials. */
  costs: ChildPage<ErpProjectCost> | null;
  /** Whole-project task counts from the database, never counted from a page. */
  taskSummary: { total: number; done: number };
  /** Sum of every cost line from the database; null without financial access. */
  costTotal: number | null;
}

export interface ErpInventoryItemView extends ErpInventoryItem {
  financialsVisible: boolean;
}

export interface ErpInventoryItemFullView extends ErpInventoryItemView {
  movements: ChildPage<ErpInventoryMovement>;
}

/** An approval request with the first page of its steps. */
export type ErpApprovalRequestView = ErpApprovalRequest & { steps: ChildPage<ErpApprovalStep> };

export interface ErpOperationalKpiView extends Omit<ErpOperationalKpi, "value"> {
  /** Null for FINANCE rows when the caller cannot see financials. */
  value: number | null;
}

export const UTILIZATION_INSUFFICIENT_DATA = "INSUFFICIENT_DATA" as const;

export interface ErpOverviewView extends Omit<ErpOverview, "totalBudget" | "totalActualCost" | "resourceUtilization" | "kpiSummary"> {
  totalBudget: number | null;
  totalActualCost: number | null;
  financialsVisible: boolean;
  /** Always null until an allocation model exists (the schema has none). */
  resourceUtilization: null;
  utilizationStatus: typeof UTILIZATION_INSUFFICIENT_DATA;
  /** Real count of distinct members in ERP teams. Labelled Team Size, never used as a denominator. */
  teamSize: number;
  kpiSummary: ErpOperationalKpiView[];
  /** The kpiSummary list is the latest N rows only. */
  kpiSummaryLimit: number;
  /** The recentActivity list is the latest N events only. */
  recentActivityLimit: number;
}

export interface CompletionDurationMetric {
  /** Average hours from creation to completion over rows with completedAt set; null when none. */
  averageHours: number | null;
  measuredRows: number;
  /** Rows in a completed status whose completedAt is null. They are excluded from the average. */
  skippedRows: number;
}

export interface ErpKpiReportView {
  financialsVisible: boolean;
  projectCompletionRate: number | null;
  taskThroughput: number | null;
  workOrderCompletionRate: number | null;
  inventoryRisk: number | null;
  /** Always null: the schema has no allocation model. */
  resourceUtilization: null;
  utilizationStatus: typeof UTILIZATION_INSUFFICIENT_DATA;
  budgetVariance: number | null;
  scheduleVariance: number | null;
  approvalCycleTime: number | null;
  completionDurations: { tasks: CompletionDurationMetric; workOrders: CompletionDurationMetric };
  kpis: ErpOperationalKpiView[];
  /** The kpis list is the latest N rows only. */
  kpisLimit: number;
}

// ── Limits ───────────────────────────────────────────────────────────────────

/** The KPI list shown on the report is the latest rows only (the UI states this). */
export const KPI_RECENT_LIMIT = 20;
/** Overview recent lists. */
const OVERVIEW_RECENT_ACTIVITY = 8;
const OVERVIEW_KPI_SUMMARY = 6;

// ── Transition tables (completion state machine) ─────────────────────────────

/**
 * Allowed task status transitions. A request for the current status is accepted
 * as a no-op (completedAt is kept). Any pair not listed here is refused with 422.
 */
export const TASK_TRANSITIONS: Readonly<Record<ErpTaskStatus, readonly ErpTaskStatus[]>> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["TODO", "BLOCKED", "REVIEW", "DONE", "CANCELLED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "CANCELLED"],
  REVIEW: ["IN_PROGRESS", "DONE", "CANCELLED"],
  DONE: ["IN_PROGRESS", "REVIEW"],
  CANCELLED: ["TODO"],
};

/** Allowed work order status transitions. Same no-op and refusal rules as tasks. */
export const WORK_ORDER_TRANSITIONS: Readonly<Record<ErpWorkOrderStatus, readonly ErpWorkOrderStatus[]>> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["OPEN", "IN_PROGRESS", "WAITING_APPROVAL", "CANCELLED"],
  IN_PROGRESS: ["ASSIGNED", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"],
  WAITING_APPROVAL: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
};

/**
 * Allowed project status transitions. A project is created PLANNED or ACTIVE (see
 * PROJECT_INITIAL_STATUSES); every later change must be one of these edges. A request
 * for the current status is a no-op. Any other pair is refused with 422.
 */
export const PROJECT_TRANSITIONS: Readonly<Record<ErpProjectStatus, readonly ErpProjectStatus[]>> = {
  PLANNED: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: ["PLANNED"],
};

const TASK_COMPLETED: ErpTaskStatus = "DONE";
const TASK_CANCELLED: ErpTaskStatus = "CANCELLED";
const WORK_ORDER_COMPLETED: ErpWorkOrderStatus = "COMPLETED";

/** Refuses a status change that the transition table does not allow. */
function assertTransition<S extends string>(table: Readonly<Record<S, readonly S[]>>, from: S, to: S): void {
  if (from === to) return;
  if (!table[from]?.includes(to)) throw new ErpError(422, "INVALID_REQUEST");
}

/**
 * completedAt for a status change. Entering the completed status stamps now;
 * a repeated completed request keeps the original stamp; any non-completed
 * status clears it (reopen).
 */
function completedAtFor(
  from: string,
  to: string,
  completed: string,
  previous: Date | null,
  now: Date,
): Date | null {
  if (to !== completed) return null;
  return from === completed ? previous : now;
}

// ── Client ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { id: string };

interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  create(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
  groupBy(args: unknown): Promise<Array<Record<string, unknown>>>;
  aggregate(args: unknown): Promise<Record<string, unknown>>;
}

interface OpsTx {
  erpProject: Delegate;
  erpProjectMilestone: Delegate;
  erpProjectCost: Delegate;
  erpTask: Delegate;
  erpTaskComment: Delegate;
  erpTeam: Delegate;
  erpTeamMember: Delegate;
  erpInventoryItem: Delegate;
  erpInventoryMovement: Delegate;
  erpWorkOrder: Delegate;
  erpWorkOrderActivity: Delegate;
  erpApprovalRequest: Delegate;
  erpApprovalStep: Delegate;
  erpOperationalKpi: Delegate;
  organizationMember: Delegate;
  auditLog: { create(args: unknown): Promise<unknown> };
  idempotencyKey: IdempotencyDelegate;
}

type OpsClient = OpsTx & {
  $transaction<R>(fn: (tx: OpsTx) => Promise<R>): Promise<R>;
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

async function client(): Promise<OpsClient> {
  const prisma = await getPrisma();
  if (!prisma) throw new ErpError(503, "SERVICE_UNAVAILABLE");
  return prisma as unknown as OpsClient;
}

// ── Mapping (explicit fields only; never a raw row) ──────────────────────────

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toDate = (s: string | null | undefined): Date | null => (s ? new Date(s) : null);
const countOf = (v: unknown): number => Number(v ?? 0);

function toMilestone(row: Row): ErpProjectMilestone {
  return {
    id: row.id,
    projectId: row.projectId as string,
    name: row.name as string,
    description: strOrNull(row.description),
    dueDate: isoOrNull(row.dueDate),
    completedAt: isoOrNull(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toCost(row: Row): ErpProjectCost {
  return {
    id: row.id,
    projectId: row.projectId as string,
    description: row.description as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    category: strOrNull(row.category),
    date: iso(row.date),
    createdBy: strOrNull(row.createdBy),
    createdAt: iso(row.createdAt),
  };
}

function toProject(row: Row, canViewCompensation: boolean): ErpProjectView {
  return {
    id: row.id,
    organizationId: strOrNull(row.organizationId),
    name: row.name as string,
    description: strOrNull(row.description),
    status: row.status as ErpProjectStatus,
    startDate: isoOrNull(row.startDate),
    endDate: isoOrNull(row.endDate),
    budget: canViewCompensation ? numOrNull(row.budget) : null,
    actualCost: canViewCompensation ? Number(row.actualCost) : null,
    crmAccountId: strOrNull(row.crmAccountId),
    crmOpportunityId: strOrNull(row.crmOpportunityId),
    managerId: strOrNull(row.managerId),
    createdBy: strOrNull(row.createdBy),
    deletedAt: isoOrNull(row.deletedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version as number,
    financialsVisible: canViewCompensation,
  };
}

function toTask(row: Row): ErpTask {
  return {
    id: row.id,
    projectId: strOrNull(row.projectId),
    teamId: strOrNull(row.teamId),
    assigneeId: strOrNull(row.assigneeId),
    createdBy: strOrNull(row.createdBy),
    title: row.title as string,
    description: strOrNull(row.description),
    status: row.status as ErpTaskStatus,
    priority: row.priority as ErpTaskPriority,
    dueDate: isoOrNull(row.dueDate),
    completedAt: isoOrNull(row.completedAt),
    estimatedHours: numOrNull(row.estimatedHours),
    actualHours: numOrNull(row.actualHours),
    deletedAt: isoOrNull(row.deletedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version as number,
  };
}

function toTaskComment(row: Row): ErpTaskComment {
  return {
    id: row.id,
    taskId: row.taskId as string,
    userId: strOrNull(row.userId),
    content: row.content as string,
    createdAt: iso(row.createdAt),
  };
}

function toInventory(row: Row, canViewCompensation: boolean): ErpInventoryItemView {
  return {
    id: row.id,
    organizationId: strOrNull(row.organizationId),
    sku: row.sku as string,
    name: row.name as string,
    category: strOrNull(row.category),
    description: strOrNull(row.description),
    quantity: row.quantity as number,
    reserved: row.reserved as number,
    reorderLevel: row.reorderLevel as number,
    unitCost: canViewCompensation ? numOrNull(row.unitCost) : null,
    currency: row.currency as string,
    location: strOrNull(row.location),
    deletedAt: isoOrNull(row.deletedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version as number,
    financialsVisible: canViewCompensation,
  };
}

function toMovement(row: Row): ErpInventoryMovement {
  return {
    id: row.id,
    itemId: row.itemId as string,
    type: row.type as ErpInventoryMovement["type"],
    quantity: row.quantity as number,
    reason: strOrNull(row.reason),
    reference: strOrNull(row.reference),
    createdBy: strOrNull(row.createdBy),
    createdAt: iso(row.createdAt),
  };
}

function toWorkOrder(row: Row): ErpWorkOrder {
  return {
    id: row.id,
    organizationId: strOrNull(row.organizationId),
    projectId: strOrNull(row.projectId),
    teamId: strOrNull(row.teamId),
    title: row.title as string,
    description: strOrNull(row.description),
    status: row.status as ErpWorkOrderStatus,
    priority: row.priority as ErpTaskPriority,
    assigneeId: strOrNull(row.assigneeId),
    createdBy: strOrNull(row.createdBy),
    dueDate: isoOrNull(row.dueDate),
    completedAt: isoOrNull(row.completedAt),
    completionNote: strOrNull(row.completionNote),
    requiresApproval: row.requiresApproval as boolean,
    deletedAt: isoOrNull(row.deletedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version as number,
  };
}

function toActivity(row: Row): ErpWorkOrderActivity {
  return {
    id: row.id,
    workOrderId: row.workOrderId as string,
    userId: strOrNull(row.userId),
    action: row.action as string,
    notes: strOrNull(row.notes),
    createdAt: iso(row.createdAt),
  };
}

/** KPI rows in the FINANCE category are money-bearing: hidden from callers without compensation access. */
function toKpi(row: Row, canViewCompensation: boolean): ErpOperationalKpiView {
  const category = row.category as string;
  const financial = category === "FINANCE";
  return {
    id: row.id,
    projectId: strOrNull(row.projectId),
    name: row.name as string,
    value: financial && !canViewCompensation ? null : Number(row.value),
    target: financial && !canViewCompensation ? null : numOrNull(row.target),
    unit: strOrNull(row.unit),
    category,
    periodStart: isoOrNull(row.periodStart),
    periodEnd: isoOrNull(row.periodEnd),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toApproval(row: Row): ErpApprovalRequest {
  return {
    id: row.id,
    organizationId: strOrNull(row.organizationId),
    projectId: strOrNull(row.projectId),
    workOrderId: strOrNull(row.workOrderId),
    requestedBy: strOrNull(row.requestedBy),
    title: row.title as string,
    description: strOrNull(row.description),
    status: row.status as ErpApprovalStatus,
    decidedAt: isoOrNull(row.decidedAt),
    decidedBy: strOrNull(row.decidedBy),
    decision: strOrNull(row.decision),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version as number,
  };
}

function toStep(row: Row): ErpApprovalStep {
  return {
    id: row.id,
    requestId: row.requestId as string,
    order: row.order as number,
    approverRole: row.approverRole as string,
    status: row.status as ErpApprovalStatus,
    decidedBy: strOrNull(row.decidedBy),
    decidedAt: isoOrNull(row.decidedAt),
    notes: strOrNull(row.notes),
    createdAt: iso(row.createdAt),
  };
}

// ── Shared write plumbing ────────────────────────────────────────────────────

/**
 * Audit row written inside the same transaction. Sensitive values are never
 * stored: a field is named in changedFields, its value is not.
 */
async function audit(
  tx: OpsTx,
  ctx: ErpCtx,
  args: {
    action: string;
    entityType: string;
    entityId: string;
    changedFields: string[];
    before?: object;
    after?: object;
    reason?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: ctx.scope.userId,
      organizationId: ctx.scope.organizationId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      outcome: "SUCCESS",
      correlationId: ctx.correlationId,
      metadata: {
        changedFields: args.changedFields,
        before: args.before ?? null,
        after: args.after ?? null,
        reason: args.reason ?? null,
      },
    },
  });
}

function assertCompensationAccess(ctx: ErpCtx, touched: boolean): void {
  if (touched && !ctx.scope.canViewCompensation) throw new ErpError(403, "FORBIDDEN");
}

function idempotencyFailure(reason: "KEY_INVALID" | "KEY_REUSED"): never {
  if (reason === "KEY_INVALID") throw new ErpError(400, "IDEMPOTENCY_KEY_INVALID");
  throw new ErpError(409, "IDEMPOTENCY_KEY_REUSED");
}

async function requireKey(ctx: ErpCtx): Promise<string> {
  if (!ctx.idempotencyKey) throw new ErpError(400, "IDEMPOTENCY_KEY_INVALID");
  return ctx.idempotencyKey;
}

/** Names of the fields of a validated input that were actually supplied. */
function suppliedKeys(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter(k => input[k] !== undefined);
}

/** A reference supplied by the client must exist, be live, and belong to this organization. */
async function assertOwned(delegate: Delegate, organizationId: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const row = await delegate.findFirst({ where: { id, organizationId, ...extra } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
}

/** An assignee or manager must be an ACTIVE member of this organization. */
async function assertActiveMember(tx: OpsTx, organizationId: string, userId: string): Promise<void> {
  const member = await tx.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE" } });
  if (!member) throw new ErpError(422, "MEMBER_NOT_IN_ORGANIZATION");
}

interface IdempotentCreate<T> {
  operation: string;
  entityType: string;
  action: string;
  payload: Record<string, unknown>;
  changedFields: string[];
  after: Record<string, unknown>;
  create: (tx: OpsTx) => Promise<Row>;
  map: (row: Row) => T;
  replay: (c: OpsClient, id: string) => Promise<Row | null>;
}

/** Create inside one transaction: mutation + audit row + idempotency key row. */
async function idempotentCreate<T>(ctx: ErpCtx, args: IdempotentCreate<T>): Promise<IdempotentSuccess<T>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const outcome = await runIdempotentWrite<T, OpsTx>({
    store: c,
    organizationId,
    actorUserId: ctx.scope.userId,
    operation: args.operation,
    rawKey: await requireKey(ctx),
    payload: args.payload,
    write: async tx => {
      const row = await args.create(tx);
      await audit(tx, ctx, {
        action: args.action,
        entityType: args.entityType,
        entityId: row.id,
        changedFields: args.changedFields,
        after: args.after,
      });
      return { resultType: args.entityType, resultId: row.id, value: args.map(row) };
    },
    replay: async (_type, id) => {
      const row = await args.replay(c, id);
      return row ? args.map(row) : null;
    },
  });
  if (outcome.kind === "refused") idempotencyFailure(outcome.reason);
  return outcome;
}

type VersionedModel = "erpProject" | "erpTask" | "erpInventoryItem" | "erpWorkOrder" | "erpApprovalRequest";

interface VersionedUpdate<T> {
  model: VersionedModel;
  /** Soft-deleted rows are not updatable when true. */
  softDelete: boolean;
  action: string;
  entityType: string;
  expectedVersion: number;
  /**
   * The column changes. A function receives the locked-in-transaction `before`
   * row and may refuse (throw) before any write: an invalid transition is a 422.
   */
  changes: Record<string, unknown> | ((before: Row, now: Date) => Record<string, unknown>);
  snapshot: (row: Row) => Record<string, unknown>;
  map: (row: Row) => T;
  beforeWrite?: (tx: OpsTx) => Promise<void>;
  reason?: string | null;
}

/**
 * Optimistic concurrency: the version in the where clause makes a stale write
 * affect zero rows, which is a 409 and never a silent overwrite. The audit row
 * is written in the same transaction, so a failed audit rolls the change back.
 */
async function versionedUpdate<T>(ctx: ErpCtx, id: string, u: VersionedUpdate<T>): Promise<T> {
  const c = await client();
  const scope: Record<string, unknown> = { id, organizationId: ctx.scope.organizationId, ...(u.softDelete ? { deletedAt: null } : {}) };
  return c.$transaction(async tx => {
    const delegate = tx[u.model];
    const before = await delegate.findFirst({ where: scope });
    if (!before) throw new ErpError(404, "NOT_FOUND");
    if (before.version !== u.expectedVersion) throw new ErpError(409, "VERSION_CONFLICT");
    const now = new Date();
    const changes = typeof u.changes === "function" ? u.changes(before, now) : u.changes;
    if (u.beforeWrite) await u.beforeWrite(tx);

    const res = await delegate.updateMany({
      where: { ...scope, version: u.expectedVersion },
      data: { ...changes, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ErpError(409, "VERSION_CONFLICT");

    const after = await delegate.findFirst({ where: scope });
    if (!after) throw new ErpError(404, "NOT_FOUND");
    await audit(tx, ctx, {
      action: u.action,
      entityType: u.entityType,
      entityId: id,
      changedFields: Object.keys(changes),
      before: u.snapshot(before),
      after: u.snapshot(after),
      reason: u.reason ?? null,
    });
    return u.map(after);
  });
}

// ── Overview and KPIs: database aggregates over the whole organization ───────

/** Live status counts for one organization, computed by the database. */
async function countByStatus(d: Delegate, where: Record<string, unknown>): Promise<Record<string, number>> {
  const rows = await d.groupBy({ by: ["status"], where, _count: { _all: true } });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const n = (r._count as { _all?: unknown } | undefined)?._all;
    out[String(r.status)] = countOf(n);
  }
  return out;
}

const sumOf = (counts: Record<string, number>): number => Object.values(counts).reduce((s, n) => s + n, 0);

function zeroed<K extends string>(keys: readonly K[], counts: Record<string, number>): Record<K, number> {
  return Object.fromEntries(keys.map(k => [k, counts[k] ?? 0])) as Record<K, number>;
}

const PROJECT_STATUSES_ALL: readonly ErpProjectStatus[] = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const TASK_STATUSES_ALL: readonly ErpTaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE", "CANCELLED"];
const WO_STATUSES_ALL: readonly ErpWorkOrderStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"];

/** Raw measures that Prisma cannot express (column-to-column comparison, distinct count). */
async function lowStockCount(c: OpsClient, organizationId: string): Promise<number> {
  const rows = await c.$queryRaw<{ n: unknown }>`
    SELECT COUNT(*) AS n FROM "ErpInventoryItem"
    WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "quantity" <= "reorderLevel"`;
  return countOf(rows[0]?.n);
}

async function teamSizeCount(c: OpsClient, organizationId: string): Promise<number> {
  const rows = await c.$queryRaw<{ n: unknown }>`
    SELECT COUNT(DISTINCT "userId") AS n FROM "ErpTeamMember" WHERE "organizationId" = ${organizationId}`;
  return countOf(rows[0]?.n);
}

/**
 * Overview aggregates. Returns null when the organization has no operational
 * rows at all, so the page renders its empty state instead of zero tiles.
 */
export async function getErpOverview(ctx: ErpCtx): Promise<ErpOverviewView | null> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const canView = ctx.scope.canViewCompensation;
  const now = new Date();
  const live = { organizationId, deletedAt: null };

  const [projectCounts, taskCounts, woCounts, approvalCounts, invTotal, kpiTotal, lowStock, teamSize, overdueTasks] = await Promise.all([
    countByStatus(c.erpProject, live),
    countByStatus(c.erpTask, live),
    countByStatus(c.erpWorkOrder, live),
    countByStatus(c.erpApprovalRequest, { organizationId }),
    c.erpInventoryItem.count({ where: live }),
    c.erpOperationalKpi.count({ where: { organizationId } }),
    lowStockCount(c, organizationId),
    teamSizeCount(c, organizationId),
    // Overdue means open work: a finished (DONE) or cancelled task is never overdue.
    c.erpTask.count({ where: { ...live, dueDate: { lt: now }, status: { notIn: [TASK_COMPLETED, TASK_CANCELLED] } } }),
  ]);

  const total = sumOf(projectCounts) + sumOf(taskCounts) + sumOf(woCounts) + sumOf(approvalCounts) + countOf(invTotal) + countOf(kpiTotal);
  if (total === 0) return null;

  // Each event list is bounded by the same N, so the merged and sorted list below
  // is the true latest N events across the three types, not a per-type approximation.
  const [money, recentTasks, recentWorkOrders, recentApprovals, kpiRows] = await Promise.all([
    canView ? c.erpProject.aggregate({ where: live, _sum: { budget: true, actualCost: true } }) : Promise.resolve(null),
    c.erpTask.findMany({ where: { ...live, completedAt: { not: null } }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: OVERVIEW_RECENT_ACTIVITY }),
    c.erpWorkOrder.findMany({ where: { ...live, completedAt: { not: null } }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: OVERVIEW_RECENT_ACTIVITY }),
    c.erpApprovalRequest.findMany({
      where: { organizationId, decidedAt: { not: null } },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: OVERVIEW_RECENT_ACTIVITY,
    }),
    c.erpOperationalKpi.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: OVERVIEW_KPI_SUMMARY }),
  ]);

  const projectsByStatus = zeroed(PROJECT_STATUSES_ALL, projectCounts);
  const tasksByStatus = zeroed(TASK_STATUSES_ALL, taskCounts);
  const workOrdersByStatus = zeroed(WO_STATUSES_ALL, woCounts);
  const openWorkOrders = sumOf(woCounts) - (woCounts.COMPLETED ?? 0) - (woCounts.CANCELLED ?? 0);

  const sum = (key: "budget" | "actualCost"): number | null => {
    const agg = (money as { _sum?: Record<string, unknown> } | null)?._sum;
    return agg ? countOrNumber(agg[key]) : null;
  };

  const recent = [
    ...recentTasks.map(t => ({ type: "task_completed", description: `Task completed: ${String(t.title)}`, createdAt: iso(t.completedAt) })),
    ...recentWorkOrders.map(w => ({ type: "work_order_completed", description: `Work order completed: ${String(w.title)}`, createdAt: iso(w.completedAt) })),
    ...recentApprovals.map(a => ({
      type: "approval_decided",
      description: `Approval ${String(a.status).toLowerCase()}: ${String(a.title)}`,
      createdAt: iso(a.decidedAt),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, OVERVIEW_RECENT_ACTIVITY);

  return {
    activeProjects: projectsByStatus.ACTIVE,
    overdueTasks: countOf(overdueTasks),
    openWorkOrders,
    inventoryWarnings: lowStock,
    pendingApprovals: approvalCounts.PENDING ?? 0,
    totalBudget: canView ? sum("budget") ?? 0 : null,
    totalActualCost: canView ? sum("actualCost") ?? 0 : null,
    financialsVisible: canView,
    resourceUtilization: null,
    utilizationStatus: UTILIZATION_INSUFFICIENT_DATA,
    teamSize,
    recentActivity: recent,
    projectsByStatus,
    tasksByStatus,
    workOrdersByStatus,
    kpiSummary: kpiRows.map(r => toKpi(r, canView)),
    kpiSummaryLimit: OVERVIEW_KPI_SUMMARY,
    recentActivityLimit: OVERVIEW_RECENT_ACTIVITY,
  };
}

function countOrNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(ctx: ErpCtx, q: ProjectListQuery): Promise<ChildPage<ErpProjectView>> {
  const c = await client();
  const where = { organizationId: ctx.scope.organizationId, deletedAt: null, ...(q.status ? { status: q.status } : {}) };
  // A cursor must name a row of this list; anything else is refused rather than continued.
  if (q.cursor && !(await c.erpProject.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } }))) {
    throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpProject.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, r => toProject(r, ctx.scope.canViewCompensation));
}

/**
 * Project with the first page of its milestones, live tasks, work orders and cost
 * lines. Counts and cost totals are database aggregates over the whole project; a
 * page is never summed. Cost lines are null for callers without financial access.
 */
export async function getProjectById(ctx: ErpCtx, id: string): Promise<ErpProjectFullView> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const canView = ctx.scope.canViewCompensation;
  const row = await c.erpProject.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  const take = CHILD_DETAIL_PAGE + 1;
  const [milestones, tasks, workOrders, taskTotal, taskDone, costs, costSum] = await Promise.all([
    c.erpProjectMilestone.findMany({
      where: { projectId: id, organizationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    }),
    c.erpTask.findMany({
      where: { projectId: id, organizationId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
    }),
    c.erpWorkOrder.findMany({
      where: { projectId: id, organizationId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take,
    }),
    c.erpTask.count({ where: { projectId: id, organizationId, deletedAt: null } }),
    c.erpTask.count({ where: { projectId: id, organizationId, deletedAt: null, status: TASK_COMPLETED } }),
    canView
      ? c.erpProjectCost.findMany({ where: { projectId: id, organizationId }, orderBy: [{ date: "desc" }, { id: "desc" }], take })
      : Promise.resolve(null),
    canView ? c.erpProjectCost.aggregate({ where: { projectId: id, organizationId }, _sum: { amount: true } }) : Promise.resolve(null),
  ]);
  const sum = (costSum as { _sum?: { amount?: unknown } } | null)?._sum?.amount;
  return {
    ...toProject(row, canView),
    milestones: pageOf(milestones, CHILD_DETAIL_PAGE, toMilestone),
    tasks: pageOf(tasks, CHILD_DETAIL_PAGE, toTask),
    workOrders: pageOf(workOrders, CHILD_DETAIL_PAGE, toWorkOrder),
    costs: costs ? pageOf(costs, CHILD_DETAIL_PAGE, toCost) : null,
    taskSummary: { total: taskTotal, done: taskDone },
    costTotal: canView ? countOrNumber(sum) ?? 0 : null,
  };
}

// ── Child collections: one parent, one ordered list, cursor-continued ────────

interface ChildSpec<T> {
  delegate: Delegate;
  where: Record<string, unknown>;
  orderBy: unknown[];
  map: (row: Row) => T;
}

/**
 * Next page of a child collection. The cursor must be a row of THIS collection
 * (same parent, same organization), otherwise 400: a foreign cursor cannot walk
 * another tenant's ordering.
 */
async function listChild<T>(q: ChildListQuery, spec: ChildSpec<T>): Promise<ChildPage<T>> {
  if (q.cursor) {
    const anchor = await spec.delegate.findFirst({ where: { ...spec.where, id: q.cursor } });
    if (!anchor) throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await spec.delegate.findMany({
    where: spec.where,
    orderBy: spec.orderBy,
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  return pageOf(rows, q.limit, spec.map);
}

export async function listProjectMilestones(ctx: ErpCtx, projectId: string, q: ChildListQuery): Promise<ChildPage<ErpProjectMilestone>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpProject, organizationId, projectId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpProjectMilestone,
    where: { projectId, organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    map: toMilestone,
  });
}

/** Cost lines are money: a caller without compensation access is refused (403), never given an empty page. */
export async function listProjectCosts(ctx: ErpCtx, projectId: string, q: ChildListQuery): Promise<ChildPage<ErpProjectCost>> {
  if (!ctx.scope.canViewCompensation) throw new ErpError(403, "FORBIDDEN");
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpProject, organizationId, projectId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpProjectCost,
    where: { projectId, organizationId },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    map: toCost,
  });
}

export async function listProjectTasks(ctx: ErpCtx, projectId: string, q: ChildListQuery): Promise<ChildPage<ErpTask>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpProject, organizationId, projectId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpTask,
    where: { projectId, organizationId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    map: toTask,
  });
}

export async function listProjectWorkOrders(ctx: ErpCtx, projectId: string, q: ChildListQuery): Promise<ChildPage<ErpWorkOrder>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpProject, organizationId, projectId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpWorkOrder,
    where: { projectId, organizationId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    map: toWorkOrder,
  });
}

export async function listTaskComments(ctx: ErpCtx, taskId: string, q: ChildListQuery): Promise<ChildPage<ErpTaskComment>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpTask, organizationId, taskId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpTaskComment,
    where: { taskId, organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    map: toTaskComment,
  });
}

export async function listWorkOrderActivities(ctx: ErpCtx, workOrderId: string, q: ChildListQuery): Promise<ChildPage<ErpWorkOrderActivity>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpWorkOrder, organizationId, workOrderId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpWorkOrderActivity,
    where: { workOrderId, organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    map: toActivity,
  });
}

export async function listInventoryMovements(ctx: ErpCtx, itemId: string, q: ChildListQuery): Promise<ChildPage<ErpInventoryMovement>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpInventoryItem, organizationId, itemId, { deletedAt: null });
  return listChild(q, {
    delegate: c.erpInventoryMovement,
    where: { itemId, organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    map: toMovement,
  });
}

export async function listApprovalSteps(ctx: ErpCtx, approvalId: string, q: ChildListQuery): Promise<ChildPage<ErpApprovalStep>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  await assertOwned(c.erpApprovalRequest, organizationId, approvalId);
  return listChild(q, {
    delegate: c.erpApprovalStep,
    where: { requestId: approvalId, organizationId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    map: toStep,
  });
}

export async function createProject(ctx: ErpCtx, input: ProjectCreateInput): Promise<IdempotentSuccess<ErpProjectView>> {
  assertCompensationAccess(ctx, input.budget !== undefined);
  const organizationId = ctx.scope.organizationId;
  const canView = ctx.scope.canViewCompensation;
  return idempotentCreate(ctx, {
    operation: "erp.project.create",
    entityType: "ErpProject",
    action: "erp.project.create",
    payload: input,
    changedFields: suppliedKeys(input),
    after: { status: input.status ?? "PLANNED" },
    create: async tx => {
      if (input.managerId) await assertActiveMember(tx, organizationId, input.managerId);
      return tx.erpProject.create({
        data: {
          organizationId,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "PLANNED",
          startDate: toDate(input.startDate),
          endDate: toDate(input.endDate),
          budget: input.budget ?? null,
          managerId: input.managerId ?? null,
          createdBy: ctx.scope.userId,
        },
      });
    },
    map: row => toProject(row, canView),
    replay: (c, id) => c.erpProject.findFirst({ where: { id, organizationId, deletedAt: null } }),
  });
}

export async function updateProject(ctx: ErpCtx, id: string, input: ProjectUpdateInput): Promise<ErpProjectView> {
  assertCompensationAccess(ctx, input.budget !== undefined);
  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.description !== undefined) changes.description = input.description;
  if (input.status !== undefined) changes.status = input.status;
  if (input.endDate !== undefined) changes.endDate = toDate(input.endDate);
  if (input.budget !== undefined) changes.budget = input.budget;
  const canView = ctx.scope.canViewCompensation;
  return versionedUpdate(ctx, id, {
    model: "erpProject",
    softDelete: true,
    action: "erp.project.update",
    entityType: "ErpProject",
    expectedVersion: input.version,
    // The stored start date is the only other date that can be compared with the new end date.
    changes: before => {
      const start = before.startDate instanceof Date ? before.startDate : null;
      if (input.endDate && start && Date.parse(input.endDate) < start.getTime()) throw new ErpError(422, "INVALID_REQUEST");
      if (input.status !== undefined) assertTransition(PROJECT_TRANSITIONS, before.status as ErpProjectStatus, input.status);
      return changes;
    },
    snapshot: row => ({ status: row.status }),
    map: row => toProject(row, canView),
  });
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(ctx: ErpCtx, q: TaskListQuery): Promise<ChildPage<ErpTask>> {
  const c = await client();
  const where = {
    organizationId: ctx.scope.organizationId,
    deletedAt: null,
    ...(q.projectId ? { projectId: q.projectId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  if (q.cursor && !(await c.erpTask.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } }))) {
    throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpTask.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, toTask);
}

export async function getTaskById(ctx: ErpCtx, id: string): Promise<ErpTask & { comments: ChildPage<ErpTaskComment> }> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const row = await c.erpTask.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  const comments = await c.erpTaskComment.findMany({
    where: { taskId: id, organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: CHILD_DETAIL_PAGE + 1,
  });
  return { ...toTask(row), comments: pageOf(comments, CHILD_DETAIL_PAGE, toTaskComment) };
}

export async function createTask(ctx: ErpCtx, input: TaskCreateInput): Promise<IdempotentSuccess<ErpTask>> {
  const organizationId = ctx.scope.organizationId;
  return idempotentCreate(ctx, {
    operation: "erp.task.create",
    entityType: "ErpTask",
    action: "erp.task.create",
    payload: input,
    changedFields: suppliedKeys(input),
    after: { priority: input.priority ?? "MEDIUM" },
    create: async tx => {
      if (input.projectId) await assertOwned(tx.erpProject, organizationId, input.projectId, { deletedAt: null });
      if (input.teamId) await assertOwned(tx.erpTeam, organizationId, input.teamId);
      if (input.assigneeId) await assertActiveMember(tx, organizationId, input.assigneeId);
      return tx.erpTask.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? "MEDIUM",
          projectId: input.projectId ?? null,
          teamId: input.teamId ?? null,
          assigneeId: input.assigneeId ?? null,
          dueDate: toDate(input.dueDate),
          estimatedHours: input.estimatedHours ?? null,
          createdBy: ctx.scope.userId,
        },
      });
    },
    map: toTask,
    replay: (c, id) => c.erpTask.findFirst({ where: { id, organizationId, deletedAt: null } }),
  });
}

/**
 * Task update. A status change is checked against TASK_TRANSITIONS (422 when not
 * allowed) and maintains completedAt. Same-status requests are no-ops for the status.
 */
export async function updateTask(ctx: ErpCtx, id: string, input: TaskUpdateInput): Promise<ErpTask> {
  const organizationId = ctx.scope.organizationId;
  const assignee = input.assigneeId;
  return versionedUpdate(ctx, id, {
    model: "erpTask",
    softDelete: true,
    action: "erp.task.update",
    entityType: "ErpTask",
    expectedVersion: input.version,
    changes: (before, now) => {
      const changes: Record<string, unknown> = {};
      if (input.title !== undefined) changes.title = input.title;
      if (input.priority !== undefined) changes.priority = input.priority;
      if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId;
      if (input.dueDate !== undefined) changes.dueDate = toDate(input.dueDate);
      if (input.status !== undefined) {
        const from = before.status as ErpTaskStatus;
        assertTransition(TASK_TRANSITIONS, from, input.status);
        changes.status = input.status;
        changes.completedAt = completedAtFor(from, input.status, TASK_COMPLETED, before.completedAt as Date | null, now);
      }
      return changes;
    },
    snapshot: row => ({ status: row.status, priority: row.priority, completedAt: isoOrNull(row.completedAt) }),
    map: toTask,
    reason: input.reason ?? null,
    beforeWrite: async tx => {
      if (assignee) await assertActiveMember(tx, organizationId, assignee);
    },
  });
}

// ── Inventory ────────────────────────────────────────────────────────────────

export async function listInventory(ctx: ErpCtx, q: InventoryListQuery): Promise<ChildPage<ErpInventoryItemView>> {
  const c = await client();
  const where = { organizationId: ctx.scope.organizationId, deletedAt: null, ...(q.category ? { category: q.category } : {}) };
  if (q.cursor && !(await c.erpInventoryItem.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } }))) {
    throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpInventoryItem.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, r => toInventory(r, ctx.scope.canViewCompensation));
}

export async function getInventoryById(ctx: ErpCtx, id: string): Promise<ErpInventoryItemFullView> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const row = await c.erpInventoryItem.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  const movements = await c.erpInventoryMovement.findMany({
    where: { itemId: id, organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHILD_DETAIL_PAGE + 1,
  });
  return {
    ...toInventory(row, ctx.scope.canViewCompensation),
    movements: pageOf(movements, CHILD_DETAIL_PAGE, toMovement),
  };
}

export async function createInventoryItem(ctx: ErpCtx, input: InventoryCreateInput): Promise<IdempotentSuccess<ErpInventoryItemView>> {
  assertCompensationAccess(ctx, input.unitCost !== undefined);
  const organizationId = ctx.scope.organizationId;
  const canView = ctx.scope.canViewCompensation;
  return idempotentCreate(ctx, {
    operation: "erp.inventory.create",
    entityType: "ErpInventoryItem",
    action: "erp.inventory.create",
    payload: input,
    changedFields: suppliedKeys(input),
    after: { sku: input.sku },
    create: tx =>
      tx.erpInventoryItem.create({
        data: {
          organizationId,
          sku: input.sku,
          name: input.name,
          category: input.category ?? null,
          description: input.description ?? null,
          quantity: input.quantity ?? 0,
          reorderLevel: input.reorderLevel ?? 0,
          unitCost: input.unitCost ?? null,
          location: input.location ?? null,
        },
      }),
    map: row => toInventory(row, canView),
    replay: (c, id) => c.erpInventoryItem.findFirst({ where: { id, organizationId, deletedAt: null } }),
  });
}

export async function updateInventory(ctx: ErpCtx, id: string, input: InventoryUpdateInput): Promise<ErpInventoryItemView> {
  const changes: Record<string, unknown> = {};
  if (input.quantity !== undefined) changes.quantity = input.quantity;
  if (input.reserved !== undefined) changes.reserved = input.reserved;
  if (input.reorderLevel !== undefined) changes.reorderLevel = input.reorderLevel;
  if (input.location !== undefined) changes.location = input.location;
  const canView = ctx.scope.canViewCompensation;
  return versionedUpdate(ctx, id, {
    model: "erpInventoryItem",
    softDelete: true,
    action: "erp.inventory.update",
    entityType: "ErpInventoryItem",
    expectedVersion: input.version,
    changes,
    snapshot: row => ({ quantity: row.quantity, reorderLevel: row.reorderLevel }),
    map: row => toInventory(row, canView),
  });
}

// ── Work orders ──────────────────────────────────────────────────────────────

export async function listWorkOrders(ctx: ErpCtx, q: WorkOrderListQuery): Promise<ChildPage<ErpWorkOrder>> {
  const c = await client();
  const where = {
    organizationId: ctx.scope.organizationId,
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.projectId ? { projectId: q.projectId } : {}),
  };
  if (q.cursor && !(await c.erpWorkOrder.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } }))) {
    throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpWorkOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, toWorkOrder);
}

export async function getWorkOrderById(ctx: ErpCtx, id: string): Promise<ErpWorkOrderDetailView> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const row = await c.erpWorkOrder.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  const activities = await c.erpWorkOrderActivity.findMany({
    where: { workOrderId: id, organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: CHILD_DETAIL_PAGE + 1,
  });
  return { ...toWorkOrder(row), activities: pageOf(activities, CHILD_DETAIL_PAGE, toActivity) };
}

export type ErpWorkOrderDetailView = ErpWorkOrder & { activities: ChildPage<ErpWorkOrderActivity> };

export async function createWorkOrder(ctx: ErpCtx, input: WorkOrderCreateInput): Promise<IdempotentSuccess<ErpWorkOrder>> {
  const organizationId = ctx.scope.organizationId;
  return idempotentCreate(ctx, {
    operation: "erp.work_order.create",
    entityType: "ErpWorkOrder",
    action: "erp.work_order.create",
    payload: input,
    changedFields: suppliedKeys(input),
    after: { priority: input.priority ?? "MEDIUM" },
    create: async tx => {
      if (input.projectId) await assertOwned(tx.erpProject, organizationId, input.projectId, { deletedAt: null });
      if (input.teamId) await assertOwned(tx.erpTeam, organizationId, input.teamId);
      return tx.erpWorkOrder.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? "MEDIUM",
          projectId: input.projectId ?? null,
          teamId: input.teamId ?? null,
          dueDate: toDate(input.dueDate),
          requiresApproval: input.requiresApproval ?? false,
          createdBy: ctx.scope.userId,
        },
      });
    },
    map: toWorkOrder,
    replay: (c, id) => c.erpWorkOrder.findFirst({ where: { id, organizationId, deletedAt: null } }),
  });
}

/**
 * Work order update. A status change is checked against WORK_ORDER_TRANSITIONS
 * (422 when not allowed) and maintains completedAt, as for tasks.
 */
export async function updateWorkOrder(ctx: ErpCtx, id: string, input: WorkOrderUpdateInput): Promise<ErpWorkOrder> {
  const organizationId = ctx.scope.organizationId;
  const assignee = input.assigneeId;
  return versionedUpdate(ctx, id, {
    model: "erpWorkOrder",
    softDelete: true,
    action: "erp.work_order.update",
    entityType: "ErpWorkOrder",
    expectedVersion: input.version,
    changes: (before, now) => {
      const changes: Record<string, unknown> = {};
      if (input.priority !== undefined) changes.priority = input.priority;
      if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId;
      if (input.completionNote !== undefined) changes.completionNote = input.completionNote;
      if (input.status !== undefined) {
        const from = before.status as ErpWorkOrderStatus;
        assertTransition(WORK_ORDER_TRANSITIONS, from, input.status);
        changes.status = input.status;
        changes.completedAt = completedAtFor(from, input.status, WORK_ORDER_COMPLETED, before.completedAt as Date | null, now);
      }
      return changes;
    },
    snapshot: row => ({ status: row.status, priority: row.priority, completedAt: isoOrNull(row.completedAt) }),
    map: toWorkOrder,
    reason: input.reason ?? null,
    beforeWrite: async tx => {
      if (assignee) await assertActiveMember(tx, organizationId, assignee);
    },
  });
}

// ── Approvals ────────────────────────────────────────────────────────────────

/** Approvals with the first page of each request's steps (continue with the steps route). */
export async function listApprovals(ctx: ErpCtx, q: ApprovalListQuery): Promise<ChildPage<ErpApprovalRequestView>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const where = { organizationId, ...(q.status ? { status: q.status } : {}) };
  if (q.cursor && !(await c.erpApprovalRequest.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } }))) {
    throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpApprovalRequest.findMany({
    where,
    include: { steps: { where: { organizationId }, orderBy: [{ order: "asc" }, { id: "asc" }], take: CHILD_DETAIL_PAGE + 1 } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, row => ({
    ...toApproval(row),
    steps: pageOf((row.steps as Row[] | undefined) ?? [], CHILD_DETAIL_PAGE, toStep),
  }));
}

/**
 * Approval decision (state machine): PENDING -> APPROVED or REJECTED, once.
 *   - a non-PENDING request is refused with 409 (VERSION_CONFLICT: the request
 *     is no longer pending; ALREADY_DECIDED is not in the shared failure set);
 *   - a stale version is refused with 409 VERSION_CONFLICT;
 *   - the decider is the server-side user; the reason is required;
 *   - the decision row, the audit row and the idempotency row share one transaction;
 *   - the same Idempotency-Key with the same payload replays the stored result;
 *     the same key with a different payload is refused (409 IDEMPOTENCY_KEY_REUSED).
 * The reason is stored in the `decision` column (the schema has no reason column).
 */
export async function decideApproval(
  ctx: ErpCtx,
  id: string,
  input: ApprovalDecisionInput,
): Promise<IdempotentSuccess<ErpApprovalRequest>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const outcome = await runIdempotentWrite<ErpApprovalRequest, OpsTx>({
    store: c,
    organizationId,
    actorUserId: ctx.scope.userId,
    operation: "erp.approval.decide",
    rawKey: await requireKey(ctx),
    payload: { id, status: input.status, version: input.version, reason: input.reason },
    write: async tx => {
      const scope = { id, organizationId };
      const before = await tx.erpApprovalRequest.findFirst({ where: scope });
      if (!before) throw new ErpError(404, "NOT_FOUND");
      if (before.status !== "PENDING") throw new ErpError(409, "VERSION_CONFLICT");
      if (before.version !== input.version) throw new ErpError(409, "VERSION_CONFLICT");

      const res = await tx.erpApprovalRequest.updateMany({
        where: { ...scope, status: "PENDING", version: input.version },
        data: {
          status: input.status,
          decidedBy: ctx.scope.userId,
          decidedAt: new Date(),
          decision: input.reason,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw new ErpError(409, "VERSION_CONFLICT");

      const after = await tx.erpApprovalRequest.findFirst({ where: scope });
      if (!after) throw new ErpError(404, "NOT_FOUND");
      await audit(tx, ctx, {
        action: "erp.approval.decide",
        entityType: "ErpApprovalRequest",
        entityId: id,
        changedFields: ["status", "decidedBy", "decidedAt", "decision"],
        before: { status: before.status },
        after: { status: after.status },
        reason: input.reason,
      });
      return { resultType: "ErpApprovalRequest", resultId: id, value: toApproval(after) };
    },
    replay: async (_type, resultId) => {
      const row = await c.erpApprovalRequest.findFirst({ where: { id: resultId, organizationId } });
      return row ? toApproval(row) : null;
    },
  });
  if (outcome.kind === "refused") idempotencyFailure(outcome.reason);
  return outcome;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

/** Each report card is the newest row of one category whose name contains the given text. */
const KPI_CARDS = {
  projectCompletionRate: { category: "PROJECTS", name: "Completion" },
  taskThroughput: { category: "TASKS", name: "Throughput" },
  workOrderCompletionRate: { category: "OPERATIONS", name: "Completion" },
  inventoryRisk: { category: "INVENTORY", name: "Risk" },
  budgetVariance: { category: "FINANCE", name: "Variance" },
  scheduleVariance: { category: "SCHEDULE", name: "Variance" },
  approvalCycleTime: { category: "APPROVALS", name: "Cycle" },
} as const;

type CardKey = keyof typeof KPI_CARDS;

/**
 * Completion duration for one completed status. Only rows with completedAt set
 * contribute to the average. Rows in the completed status without completedAt are
 * counted as skipped and never used as a duration source.
 */
async function taskDuration(c: OpsClient, organizationId: string): Promise<CompletionDurationMetric> {
  const rows = await c.$queryRaw<{ measured: unknown; skipped: unknown; avg_hours: unknown }>`
    SELECT COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL) AS measured,
           COUNT(*) FILTER (WHERE "completedAt" IS NULL) AS skipped,
           AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 3600.0) FILTER (WHERE "completedAt" IS NOT NULL) AS avg_hours
    FROM "ErpTask"
    WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "status" = 'DONE'`;
  return toDuration(rows[0]);
}

async function workOrderDuration(c: OpsClient, organizationId: string): Promise<CompletionDurationMetric> {
  const rows = await c.$queryRaw<{ measured: unknown; skipped: unknown; avg_hours: unknown }>`
    SELECT COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL) AS measured,
           COUNT(*) FILTER (WHERE "completedAt" IS NULL) AS skipped,
           AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 3600.0) FILTER (WHERE "completedAt" IS NOT NULL) AS avg_hours
    FROM "ErpWorkOrder"
    WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "status" = 'COMPLETED'`;
  return toDuration(rows[0]);
}

function toDuration(row: { measured: unknown; skipped: unknown; avg_hours: unknown } | undefined): CompletionDurationMetric {
  return {
    averageHours: row?.avg_hours === null || row?.avg_hours === undefined ? null : Number(row.avg_hours),
    measuredRows: countOf(row?.measured),
    skippedRows: countOf(row?.skipped),
  };
}

/** Null when the organization has no KPI rows: the page renders an empty state, never fixture values. */
export async function getErpKpiReport(ctx: ErpCtx): Promise<ErpKpiReportView | null> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const canView = ctx.scope.canViewCompensation;
  const total = await c.erpOperationalKpi.count({ where: { organizationId } });
  if (countOf(total) === 0) return null;

  const cardKeys = Object.keys(KPI_CARDS) as CardKey[];
  const [cardRows, recentRows, taskDur, woDur] = await Promise.all([
    Promise.all(
      cardKeys.map(key =>
        c.erpOperationalKpi.findFirst({
          where: { organizationId, category: KPI_CARDS[key].category, name: { contains: KPI_CARDS[key].name } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      ),
    ),
    c.erpOperationalKpi.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: KPI_RECENT_LIMIT }),
    taskDuration(c, organizationId),
    workOrderDuration(c, organizationId),
  ]);

  const card = (key: CardKey): number | null => {
    const row = cardRows[cardKeys.indexOf(key)];
    if (!row) return null;
    if (KPI_CARDS[key].category === "FINANCE" && !canView) return null;
    return Number(row.value);
  };

  return {
    financialsVisible: canView,
    projectCompletionRate: card("projectCompletionRate"),
    taskThroughput: card("taskThroughput"),
    workOrderCompletionRate: card("workOrderCompletionRate"),
    inventoryRisk: card("inventoryRisk"),
    resourceUtilization: null,
    utilizationStatus: UTILIZATION_INSUFFICIENT_DATA,
    budgetVariance: card("budgetVariance"),
    scheduleVariance: card("scheduleVariance"),
    approvalCycleTime: card("approvalCycleTime"),
    completionDurations: { tasks: taskDur, workOrders: woDur },
    kpis: recentRows.map(r => toKpi(r, canView)),
    kpisLimit: KPI_RECENT_LIMIT,
  };
}
