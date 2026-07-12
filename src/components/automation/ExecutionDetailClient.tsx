"use client";

import Link            from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowExecutionFull } from "@/lib/automation/types";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:   "bg-green-500/15 text-green-700 dark:text-green-400",
  FAILED:    "bg-red-500/15 text-red-700 dark:text-red-400",
  PARTIAL:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  CANCELLED: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  RUNNING:   "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  QUEUED:    "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO:  "text-blue-600 dark:text-blue-400",
  WARN:  "text-yellow-600 dark:text-yellow-400",
  ERROR: "text-red-600 dark:text-red-400",
};

export function ExecutionDetailClient({ execution }: { execution: WorkflowExecutionFull }) {
  const locale = useLocale();
  const t      = useTranslations("automationOperations");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold">{t("executionDetail.title")}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[execution.status] ?? ""}`}>
              {execution.status}
            </span>
            {execution.isSimulation && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/15 text-purple-700 dark:text-purple-400">
                {t("executionDetail.simulation")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{execution.id}</p>
        </div>
        <Link
          href={`/${locale}/automation/executions`}
          className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent transition-colors"
        >
          {t("executionDetail.back")}
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("executionDetail.workflow")}</div>
          {execution.workflow ? (
            <Link href={`/${locale}/automation/workflows/${execution.workflow.id}`} className="font-medium hover:text-primary text-sm">
              {execution.workflow.name}
            </Link>
          ) : (
            <span className="font-mono text-xs">{execution.workflowId}</span>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("executionDetail.triggeredBy")}</div>
          <div className="font-medium">{execution.triggeredBy ?? t("executionDetail.triggeredBySystem")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("executionDetail.duration")}</div>
          <div className="font-medium">{execution.durationMs != null ? `${execution.durationMs}ms` : "—"}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("executionDetail.started")}</div>
          <div className="font-medium">{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "—"}</div>
        </div>
      </div>

      {execution.errorMessage && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
          <span className="font-medium">{t("executionDetail.errorPrefix")}</span>{execution.errorMessage}
        </div>
      )}

      {execution.steps.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t("executionDetail.steps", { count: execution.steps.length })}</h3>
          {execution.steps.map(step => (
            <div key={step.id} className="rounded-xl border bg-card p-4 text-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{step.stepOrder}</span>
                <span className="font-mono font-medium">{step.stepType}</span>
                <span className={`text-xs ml-auto ${step.status === "SUCCESS" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                  {step.status}
                </span>
                {step.durationMs != null && <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>}
              </div>
              {(step.output as { preview?: string }).preview && (
                <p className="text-xs text-muted-foreground">{(step.output as { preview: string }).preview}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {execution.logs.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">{t("executionDetail.logs", { count: execution.logs.length })}</h3>
          <div className="rounded-xl border bg-muted/30 p-4 font-mono text-xs space-y-1 max-h-64 overflow-auto">
            {execution.logs.map(log => (
              <div key={log.id} className="flex gap-3">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className={`${LOG_LEVEL_COLORS[log.level] ?? ""} shrink-0 w-12`}>[{log.level}]</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
