import { notFound }        from "next/navigation";
import Link                from "next/link";
import { getTranslations } from "next-intl/server";
import { getProjectById }  from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }  from "@/components/erp/ErpScopeNotice";
import { MilestoneList }   from "@/components/erp/MilestoneList";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Milestones");
export const dynamic  = "force-dynamic";

export default async function MilestonesPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const t       = await getTranslations("enterpriseOperations");
  const { id }  = await params;
  const access  = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const project = await getProjectById(access.ctx, id);
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Link href={`../`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-bold">{t("projects.milestonesPageTitle")}</h1>
        </div>
        <MilestoneList projectId={project.id} page={project.milestones} />
      </div>
    );
  } catch (err) {
    if (pageErrorCode(err) === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
