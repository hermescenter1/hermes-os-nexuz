import { notFound }          from "next/navigation";
import { getTranslations }   from "next-intl/server";
import { getTaskById }       from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }    from "@/components/erp/ErpScopeNotice";
import { TaskDetailClient }  from "@/components/erp/TaskDetailClient";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Task");
export const dynamic  = "force-dynamic";

export default async function ErpTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t      = await getTranslations("enterpriseOperations");
  const { id } = await params;
  const access = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const task = await getTaskById(access.ctx, id);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold sr-only">{t("tasks.detailPageTitle")}</h1>
        <TaskDetailClient task={task} />
      </div>
    );
  } catch (err) {
    if (pageErrorCode(err) === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
