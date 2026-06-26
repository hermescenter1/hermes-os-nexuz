"use client";

import type { MaintenanceCalendarEvent } from "@/lib/cmms/types";

const EVENT_TYPE_STYLE: Record<string, string> = {
  preventive:  "border-blue-500/40 bg-blue-500/10",
  calibration: "border-purple-500/40 bg-purple-500/10",
  inspection:  "border-cyan-500/40 bg-cyan-500/10",
  lubrication: "border-yellow-500/40 bg-yellow-500/10",
  shutdown:    "border-red-500/40 bg-red-500/10",
  corrective:  "border-orange-500/40 bg-orange-500/10",
  maintenance: "border-slate-500/40 bg-slate-500/10",
};

export function CalendarClient({ events }: { events: MaintenanceCalendarEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const upcoming = sorted.filter(e => new Date(e.startDate) >= new Date());
  const past     = sorted.filter(e => new Date(e.startDate) <  new Date());

  return (
    <div className="space-y-8">
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-4 text-green-400">Upcoming Events ({upcoming.length})</h2>
          <div className="space-y-3">
            {upcoming.map(ev => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-4 text-muted-foreground">Past Events ({past.length})</h2>
          <div className="space-y-3">
            {past.map(ev => (
              <EventCard key={ev.id} event={ev} dimmed />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EventCard({ event: ev, dimmed = false }: { event: MaintenanceCalendarEvent; dimmed?: boolean }) {
  const style = EVENT_TYPE_STYLE[ev.eventType] ?? EVENT_TYPE_STYLE.maintenance;
  return (
    <div className={`rounded-xl border p-4 ${style} ${dimmed ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">{ev.title}</h3>
          {ev.description && <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium">{new Date(ev.startDate).toLocaleDateString()}</p>
          {ev.endDate && (
            <p className="text-xs text-muted-foreground">→ {new Date(ev.endDate).toLocaleDateString()}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        {ev.assetId && <span>Asset: {ev.assetId}</span>}
        {ev.technicianId && <span>Tech: {ev.technicianId}</span>}
        <span className="capitalize">{ev.eventType}</span>
        <span className={`ml-auto font-medium ${
          ev.priority === "EMERGENCY" ? "text-red-400" :
          ev.priority === "CRITICAL"  ? "text-red-400" :
          ev.priority === "HIGH"      ? "text-orange-400" : "text-muted-foreground"
        }`}>{ev.priority}</span>
      </div>
    </div>
  );
}
