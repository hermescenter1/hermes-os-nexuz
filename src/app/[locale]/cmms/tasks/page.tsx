import { getTasks }                from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Tasks");
export const dynamic  = "force-dynamic";

export default async function TasksPage() {
  const t = await getTranslations("maintenanceOperations");
  const tasks = await getTasks();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.tasksList.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.tasksList.subtitle")}</p>
      </div>
      <MaintenanceTasksClient tasks={tasks} title={t("pages.tasksList.clientHeading")} />
    </div>
  );
}
