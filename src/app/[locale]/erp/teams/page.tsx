import { getTranslations }    from "next-intl/server";
import { listTeams }          from "@/lib/erp/db";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { TeamListClient }     from "@/components/erp/TeamListClient";
import { ErpScopeNotice }     from "@/components/erp/ErpScopeNotice";
import { noIndexMetadata }    from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Teams");
export const dynamic  = "force-dynamic";

export default async function ErpTeamsPage() {
  const t = await getTranslations("enterpriseOperations");
  const access = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    try {
      const page = await listTeams(access.ctx, { limit: 50 });
      body = <TeamListClient page={page} endpoint="/api/erp/teams" />;
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("teams.pageTitle")}</h1>
      {body}
    </div>
  );
}
