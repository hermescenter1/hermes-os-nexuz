import { getDowntime }      from "@/lib/cmms/db";
import { DowntimeClient }  from "@/components/cmms/DowntimeClient";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Downtime Records");
export const dynamic  = "force-dynamic";

export default async function DowntimePage() {
  const downtime = await getDowntime();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Downtime Records</h1>
        <p className="text-muted-foreground text-sm mt-1">Equipment downtime tracking and production loss analysis</p>
      </div>
      <DowntimeClient downtime={downtime} />
    </div>
  );
}
