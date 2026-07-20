"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpTask } from "@/lib/erp/types";
import { formatDate } from "@/lib/i18n/format";

export function TaskDetailClient({ task }: { task: ErpTask & { comments?: unknown[] } }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{task.status.toLowerCase().replace("_"," ")}</span>
          <span className="text-xs text-muted-foreground">{task.priority}</span>
        </div>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        {task.description && <p className="text-muted-foreground mt-2">{task.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { label: t("tasks.dueDate"),        value: task.dueDate ? formatDate(task.dueDate, locale) : "—" },
          { label: t("tasks.estimatedHours"), value: task.estimatedHours ? `${task.estimatedHours}h` : "—" },
          { label: t("tasks.actualHours"),    value: task.actualHours   ? `${task.actualHours}h`    : "—" },
          { label: t("tasks.priority"),       value: task.priority },
        ].map(m => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
            <div className="font-medium">{String(m.value)}</div>
          </div>
        ))}
      </div>

      {task.projectId && (
        <div>
          <Link href={`/${locale}/erp/projects/${task.projectId}`} className="text-sm text-primary hover:underline">
            {t("tasks.viewProject")}
          </Link>
        </div>
      )}

      <div className="flex gap-2">
        <Link href={`/${locale}/erp/tasks`} className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent">{t("tasks.backToTasks")}</Link>
      </div>
    </div>
  );
}
