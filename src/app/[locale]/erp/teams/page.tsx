import { getTranslations }    from "next-intl/server";
import { getTeams }           from "@/lib/erp/db";
import { TeamListClient }     from "@/components/erp/TeamListClient";
import { noIndexMetadata }    from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Teams");
export const dynamic  = "force-dynamic";

export default async function ErpTeamsPage() {
  const t     = await getTranslations("enterpriseOperations");
  const teams = await getTeams();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("teams.pageTitle")}</h1>
      <TeamListClient teams={teams} />
    </div>
  );
}
