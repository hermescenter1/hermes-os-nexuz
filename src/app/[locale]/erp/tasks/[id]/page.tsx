import { notFound }          from "next/navigation";
import { getTranslations }   from "next-intl/server";
import { getTaskById }       from "@/lib/erp/db";
import { TaskDetailClient }  from "@/components/erp/TaskDetailClient";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Task");
export const dynamic  = "force-dynamic";

export default async function ErpTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t      = await getTranslations("enterpriseOperations");
  const { id } = await params;
  const task   = await getTaskById(id);
  if (!task) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold sr-only">{t("tasks.detailPageTitle")}</h1>
      <TaskDetailClient task={task} />
    </div>
  );
}
