"use client";

import { usePathname } from "next/navigation";
import type { AssetLifecycleEvent } from "@/lib/assets/types";

function evColor(type: string) {
  if (type === "COMMISSIONED")      return "bg-signal text-bg";
  if (type === "DEGRADED")          return "bg-warn text-bg";
  if (type === "MAINTENANCE_STARTED") return "bg-ice text-bg";
  if (type === "INSPECTION")        return "bg-ice/[0.08] text-ice";
  if (type === "FUNCTION_TEST")     return "bg-signal/[0.08] text-signal";
  if (type === "FIRMWARE_UPDATED")  return "bg-surface2 text-faint";
  return "bg-surface2 text-faint";
}
function evDot(type: string) {
  if (type === "COMMISSIONED")       return "bg-signal";
  if (type === "DEGRADED")           return "bg-warn";
  if (type === "MAINTENANCE_STARTED") return "bg-ice";
  if (type === "INSPECTION")         return "bg-ice";
  if (type === "FUNCTION_TEST")      return "bg-signal";
  return "bg-line2";
}

interface Props { events: AssetLifecycleEvent[] }

export function AssetLifecycleClient({ events }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";
  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const stateDistribution: Record<string, number> = {};
  for (const ev of events) {
    stateDistribution[ev.toState] = (stateDistribution[ev.toState] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "چرخه عمر دارایی" : "ASSET LIFECYCLE"}</p>
        <h1 className="text-xl font-semibold text-ink">{isFa ? "رویدادهای چرخه عمر" : "Lifecycle Events"}</h1>
        <p className="text-sm text-muted mt-1">{events.length} {isFa ? "رویداد ثبت‌شده" : "recorded events"}</p>
      </div>

      {/* State distribution */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-3">{isFa ? "توزیع حالت‌های چرخه عمر" : "Lifecycle State Distribution"}</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stateDistribution).sort((a, b) => b[1] - a[1]).map(([state, count]) => (
            <div key={state} className="flex items-center gap-2 bg-surface2 rounded-lg px-3 py-1.5 border border-line">
              <span className="text-sm font-semibold text-ink tabular-nums">{count}</span>
              <span className="text-xs text-muted">{state.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-5">{isFa ? "جدول زمانی رویدادها" : "Event Timeline"}</p>
        {sorted.length === 0 && (
          <p className="text-center py-8 text-muted">{isFa ? "رویدادی ثبت نشده" : "No events recorded"}</p>
        )}
        <div className="space-y-0">
          {sorted.map((ev, i) => (
            <div key={ev.id} className="flex gap-4 relative">
              {/* Line */}
              {i < sorted.length - 1 && (
                <div className="absolute start-[7px] top-6 bottom-0 w-px bg-line/50" />
              )}
              {/* Dot */}
              <div className={`w-3.5 h-3.5 rounded-full mt-1 shrink-0 z-10 ${evDot(ev.eventType)}`} />
              {/* Content */}
              <div className="flex-1 pb-5">
                <div className="flex flex-wrap items-start gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${evColor(ev.eventType)}`}>
                    {ev.eventType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-faint">{new Date(ev.occurredAt).toLocaleDateString()}</span>
                  {ev.performedBy && (
                    <span className="text-xs text-faint/70">{isFa ? "توسط" : "by"} {ev.performedBy}</span>
                  )}
                </div>
                {ev.fromState && (
                  <p className="text-xs text-faint mb-1">
                    {ev.fromState.replace(/_/g, " ")} → <span className="text-muted">{ev.toState.replace(/_/g, " ")}</span>
                  </p>
                )}
                {ev.notes && <p className="text-sm text-muted">{ev.notes}</p>}
                {ev.documents.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {ev.documents.map(d => (
                      <span key={d} className="text-xs bg-surface2 border border-line px-2 py-0.5 rounded text-faint">{d}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
