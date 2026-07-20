"use client";

import { useState, useEffect }  from "react";
import type { AtsOverview, PipelineStage } from "@/lib/ats/types";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/ats/types";

const STAGE_DOT: Record<PipelineStage, string> = {
  applied:            "bg-muted",
  screening:          "bg-ice",
  "technical-review": "bg-ice",
  interview:          "bg-warn",
  offer:              "bg-signal",
  hired:              "bg-signal",
  rejected:           "bg-danger",
};

const ACT_BADGE: Record<string, string> = {
  hired:        "hs-badge hs--reasoning",
  interview:    "hs-badge hs--warning",
  "stage-change": "hs-badge hs--confident",
  applied:      "hs-badge hs--nominal",
};

export function AtsOverviewClient() {
  const [data,    setData]    = useState<AtsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ats/overview")
      .then(r => r.json())
      .then((d: AtsOverview) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxStage = data
    ? Math.max(...Object.values(data.byStage), 1)
    : 1;

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-line bg-surface h-64 animate-pulse" />
          <div className="rounded-xl border border-line bg-surface h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">ATS data unavailable</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* KPI strip */}
      <div className="global-ops-strip">
        {[
          { label: "Open Positions",    value: data.openJobs,            color: "text-signal" },
          { label: "Total Candidates",  value: data.totalCandidates,     color: "text-ink"    },
          { label: "Avg ATS Score",     value: `${data.averageScore}/100`, color: "text-warn" },
          { label: "In Pipeline",       value: data.totalCandidates - (data.byStage.hired + data.byStage.rejected), color: "text-ink" },
          { label: "Offers Extended",   value: data.byStage.offer,       color: "text-warn"   },
          { label: "Hired",             value: data.byStage.hired,       color: "text-signal" },
          { label: "Velocity (days)",   value: data.hiringVelocityDays,  color: "text-faint"  },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Stage funnel + Recent Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Stage funnel */}
        <div className="lg:col-span-2 rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Hiring Pipeline Overview</span>
          </div>
          <div className="space-y-2.5">
            {STAGE_ORDER.map(stage => {
              const count = data.byStage[stage];
              const pct   = Math.round((count / (data.totalCandidates || 1)) * 100);
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${STAGE_DOT[stage]}`} />
                  <span className="kpi-label text-faint w-28 flex-shrink-0">{STAGE_LABELS[stage]}</span>
                  <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                    <div
                      className={`h-1.5 rounded ${STAGE_DOT[stage]} opacity-60`}
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-ink w-6 text-right flex-shrink-0">{count}</span>
                  <span className="kpi-label text-faint w-8 text-right flex-shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top jobs */}
        <div className="rounded-xl border border-line bg-surface px-4 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Top Open Positions</span>
          </div>
          <div className="space-y-2">
            {data.topJobs.map((j, i) => (
              <div key={j.jobId} className="flex items-start gap-2">
                <span className="font-mono text-xs text-faint w-3 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-xs text-ink leading-snug truncate">{j.title}</p>
                  <p className="kpi-label text-faint">{j.count} applicants</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-line bg-surface px-5 py-5">
        <div className="h-layer-sep mb-4">
          <span className="kpi-label">Recent Hiring Activity</span>
        </div>
        <div className="divide-y divide-line">
          {data.recentActivity.map(act => (
            <div key={act.id} className="flex items-center gap-3 py-2.5">
              <span className={ACT_BADGE[act.type] ?? "hs-badge hs--nominal"}>
                {act.type.replace("-", " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-body text-xs text-ink truncate">
                  <span className="font-semibold">{act.candidateName}</span>
                  {" — "}{act.jobTitle}
                </p>
                <p className="kpi-label text-faint">{act.detail}</p>
              </div>
              <span className="font-mono text-[0.58rem] text-faint flex-shrink-0">{act.timestamp}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
