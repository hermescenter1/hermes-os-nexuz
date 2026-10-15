"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpProjectFullView } from "@/lib/erp/operations";
import { MilestoneList } from "./MilestoneList";

export function ProjectDetailClient({ project }: { project: ErpProjectFullView }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");

  // Money is null (never 0) for callers without financial access. Totals and counts are
  // database aggregates over the whole project, not sums over a page of rows.
  const totalCost = project.costTotal;
  const restricted = t("financials.restricted");
  const doneCount = project.taskSummary.done;
  const taskCount = project.taskSummary.total;
  const progress  = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/${locale}/erp/projects/${project.id}/milestones`} className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent">{t("projects.milestones")}</Link>
          <Link href={`/${locale}/erp/tasks?projectId=${project.id}`} className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent">{t("projects.tasks")}</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("projects.status"),     value: project.status.toLowerCase().replace("_"," ") },
          { label: t("projects.budget"),     value: project.budget === null ? restricted : project.budget ? `$${(project.budget / 1000).toFixed(0)}K` : "—" },
          { label: t("projects.actualCost"), value: totalCost === null ? restricted : `$${(totalCost / 1000).toFixed(1)}K` },
          { label: t("projects.progress"),   value: `${progress}%` },
        ].map(m => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
            <div className="font-bold capitalize">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t("projects.completion")}</span>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Milestones: first page here, the rest through the milestones route. */}
      {project.milestones.items.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">{t("projects.milestones")}</h3>
          <MilestoneList projectId={project.id} page={project.milestones} />
        </div>
      )}

      {/* Tasks: a short preview. The full list is the tasks page filtered to this project. */}
      {taskCount > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">{t("projects.tasksCount", { count: taskCount })}</h3>
          <div className="space-y-1">
            {project.tasks.items.slice(0, 10).map(task => (
              <Link key={task.id} href={`/${locale}/erp/tasks/${task.id}`} className="flex items-center justify-between text-sm py-1 border-b last:border-0 hover:text-primary">
                <span>{task.title}</span>
                <span className="text-muted-foreground capitalize text-xs">{task.status.toLowerCase().replace("_"," ")}</span>
              </Link>
            ))}
            {taskCount > 10 && (
              <Link href={`/${locale}/erp/tasks?projectId=${project.id}`} className="text-xs text-primary hover:underline pt-1 block">
                {t("projects.viewAllTasks", { count: taskCount })}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
