"use client";

import { useState, useEffect }  from "react";
import Link                     from "next/link";
import { usePathname }          from "next/navigation";
import { HealthScoreCard }      from "./HealthScoreCard";
import type {
  CrmCustomerSuccessOverview, CrmRenewalForecast,
  CrmExpansionOpportunity, CrmSuccessManager,
} from "@/lib/crm/types";

const RENEWAL_STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-green-500/10 text-green-400 border-green-500/20",
  PENDING:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  AT_RISK:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  CHURNED:   "bg-red-500/10 text-red-400 border-red-500/20",
};

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function CustomerSuccessClient() {
  const [data,    setData]    = useState<CrmCustomerSuccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"health"|"renewals"|"expansions"|"managers">("health");
  const pathname = usePathname();
  const base = pathname.startsWith("/fa") ? "/fa" : "/en";

  useEffect(() => {
    fetch("/api/crm/customer-success")
      .then(r => r.json())
      .then(d => setData(d.overview ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;
  if (!data)   return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Data unavailable.</div>;

  const { healthSummary } = data;

  const healthKpis = [
    { label: "Healthy",  value: healthSummary.healthy,  color: "text-green-400"  },
    { label: "Watch",    value: healthSummary.watch,    color: "text-yellow-400" },
    { label: "At Risk",  value: healthSummary.atRisk,   color: "text-orange-400" },
    { label: "Critical", value: healthSummary.critical, color: "text-red-400"    },
  ];

  const tabs = [
    { id: "health",     label: `Health (${data.accounts.length})` },
    { id: "renewals",   label: `Renewals (${data.renewals.length})` },
    { id: "expansions", label: `Expansion (${data.expansions.length})` },
    { id: "managers",   label: `CSMs (${data.managers.length})` },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Health summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {healthKpis.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">{label}</p>
            <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={[
              "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
              tab === t.id
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {["Account","Tier","Industry","Health Score"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data.accounts]
                .sort((a, b) => (a.health?.score ?? 0) - (b.health?.score ?? 0))
                .map(a => (
                <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/crm/accounts/${a.id}`} className="font-medium text-ink hover:text-cyan-400 transition-colors">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.tier}</td>
                  <td className="px-4 py-3 text-muted">{a.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.health
                      ? <HealthScoreCard score={a.health.score} category={a.health.category} compact />
                      : <span className="text-faint text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "renewals" && (
        <div className="space-y-3">
          {data.renewals.map((r: CrmRenewalForecast) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-ink">
                  {data.accounts.find(a => a.id === r.accountId)?.name ?? r.accountId}
                </p>
                <p className="text-xs text-muted">Due {new Date(r.renewalDate).toLocaleDateString()} · {r.probability}% probability</p>
                {r.notes && <p className="text-xs text-faint">{r.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${RENEWAL_STATUS_STYLES[r.status] ?? ""}`}>
                  {r.status}
                </span>
                <span className="font-mono text-sm text-cyan-400">{fmt(r.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "expansions" && (
        <div className="space-y-3">
          {data.expansions.map((e: CrmExpansionOpportunity) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-ink">{e.title}</p>
                <p className="text-xs text-muted">{e.type} · {data.accounts.find(a => a.id === e.accountId)?.name ?? ""}</p>
                {e.description && <p className="text-xs text-faint">{e.description}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-xs text-muted">{e.status}</span>
                <span className="font-mono text-sm text-cyan-400">{fmt(e.value)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "managers" && (
        <div className="space-y-3">
          {data.managers.map((mgr: CrmSuccessManager) => (
            <div key={mgr.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{mgr.displayName}</p>
                  <p className="text-xs text-muted">{mgr.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-cyan-400">{(mgr.accountIds as string[]).length}</p>
                  <p className="text-xs text-faint">of {mgr.capacity} accounts</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
