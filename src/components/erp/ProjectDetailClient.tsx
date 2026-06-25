"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpProjectFull } from "@/lib/erp/types";

export function ProjectDetailClient({ project }: { project: ErpProjectFull }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  const totalCost = project.costs?.reduce((s, c) => s + c.amount, 0) ?? 0;
  const doneCount = project.tasks?.filter(t => t.status === "DONE").length ?? 0;
  const taskCount = project.tasks?.length ?? 0;
  const progress  = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Link href={`/${locale}/erp/projects/${project.id}/milestones`} className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent">Milestones</Link>
          <Link href={`/${locale}/erp/tasks?projectId=${project.id}`} className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent">Tasks</Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Status",    value: project.status.toLowerCase().replace("_"," ") },
          { label: "Budget",    value: project.budget ? `$${(project.budget / 1000).toFixed(0)}K` : "—" },
          { label: "Actual Cost", value: `$${(totalCost / 1000).toFixed(1)}K` },
          { label: "Progress",  value: `${progress}%` },
        ].map(m => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
            <div className="font-bold capitalize">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Completion</span>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Milestones */}
      {project.milestones && project.milestones.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Milestones</h3>
          <div className="space-y-2">
            {project.milestones.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span className={m.completedAt ? "line-through text-muted-foreground" : ""}>{m.name}</span>
                <span className="text-muted-foreground">{m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {project.tasks && project.tasks.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Tasks ({project.tasks.length})</h3>
          <div className="space-y-1">
            {project.tasks.slice(0, 10).map(t => (
              <Link key={t.id} href={`/${locale}/erp/tasks/${t.id}`} className="flex items-center justify-between text-sm py-1 border-b last:border-0 hover:text-primary">
                <span>{t.title}</span>
                <span className="text-muted-foreground capitalize text-xs">{t.status.toLowerCase().replace("_"," ")}</span>
              </Link>
            ))}
            {project.tasks.length > 10 && (
              <Link href={`/${locale}/erp/tasks?projectId=${project.id}`} className="text-xs text-primary hover:underline pt-1 block">
                View all {project.tasks.length} tasks
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
