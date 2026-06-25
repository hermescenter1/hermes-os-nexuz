"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AutomationOverview, WorkflowExecution } from "@/lib/automation/types";

const STATUS_COLORS: Record<string, string> = {
  SUCCESS:   "bg-green-500/15 text-green-700 dark:text-green-400",
  FAILED:    "bg-red-500/15 text-red-700 dark:text-red-400",
  PARTIAL:   "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  CANCELLED: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  RUNNING:   "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  QUEUED:    "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

function ExecRow({ exec, locale }: { exec: WorkflowExecution; locale: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent/50 text-sm">
      <div className="flex items-center gap-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[exec.status] ?? ""}`}>
          {exec.status}
        </span>
        <span className="text-muted-foreground font-mono text-xs truncate max-w-[180px]">{exec.workflowId}</span>
        {exec.isSimulation && <span className="text-xs text-purple-500">[sim]</span>}
      </div>
      <div className="flex items-center gap-4 text-muted-foreground">
        {exec.durationMs != null && <span className="text-xs">{exec.durationMs}ms</span>}
        <Link href={`/${locale}/automation/executions/${exec.id}`} className="text-xs text-primary hover:underline">
          view
        </Link>
      </div>
    </div>
  );
}

export function AutomationDashboardClient({ overview }: { overview: AutomationOverview }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  const kpis = [
    { label: "Active Workflows",   value: overview.activeWorkflows  },
    { label: "Executions Today",   value: overview.executionsToday  },
    { label: "Success Rate",       value: `${overview.successRate}%` },
    { label: "Failed Executions",  value: overview.failedExecutions },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground mb-1">{kpi.label}</div>
            <div className="text-2xl font-bold">{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Executions</h3>
            <Link href={`/${locale}/automation/executions`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-1">
            {overview.recentExecutions.length === 0
              ? <p className="text-sm text-muted-foreground">No executions yet.</p>
              : overview.recentExecutions.map(e => <ExecRow key={e.id} exec={e} locale={locale} />)
            }
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold mb-4">Workflow Status Breakdown</h3>
          <div className="space-y-3">
            {(Object.entries(overview.workflowsByStatus) as [string, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{status.toLowerCase()}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, (count / Math.max(1, overview.activeWorkflows + 2)) * 100)}%` }}
                    />
                  </div>
                  <span className="font-medium w-4 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-semibold mt-6 mb-4">Popular Templates</h3>
          <div className="space-y-2">
            {overview.mostUsedTemplates.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <Link href={`/${locale}/automation/templates/${t.id}`} className="hover:text-primary truncate max-w-[200px]">
                  {t.name}
                </Link>
                <span className="text-muted-foreground">{t.usageCount} uses</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
