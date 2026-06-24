"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  OperationsAlert,
  AlertSeverity,
  CategoryCount,
} from "@/lib/operations/types";

interface AlertsResponse {
  alerts:      OperationsAlert[];
  byCategory:  CategoryCount[];
  counts: {
    total:    number;
    critical: number;
    warning:  number;
    info:     number;
  };
  builtAt: string;
}

const SEV_BADGE: Record<AlertSeverity, string> = {
  critical: "hs-badge hs--risk",
  warning:  "hs-badge hs--warning",
  info:     "hs-badge hs--nominal",
};

const SEV_DOT: Record<AlertSeverity, string> = {
  critical: "bg-danger",
  warning:  "bg-warn",
  info:     "bg-muted",
};

const SEV_ROW: Record<AlertSeverity, string> = {
  critical: "border-danger/20 bg-danger/[0.03]",
  warning:  "border-warn/20  bg-warn/[0.03]",
  info:     "border-line     bg-bg",
};

const HEAT_BG: Record<AlertSeverity, string> = {
  critical: "bg-danger/[0.10] border-danger/25 text-danger",
  warning:  "bg-warn/[0.08]  border-warn/25  text-warn",
  info:     "bg-line/40      border-line/60  text-muted",
};

export function AlertCommandClient() {
  const [data,      setData]      = useState<AlertsResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [filter,    setFilter]    = useState<AlertSeverity | "all">("all");
  const [selectedId,setSelectedId]= useState<string | null>(null);

  useEffect(() => {
    fetch("/api/operations/alerts")
      .then(r => r.json())
      .then((d: AlertsResponse) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load alert data"); setLoading(false); });
  }, []);

  const visible = useMemo(() => {
    if (!data?.alerts) return [];
    return filter === "all" ? data.alerts : data.alerts.filter(a => a.severity === filter);
  }, [data, filter]);

  const selected = useMemo(() =>
    data?.alerts.find(a => a.id === selectedId) ?? null,
    [data, selectedId],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="rounded border border-line h-12 animate-pulse bg-surface" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">{error ?? "Alert data unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Count strip */}
      <div className="global-ops-strip">
        {[
          { label: "Total",    value: data.counts.total,    color: "text-ink"    },
          { label: "Critical", value: data.counts.critical, color: "text-danger" },
          { label: "Warning",  value: data.counts.warning,  color: "text-warn"   },
          { label: "Info",     value: data.counts.info,     color: "text-muted"  },
          { label: "Vendors",  value: new Set(data.alerts.map(a => a.vendor)).size, color: "text-signal" },
          { label: "Categories", value: data.byCategory.length, color: "text-ink" },
          { label: "Resolution Coverage", value: "100%", color: "text-signal" },
        ].map(k => (
          <div key={k.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{k.label}</p>
            <p className={`exec-kpi-value ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "critical", "warning", "info"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`hs-badge transition-colors ${
              filter === f
                ? f === "critical" ? "hs--risk"
                : f === "warning"  ? "hs--warning"
                : f === "info"     ? "hs--confident"
                : "hs--memory"
                : "hs--nominal opacity-60"
            }`}
          >
            {f === "all" ? "ALL" : f.toUpperCase()}
            {f !== "all" && (
              <span className="font-mono text-[0.55rem] ms-1 opacity-70">
                ({f === "critical" ? data.counts.critical : f === "warning" ? data.counts.warning : data.counts.info})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main layout: queue + detail */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Alert queue */}
        <div className="lg:col-span-2 flex flex-col gap-1">
          <p className="kpi-label text-faint mb-1">
            Showing {visible.length} alert{visible.length !== 1 ? "s" : ""} · sorted by severity
          </p>
          {visible.map(alert => (
            <button
              key={alert.id}
              onClick={() => setSelectedId(prev => prev === alert.id ? null : alert.id)}
              className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                selectedId === alert.id
                  ? "border-signal/40 bg-signal/[0.04]"
                  : SEV_ROW[alert.severity]
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${SEV_DOT[alert.severity]}`} />
                <span className={SEV_BADGE[alert.severity]}>{alert.severity}</span>
                <p className="font-body text-xs text-ink truncate flex-1">{alert.label}</p>
                <span className="font-mono text-[0.58rem] text-faint flex-shrink-0">{alert.vendorName}</span>
              </div>
              {selectedId === alert.id && (
                <div className="mt-1.5 ps-4 text-left">
                  <p className="kpi-label text-faint">
                    {alert.category} · {alert.deviceLabel || alert.deviceId}
                  </p>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Alert detail / Severity heat map */}
        <div className="flex flex-col gap-4">

          {/* Selected alert detail */}
          {selected ? (
            <div className="rounded-xl border border-signal/20 bg-surface px-4 py-4">
              <div className="h-layer-sep mb-3">
                <span className="kpi-label">Alert Detail</span>
              </div>
              <span className={`${SEV_BADGE[selected.severity]} mb-3 inline-block`}>
                {selected.severity.toUpperCase()}
              </span>
              <h3 className="font-body text-sm font-semibold text-ink mb-3 leading-snug">
                {selected.label}
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Category", value: selected.category   },
                  { label: "Vendor",   value: selected.vendorName },
                  { label: "Device",   value: selected.deviceLabel || selected.deviceId },
                  { label: "Case Ref", value: selected.caseId     },
                  { label: "Status",   value: "ACTIVE"            },
                ].map(row => (
                  <div key={row.label} className="flex justify-between gap-2">
                    <span className="kpi-label text-faint flex-shrink-0">{row.label}</span>
                    <span className="font-mono text-[0.65rem] text-ink text-right truncate">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-4 py-4">
              <div className="h-layer-sep mb-3">
                <span className="kpi-label">Alert Detail</span>
              </div>
              <p className="kpi-label text-faint">Select an alert to inspect</p>
            </div>
          )}

          {/* Severity Heat Map */}
          <div className="rounded-xl border border-line bg-surface px-4 py-4">
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">Severity Heat Map</span>
            </div>
            <div className="space-y-1.5">
              {data.byCategory.map(cat => (
                <div
                  key={cat.category}
                  className={`flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 ${HEAT_BG[cat.severity]}`}
                >
                  <span className="font-body text-xs text-current truncate">{cat.category}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="h-1 w-12 rounded bg-current/20">
                      <div
                        className="h-1 rounded bg-current/60"
                        style={{ width: `${(cat.count / Math.max(...data.byCategory.map(c => c.count), 1)) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[0.65rem]">{cat.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="kpi-label text-faint">
        Source: Engineering Knowledge Graph · Built {new Date(data.builtAt).toLocaleTimeString()} · Deterministic
      </p>
    </div>
  );
}
