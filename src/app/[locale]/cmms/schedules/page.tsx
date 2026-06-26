import { getSchedules }     from "@/lib/cmms/db";
import { SchedulesClient } from "@/components/cmms/SchedulesClient";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Schedules");
export const dynamic  = "force-dynamic";

export default async function SchedulesPage() {
  const schedules = await getSchedules();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Schedules</h1>
        <p className="text-muted-foreground text-sm mt-1">Planned and upcoming maintenance occurrences</p>
      </div>
      <SchedulesClient schedules={schedules} />
    </div>
  );
}
