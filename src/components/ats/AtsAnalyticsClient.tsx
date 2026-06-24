"use client";

import { useState, useEffect } from "react";
import type { AtsAnalytics }   from "@/lib/ats/types";

export function AtsAnalyticsClient() {
  const [data,    setData]    = useState<AtsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ats/analytics")
      .then(r => r.json())
      .then((d: AtsAnalytics) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-xl border border-line bg-surface h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">Analytics data unavailable</p>
      </div>
    );
  }

  const maxStageCount = Math.max(...data.byStage.map(s => s.count), 1);
  const maxSkillCount = Math.max(...data.topSkills.map(s => s.count), 1);
  const maxDeptCands  = Math.max(...data.byDepartment.map(d => d.candidates), 1);
  const maxSrcCount   = Math.max(...data.bySources.map(s => s.count), 1);
  const maxScoreDist  = Math.max(...data.scoreDistribution.map(s => s.count), 1);

  return (
    <div className="flex flex-col gap-5">

      {/* KPI Strip */}
      <div className="global-ops-strip">
        {[
          { label: "Open Jobs",        value: data.openJobs,            color: "text-signal" },
          { label: "Total Candidates", value: data.totalCandidates,     color: "text-ink"    },
          { label: "Avg ATS Score",    value: `${data.averageAtsScore}`, color: "text-warn"  },
          { label: "Hired",            value: data.hiredCandidates,     color: "text-signal" },
          { label: "Rejected",         value: data.rejectedCandidates,  color: "text-danger" },
          { label: "Velocity (days)",  value: data.hiringVelocityDays,  color: "text-faint"  },
          { label: "Hire Rate",        value: `${data.totalCandidates > 0 ? Math.round((data.hiredCandidates / data.totalCandidates) * 100) : 0}%`, color: "text-signal" },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Funnel + Score distribution */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Pipeline funnel */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Pipeline Funnel</span>
          </div>
          <div className="space-y-2.5">
            {data.byStage.map(s => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="kpi-label text-faint w-28 flex-shrink-0">{s.label}</span>
                <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                  <div
                    className="h-1.5 rounded bg-signal/50"
                    style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score distribution */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">ATS Score Distribution</span>
          </div>
          <div className="space-y-2.5">
            {data.scoreDistribution.map(s => {
              const barColor = s.range.startsWith("86") ? "bg-signal/60"
                : s.range.startsWith("71") ? "bg-signal/40"
                : s.range.startsWith("51") ? "bg-warn/50"
                : s.range.startsWith("31") ? "bg-danger/40"
                : "bg-danger/60";
              return (
                <div key={s.range} className="flex items-center gap-3">
                  <span className="kpi-label text-faint w-14 flex-shrink-0">{s.range}</span>
                  <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                    <div
                      className={`h-1.5 rounded ${barColor}`}
                      style={{ width: `${(s.count / maxScoreDist) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Top skills + Source breakdown */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Top skills */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Top Candidate Skills</span>
          </div>
          <div className="space-y-2">
            {data.topSkills.map(s => (
              <div key={s.skill} className="flex items-center gap-3">
                <span className="kpi-label text-faint truncate flex-1 min-w-0">{s.skill}</span>
                <div className="w-20 h-1.5 rounded bg-line overflow-hidden flex-shrink-0">
                  <div
                    className="h-1.5 rounded bg-ice/60"
                    style={{ width: `${(s.count / maxSkillCount) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Application sources */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Application Sources</span>
          </div>
          <div className="space-y-2.5">
            {data.bySources.map(s => (
              <div key={s.source} className="flex items-center gap-3">
                <span className="kpi-label text-faint w-16 flex-shrink-0 capitalize">{s.source}</span>
                <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                  <div
                    className="h-1.5 rounded bg-signal/40"
                    style={{ width: `${(s.count / maxSrcCount) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{s.count}</span>
                <span className="kpi-label text-faint w-8 text-right flex-shrink-0">
                  {Math.round((s.count / data.totalCandidates) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Department + Rejection reasons */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Department breakdown */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">By Department</span>
          </div>
          <div className="space-y-3">
            {data.byDepartment.map(d => (
              <div key={d.department}>
                <div className="flex justify-between mb-1">
                  <span className="kpi-label text-ink">{d.department}</span>
                  <div className="flex gap-3">
                    <span className="kpi-label text-faint">{d.jobs} job{d.jobs !== 1 ? "s" : ""}</span>
                    <span className="kpi-label text-ink">{d.candidates} candidates</span>
                  </div>
                </div>
                <div className="h-1 rounded bg-line overflow-hidden">
                  <div
                    className="h-1 rounded bg-signal/40"
                    style={{ width: `${(d.candidates / maxDeptCands) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rejection reasons */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4">
            <span className="kpi-label">Rejection Reasons</span>
          </div>
          {data.rejectionReasons.length > 0 ? (
            <div className="space-y-2">
              {data.rejectionReasons.map(r => {
                const maxReason = Math.max(...data.rejectionReasons.map(x => x.count), 1);
                return (
                  <div key={r.reason} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-xs text-faint leading-snug">{r.reason}</p>
                      <div className="h-1 rounded bg-line overflow-hidden mt-1">
                        <div
                          className="h-1 rounded bg-danger/50"
                          style={{ width: `${(r.count / maxReason) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="font-mono text-xs text-danger flex-shrink-0 w-4 text-right">{r.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="kpi-label text-faint">No rejections yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
