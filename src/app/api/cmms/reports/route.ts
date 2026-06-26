import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getTasks, getFailures, getDowntime, getCosts, getSpareParts } from "@/lib/cmms/db";
import { computeKpis }   from "@/lib/cmms/kpi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [tasks, failures, downtime, costs, spares] = await Promise.all([
    getTasks(),
    getFailures(),
    getDowntime(),
    getCosts(),
    getSpareParts(),
  ]);

  const kpis = computeKpis(tasks, failures, downtime);

  // Failure Pareto by category
  const failureByCategory: Record<string, number> = {};
  for (const f of failures) {
    failureByCategory[f.category] = (failureByCategory[f.category] ?? 0) + 1;
  }
  const failurePareto = Object.entries(failureByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  // Cost by category
  const costByCategory: Record<string, number> = {};
  let totalCost = 0;
  for (const c of costs) {
    costByCategory[c.category] = (costByCategory[c.category] ?? 0) + c.amount;
    totalCost += c.amount;
  }

  // Low stock alerts
  const lowStockParts = spares.filter(p => p.stockQty <= p.minStockQty);

  return NextResponse.json({
    kpis,
    failurePareto,
    costByCategory,
    totalCost,
    lowStockParts: lowStockParts.length,
    totalParts: spares.length,
    taskSummary: {
      total: tasks.length,
      completed: tasks.filter(t => t.status === "COMPLETED").length,
      overdue:   tasks.filter(t => t.status === "OVERDUE").length,
      inProgress: tasks.filter(t => t.status === "IN_PROGRESS").length,
      planned:   tasks.filter(t => ["PLANNED","SCHEDULED"].includes(t.status)).length,
    },
  });
}
