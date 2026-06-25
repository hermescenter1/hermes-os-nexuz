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

export async function createWorkflow(data: {
  name: string; description?: string | null; triggerType: string;
  organizationId?: string | null; createdBy?: string | null; templateId?: string | null;
}): Promise<WorkflowDefinition | null> {
  try {
    const db = await m();
    if (db?.wf) {
      const row = await db.wf.create({
        data: { ...data, status: "DRAFT", updatedAt: new Date() },
      } as never) as WorkflowDefinition;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
}

export async function updateWorkflow(id: string, data: Partial<{
  name: string; description: string | null; status: string;
}>): Promise<WorkflowDefinition | null> {
  try {
    const db = await m();
    if (db?.wf) {
      const row = await db.wf.update({
        where: { id }, data: { ...data, updatedAt: new Date() },
      } as never) as WorkflowDefinition;
      return { ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
    }
  } catch { /* fall through */ }
  return null;
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
