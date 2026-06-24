"use client";

import { useState, useEffect } from "react";
import type { WarRoomData, WarRoomIncident, AlertSeverity } from "@/lib/operations/types";

const SEV_BADGE: Record<AlertSeverity, string> = {
  critical: "hs-badge hs--risk",
  warning:  "hs-badge hs--warning",
  info:     "hs-badge hs--nominal",
};

const SEV_ROW: Record<AlertSeverity, string> = {
  critical: "border-danger/20 bg-danger/[0.03]",
  warning:  "border-warn/20  bg-warn/[0.03]",
  info:     "border-line     bg-bg",
};

const SEV_ACCENT: Record<AlertSeverity, string> = {
  critical: "border-l-danger",
  warning:  "border-l-warn",
  info:     "border-l-line",
};

function IncidentRow({
  incident, selected, onClick,
}: {
  incident:  WarRoomIncident;
  selected:  boolean;
  onClick:   () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border border-l-2 ${SEV_ACCENT[incident.severity]} px-3 py-2.5 transition-colors ${
        selected
          ? "border-signal/40 bg-signal/[0.04]"
          : SEV_ROW[incident.severity]
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`${SEV_BADGE[incident.severity]} flex-shrink-0`}>{incident.severity}</span>
        <p className="font-body text-xs text-ink truncate flex-1">{incident.alarmLabel}</p>
        <span className="font-mono text-[0.58rem] text-faint flex-shrink-0">{incident.vendorName}</span>
      </div>
      <p className="kpi-label text-faint mt-0.5 truncate">{incident.category}</p>
    </button>
  );
}

