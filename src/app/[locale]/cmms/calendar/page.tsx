import { getCalendarEvents } from "@/lib/cmms/db";
import { CalendarClient }   from "@/components/cmms/CalendarClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Calendar");
export const dynamic  = "force-dynamic";

export default async function CalendarPage() {
  const t = await getTranslations("maintenanceOperations");
  const events = await getCalendarEvents();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.calendarPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.calendarPage.subtitle")}</p>
      </div>
      <CalendarClient events={events} />
    </div>
  );
}
