import { getTasks }                from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Tasks");
export const dynamic  = "force-dynamic";

export default async function TasksPage() {
  const tasks = await getTasks();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Tasks</h1>
        <p className="text-muted-foreground text-sm mt-1">All maintenance tasks and assignments</p>
      </div>
      <MaintenanceTasksClient tasks={tasks} title="All Tasks" />
    </div>
  );
}
