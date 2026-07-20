"use client";

import { useState, useEffect }             from "react";
import { CustomerHealthBadge, CustomerStatusBadge } from "./CustomerHealthBadge";
import type { CustomerAccount, CustomerStatus, CustomerPlan } from "@/lib/customers/types";
import { PLAN_LABELS }                    from "@/lib/customers/types";

interface AccountsData {
  accounts: CustomerAccount[];
  total:    number;
}

const STATUS_FILTERS: { value: CustomerStatus | "all"; label: string }[] = [
  { value: "all",             label: "ALL"       },
  { value: "active",          label: "ACTIVE"    },
  { value: "at-risk",         label: "AT RISK"   },
  { value: "expansion-ready", label: "EXPANSION" },
  { value: "onboarding",      label: "ONBOARDING"},
];

export function AccountListClient() {
  const [data,     setData]     = useState<AccountsData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [status,   setStatus]   = useState<CustomerStatus | "all">("all");
  const [sort,     setSort]     = useState("health");
  const [selected, setSelected] = useState<CustomerAccount | null>(null);
  const [query,    setQuery]    = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (status !== "all") params.set("status", status);
    fetch(`/api/customers/accounts?${params}`)
      .then(r => r.json())
      .then((d: AccountsData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [status, sort]);

  const accounts = data?.accounts.filter(a =>
    !query || a.companyName.toLowerCase().includes(query.toLowerCase()) ||
    a.industry.toLowerCase().includes(query.toLowerCase()) ||
    a.country.toLowerCase().includes(query.toLowerCase()),
  ) ?? [];

  return (
    <div className="flex flex-col gap-5">

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search company, industry, country…"
          className="rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-signal/40 w-64"
        />
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value as CustomerStatus | "all")}
              className={`px-3 py-1.5 rounded border kpi-label transition-colors flex-shrink-0 ${
                status === f.value
                  ? "border-signal bg-signal/10 text-signal"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none"
        >
          <option value="health">Sort: Health</option>
          <option value="arr">Sort: ARR</option>
          <option value="plan">Sort: Plan</option>
          <option value="name">Sort: Name</option>
          <option value="active">Sort: Last Active</option>
        </select>
        <span className="kpi-label text-faint ml-auto">{accounts.length} accounts</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Account list */}
        <div className="flex flex-col gap-2">
          {loading && (
            <div className="flex flex-col gap-2">
              {[1,2,3,4,5].map(i => <div key={i} className="rounded-xl border border-line bg-surface h-16 animate-pulse" />)}
            </div>
          )}
          {!loading && accounts.map(a => (
            <button
              key={a.id}
              onClick={() => setSelected(sel => sel?.id === a.id ? null : a)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selected?.id === a.id
                  ? "border-signal/50 bg-signal/5"
                  : "border-line bg-surface hover:border-signal/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm font-semibold text-ink truncate">{a.companyName}</p>
                  <p className="kpi-label text-faint">{a.industry} · {a.country}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="kpi-label text-faint hidden sm:block">{PLAN_LABELS[a.plan as CustomerPlan]}</span>
                  <CustomerStatusBadge status={a.status} />
                  <CustomerHealthBadge tier={a.healthScore.tier} score={a.healthScore.total} />
                </div>
              </div>
            </button>
          ))}
          {!loading && accounts.length === 0 && (
            <p className="kpi-label text-faint text-center py-8">No accounts match filter</p>
          )}
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-line bg-surface px-5 py-5 sticky top-4 h-fit">
          {!selected ? (
            <p className="kpi-label text-faint text-center py-8">Select an account to view details</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="type-secondary font-semibold text-ink">{selected.companyName}</p>
                    <p className="kpi-label text-faint">{selected.industry} · {selected.country}</p>
                  </div>
                  <CustomerStatusBadge status={selected.status} />
                </div>
              </div>

              <div className="h-layer-sep" />

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Plan",         value: PLAN_LABELS[selected.plan as CustomerPlan] },
                  { label: "ARR",          value: `$${(selected.arr / 1000).toFixed(0)}k` },
                  { label: "Sites",        value: selected.sites },
                  { label: "Assets",       value: selected.assets },
                  { label: "CSM",          value: selected.csm },
                  { label: "Joined",       value: selected.joinedAt.slice(0,7) },
                  { label: "Last Active",  value: selected.lastActiveAt },
                ].map(kv => (
                  <div key={kv.label}>
                    <p className="kpi-label text-faint">{kv.label}</p>
                    <p className="font-mono text-xs text-ink">{kv.value}</p>
                  </div>
                ))}
              </div>

              <div className="h-layer-sep" />

              <div>
                <p className="kpi-label text-faint mb-2">Health Score</p>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-2xl font-mono font-bold ${
                    selected.healthScore.total >= 65 ? "text-signal" :
                    selected.healthScore.total >= 50 ? "text-warn" : "text-danger"
                  }`}>{selected.healthScore.total}</span>
                  <CustomerHealthBadge tier={selected.healthScore.tier} score={selected.healthScore.total} showScore={false} />
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Login Activity",   v: selected.healthScore.loginActivity,   invert: false },
                    { label: "Feature Adoption", v: selected.healthScore.featureAdoption, invert: false },
                    { label: "Asset Coverage",   v: selected.healthScore.assetScore,      invert: false },
                    { label: "Knowledge Usage",  v: selected.healthScore.knowledgeScore,  invert: false },
                    { label: "Alert Handling",   v: selected.healthScore.alertHandling,   invert: false },
                    { label: "Support Risk",     v: selected.healthScore.supportRisk,     invert: true  },
                  ].map(dim => (
                    <div key={dim.label} className="flex items-center gap-2">
                      <span className="kpi-label text-faint w-28 flex-shrink-0">{dim.label}</span>
                      <div className="flex-1 h-1 rounded bg-line overflow-hidden">
                        <div
                          className={`h-1 rounded ${
                            dim.invert
                              ? dim.v < 30 ? "bg-signal/60" : dim.v < 60 ? "bg-warn" : "bg-danger/60"
                              : dim.v >= 65 ? "bg-signal/60" : dim.v >= 40 ? "bg-warn" : "bg-danger/60"
                          }`}
                          style={{ width: `${dim.v}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-ink w-6 text-right flex-shrink-0">{dim.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-layer-sep" />

              <div>
                <p className="kpi-label text-faint mb-2">Usage</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Copilot Queries",     v: selected.usage.copilotQueries            },
                    { label: "Knowledge Views",     v: selected.usage.knowledgeGraphViews       },
                    { label: "Industrial Logins",   v: selected.usage.industrialDashboardLogins  },
                    { label: "ATS Processed",       v: selected.usage.atsApplicationsProcessed  },
                    { label: "Articles Read",       v: selected.usage.knowledgeArticlesRead      },
                    { label: "Alerts Handled",      v: selected.usage.alertsHandled             },
                  ].map(u => (
                    <div key={u.label}>
                      <p className="kpi-label text-faint">{u.label}</p>
                      <p className="font-mono text-xs font-bold text-ink">{u.v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
