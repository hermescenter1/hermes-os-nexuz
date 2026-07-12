import { getTranslations }     from "next-intl/server";
import { getTasks }           from "@/lib/erp/db";
import { TaskListClient }     from "@/components/erp/TaskListClient";
import { noIndexMetadata }    from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Tasks");
export const dynamic  = "force-dynamic";

export default async function ErpTasksPage({ searchParams }: { searchParams: Promise<{ projectId?: string; status?: string }> }) {
  const t                     = await getTranslations("enterpriseOperations");
  const { projectId, status } = await searchParams;
  const tasks                 = await getTasks(projectId, status);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("tasks.pageTitle")}</h1>
      <TaskListClient tasks={tasks} />
    </div>
  );
}
