"use client";

import { useLocale } from "next-intl";

import { useState, useEffect, useMemo } from "react";
import type { VendorZone, OperationalStatus } from "@/lib/operations/types";
import { formatDate } from "@/lib/i18n/format";

interface SitesResponse {
  zones:   VendorZone[];
  builtAt: string;
}

type FilterState = "all" | OperationalStatus;

const STATUS_BADGE: Record<OperationalStatus, string> = {
  critical:  "hs-badge hs--risk",
  warning:   "hs-badge hs--warning",
  online:    "hs-badge hs--reasoning",
  simulated: "hs-badge hs--nominal",
};

const STATUS_BAR: Record<OperationalStatus, string> = {
  critical:  "bg-danger",
  warning:   "bg-warn",
  online:    "bg-signal",
  simulated: "bg-muted",
};

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-signal" :
    score >= 60 ? "bg-warn"   :
    "bg-danger";
  return (
    <div className="h-1 rounded bg-line">
      <div
        className={`h-1 rounded ${color} transition-all`}
        style={{ inlineSize: `${score}%` }}
      />
    </div>
  );
}

function ZoneCard({ zone }: { zone: VendorZone }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-body text-sm font-semibold text-ink truncate">{zone.name}</p>
          <p className="kpi-label text-faint mt-0.5">{zone.vendor.toUpperCase()} · TECHNOLOGY ZONE</p>
        </div>
        <span className={STATUS_BADGE[zone.status]}>{zone.status.toUpperCase()}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 border border-line rounded-lg overflow-hidden">
        {[
          { label: "Assets",  value: zone.assetCount,  color: "text-ink"    },
          { label: "Alarms",  value: zone.alarmCount,  color: zone.alarmCount > 0 ? "text-warn" : "text-muted" },
          { label: "Cases",   value: zone.caseCount,   color: "text-ink"    },
        ].map((kpi, i) => (
          <div key={kpi.label} className={`px-3 py-2 bg-bg ${i < 2 ? "border-e border-line" : ""}`}>
            <p className="kpi-label mb-0.5">{kpi.label}</p>
            <p className={`font-mono text-base font-semibold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Alert breakdown */}
      {zone.alarmCount > 0 && (
        <div className="flex items-center gap-2">
          {zone.criticalAlarms > 0 && (
            <span className="hs-badge hs--risk">{zone.criticalAlarms} critical</span>
          )}
          {zone.warningAlarms > 0 && (
            <span className="hs-badge hs--warning">{zone.warningAlarms} warning</span>
          )}
        </div>
      )}

      {/* Health score */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="kpi-label">Zone Health</span>
          <span className={`kpi-label ${
            zone.healthScore >= 80 ? "text-signal" :
            zone.healthScore >= 60 ? "text-warn"   : "text-danger"
          }`}>{zone.healthScore}%</span>
        </div>
        <HealthBar score={zone.healthScore} />
      </div>

      {/* Risk score */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="kpi-label">Operational Risk</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 rounded bg-line overflow-hidden">
            <div
              className={STATUS_BAR[zone.status]}
              style={{ width: `${zone.riskScore}%`, height: "100%" }}
            />
          </div>
          <span className="font-mono text-xs text-ink">{zone.riskScore}</span>
        </div>
      </div>

      {/* Protocols */}
      {zone.protocols.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {zone.protocols.slice(0, 4).map(p => (
            <span key={p} className="font-mono text-[0.55rem] px-1.5 py-0.5 rounded bg-surface2 border border-line text-faint">{p}</span>
          ))}
          {zone.protocols.length > 4 && (
            <span className="kpi-label text-faint">+{zone.protocols.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function SitesMonitorClient() {
  const locale = useLocale();
  const [data,    setData]    = useState<SitesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<FilterState>("all");

  useEffect(() => {
    fetch("/api/operations/sites")
      .then(r => r.json())
      .then((d: SitesResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load site data"); setLoading(false); });
  }, []);

  const visibleZones = useMemo(() =>
    !data?.zones ? [] :
    filter === "all" ? data.zones :
    data.zones.filter(z => z.status === filter),
    [data, filter],
  );

  // Summary counts
  const counts = useMemo(() => {
    if (!data?.zones) return { total: 0, critical: 0, warning: 0, online: 0 };
    return {
      total:    data.zones.length,
      critical: data.zones.filter(z => z.status === "critical").length,
      warning:  data.zones.filter(z => z.status === "warning").length,
      online:   data.zones.filter(z => z.status === "online").length,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1,2,3,4,5,6,7].map(i => (
          <div key={i} className="rounded-xl border border-line bg-surface px-4 py-4 h-52 animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">{error ?? "Site data unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Summary KPI strip */}
      <div className="global-ops-strip">
        {[
          { label: "Total Zones",    value: counts.total,    color: "text-ink"    },
          { label: "Critical",       value: counts.critical, color: "text-danger" },
          { label: "Warning",        value: counts.warning,  color: "text-warn"   },
          { label: "Online",         value: counts.online,   color: "text-signal" },
          {
            label: "Avg Health",
            value: `${Math.round(data.zones.reduce((s, z) => s + z.healthScore, 0) / (data.zones.length || 1))}%`,
            color: "text-ink",
          },
          {
            label: "Total Assets",
            value: data.zones.reduce((s, z) => s + z.assetCount, 0),
            color: "text-ink",
          },
          {
            label: "Total Alarms",
            value: data.zones.reduce((s, z) => s + z.alarmCount, 0),
            color: "text-warn",
          },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(["all", "critical", "warning", "online"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`hs-badge transition-colors ${
              filter === f
                ? f === "critical" ? "hs--risk"
                : f === "warning"  ? "hs--warning"
                : f === "online"   ? "hs--reasoning"
                : "hs--memory"
                : "hs--nominal opacity-60"
            }`}
          >
            {f === "all" ? "ALL ZONES" : f.toUpperCase()}
            {f !== "all" && (
              <span className="font-mono text-[0.55rem] ms-1 opacity-70">
                ({f === "critical" ? counts.critical : f === "warning" ? counts.warning : counts.online})
              </span>
            )}
          </button>
        ))}
        <span className="kpi-label text-faint ms-2">
          Showing {visibleZones.length} of {counts.total} zones
        </span>
      </div>

      {/* Zone cards grid */}
      {visibleZones.length === 0
        ? <p className="kpi-label text-faint">No zones match this filter.</p>
        : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleZones.map(zone => <ZoneCard key={zone.id} zone={zone} />)}
          </div>
        )
      }

      <p className="kpi-label text-faint">
        Built · {formatDate(data.builtAt, locale, { timeStyle: "medium" })} · Deterministic · No AI
      </p>
    </div>
  );
}
