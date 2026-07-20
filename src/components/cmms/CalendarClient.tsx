"use client";
import { useTranslations, useLocale } from "next-intl";
import type { MaintenanceCalendarEvent } from "@/lib/cmms/types";
import { formatDate } from "@/lib/i18n/format";

const EVENT_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  preventive:  { border: "border-s-2 border-ice/50",    bg: "bg-ice/[0.04]",    text: "text-ice"    },
  calibration: { border: "border-s-2 border-muted/40",  bg: "bg-muted/[0.04]",  text: "text-muted"  },
  inspection:  { border: "border-s-2 border-signal/40", bg: "bg-signal/[0.04]", text: "text-signal" },
  lubrication: { border: "border-s-2 border-warn/40",   bg: "bg-warn/[0.04]",   text: "text-warn"   },
  shutdown:    { border: "border-s-2 border-danger/50", bg: "bg-danger/[0.04]", text: "text-danger" },
  corrective:  { border: "border-s-2 border-warn/50",   bg: "bg-warn/[0.06]",   text: "text-warn"   },
  maintenance: { border: "border-s-2 border-faint/30",  bg: "bg-surface3",      text: "text-faint"  },
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW:       "text-signal",
  MEDIUM:    "text-warn",
  HIGH:      "text-warn",
  CRITICAL:  "text-danger",
  EMERGENCY: "text-danger",
};

function EventCard({ event: ev, dimmed = false }: { event: MaintenanceCalendarEvent; dimmed?: boolean }) {
  const locale = useLocale();
  const s = EVENT_STYLE[ev.eventType] ?? EVENT_STYLE.maintenance;
  return (
    <div className={`card-enterprise rounded-xl p-4 ${s.border} ${s.bg} ${dimmed ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-mono font-semibold capitalize ${s.text}`}>{ev.eventType}</span>
            <span className={`text-xs font-bold ${PRIORITY_COLOR[ev.priority] ?? "text-muted"}`}>{ev.priority}</span>
          </div>
          <h3 className="font-semibold text-ink text-sm">{ev.title}</h3>
          {ev.description && <p className="text-xs text-muted mt-0.5 line-clamp-1">{ev.description}</p>}
        </div>
        <div className="text-end shrink-0">
          <p className="text-xs font-mono font-medium text-ink">{formatDate(ev.startDate, locale)}</p>
          {ev.endDate && (
            <p className="text-xs text-faint font-mono">→ {formatDate(ev.endDate, locale)}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-3 text-xs text-faint">
        {ev.assetId     && <span>{ev.assetId}</span>}
        {ev.technicianId && <span>{ev.technicianId}</span>}
      </div>
    </div>
  );
}

export function CalendarClient({ events }: { events: MaintenanceCalendarEvent[] }) {
  const locale = useLocale();
  const t        = useTranslations("maintenanceOperations");
  const now      = new Date();
  const sorted   = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const upcoming = sorted.filter(e => new Date(e.startDate) >= now);
  const past     = sorted.filter(e => new Date(e.startDate) <  now);

  return (
    <div className="space-y-7">
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <p className="eyebrow-label text-signal">{t("calendar.upcomingEvents")}</p>
            <span className="text-xs text-faint font-mono">({upcoming.length})</span>
          </div>
          <div className="space-y-3">
            {upcoming.map(ev => <EventCard key={ev.id} event={ev} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <p className="eyebrow-label text-faint">{t("calendar.pastEvents")}</p>
            <span className="text-xs text-faint font-mono">({past.length})</span>
          </div>
          <div className="space-y-3">
            {past.map(ev => <EventCard key={ev.id} event={ev} dimmed />)}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <div className="card-enterprise rounded-xl px-5 py-12 text-center">
          <p className="text-muted text-sm">{t("calendar.empty")}</p>
        </div>
      )}
    </div>
  );
}
