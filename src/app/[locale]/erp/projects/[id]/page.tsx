import { notFound }            from "next/navigation";
import { getProjectById }      from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }      from "@/components/erp/ErpScopeNotice";
import { ProjectDetailClient } from "@/components/erp/ProjectDetailClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Project");
export const dynamic  = "force-dynamic";

export default async function ErpProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params;
  const access  = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const project = await getProjectById(access.ctx, id);
    return <ProjectDetailClient project={project} />;
  } catch (err) {
    if (pageErrorCode(err) === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
