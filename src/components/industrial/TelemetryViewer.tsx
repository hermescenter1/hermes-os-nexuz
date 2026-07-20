"use client";

import { useState, useEffect } from "react";
import { GlassCard }           from "@/components/ui/GlassCard";
import { DashboardPanel }      from "@/components/ui/DashboardPanel";
import { useTranslations, useLocale }     from "next-intl";
import type { TelemetryRecord, TelemetryQuality } from "@/lib/industrial/types";
import { formatDate } from "@/lib/i18n/format";

const QUALITY_COLORS: Record<TelemetryQuality, string> = {
  GOOD:      "text-signal",
  BAD:       "text-red-400",
  UNCERTAIN: "text-amber-400",
  STALE:     "text-muted",
};

export function TelemetryViewer() {
  const locale = useLocale();
  const t = useTranslations("industrial");
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial/telemetry?limit=50")
      .then((r) => r.json())
      .then((d) => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => { setError((t as unknown as (k: string) => string)("loadError")); setLoading(false); });
  }, [t]);

  if (loading) {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm animate-pulse">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }
  if (error) {
    return (
      <DashboardPanel title="">
        <p className="text-red-400 text-sm">{error}</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title={(t as unknown as (k: string) => string)("telemetry.title")}>
      {records.length === 0 ? (
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("telemetry.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted border-b border-line">
                <th className="text-left py-2 pr-4">Tag</th>
                <th className="text-left py-2 pr-4">Value</th>
                <th className="text-left py-2 pr-4">Quality</th>
                <th className="text-left py-2 pr-4">Unit</th>
                <th className="text-left py-2">Received</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} className="border-b border-line/40 hover:bg-surface/30 transition-colors">
                  <td className="py-1.5 pr-4 text-ink truncate max-w-[180px]">{rec.tag}</td>
                  <td className="py-1.5 pr-4 text-signal">
                    {typeof rec.value === "object" ? JSON.stringify(rec.value) : String(rec.value ?? "—")}
                    {rec.unit ? <span className="text-muted ml-1">{rec.unit}</span> : null}
                  </td>
                  <td className={`py-1.5 pr-4 uppercase ${QUALITY_COLORS[rec.quality]}`}>{rec.quality}</td>
                  <td className="py-1.5 pr-4 text-muted">{rec.unit ?? "—"}</td>
                  <td className="py-1.5 text-muted">{formatDate(rec.receivedAt, locale, { timeStyle: "medium" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardPanel>
  );
}
