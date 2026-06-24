"use client";

import { useState, useEffect } from "react";
import type { CustomerRisk, RiskType, RiskSeverity, RiskStatus } from "@/lib/customers/types";
import { RISK_TYPE_LABELS } from "@/lib/customers/types";

interface RisksData {
  risks:            CustomerRisk[];
  total:            number;
  bySeverity:       { severity: RiskSeverity; count: number }[];
  byType:           { type: RiskType; label: string; count: number }[];
  customersAtRisk:  number;
}

const SEV_CLASS: Record<RiskSeverity, string> = {
  high:   "hs-badge hs--risk",
  medium: "hs-badge hs--warning",
  low:    "hs-badge hs--nominal",
};

const SEV_BORDER: Record<RiskSeverity, string> = {
  high:   "border-l-danger",
  medium: "border-l-warn",
  low:    "border-l-signal/40",
};

const STATUS_CLASS: Record<RiskStatus, string> = {
  open:          "hs-badge hs--risk",
  "in-progress": "hs-badge hs--warning",
  resolved:      "hs-badge hs--reasoning",
};

export function RiskCenterClient() {
  const [data,         setData]    = useState<RisksData | null>(null);
  const [loading,      setLoading] = useState(true);
  const [sevFilter,    setSev]     = useState<RiskSeverity | "all">("all");
  const [typeFilter,   setType]    = useState<RiskType | "all">("all");
  const [expanded,     setExpanded]= useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers/risks")
      .then(r => r.json())
      .then((d: RisksData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="flex flex-col gap-2">
          {[1,2,3,4,5].map(i => <div key={i} className="rounded-xl border border-line bg-surface h-16 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filtered = data.risks.filter(r => {
    if (sevFilter !== "all"  && r.severity !== sevFilter) return false;
    if (typeFilter !== "all" && r.type     !== typeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-5">

      {/* KPI strip */}
      <div className="global-ops-strip">
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">Total Risks</p>
          <p className="exec-kpi-value text-ink">{data.total}</p>
        </div>
        <div className="global-ops-cell">
          <p className="kpi-label mb-1.5">Customers at Risk</p>
          <p className="exec-kpi-value text-danger">{data.customersAtRisk}</p>
        </div>
        {data.bySeverity.map(s => (
          <div key={s.severity} className="global-ops-cell">
            <p className="kpi-label mb-1.5 capitalize">{s.severity} Severity</p>
            <p className={`exec-kpi-value ${s.severity === "high" ? "text-danger" : s.severity === "medium" ? "text-warn" : "text-signal"}`}>
              {s.count}
            </p>
          </div>
        ))}
        {data.byType.slice(0, 2).map(t => (
          <div key={t.type} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{t.label}</p>
            <p className="exec-kpi-value text-ink">{t.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["all", "high", "medium", "low"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSev(s)}
              className={`px-3 py-1.5 rounded border kpi-label transition-colors ${
                sevFilter === s
                  ? "border-signal bg-signal/10 text-signal"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setType("all")}
            className={`px-3 py-1.5 rounded border kpi-label transition-colors ${
              typeFilter === "all" ? "border-signal bg-signal/10 text-signal" : "border-line text-muted hover:text-ink"
            }`}
          >
            ALL TYPES
          </button>
          {data.byType.map(t => (
            <button
              key={t.type}
              onClick={() => setType(typeFilter === t.type ? "all" : t.type)}
              className={`px-3 py-1.5 rounded border kpi-label transition-colors ${
                typeFilter === t.type ? "border-signal bg-signal/10 text-signal" : "border-line text-muted hover:text-ink"
              }`}
            >
              {t.label.toUpperCase()} ({t.count})
            </button>
          ))}
        </div>
        <span className="ml-auto kpi-label text-faint">{filtered.length} risks</span>
      </div>

      {/* Risk list */}
      <div className="flex flex-col gap-2">
        {filtered.map(r => (
          <button
            key={r.id}
            onClick={() => setExpanded(e => e === r.id ? null : r.id)}
            className={`w-full rounded-xl border border-l-4 px-4 py-3 text-left transition-colors ${SEV_BORDER[r.severity]} ${
              expanded === r.id ? "bg-surface2" : "bg-surface hover:bg-surface2"
            } border-line`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-body text-sm font-semibold text-ink">{r.companyName}</p>
                  <span className={SEV_CLASS[r.severity]}>{r.severity}</span>
                  <span className="kpi-label text-faint">{RISK_TYPE_LABELS[r.type]}</span>
                </div>
                <p className="kpi-label text-faint mt-0.5 truncate">{r.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={STATUS_CLASS[r.status]}>{r.status}</span>
                <span className="kpi-label text-faint hidden sm:block">{r.owner}</span>
              </div>
            </div>

            {expanded === r.id && (
              <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-3 text-left">
                <div>
                  <p className="kpi-label text-faint">Risk Type</p>
                  <p className="font-body text-xs text-ink">{RISK_TYPE_LABELS[r.type]}</p>
                </div>
                <div>
                  <p className="kpi-label text-faint">Detected</p>
                  <p className="font-body text-xs text-ink">{r.detectedAt}</p>
                </div>
                <div>
                  <p className="kpi-label text-faint">Owner</p>
                  <p className="font-body text-xs text-ink">{r.owner}</p>
                </div>
                <div>
                  <p className="kpi-label text-faint">Status</p>
                  <span className={STATUS_CLASS[r.status]}>{r.status}</span>
                </div>
                <div className="col-span-2">
                  <p className="kpi-label text-faint">Description</p>
                  <p className="font-body text-xs text-ink">{r.description}</p>
                </div>
              </div>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-5 py-8 text-center">
            <p className="kpi-label text-signal">No risks match the selected filters</p>
          </div>
        )}
      </div>

      {/* Type breakdown */}
      <div className="rounded-xl border border-line bg-surface px-5 py-5">
        <div className="h-layer-sep mb-4"><span className="kpi-label">Risk Breakdown by Type</span></div>
        <div className="space-y-2">
          {data.byType.map(t => (
            <div key={t.type} className="flex items-center gap-3">
              <span className="kpi-label text-faint flex-1">{t.label}</span>
              <div className="w-32 h-1.5 rounded bg-line overflow-hidden">
                <div className="h-1.5 rounded bg-danger/50" style={{ width: `${(t.count / data.total) * 100}%` }} />
              </div>
              <span className="font-mono text-xs text-ink w-4 text-right">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
