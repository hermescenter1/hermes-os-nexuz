"use client";

import { useState, useEffect } from "react";
import type { CrmDashboardStats, CrmPipelineStage } from "@/lib/crm/types";

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const STAGE_BAR_COLORS: Record<string, string> = {
  DISCOVERY:         "bg-slate-500",
  QUALIFICATION:     "bg-blue-500",
  PROPOSAL:          "bg-cyan-500",
  TECHNICAL_REVIEW:  "bg-indigo-500",
  COMMERCIAL_REVIEW: "bg-violet-500",
  NEGOTIATION:       "bg-amber-500",
  WON:               "bg-green-500",
  LOST:              "bg-red-500",
};

export function CrmDashboardClient() {
  const [stats,    setStats]    = useState<CrmDashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<CrmPipelineStage[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/crm/dashboard")
      .then(r => r.json())
      .then(d => { setStats(d.stats); setPipeline(d.pipeline ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;
  if (!stats)  return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Dashboard data unavailable.</div>;

  const kpis = [
    { label: "Total Leads",          value: String(stats.totalLeads),          sub: `+${stats.newLeadsThisMonth} this month` },
    { label: "Pipeline Value",        value: fmt(stats.pipelineValue),           sub: `${stats.activeOpportunities} open opps` },
    { label: "Forecast Revenue",      value: fmt(stats.forecastRevenue),         sub: "weighted pipeline" },
    { label: "Conversion Rate",       value: `${stats.conversionRate}%`,         sub: "lead → customer" },
    { label: "Renewals Q",            value: String(stats.renewalsThisQuarter),  sub: "this quarter" },
    { label: "Healthy Accounts",      value: String(stats.healthyAccounts),      sub: `${stats.atRiskAccounts} at risk` },
    { label: "Churn Risk",            value: `${stats.churnRisk}%`,              sub: "of accounts" },
  ];

  const maxPipelineValue = Math.max(...pipeline.map(s => s.value), 1);

  return (
    <div className="space-y-8">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-line bg-surface p-4 space-y-1">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">{kpi.label}</p>
            <p className="text-2xl font-bold text-ink">{kpi.value}</p>
            <p className="text-xs text-muted">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Pipeline funnel */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
        <h3 className="text-sm font-semibold text-ink">Opportunity Pipeline</h3>
        <div className="space-y-3">
          {pipeline.filter(s => s.stage !== "LOST").map(s => (
            <div key={s.stage} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{s.label}</span>
                <span className="text-muted">{s.count} · {fmt(s.value)} ({s.probability}%)</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${STAGE_BAR_COLORS[s.stage] ?? "bg-cyan-500"}`}
                  style={{ width: `${Math.round((s.value / maxPipelineValue) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
