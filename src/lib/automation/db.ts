// Phase 67 — Workflow Automation DB layer (Prisma + mock fallback)

import { getPrisma }    from "@/lib/db/prisma";
import {
  MOCK_WORKFLOWS, MOCK_WORKFLOWS_WITH_DETAILS, MOCK_EXECUTIONS,
  MOCK_WEBHOOKS, EXECUTIONS_TODAY, FAILED_COUNT,
} from "./mock-data";
import { BUILT_IN_TEMPLATES }  from "./templates";
import { simulateWorkflow, runWorkflow } from "./engine";

import type {
  WorkflowDefinition, WorkflowDefinitionFull, WorkflowExecution,
  WorkflowExecutionFull, WorkflowTemplate, WorkflowWebhookEndpoint,
  AutomationOverview, SimulateResult,
} from "./types";

/**
 * Structural write shapes. This layer deliberately does not import the zod
 * inferred types: the routes validate first, and keeping the persistence
 * contract structural lets other trusted callers — the template copy path —
 * pass their own shapes without a cast.
 */
type ConditionInput = {
  type: string; field?: string | null; operator?: string | null;
  value?: string | null; logicGroup?: number;
};
type ActionInput = { type: string; config?: Record<string, unknown> };

/**
 * Why a workflow write did not happen. Collapsing all three into `null` is how
 * a failed transaction used to surface to the client as 404 "not found", which
 * told an operator their workflow had vanished when in fact nothing had been
 * written.
 */
export type WorkflowWriteFailure = "not_found" | "unavailable" | "write_failed";
export type WorkflowWriteResult =
  | { ok: true;  workflow: WorkflowDefinitionFull }
  | { ok: false; reason: WorkflowWriteFailure };

/** Thrown inside a transaction so the rollback and the 404 stay in agreement. */
class WorkflowNotFoundError extends Error {}

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;

async function m() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    wf:       d.workflowDefinition       as AnyModel | undefined,
    exec:     d.workflowExecution        as AnyModel | undefined,
    template: d.workflowTemplate         as AnyModel | undefined,
    webhook:  d.workflowWebhookEndpoint  as AnyModel | undefined,
    audit:    d.workflowAuditEvent       as AnyModel | undefined,
    cond:     d.workflowCondition        as AnyModel | undefined,
    action:   d.workflowAction           as AnyModel | undefined,
  };
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// ── Workflow write helpers (PAGE 08 persistence closure) ─────────────────────

