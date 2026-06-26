import { getTasks }                from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Work Orders");
export const dynamic  = "force-dynamic";

export default async function WorkOrdersPage() {
  const all      = await getTasks();
  const active   = all.filter(t => ["IN_PROGRESS","PLANNED","SCHEDULED","OVERDUE"].includes(t.status));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Work Orders</h1>
        <p className="text-muted-foreground text-sm mt-1">Active and pending maintenance work orders</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: all.length },
          { label: "Active", value: all.filter(t => t.status === "IN_PROGRESS").length, color: "text-yellow-400" },
          { label: "Overdue", value: all.filter(t => t.status === "OVERDUE").length, color: "text-red-400" },
          { label: "Planned", value: all.filter(t => ["PLANNED","SCHEDULED"].includes(t.status)).length, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className={`text-2xl font-bold ${color ?? ""}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
      <MaintenanceTasksClient tasks={active} title="Active Work Orders" />
    </div>
  );
}
