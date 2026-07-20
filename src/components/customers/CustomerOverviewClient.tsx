"use client";

import { useState, useEffect }   from "react";
import { CustomerHealthBadge, CustomerStatusBadge } from "./CustomerHealthBadge";
import type { HealthTier, CustomerStatus }  from "@/lib/customers/types";

interface OverviewData {
  total:           number;
  active:          number;
  atRisk:          number;
  expansionReady:  number;
  onboarding:      number;
  churned:         number;
  averageHealth:   number;
  totalArr:        number;
  byPlan:          { plan: string; label: string; count: number; arr: number }[];
  byIndustry:      { industry: string; count: number }[];
  byHealth:        { tier: HealthTier; count: number }[];
  topHealthAccounts:    { id: string; name: string; score: number; tier: HealthTier }[];
  bottomHealthAccounts: { id: string; name: string; score: number; tier: HealthTier }[];
  statusCounts:    Record<CustomerStatus, number>;
}

const TIER_BAR: Record<HealthTier, string> = {
  excellent: "bg-signal",
  good:      "bg-signal/60",
  fair:      "bg-warn",
  poor:      "bg-danger/60",
  critical:  "bg-danger",
};

export function CustomerOverviewClient() {
  const [data,    setData]    = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customers/overview")
      .then(r => r.json())
      .then((d: OverviewData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="rounded-xl border border-line bg-surface h-48 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">Customer data unavailable</p>
      </div>
    );
  }

  const maxTierCount = Math.max(...data.byHealth.map(t => t.count), 1);

  return (
    <div className="flex flex-col gap-5">

      {/* KPI strip */}
      <div className="global-ops-strip">
        {[
          { label: "Total Customers",    value: data.total,            color: "text-ink"    },
          { label: "Active",             value: data.active,           color: "text-signal" },
          { label: "At Risk",            value: data.atRisk,           color: "text-danger" },
          { label: "Expansion Ready",    value: data.expansionReady,   color: "text-hermesGold" },
          { label: "Onboarding",         value: data.onboarding,       color: "text-warn"   },
          { label: "Avg Health Score",   value: `${data.averageHealth}/100`, color: "text-signal" },
          { label: "Total ARR",          value: `$${(data.totalArr / 1000).toFixed(0)}k`, color: "text-ink" },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Top row: Health + Industry */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Health distribution */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">Health Distribution</span></div>
          <div className="space-y-2.5">
            {data.byHealth.map(h => (
              <div key={h.tier} className="flex items-center gap-3">
                <span className="kpi-label text-faint w-20 flex-shrink-0 capitalize">{h.tier}</span>
                <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                  <div className={`h-1.5 rounded ${TIER_BAR[h.tier]}`} style={{ width: `${(h.count / maxTierCount) * 100}%` }} />
                </div>
                <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{h.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By industry */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">By Industry</span></div>
          <div className="space-y-2">
            {data.byIndustry.map(d => (
              <div key={d.industry} className="flex items-center gap-3">
                <span className="kpi-label text-faint flex-1 min-w-0 truncate">{d.industry}</span>
                <div className="w-20 h-1.5 rounded bg-line overflow-hidden flex-shrink-0">
                  <div
                    className="h-1.5 rounded bg-ice/60"
                    style={{ width: `${(d.count / data.total) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs text-ink w-4 text-right flex-shrink-0">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By plan */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">By Plan</span></div>
          <div className="space-y-3">
            {data.byPlan.filter(p => p.count > 0).map(p => (
              <div key={p.plan}>
                <div className="flex justify-between mb-0.5">
                  <span className="kpi-label text-ink">{p.label}</span>
                  <div className="flex gap-3">
                    <span className="kpi-label text-faint">{p.count}</span>
                    <span className="kpi-label text-ink">${(p.arr / 1000).toFixed(0)}k ARR</span>
                  </div>
                </div>
                <div className="h-1 rounded bg-line overflow-hidden">
                  <div className="h-1 rounded bg-signal/40" style={{ width: `${(p.count / data.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top + Bottom health accounts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">Highest Health Accounts</span></div>
          <div className="space-y-2.5">
            {data.topHealthAccounts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="font-mono text-xs text-faint w-4 flex-shrink-0">{i + 1}</span>
                <p className="font-body text-xs text-ink flex-1 min-w-0 truncate">{a.name}</p>
                <CustomerHealthBadge tier={a.tier} score={a.score} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">Lowest Health Accounts</span></div>
          <div className="space-y-2.5">
            {data.bottomHealthAccounts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="font-mono text-xs text-faint w-4 flex-shrink-0">{i + 1}</span>
                <p className="font-body text-xs text-ink flex-1 min-w-0 truncate">{a.name}</p>
                <CustomerHealthBadge tier={a.tier} score={a.score} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="rounded-xl border border-line bg-surface px-5 py-5">
        <div className="h-layer-sep mb-4"><span className="kpi-label">Status Breakdown</span></div>
        <div className="flex flex-wrap gap-3">
          {(["active", "at-risk", "expansion-ready", "onboarding", "churned"] as CustomerStatus[]).map(s => (
            <div key={s} className="rounded border border-line px-4 py-3 flex items-center gap-2">
              <CustomerStatusBadge status={s} />
              <span className="intel-kpi-value text-ink">{data.statusCounts[s]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
