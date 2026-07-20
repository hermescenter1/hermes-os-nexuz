"use client";

import Link            from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowDefinition } from "@/lib/automation/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:   "bg-green-500/15 text-green-700 dark:text-green-400",
  PAUSED:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  DRAFT:    "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  ARCHIVED: "bg-red-500/15 text-red-400",
};

export function WorkflowListClient({ workflows }: { workflows: WorkflowDefinition[] }) {
  const locale = useLocale();
  const t      = useTranslations("automationOperations");
  // Display label for the trigger enum; falls back to the raw enum value.
  const triggerLabel = (type: string) =>
    t.has(`triggerLabels.${type}`) ? t(`triggerLabels.${type}`) : type;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("workflowList.heading", { count: workflows.length })}</h2>
        <Link
          href={`/${locale}/automation/workflows/new`}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {t("workflowList.newWorkflow")}
        </Link>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowList.colName")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowList.colTrigger")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowList.colStatus")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("workflowList.colUpdated")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workflows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("workflowList.empty")}{" "}
                  <Link href={`/${locale}/automation/workflows/new`} className="text-primary hover:underline">
                    {t("workflowList.createOne")}
                  </Link>
                </td>
              </tr>
            ) : (
              workflows.map(wf => (
                <tr key={wf.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/${locale}/automation/workflows/${wf.id}`} className="hover:text-primary">
                      {wf.name}
                    </Link>
                    {wf.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{wf.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {triggerLabel(wf.triggerType)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[wf.status] ?? ""}`}>
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(wf.updatedAt, locale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Link href={`/${locale}/automation/workflows/${wf.id}/builder`} className="text-xs text-muted-foreground hover:text-primary">
                        {t("workflowList.edit")}
                      </Link>
                      <Link href={`/${locale}/automation/workflows/${wf.id}`} className="text-xs text-primary hover:underline">
                        {t("workflowList.view")}
                      </Link>
                    </div>
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
