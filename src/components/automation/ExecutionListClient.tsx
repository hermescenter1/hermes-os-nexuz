"use client";

import Link            from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowExecution } from "@/lib/automation/types";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:   "bg-green-500/15 text-green-700 dark:text-green-400",
  FAILED:    "bg-red-500/15 text-red-700 dark:text-red-400",
  PARTIAL:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  CANCELLED: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  RUNNING:   "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  QUEUED:    "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

export function ExecutionListClient({ executions }: { executions: WorkflowExecution[] }) {
  const locale = useLocale();
  const t      = useTranslations("automationOperations");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("executionList.heading", { count: executions.length })}</h2>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colStatus")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colWorkflow")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colTriggeredBy")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colDuration")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colType")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("executionList.colDate")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {executions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t("executionList.empty")}</td>
              </tr>
            ) : (
              executions.map(e => (
                <tr key={e.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] ?? ""}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/${locale}/automation/workflows/${e.workflowId}`} className="text-xs hover:text-primary font-mono">
                      {e.workflowId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.triggeredBy ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{e.durationMs != null ? `${e.durationMs}ms` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.isSimulation ? t("executionList.typeSimulation") : t("executionList.typeLive")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/${locale}/automation/executions/${e.id}`} className="text-xs text-primary hover:underline">
                      {t("executionList.view")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
