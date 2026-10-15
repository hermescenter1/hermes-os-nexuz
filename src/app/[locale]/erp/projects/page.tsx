import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }     from "next-intl/server";
import { listProjects }        from "@/lib/erp/operations";
import { ProjectListQuerySchema } from "@/lib/erp/ops-schemas";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }      from "@/components/erp/ErpScopeNotice";
import { ProjectListClient }   from "@/components/erp/ProjectListClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Projects");
export const dynamic  = "force-dynamic";

export default async function ErpProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const t          = await getTranslations("enterpriseOperations");
  const { status } = await searchParams;
  const access     = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    // An unknown status filter is ignored rather than passed to the query.
    const parsed = ProjectListQuerySchema.safeParse({ status });
    const query  = parsed.success ? parsed.data : ProjectListQuerySchema.parse({});
    try {
      const page = await listProjects(access.ctx, query);
      body = (<>
        <ProjectListClient page={page} endpoint={collectionEndpoint("/api/erp/projects", query)} />
      </>);
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("projects.pageTitle")}</h1>
      {body}
    </div>
  );
}
