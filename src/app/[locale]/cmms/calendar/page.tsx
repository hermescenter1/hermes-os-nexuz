import { getCalendarEvents } from "@/lib/cmms/db";
import { CalendarClient }   from "@/components/cmms/CalendarClient";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Calendar");
export const dynamic  = "force-dynamic";

export default async function CalendarPage() {
  const events = await getCalendarEvents();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Calendar</h1>
        <p className="text-muted-foreground text-sm mt-1">Scheduled maintenance events and planning view</p>
      </div>
      <CalendarClient events={events} />
    </div>
  );
}