/** Minimal structural view of the transaction client this module needs. */
type TxModel = {
  updateMany: (args: unknown) => Promise<unknown>;
  findFirst:  (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
  createMany: (args: unknown) => Promise<unknown>;
};
type WorkflowTx = {
  workflowDefinition: Pick<TxModel, "updateMany" | "findFirst">;
  workflowCondition:  Pick<TxModel, "deleteMany" | "createMany">;
  workflowAction:     Pick<TxModel, "deleteMany" | "createMany">;
};
type WorkflowTxClient = { $transaction: <T>(fn: (tx: WorkflowTx) => Promise<T>) => Promise<T> };

const CHILDREN_INCLUDE = {
  conditions: true,
  actions: { orderBy: { order: "asc" } },
} as const;

function conditionCreate(c: ConditionInput) {
  return {
    type:       c.type,
    field:      c.field ?? null,
    operator:   c.operator ?? null,
    value:      c.value ?? null,
    logicGroup: c.logicGroup ?? 0,
  };
}

/** Execution order is the 1-based array position, never a client-sent number. */
function actionCreate(a: ActionInput, index: number) {
  return { type: a.type, order: index + 1, config: a.config ?? {} };
}

function normalizeFull(row: WorkflowDefinitionFull): WorkflowDefinitionFull {
  return {
    ...row,
    createdAt:  toIso(row.createdAt),
    updatedAt:  toIso(row.updatedAt),
    conditions: (row.conditions ?? []).map(c => ({ ...c, createdAt: toIso(c.createdAt), updatedAt: toIso(c.updatedAt) })),
    actions:    (row.actions ?? []).map(a => ({ ...a, createdAt: toIso(a.createdAt), updatedAt: toIso(a.updatedAt) })),
  };
}

// ── Overview ──────────────────────────────────────────────────────────────────

export async function getAutomationOverview(): Promise<AutomationOverview> {
  try {
    const db = await m();
    if (db?.wf && db?.exec && db?.template) {
      const [workflows, executions, templates] = await Promise.all([
        db.wf.findMany({ where: { deletedAt: null } } as never),
        db.exec.findMany({ orderBy: { createdAt: "desc" }, take: 100 } as never),
        db.template.findMany({ orderBy: { usageCount: "desc" }, take: 5 } as never) as Promise<WorkflowTemplate[]>,
      ]) as [WorkflowDefinition[], WorkflowExecution[], WorkflowTemplate[]];

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const execToday  = executions.filter(e => new Date(toIso(e.createdAt)) >= today);
      const success    = executions.filter(e => e.status === "SUCCESS").length;
      const failed     = executions.filter(e => e.status === "FAILED").length;
      const total      = executions.length;

      return buildOverview(workflows, executions, execToday, total, success, failed, templates);
    }
  } catch { /* fall through */ }

  return buildOverview(
    MOCK_WORKFLOWS, MOCK_EXECUTIONS, EXECUTIONS_TODAY,
    MOCK_EXECUTIONS.length, MOCK_EXECUTIONS.filter(e => e.status === "SUCCESS").length,
    FAILED_COUNT, BUILT_IN_TEMPLATES
  );
}

function buildOverview(
  workflows: WorkflowDefinition[],
  executions: WorkflowExecution[],
  execToday: WorkflowExecution[],
  total: number,
  success: number,
  failed: number,
  templates: WorkflowTemplate[]
): AutomationOverview {
  const byStatus = { DRAFT: 0, ACTIVE: 0, PAUSED: 0, ARCHIVED: 0 };
  workflows.forEach(w => { byStatus[w.status] = (byStatus[w.status] ?? 0) + 1; });

  const execByStatus = { QUEUED: 0, RUNNING: 0, SUCCESS: 0, FAILED: 0, PARTIAL: 0, CANCELLED: 0 };
  executions.forEach(e => { execByStatus[e.status] = (execByStatus[e.status] ?? 0) + 1; });

  return {
    activeWorkflows:    byStatus.ACTIVE,
    executionsToday:    execToday.length,
    successRate:        total > 0 ? Math.round((success / total) * 100) : 0,
    failedExecutions:   failed,
    totalExecutions:    total,
    mostUsedTemplates:  templates.slice(0, 5).map(t => ({ id: t.id, name: t.name, usageCount: t.usageCount })),
    recentExecutions:   executions.slice(0, 10).map(e => ({ ...e, createdAt: toIso(e.createdAt) })),
    workflowsByStatus:  byStatus,
    executionsByStatus: execByStatus,
  };
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function getWorkflows(status?: string): Promise<WorkflowDefinition[]> {
  try {
    const db = await m();
    if (db?.wf) {
      const where = status ? { status, deletedAt: null } : { deletedAt: null };
      const rows = await db.wf.findMany({ where, orderBy: { updatedAt: "desc" } } as never) as WorkflowDefinition[];
      return rows.map(r => ({ ...r, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) }));
    }
  } catch { /* fall through */ }
  return status ? MOCK_WORKFLOWS.filter(w => w.status === status) : [...MOCK_WORKFLOWS];
}

export async function getWorkflowById(id: string): Promise<WorkflowDefinitionFull | null> {
  try {
    const db = await m();
    if (db?.wf) {
      const row = await db.wf.findFirst({
        where:   { id, deletedAt: null },
        include: { conditions: true, actions: { orderBy: { order: "asc" } } },
      } as never) as WorkflowDefinitionFull | null;
      if (row) return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return MOCK_WORKFLOWS_WITH_DETAILS.find(w => w.id === id) ?? null;
}

/**
 * PAGE 08 — a workflow is created with its conditions and ordered actions in
 * one nested write, so Prisma runs the whole thing in a single transaction and
 * a failing child can never leave a headless parent behind.
 *
 * Execution order is the array position (1-based), never a client-supplied
 * number, so the stored sequence is always dense and deterministic.
 */
export async function createWorkflow(data: {
  name: string; description?: string | null; triggerType: string;
  organizationId?: string | null; createdBy?: string | null; templateId?: string | null;
  conditions?: ConditionInput[]; actions?: ActionInput[];
}): Promise<WorkflowDefinitionFull | null> {
  const { conditions, actions, ...scalars } = data;
  try {
    const db = await m();
    if (db?.wf) {
      const row = await db.wf.create({
        data: {
          ...scalars,
          status: "DRAFT",
          updatedAt: new Date(),
          ...(conditions?.length ? { conditions: { create: conditions.map(conditionCreate) } } : {}),
          ...(actions?.length    ? { actions:    { create: actions.map(actionCreate) } }       : {}),
        },
        include: CHILDREN_INCLUDE,
      } as never) as WorkflowDefinitionFull;
      return normalizeFull(row);
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * PAGE 08 — scalar fields and both child collections update together inside one
 * transaction. A collection that is absent from `data` is left untouched
 * (PATCH semantics); a collection that is present replaces what is stored, so
 * removed conditions and actions actually disappear instead of lingering.
 */
export async function updateWorkflow(id: string, data: Partial<{
  name: string; description: string | null; status: string; triggerType: string;
  conditions: ConditionInput[]; actions: ActionInput[];
}>): Promise<WorkflowWriteResult> {
  const { conditions, actions, ...scalars } = data;
  const scalarData = { ...scalars, updatedAt: new Date() };

  const db = await getPrisma();
  if (!db) return { ok: false, reason: "unavailable" };
  const wf = (db as Record<string, unknown>).workflowDefinition as
    | { updateMany: (a: unknown) => Promise<unknown>; findFirst: (a: unknown) => Promise<unknown> }
    | undefined;
  if (!wf) return { ok: false, reason: "unavailable" };

  /**
   * `updateMany` rather than `update`: it reports a row count instead of
   * throwing, and its `where` can carry `deletedAt: null`, so a soft-deleted
   * workflow reads as absent instead of being silently resurrected.
   */
  const applyScalars = async (
    model: { updateMany: (a: unknown) => Promise<unknown> },
  ) => {
    const res = await model.updateMany({ where: { id, deletedAt: null }, data: scalarData }) as { count?: number };
    if ((res?.count ?? 0) === 0) throw new WorkflowNotFoundError();
  };

  // Status-only transitions (activate / pause) never touch the children, so
  // they need no transaction.
  if (conditions === undefined && actions === undefined) {
    try {
      await applyScalars(wf);
      const row = await wf.findFirst({ where: { id, deletedAt: null }, include: CHILDREN_INCLUDE }) as WorkflowDefinitionFull | null;
      if (!row) return { ok: false, reason: "not_found" };
      return { ok: true, workflow: normalizeFull(row) };
    } catch (err) {
      return { ok: false, reason: err instanceof WorkflowNotFoundError ? "not_found" : "write_failed" };
    }
  }

  const client = db as unknown as WorkflowTxClient;
  if (typeof client.$transaction !== "function") return { ok: false, reason: "unavailable" };

  try {
    const row = await client.$transaction(async (tx) => {
      await applyScalars(tx.workflowDefinition);

      if (conditions !== undefined) {
        await tx.workflowCondition.deleteMany({ where: { workflowId: id } });
        if (conditions.length) {
          await tx.workflowCondition.createMany({
            data: conditions.map(c => ({ workflowId: id, ...conditionCreate(c) })),
          });
        }
      }

      if (actions !== undefined) {
        await tx.workflowAction.deleteMany({ where: { workflowId: id } });
        if (actions.length) {
          await tx.workflowAction.createMany({
            data: actions.map((a, i) => ({ workflowId: id, ...actionCreate(a, i) })),
          });
        }
      }

      return tx.workflowDefinition.findFirst({
        where: { id, deletedAt: null },
        include: CHILDREN_INCLUDE,
      });
    });

    if (!row) return { ok: false, reason: "not_found" };
    return { ok: true, workflow: normalizeFull(row as WorkflowDefinitionFull) };
  } catch (err) {
    return { ok: false, reason: err instanceof WorkflowNotFoundError ? "not_found" : "write_failed" };
  }
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  try {
    const db = await m();
    if (db?.wf) {
      await db.wf.update({ where: { id }, data: { deletedAt: new Date() } } as never);
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<WorkflowTemplate[]> {
  try {
    const db = await m();
    if (db?.template) {
      const rows = await db.template.findMany({ orderBy: { usageCount: "desc" } } as never) as WorkflowTemplate[];
      if (rows.length > 0) return rows;
    }
  } catch { /* fall through */ }
  return BUILT_IN_TEMPLATES;
}

export async function getTemplateById(id: string): Promise<WorkflowTemplate | null> {
  try {
    const db = await m();
    if (db?.template) {
      const row = await db.template.findUnique({ where: { id } } as never) as WorkflowTemplate | null;
      if (row) return row;
    }
  } catch { /* fall through */ }
  return BUILT_IN_TEMPLATES.find(t => t.id === id) ?? null;
}

// ── Executions ────────────────────────────────────────────────────────────────

export async function getExecutions(workflowId?: string, limit = 50): Promise<WorkflowExecution[]> {
  try {
    const db = await m();
    if (db?.exec) {
      const where = workflowId ? { workflowId } : {};
      const rows = await db.exec.findMany({
        where, orderBy: { createdAt: "desc" }, take: limit,
      } as never) as WorkflowExecution[];
      return rows.map(r => ({ ...r, createdAt: toIso(r.createdAt) }));
    }
  } catch { /* fall through */ }
  const execs = workflowId ? MOCK_EXECUTIONS.filter(e => e.workflowId === workflowId) : MOCK_EXECUTIONS;
  return execs.slice(0, limit);
}

export async function getExecutionById(id: string): Promise<WorkflowExecutionFull | null> {
  try {
    const db = await m();
    if (db?.exec) {
      const row = await db.exec.findUnique({
        where:   { id },
        include: { steps: { orderBy: { stepOrder: "asc" } }, logs: { orderBy: { createdAt: "asc" } } },
      } as never) as WorkflowExecutionFull | null;
      if (row) return { ...row, createdAt: toIso(row.createdAt), workflow: null };
    }
  } catch { /* fall through */ }
  const exec = MOCK_EXECUTIONS.find(e => e.id === id);
  if (!exec) return null;
  const wf = MOCK_WORKFLOWS.find(w => w.id === exec.workflowId);
  return {
    ...exec,
    steps: [],
    logs:  [
      { id: "log-m-1", executionId: id, level: "INFO", message: `Workflow '${wf?.name ?? exec.workflowId}' triggered`, metadata: {}, createdAt: exec.startedAt ?? exec.createdAt },
      { id: "log-m-2", executionId: id, level: exec.status === "FAILED" ? "ERROR" : "INFO", message: exec.status === "FAILED" ? `Error: ${exec.errorMessage ?? "unknown"}` : `Completed with status: ${exec.status}`, metadata: {}, createdAt: exec.finishedAt ?? exec.createdAt },
    ],
    workflow: wf ? { id: wf.id, name: wf.name } : null,
  };
}

// ── Simulate & Run ────────────────────────────────────────────────────────────

export async function simulateWorkflowById(id: string, context: Record<string, unknown>): Promise<SimulateResult | null> {
  const workflow = await getWorkflowById(id);
  if (!workflow) return null;
  return simulateWorkflow(workflow, context);
}

export async function runWorkflowById(id: string, context: Record<string, unknown>, triggeredBy?: string): Promise<WorkflowExecution | null> {
  const workflow = await getWorkflowById(id);
  if (!workflow) return null;
  const { execution } = runWorkflow(workflow, context, triggeredBy);
  return { id: `exec-live-${Date.now()}`, ...execution };
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export async function getWebhooks(workflowId?: string): Promise<WorkflowWebhookEndpoint[]> {
  try {
    const db = await m();
    if (db?.webhook) {
      const where = workflowId ? { workflowId, deletedAt: null } : { deletedAt: null };
      const rows = await db.webhook.findMany({ where } as never) as WorkflowWebhookEndpoint[];
      return rows.map(r => ({ ...r, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) }));
    }
  } catch { /* fall through */ }
  return workflowId ? MOCK_WEBHOOKS.filter(w => w.workflowId === workflowId) : MOCK_WEBHOOKS;
}

export async function createWebhook(data: {
  name: string; url: string; workflowId?: string | null; organizationId?: string | null;
}): Promise<WorkflowWebhookEndpoint | null> {
  try {
    const db = await m();
    if (db?.webhook) {
      const row = await db.webhook.create({
        data: { ...data, isActive: true, failureCount: 0, retryCount: 0, updatedAt: new Date() },
      } as never) as WorkflowWebhookEndpoint;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}
