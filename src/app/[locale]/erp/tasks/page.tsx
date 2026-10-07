import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }     from "next-intl/server";
import { listTasks }          from "@/lib/erp/operations";
import { TaskListQuerySchema } from "@/lib/erp/ops-schemas";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }     from "@/components/erp/ErpScopeNotice";
import { TaskListClient }     from "@/components/erp/TaskListClient";
import { noIndexMetadata }    from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Tasks");
export const dynamic  = "force-dynamic";

export default async function ErpTasksPage({ searchParams }: { searchParams: Promise<{ projectId?: string; status?: string }> }) {
  const t                     = await getTranslations("enterpriseOperations");
  const { projectId, status } = await searchParams;
  const access                = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    // Unknown filters are ignored rather than passed to the query.
    const parsed = TaskListQuerySchema.safeParse({ projectId, status });
    const query  = parsed.success ? parsed.data : TaskListQuerySchema.parse({});
    try {
      const page = await listTasks(access.ctx, query);
      body = (<>
        <TaskListClient page={page} endpoint={collectionEndpoint("/api/erp/tasks", query)} />
      </>);
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("tasks.pageTitle")}</h1>
      {body}
    </div>
  );
}
