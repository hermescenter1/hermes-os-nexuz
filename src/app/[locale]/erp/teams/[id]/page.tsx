import { notFound }           from "next/navigation";
import { getTeam }            from "@/lib/erp/db";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { TeamDetailClient }   from "@/components/erp/TeamDetailClient";
import { ErpScopeNotice }     from "@/components/erp/ErpScopeNotice";
import { noIndexMetadata }    from "@/lib/seo/metadata";
import { ErpError }           from "@/lib/erp/tenant";
import { requirePermission }   from "@/lib/org/rbac";

export const metadata = noIndexMetadata("Team");
export const dynamic  = "force-dynamic";

export default async function ErpTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await resolveErpPageScope();
  if (!access.ok) return <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  try {
    const team = await getTeam(access.ctx, id);
    // Adding and removing members is a manage_erp action; the server enforces it on every write too.
    const canManage = requirePermission(access.ctx.scope.role, "manage_erp").ok;
    return <TeamDetailClient team={team} canManage={canManage} />;
  } catch (err) {
    if (err instanceof ErpError && err.code === "NOT_FOUND") notFound();
    return <ErpScopeNotice code={pageErrorCode(err)} />;
  }
}
