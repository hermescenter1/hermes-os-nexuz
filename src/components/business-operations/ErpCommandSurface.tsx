// PHASE 87H — premium ERP business-operations command surface (Server
// Component). Receives the ALREADY server-fetched, already-authorized
// ErpOverview and reorganizes it into the prioritized operations IA:
// attention → operational status → budget → KPIs → recent activity → actions.
// Every value is a real overview field or an existing deterministic
// calculation (see logic.ts). No fetch, no auth decision, no fabrication.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn, TechnicalValue } from "@/components/ds";
import {
  DashboardSection,
  AttentionPanel,
  SafeActionGrid,
  type AttentionItem,
  type SafeAction,
} from "@/components/dashboard-experience";
import {
  ProjectStatusBadge, TaskStatusBadge, WorkOrderStatusBadge,
} from "./WorkflowStatusBadge";
import { deriveErpAttention, budgetVariancePct, formatErpMoney } from "./logic";
import type {
  ErpOverview, ErpProjectStatus, ErpTaskStatus, ErpWorkOrderStatus,
} from "@/lib/erp/types";

function ErpLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={className}>{children}</Link>;
}

const PROJECT_ORDER: ErpProjectStatus[] = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const TASK_ORDER: ErpTaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE", "CANCELLED"];
const WO_ORDER: ErpWorkOrderStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"];
const ACTIVITY_KEYS = new Set(["task_completed", "work_order_completed", "approval_decided"]);

