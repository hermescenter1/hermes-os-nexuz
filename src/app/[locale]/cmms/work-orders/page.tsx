import { getTasks }                from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Orders");
export const dynamic  = "force-dynamic";

export default async function WorkOrdersPage() {
  const t = await getTranslations("maintenanceOperations");
  const all      = await getTasks();
  const active   = all.filter(x => ["IN_PROGRESS","PLANNED","SCHEDULED","OVERDUE"].includes(x.status));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.workOrdersList.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.workOrdersList.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("pages.workOrdersList.kpiTotal"), value: all.length },
          { label: t("pages.workOrdersList.kpiActive"), value: all.filter(x => x.status === "IN_PROGRESS").length, color: "text-yellow-400" },
          { label: t("pages.workOrdersList.kpiOverdue"), value: all.filter(x => x.status === "OVERDUE").length, color: "text-red-400" },
          { label: t("pages.workOrdersList.kpiPlanned"), value: all.filter(x => ["PLANNED","SCHEDULED"].includes(x.status)).length, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
      <MaintenanceTasksClient tasks={active} title={t("pages.workOrdersList.clientHeading")} />
    </div>
  );
}
