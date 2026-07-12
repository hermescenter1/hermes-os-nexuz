"use client";

import Link            from "next/link";
import { useState }    from "react";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowDefinitionFull, WorkflowExecution } from "@/lib/automation/types";

type Tab = "overview" | "conditions" | "actions" | "executions";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   "bg-green-500/15 text-green-700 dark:text-green-400",
  PAUSED:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  DRAFT:    "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  ARCHIVED: "bg-red-500/15 text-red-400",
};

const EXEC_STATUS_COLORS: Record<string, string> = {
  SUCCESS:   "text-green-600 dark:text-green-400",
  FAILED:    "text-red-600 dark:text-red-400",
  PARTIAL:   "text-yellow-600 dark:text-yellow-400",
  CANCELLED: "text-slate-500",
};

export function WorkflowDetailClient({
  workflow,
  executions,
}: {
  workflow:   WorkflowDefinitionFull;
  executions: WorkflowExecution[];
}) {
  const [tab, setTab]   = useState<Tab>("overview");
  const locale          = useLocale();
  const t               = useTranslations("automationOperations");

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview",   label: t("workflowDetail.tabOverview") },
    { id: "conditions", label: t("workflowDetail.tabConditions", { count: workflow.conditions.length }) },
    { id: "actions",    label: t("workflowDetail.tabActions", { count: workflow.actions.length }) },
    { id: "executions", label: t("workflowDetail.tabExecutions", { count: executions.length }) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[workflow.status] ?? ""}`}>
              {workflow.status}
            </span>
          </div>
          {workflow.description && (
            <p className="text-muted-foreground">{workflow.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/automation/workflows/${workflow.id}/builder`}
            className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
          >
            {t("workflowDetail.edit")}
          </Link>
          <Link
            href={`/${locale}/automation/workflows`}
            className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
          >
            {t("workflowDetail.back")}
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(tb => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tb.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold">{t("workflowDetail.trigger")}</h3>
            <p className="text-sm font-mono text-muted-foreground">{workflow.triggerType}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold">{t("workflowDetail.meta")}</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("workflowDetail.created")}</dt>
                <dd>{new Date(workflow.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("workflowDetail.updated")}</dt>
                <dd>{new Date(workflow.updatedAt).toLocaleDateString()}</dd>
              </div>
              {workflow.templateId && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("workflowDetail.template")}</dt>
                  <dd>
                    <Link href={`/${locale}/automation/templates/${workflow.templateId}`} className="text-primary hover:underline text-xs">
                      {workflow.templateId}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {tab === "conditions" && (
        <div className="space-y-3">
          {workflow.conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workflowDetail.noConditions")}</p>
          ) : (
            workflow.conditions.map(c => (
              <div key={c.id} className="rounded-xl border bg-card p-4 text-sm space-y-1">
                <div className="font-medium font-mono">{c.type}</div>
                {c.field && <div className="text-muted-foreground">{t("workflowDetail.fieldLabel")} <span className="font-mono">{c.field}</span></div>}
                {c.value && <div className="text-muted-foreground">{t("workflowDetail.valueLabel")} <span className="font-mono">{c.value}</span></div>}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "actions" && (
        <div className="space-y-3">
          {workflow.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workflowDetail.noActions")}</p>
          ) : (
            workflow.actions.map(a => (
              <div key={a.id} className="rounded-xl border bg-card p-4 text-sm">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{a.order}</span>
                  <span className="font-medium font-mono">{a.type}</span>
                </div>
                {Object.keys(a.config).length > 0 && (
                  <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-auto">
                    {JSON.stringify(a.config, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "executions" && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowDetail.colStatus")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowDetail.colTriggeredBy")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowDetail.colDuration")}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowDetail.colDate")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {executions.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("workflowDetail.empty")}</td></tr>
              ) : (
                executions.map(e => (
                  <tr key={e.id} className="hover:bg-accent/30">
                    <td className={`px-4 py-3 font-medium text-xs ${EXEC_STATUS_COLORS[e.status] ?? ""}`}>{e.status}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.triggeredBy ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{e.durationMs != null ? `${e.durationMs}ms` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/${locale}/automation/executions/${e.id}`} className="text-xs text-primary hover:underline">{t("workflowDetail.view")}</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