export async function ErpCommandSurface({ overview, locale }: { overview: ErpOverview; locale: string }) {
  const t = await getTranslations("businessOps");
  const tStatus = await getTranslations("businessOps.status");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  const attention: AttentionItem[] = deriveErpAttention(overview).map((a) => ({
    id: a.id,
    severity: a.severity === "action" ? "high" : "medium",
    severityLabel: a.severity === "action" ? t("attention.severityAction") : t("attention.severityReview"),
    object: t(`groups.${a.kind === "inventoryLow" ? "workOrders" : a.kind === "pendingApprovals" ? "projects" : "tasks"}`),
    reason: t(`attention.${a.kind}`, { count: nf.format(a.count) }),
    href: a.href,
    viewLabel: t("attention.view"),
  }));

  const variance = budgetVariancePct(overview.totalBudget, overview.totalActualCost);
  const recent = overview.recentActivity.filter((e) => ACTIVITY_KEYS.has(e.type)).slice(0, 6);

  const actions: SafeAction[] = [
    { key: "projects", label: t("actions.openProjects"), description: t("actions.openProjectsDesc"), href: "/erp/projects", glyph: "◆" },
    { key: "approvals", label: t("actions.openApprovals"), description: t("actions.openApprovalsDesc"), href: "/erp/approvals", glyph: "◈" },
    { key: "tasks", label: t("actions.openTasks"), description: t("actions.openTasksDesc"), href: "/erp/tasks", glyph: "◉" },
    { key: "workOrders", label: t("actions.openWorkOrders"), description: t("actions.openWorkOrdersDesc"), href: "/erp/work-orders", glyph: "◇" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Attention-required operations */}
      <DashboardSection id="erp-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.empty")} LinkComponent={ErpLink} />
      </DashboardSection>

      {/* 2. Operational status distributions (real counts) */}
      <DashboardSection id="erp-status" title={t("sections.operationalStatus")}>
        <div className="grid gap-4 lg:grid-cols-3">
          <StatusCard
            title={t("groups.projects")}
            rows={PROJECT_ORDER.map((s) => ({ key: s, count: overview.projectsByStatus[s] ?? 0, badge: <ProjectStatusBadge status={s} label={tStatus(`project.${s}`)} /> }))}
            nf={nf}
          />
          <StatusCard
            title={t("groups.tasks")}
            rows={TASK_ORDER.map((s) => ({ key: s, count: overview.tasksByStatus[s] ?? 0, badge: <TaskStatusBadge status={s} label={tStatus(`task.${s}`)} /> }))}
            nf={nf}
          />
          <StatusCard
            title={t("groups.workOrders")}
            rows={WO_ORDER.map((s) => ({ key: s, count: overview.workOrdersByStatus[s] ?? 0, badge: <WorkOrderStatusBadge status={s} label={tStatus(`workOrder.${s}`)} /> }))}
            nf={nf}
          />
        </div>
      </DashboardSection>

      {/* 3. Budget summary (real budget vs. recorded actual cost) */}
      <DashboardSection id="erp-budget" title={t("sections.budget")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-caption text-text-muted">{t("budget.total")}</dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary"><TechnicalValue mono={false}>{formatErpMoney(overview.totalBudget)}</TechnicalValue></dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">{t("budget.actual")}</dt>
              <dd className="mt-0.5 text-title font-semibold text-text-primary"><TechnicalValue mono={false}>{formatErpMoney(overview.totalActualCost)}</TechnicalValue></dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">{t("budget.variance")}</dt>
              <dd className={cn("mt-0.5 text-title font-semibold", variance > 10 ? "text-status-danger" : variance > 0 ? "text-status-warning" : "text-status-success")}>
                <span dir="ltr" className="tabular-nums">{variance > 0 ? "+" : ""}{nf.format(variance)}%</span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-caption text-text-muted">{t("budget.note")}</p>
        </div>
      </DashboardSection>

      {/* 4. Operational KPIs (only when real records exist) */}
      {overview.kpiSummary.length > 0 ? (
        <DashboardSection id="erp-kpis" title={t("sections.kpis")}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overview.kpiSummary.slice(0, 4).map((kpi) => {
              const pct = kpi.target ? Math.min(100, Math.round((kpi.value / kpi.target) * 100)) : null;
              return (
                <li key={kpi.id} className="rounded-md border border-border-default bg-surface-primary p-4">
                  <p className="text-caption text-text-muted" dir="auto">{kpi.name}</p>
                  <p className="mt-0.5 text-kpi-md font-bold text-text-primary" dir="ltr">
                    {nf.format(kpi.value)}{kpi.unit ? <span className="ms-0.5 text-caption font-normal text-text-muted">{kpi.unit}</span> : null}
                  </p>
                  {kpi.target ? (
                    <div className="mt-2">
                      <div className="h-1 rounded-full bg-surface-interactive">
                        <div className="h-1 rounded-full bg-brand-primary" style={{ inlineSize: `${pct ?? 0}%` }} />
                      </div>
                      <p className="mt-1 text-caption text-text-muted">{t("kpiTarget", { value: `${nf.format(kpi.target)}${kpi.unit ?? ""}` })}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </DashboardSection>
      ) : null}

      {/* 5. Recent activity (localized by event type; real timestamps) */}
      <DashboardSection id="erp-activity" title={t("sections.activity")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {recent.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("activity.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {recent.map((e, i) => (
                <li key={`${e.type}-${i}`} className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                  <span className="flex-1 text-body-compact text-text-primary" dir="auto">{t(`activity.${e.type}`)}</span>
                  <span className="shrink-0 text-caption text-text-muted" dir="ltr">{df.format(new Date(e.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DashboardSection>

      {/* 6. Safe actions */}
      <DashboardSection id="erp-actions" title={t("sections.actions")}>
        <SafeActionGrid actions={actions} LinkComponent={ErpLink} />
      </DashboardSection>
    </div>
  );
}

function StatusCard({
  title, rows, nf,
}: {
  title: string;
  rows: { key: string; count: number; badge: React.ReactNode }[];
  nf: Intl.NumberFormat;
}) {
  return (
    <div className="rounded-md border border-border-default bg-surface-primary p-5">
      <h3 className="mb-3 text-title-lg font-semibold text-text-primary">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-2">
            {r.badge}
            <span className="tabular-nums text-body-compact font-semibold text-text-primary" dir="ltr">{nf.format(r.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
