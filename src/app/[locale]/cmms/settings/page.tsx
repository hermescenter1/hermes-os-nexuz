import { getTechnicians, getTeams, getWorkCenters } from "@/lib/cmms/db";
import { SettingsClient }                          from "@/components/cmms/SettingsClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }                         from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Settings");
export const dynamic  = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations("maintenanceOperations");
  const [technicians, teams, workCenters] = await Promise.all([
    getTechnicians(), getTeams(), getWorkCenters(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.settingsPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.settingsPage.subtitle")}</p>
      </div>
      <SettingsClient technicians={technicians} teams={teams} workCenters={workCenters} />
    </div>
  );
}
