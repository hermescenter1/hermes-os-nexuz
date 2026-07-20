"use client";

import { useLocale } from "next-intl";
import { useState, useEffect } from "react";
import { formatNumber } from "@/lib/i18n/format";

interface UsageTotals {
  copilotQueries:            number;
  knowledgeGraphViews:       number;
  industrialDashboardLogins: number;
  atsApplicationsProcessed:  number;
  knowledgeArticlesRead:     number;
  alertsHandled:             number;
}

interface FeatureAdoption {
  feature:        string;
  label:          string;
  customersUsing: number;
  totalCustomers: number;
  pct:            number;
}

interface TopEntry { id: string; name: string; count: number }

interface PerCustomer {
  id:         string;
  name:       string;
  plan:       string;
  copilot:    number;
  knowledge:  number;
  industrial: number;
  ats:        number;
  alerts:     number;
}

interface UsageData {
  totals:          UsageTotals;
  featureAdoption: FeatureAdoption[];
  topByFeature:    { copilot: TopEntry[]; knowledge: TopEntry[]; industrial: TopEntry[]; ats: TopEntry[] };
  perCustomer:     PerCustomer[];
}

const FEATURE_COLORS: Record<string, string> = {
  copilot:    "bg-signal/70",
  knowledge:  "bg-ice/70",
  industrial: "bg-hermesGold/60",
  ats:        "bg-warn/60",
  knowledge2: "bg-signal/40",
};

export function UsageAnalyticsClient() {
  const locale = useLocale();
  const [data,    setData]    = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"adoption" | "top" | "perCustomer">("adoption");

  useEffect(() => {
    fetch("/api/customers/usage")
      .then(r => r.json())
      .then((d: UsageData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5,6].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="rounded-xl border border-line bg-surface h-64 animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { totals, featureAdoption, topByFeature, perCustomer } = data;

  const maxPerCustomer = Math.max(
    ...perCustomer.map(c => c.copilot + c.knowledge + c.industrial), 1,
  );

  return (
    <div className="flex flex-col gap-5">

      {/* Totals strip */}
      <div className="global-ops-strip">
        {[
          { label: "Copilot Queries",      v: totals.copilotQueries,            color: "text-signal" },
          { label: "Knowledge Views",      v: totals.knowledgeGraphViews,       color: "text-ice"    },
          { label: "Industrial Logins",    v: totals.industrialDashboardLogins, color: "text-hermesGold" },
          { label: "ATS Processed",        v: totals.atsApplicationsProcessed,  color: "text-warn"   },
          { label: "Articles Read",        v: totals.knowledgeArticlesRead,     color: "text-signal" },
          { label: "Alerts Handled",       v: totals.alertsHandled,            color: "text-ink"    },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`intel-kpi-value ${kpi.color}`}>{formatNumber(kpi.v, locale)}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1">
        {([
          { id: "adoption",    label: "FEATURE ADOPTION" },
          { id: "top",         label: "TOP USERS"        },
          { id: "perCustomer", label: "PER CUSTOMER"     },
        ] as const).map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-1.5 rounded border kpi-label transition-colors ${
              view === v.id
                ? "border-signal bg-signal/10 text-signal"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Feature adoption */}
      {view === "adoption" && (
        <div className="rounded-xl border border-line bg-surface px-6 py-6">
          <div className="h-layer-sep mb-6"><span className="kpi-label">Feature Adoption by Platform Module</span></div>
          <div className="space-y-5">
            {featureAdoption.map(f => (
              <div key={f.feature}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-body text-sm text-ink">{f.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="kpi-label text-faint">{f.customersUsing}/{f.totalCustomers} accounts</span>
                    <span className={`font-mono text-sm font-bold ${f.pct >= 70 ? "text-signal" : f.pct >= 40 ? "text-warn" : "text-danger"}`}>
                      {f.pct}%
                    </span>
                  </div>
                </div>
                <div className="h-3 rounded-full bg-line overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all ${FEATURE_COLORS[f.feature] ?? "bg-signal/50"}`}
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top users per feature */}
      {view === "top" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(["copilot", "knowledge", "industrial", "ats"] as const).map(feat => {
            const entries = topByFeature[feat];
            const labels: Record<typeof feat, string> = {
              copilot:    "Copilot Queries",
              knowledge:  "Knowledge Views",
              industrial: "Industrial Logins",
              ats:        "ATS Applications",
            };
            const max = Math.max(...entries.map(e => e.count), 1);
            return (
              <div key={feat} className="rounded-xl border border-line bg-surface px-5 py-5">
                <div className="h-layer-sep mb-4"><span className="kpi-label">{labels[feat]}</span></div>
                <div className="space-y-2.5">
                  {entries.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-faint w-4 flex-shrink-0">{i + 1}</span>
                      <span className="font-body text-xs text-ink flex-1 min-w-0 truncate">{e.name}</span>
                      <div className="w-20 h-1.5 rounded bg-line overflow-hidden flex-shrink-0">
                        <div
                          className={FEATURE_COLORS[feat]}
                          style={{ width: `${(e.count / max) * 100}%`, height: "100%", borderRadius: "2px" }}
                        />
                      </div>
                      <span className="font-mono text-xs font-bold text-ink w-8 text-right flex-shrink-0">{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-customer usage table */}
      {view === "perCustomer" && (
        <div className="rounded-xl border border-line bg-surface px-5 py-5 overflow-x-auto">
          <div className="h-layer-sep mb-4"><span className="kpi-label">Usage Per Account</span></div>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line">
                {["Account", "Plan", "Copilot", "Knowledge", "Industrial", "ATS", "Alerts", "Total"].map(h => (
                  <th key={h} className="kpi-label text-faint text-left pb-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perCustomer.map(c => {
                const total = c.copilot + c.knowledge + c.industrial + c.ats + c.alerts;
                return (
                  <tr key={c.id} className="border-b border-line/50 hover:bg-line/10">
                    <td className="py-2 pr-4 font-body text-xs text-ink">{c.name}</td>
                    <td className="py-2 pr-4 kpi-label text-faint capitalize">{c.plan}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{c.copilot}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{c.knowledge}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{c.industrial}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{c.ats}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{c.alerts}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 rounded bg-line overflow-hidden">
                          <div className="h-1 rounded bg-signal/60" style={{ width: `${(total / maxPerCustomer) * 100}%` }} />
                        </div>
                        <span className="font-mono text-xs font-bold text-ink">{total}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
