import { getTasks, getFailures, getDowntime, getCosts, getSpareParts } from "@/lib/cmms/db";
import { computeKpis }   from "@/lib/cmms/kpi";
import { ReportsClient } from "@/components/cmms/ReportsClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Reports");
export const dynamic  = "force-dynamic";

export default async function ReportsPage() {
  const t = await getTranslations("maintenanceOperations");
  const [tasks, failures, downtime, costs, spares] = await Promise.all([
    getTasks(), getFailures(), getDowntime(), getCosts(), getSpareParts(),
  ]);

  const kpis = computeKpis(tasks, failures, downtime);

  const failureByCategory: Record<string, number> = {};
  for (const f of failures) {
    failureByCategory[f.category] = (failureByCategory[f.category] ?? 0) + 1;
  }
  const failurePareto = Object.entries(failureByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({ category, count }));

  const costByCategory: Record<string, number> = {};
  let totalCost = 0;
  for (const c of costs) {
    costByCategory[c.category] = (costByCategory[c.category] ?? 0) + c.amount;
    totalCost += c.amount;
  }

  const report = {
    kpis,
    failurePareto,
    costByCategory,
    totalCost,
    lowStockParts: spares.filter(p => p.stockQty <= p.minStockQty).length,
    totalParts:    spares.length,
    taskSummary: {
      total:      tasks.length,
      completed:  tasks.filter(t => t.status === "COMPLETED").length,
      overdue:    tasks.filter(t => t.status === "OVERDUE").length,
      inProgress: tasks.filter(t => t.status === "IN_PROGRESS").length,
      planned:    tasks.filter(t => ["PLANNED","SCHEDULED"].includes(t.status)).length,
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.reportsPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.reportsPage.subtitle")}</p>
      </div>
      <ReportsClient report={report} />
    </div>
  );
}
