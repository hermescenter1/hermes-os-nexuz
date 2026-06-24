"use client";

import { useState, useEffect } from "react";
import { CustomerHealthBadge, CustomerStatusBadge } from "./CustomerHealthBadge";
import type { HealthTier, CustomerStatus, CustomerHealth, CustomerPlan } from "@/lib/customers/types";
import { PLAN_LABELS } from "@/lib/customers/types";

interface HealthAccount {
  id:     string;
  name:   string;
  plan:   CustomerPlan;
  status: CustomerStatus;
  csm:    string;
  health: CustomerHealth;
}

interface HealthData {
  accounts:      HealthAccount[];
  averageScores: Record<string, number>;
  byTier:        { tier: HealthTier; label: string; count: number }[];
}

const DIM_LABELS: { key: keyof CustomerHealth; label: string; invert?: boolean }[] = [
  { key: "loginActivity",      label: "Login Activity"    },
  { key: "featureAdoption",    label: "Feature Adoption"  },
  { key: "assetScore",         label: "Asset Coverage"    },
  { key: "knowledgeScore",     label: "Knowledge Usage"   },
  { key: "alertHandling",      label: "Alert Handling"    },
  { key: "supportRisk",        label: "Support Risk",      invert: true },
  { key: "billingRisk",        label: "Billing Risk",      invert: true },
  { key: "expansionPotential", label: "Expansion Potential"},
];

const TIER_COLOR: Record<HealthTier, string> = {
  excellent: "text-signal",
  good:      "text-signal",
  fair:      "text-warn",
  poor:      "text-danger",
  critical:  "text-danger",
};

export function HealthCenterClient() {
  const [data,     setData]     = useState<HealthData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<HealthAccount | null>(null);
  const [tier,     setTier]     = useState<HealthTier | "all">("all");

  useEffect(() => {
    fetch("/api/customers/health")
      .then(r => r.json())
      .then((d: HealthData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="rounded-xl border border-line bg-surface h-64 animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const filtered = tier === "all"
    ? data.accounts
    : data.accounts.filter(a => a.health.tier === tier);

  return (
    <div className="flex flex-col gap-5">

      {/* Average dimension strip */}
      <div className="global-ops-strip">
        {[
          { label: "Avg Health",      v: data.averageScores.total,              color: "text-signal" },
          { label: "Login Activity",  v: data.averageScores.loginActivity,      color: "text-ink"    },
          { label: "Feature Adoption",v: data.averageScores.featureAdoption,    color: "text-ink"    },
          { label: "Asset Coverage",  v: data.averageScores.assetScore,         color: "text-ink"    },
          { label: "Knowledge Usage", v: data.averageScores.knowledgeScore,     color: "text-ink"    },
          { label: "Alert Handling",  v: data.averageScores.alertHandling,      color: "text-ink"    },
          { label: "Avg Support Risk",v: data.averageScores.supportRisk,        color: "text-warn"   },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`intel-kpi-value ${kpi.color}`}>{kpi.v}<span className="kpi-label text-faint">/100</span></p>
          </div>
        ))}
      </div>

      {/* Tier filter + dimension breakdown */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Tier filters + breakdown */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5">
          <div className="h-layer-sep mb-4"><span className="kpi-label">Filter by Tier</span></div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setTier("all")}
              className={`flex items-center justify-between px-3 py-2 rounded border transition-colors ${tier === "all" ? "border-signal/50 bg-signal/5" : "border-line hover:border-signal/30"}`}
            >
              <span className="kpi-label text-ink">All Tiers</span>
              <span className="font-mono text-xs text-faint">{data.accounts.length}</span>
            </button>
            {data.byTier.map(t => (
              <button
                key={t.tier}
                onClick={() => setTier(tier === t.tier ? "all" : t.tier)}
                className={`flex items-center justify-between px-3 py-2 rounded border transition-colors ${tier === t.tier ? "border-signal/50 bg-signal/5" : "border-line hover:border-signal/30"}`}
              >
                <span className={`kpi-label capitalize ${TIER_COLOR[t.tier]}`}>{t.label}</span>
                <span className="font-mono text-xs text-faint">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="h-layer-sep my-4" />

          <div className="h-layer-sep mb-3"><span className="kpi-label">Avg Dimensions</span></div>
          {DIM_LABELS.map(d => {
            const v = data.averageScores[d.key as string] ?? 0;
            const isRisk = d.invert;
            const barColor = isRisk
              ? v < 20 ? "bg-signal/60" : v < 40 ? "bg-warn" : "bg-danger/60"
              : v >= 65 ? "bg-signal/60" : v >= 40 ? "bg-warn" : "bg-danger/60";
            return (
              <div key={d.key as string} className="flex items-center gap-2 mb-1.5">
                <span className="kpi-label text-faint w-24 flex-shrink-0">{d.label}</span>
                <div className="flex-1 h-1 rounded bg-line overflow-hidden">
                  <div className={`h-1 rounded ${barColor}`} style={{ width: `${v}%` }} />
                </div>
                <span className="font-mono text-xs text-ink w-6 text-right flex-shrink-0">{v}</span>
              </div>
            );
          })}
        </div>

        {/* Account list */}
        <div className="flex flex-col gap-2 lg:col-span-2">
          <p className="kpi-label text-faint mb-1">{filtered.length} accounts</p>
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => setSelected(s => s?.id === a.id ? null : a)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selected?.id === a.id ? "border-signal/50 bg-signal/5" : "border-line bg-surface hover:border-signal/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-semibold text-ink truncate">{a.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="kpi-label text-faint">{PLAN_LABELS[a.plan]}</span>
                    <span className="kpi-label text-faint">·</span>
                    <span className="kpi-label text-faint">{a.csm}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <CustomerStatusBadge status={a.status} />
                  <CustomerHealthBadge tier={a.health.tier} score={a.health.total} />
                </div>
              </div>

              {/* Dimension mini-bars */}
              {selected?.id === a.id && (
                <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {DIM_LABELS.map(d => {
                    const v = a.health[d.key] as number;
                    const isRisk = d.invert;
                    const barColor = isRisk
                      ? v < 20 ? "bg-signal/60" : v < 40 ? "bg-warn" : "bg-danger/60"
                      : v >= 65 ? "bg-signal/60" : v >= 40 ? "bg-warn" : "bg-danger/60";
                    return (
                      <div key={d.key as string} className="flex items-center gap-2">
                        <span className="kpi-label text-faint w-20 flex-shrink-0">{d.label}</span>
                        <div className="flex-1 h-1 rounded bg-line overflow-hidden">
                          <div className={`h-1 rounded ${barColor}`} style={{ width: `${v}%` }} />
                        </div>
                        <span className="font-mono text-xs text-ink w-6 text-right flex-shrink-0">{v}</span>
                      </div>
                    );
                  })}
                  <div className="col-span-2 mt-1">
                    {a.health.explanations.slice(0, 3).map((ex, i) => (
                      <p key={i} className="kpi-label text-faint leading-relaxed">· {ex}</p>
                    ))}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