function IncidentDetail({ incident }: { incident: WarRoomIncident | null }) {
  if (!incident) {
    return (
      <div className="rounded-xl border border-line bg-surface px-5 py-8 flex flex-col items-center justify-center text-center">
        <p className="kpi-label text-faint">Select an incident to inspect</p>
        <p className="kpi-label text-faint/60 mt-1">Click any incident in the queue</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-5 flex flex-col gap-4">
      {/* Header */}
      <div className="border-b border-line pb-4">
        <span className={`${SEV_BADGE[incident.severity]} mb-2 inline-block`}>
          {incident.severity.toUpperCase()}
        </span>
        <h3 className="intel-title leading-snug mb-1">{incident.alarmLabel}</h3>
        <p className="kpi-label text-faint">
          {incident.vendorName} · {incident.category} · Impact Score: {incident.impactScore}
        </p>
      </div>

      {/* Evidence chain */}
      <div>
        <p className="kpi-label mb-2">Engineering Evidence Chain</p>
        <div className="space-y-0">
          {[
            { step: "ALARM",       label: incident.alarmLabel,  color: "text-danger", border: "border-danger/20" },
            { step: "SYMPTOM",     label: incident.symptoms,    color: "text-warn",   border: "border-warn/20"   },
            { step: "ROOT CAUSE",  label: incident.rootCause,   color: "text-warn",   border: "border-warn/20"   },
            { step: "RESOLUTION",  label: incident.resolution,  color: "text-signal", border: "border-signal/20" },
          ].map((step, i, arr) => (
            <div key={step.step}>
              <div className={`rounded border ${step.border} px-3 py-2 bg-bg`}>
                <p className={`kpi-label ${step.color} mb-0.5`}>{step.step}</p>
                <p className="font-body text-xs text-ink leading-snug">{step.label}</p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex items-center ms-4 my-0.5">
                  <div className="w-px h-3 bg-signal/20" />
                  <span className="kpi-label text-signal/50 ms-1.5" style={{ fontSize: "0.50rem" }}>↓</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="border-t border-line pt-3 space-y-1.5">
        {[
          { label: "Case ID",   value: incident.caseId  },
          { label: "Vendor",    value: incident.vendorName },
          { label: "Category",  value: incident.category },
          { label: "Source",    value: "Engineering Knowledge Base" },
          { label: "Type",      value: "Deterministic · No AI inference" },
        ].map(row => (
          <div key={row.label} className="flex justify-between gap-2">
            <span className="kpi-label text-faint flex-shrink-0">{row.label}</span>
            <span className="font-mono text-[0.65rem] text-ink text-right truncate">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WarRoomClient() {
  const [data,      setData]      = useState<WarRoomData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [selectedId,setSelectedId]= useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<AlertSeverity | "all">("all");

  useEffect(() => {
    fetch("/api/operations/war-room")
      .then(r => r.json())
      .then((d: WarRoomData) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load war room data"); setLoading(false); });
  }, []);

  const selected = data?.incidents.find(i => i.id === selectedId) ?? null;

  const visible = !data?.incidents ? [] :
    sevFilter === "all" ? data.incidents :
    data.incidents.filter(i => i.severity === sevFilter);

  const counts = {
    critical: data?.incidents.filter(i => i.severity === "critical").length ?? 0,
    warning:  data?.incidents.filter(i => i.severity === "warning").length  ?? 0,
    info:     data?.incidents.filter(i => i.severity === "info").length     ?? 0,
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface h-80 animate-pulse" />
          <div className="rounded-xl border border-line bg-surface h-80 animate-pulse" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">{error ?? "War room data unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Situation KPI strip */}
      <div className="global-ops-strip">
        {[
          { label: "Incidents",        value: data.incidents.length,        color: "text-ink"    },
          { label: "Critical",         value: counts.critical,              color: "text-danger" },
          { label: "Warning",          value: counts.warning,               color: "text-warn"   },
          { label: "Info",             value: counts.info,                  color: "text-muted"  },
          { label: "Affected Vendors", value: data.criticalVendors.length,  color: "text-danger" },
          { label: "Online Zones",     value: data.systemState.online,      color: "text-signal" },
          { label: "Critical Zones",   value: data.systemState.critical,    color: "text-danger" },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Critical vendors + system state */}
      {data.criticalVendors.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/[0.03] px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0 mt-1.5" />
          <div>
            <p className="kpi-label text-danger mb-1">CRITICAL VENDOR ZONES</p>
            <p className="font-body text-xs text-ink">
              {data.criticalVendors.join(" · ")}
            </p>
            <p className="kpi-label text-faint mt-1">
              These vendor zones have documented critical alarm types in the engineering knowledge base.
              All incidents have traceable root causes and resolutions.
            </p>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Left: Incident queue */}
        <div className="flex flex-col gap-3">
          <div className="h-layer-sep">
            <span className="kpi-label">Incident Queue</span>
          </div>

          {/* Severity filter */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "critical", "warning", "info"] as const).map(f => (
              <button
                key={f}
                onClick={() => setSevFilter(f)}
                className={`hs-badge transition-colors ${
                  sevFilter === f
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
                    ({f === "critical" ? counts.critical : f === "warning" ? counts.warning : counts.info})
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: "460px" }}>
            {visible.map(incident => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                selected={selectedId === incident.id}
                onClick={() => setSelectedId(prev => prev === incident.id ? null : incident.id)}
              />
            ))}
          </div>
        </div>

        {/* Right: Engineering evidence panel */}
        <div className="flex flex-col gap-3">
          <div className="h-layer-sep">
            <span className="kpi-label">Engineering Evidence Panel</span>
          </div>
          <IncidentDetail incident={selected} />

          {/* Recommended actions */}
          {selected && (
            <div className="rounded-xl border border-signal/15 bg-signal/[0.03] px-4 py-4">
              <div className="h-layer-sep mb-3">
                <span className="kpi-label">Knowledge-Based Action</span>
              </div>
              <p className="kpi-label text-signal mb-2">ENGINEERING RESOLUTION</p>
              <p className="font-body text-xs text-ink leading-relaxed">
                {selected.resolution}
              </p>
              <p className="kpi-label text-faint mt-2">
                Source: Engineering Case {selected.caseId} · Not AI-generated · Deterministic
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cross-site impact analysis */}
      <div className="rounded-xl border border-line bg-surface px-5 py-5">
        <div className="h-layer-sep mb-4">
          <span className="kpi-label">Cross-Site Impact Analysis</span>
        </div>
        <p className="kpi-label text-faint mb-3">
          Vendor zone exposure across all documented alarm types · {data.incidents.length} total incidents
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.systemState && Object.entries(data.systemState).map(([state, count]) => (
            <div
              key={state}
              className={`rounded-xl border px-4 py-3 ${
                state === "critical"  ? "border-danger/20 bg-danger/[0.03]" :
                state === "warning"   ? "border-warn/20  bg-warn/[0.03]"   :
                state === "online"    ? "border-signal/15 bg-signal/[0.03]" :
                "border-line bg-bg"
              }`}
            >
              <p className={`intel-kpi-value mb-1 ${
                state === "critical"  ? "text-danger" :
                state === "warning"   ? "text-warn"   :
                state === "online"    ? "text-signal"  :
                "text-muted"
              }`}>{count as number}</p>
              <p className="kpi-label capitalize">{state} zones</p>
            </div>
          ))}
        </div>
      </div>

      <p className="kpi-label text-faint">
        Source: Hermes Engineering Knowledge Base · Built {new Date(data.builtAt).toLocaleTimeString()} · All incidents traceable
      </p>
    </div>
  );
}
