import { getTechnicians, getTeams, getWorkCenters } from "@/lib/cmms/db";
import { SettingsClient }                          from "@/components/cmms/SettingsClient";
import { noIndexMetadata }                         from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Settings");
export const dynamic  = "force-dynamic";

export default async function SettingsPage() {
  const [technicians, teams, workCenters] = await Promise.all([
    getTechnicians(), getTeams(), getWorkCenters(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CMMS Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Work centers, teams, technicians, and system configuration
        </p>
      </div>
      <SettingsClient technicians={technicians} teams={teams} workCenters={workCenters} />
    </div>
  );
}
