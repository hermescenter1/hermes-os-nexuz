"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ChildPage } from "@/lib/erp/pagination";
import type { ErpProjectMilestone } from "@/lib/erp/types";
import { formatDate } from "@/lib/i18n/format";
import { ErpPagedList } from "./ErpPagedList";

/** The milestones of one project, continued through the project's milestones route. */
export function MilestoneList({ projectId, page }: { projectId: string; page: ChildPage<ErpProjectMilestone> }) {
  const locale = useLocale();
  const t = useTranslations("enterpriseOperations");

  if (page.items.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{t("projects.noMilestones")}</div>;
  }
  return (
    <ErpPagedList
      page={page}
      endpoint={`/api/erp/projects/${projectId}/milestones`}
      renderItem={m => (
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
          <div>
            <div className={`font-medium ${m.completedAt ? "line-through text-muted-foreground" : ""}`}>{m.name}</div>
            {m.description && <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>}
          </div>
          <div className="text-xs text-muted-foreground shrink-0 ml-4">
            {m.dueDate ? formatDate(m.dueDate, locale) : "—"}
            {m.completedAt && <span className="ml-2 text-green-400">{t("projects.milestoneDone")}</span>}
          </div>
        </div>
      )}
    />
  );
}
