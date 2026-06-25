"use client";

import Link            from "next/link";
import { usePathname } from "next/navigation";
import type { ErpOverview } from "@/lib/erp/types";

const KPI_COLOR = (v: number, warn: number, crit: number) =>
  v <= crit ? "text-red-500" : v <= warn ? "text-yellow-500" : "text-green-400";

export function ErpDashboardClient({ overview }: { overview: ErpOverview }) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  const kpis = [
    { label: "Active Projects",      value: overview.activeProjects,     link: `/${locale}/erp/projects`,    color: "" },
    { label: "Overdue Tasks",        value: overview.overdueTasks,       link: `/${locale}/erp/tasks`,       color: overview.overdueTasks > 0 ? "text-red-500" : "text-green-400" },
    { label: "Open Work Orders",     value: overview.openWorkOrders,     link: `/${locale}/erp/work-orders`, color: "" },
    { label: "Inventory Warnings",   value: overview.inventoryWarnings,  link: `/${locale}/erp/inventory`,   color: overview.inventoryWarnings > 0 ? "text-yellow-500" : "text-green-400" },
    { label: "Pending Approvals",    value: overview.pendingApprovals,   link: `/${locale}/erp/approvals`,   color: overview.pendingApprovals > 0 ? "text-yellow-500" : "" },
    { label: "Resource Utilization", value: `${overview.resourceUtilization}%`, link: `/${locale}/erp/resources`, color: KPI_COLOR(overview.resourceUtilization, 50, 30) },
  ];

  const budgetVariance = overview.totalBudget > 0
    ? Math.round(((overview.totalActualCost - overview.totalBudget) / overview.totalBudget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <Link key={kpi.label} href={kpi.link} className="rounded-xl border bg-card p-4 hover:bg-accent/30 transition-colors">
            <div className="text-xs text-muted-foreground mb-1 truncate">{kpi.label}</div>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Budget Summary */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Budget Overview</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Budget</span>
              <span className="font-medium">${(overview.totalBudget / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actual Cost</span>
              <span className="font-medium">${(overview.totalActualCost / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variance</span>
              <span className={`font-medium ${budgetVariance > 10 ? "text-red-500" : budgetVariance > 0 ? "text-yellow-500" : "text-green-400"}`}>
                {budgetVariance > 0 ? "+" : ""}{budgetVariance}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(100, overview.totalBudget > 0 ? Math.round((overview.totalActualCost / overview.totalBudget) * 100) : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Project Status */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Projects by Status</h3>
            <Link href={`/${locale}/erp/projects`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {(Object.entries(overview.projectsByStatus) as [string, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{status.toLowerCase().replace("_"," ")}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Work Orders */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Work Orders by Status</h3>
            <Link href={`/${locale}/erp/work-orders`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {(Object.entries(overview.workOrdersByStatus) as [string, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize text-xs">{status.toLowerCase().replace(/_/g," ")}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Task Status */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Task Pipeline</h3>
            <Link href={`/${locale}/erp/tasks`} className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(overview.tasksByStatus) as [string, number][]).map(([status, count]) => (
              <div key={status} className="text-center rounded-lg bg-muted/50 p-3">
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground mt-0.5 capitalize">{status.toLowerCase().replace("_"," ")}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-2">
            {overview.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              overview.recentActivity.map((event, i) => (
                <div key={i} className="flex items-start gap-3 text-sm py-1 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <p className="leading-tight">{event.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(event.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      {overview.kpiSummary.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Operational KPIs</h3>
            <Link href={`/${locale}/erp/kpis`} className="text-xs text-primary hover:underline">Full report</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {overview.kpiSummary.slice(0, 4).map(kpi => {
              const pct = kpi.target ? Math.round((kpi.value / kpi.target) * 100) : null;
              return (
                <div key={kpi.id} className="rounded-lg bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground mb-1">{kpi.name}</div>
                  <div className="text-xl font-bold">{kpi.value}{kpi.unit && <span className="text-xs ml-0.5 font-normal">{kpi.unit}</span>}</div>
                  {kpi.target && (
                    <div className="mt-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Target: {kpi.target}{kpi.unit}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
