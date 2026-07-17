"use client";

// PHASE 87G AMENDMENT 1 — localized customer-success center. Same fetch/tabs;
// health + renewal-status enums map to localized labels (values internal;
// expansion type/status remain raw machine identifiers — no verified enum).

import { useState, useEffect }  from "react";
import Link                     from "next/link";
import { usePathname }          from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
const RENEWAL_STATUS_KEYS = new Set(["CONFIRMED", "PENDING", "AT_RISK", "CHURNED"]);

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function CustomerSuccessClient() {
  const t = useTranslations("crm");
  const locale = useLocale();
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

  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  if (loading) return (
    <div className="h-64 rounded-xl border border-line bg-surface animate-pulse">
      <span className="sr-only" role="status">{t("common.loading")}</span>
    </div>
  );
  if (!data) return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">{t("cs.unavailable")}</div>;

  const { healthSummary } = data;

  const healthKpis = [
    { label: t("health.HEALTHY"),  value: healthSummary.healthy,  color: "text-green-400"  },
    { label: t("health.WATCH"),    value: healthSummary.watch,    color: "text-yellow-400" },
    { label: t("health.AT_RISK"),  value: healthSummary.atRisk,   color: "text-orange-400" },
    { label: t("health.CRITICAL"), value: healthSummary.critical, color: "text-red-400"    },
  ];

  const tabs = [
    { id: "health",     label: t("cs.tabHealth",     { count: data.accounts.length }) },
    { id: "renewals",   label: t("cs.tabRenewals",   { count: data.renewals.length }) },
    { id: "expansions", label: t("cs.tabExpansions", { count: data.expansions.length }) },
    { id: "managers",   label: t("cs.tabManagers",   { count: data.managers.length }) },
  ] as const;

  const renewalLabel = (status: string) =>
    RENEWAL_STATUS_KEYS.has(status) ? t(`renewalStatus.${status}`) : status;

  const columns = [t("cs.colAccount"), t("cs.colTier"), t("cs.colIndustry"), t("cs.colHealthScore")];
  const tierLabel = (tier: string) =>
    tier === "ENTERPRISE" || tier === "PREMIUM" || tier === "STANDARD" ? t(`tier.${tier}`) : tier;

  return (
    <div className="space-y-6">
      {/* Health summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {healthKpis.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">{label}</p>
            <p className={`mt-1 text-3xl font-bold ${color}`} dir="ltr">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line" role="tablist">
        {tabs.map(tb => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id as typeof tab)}
            className={[
              "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
              tab === tb.id
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map(h => (
                  <th key={h} scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data.accounts]
                .sort((a, b) => (a.health?.score ?? 0) - (b.health?.score ?? 0))
                .map(a => (
                <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/crm/accounts/${a.id}`} className="font-medium text-ink hover:text-cyan-400 transition-colors" dir="auto">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{tierLabel(a.tier)}</td>
                  <td className="px-4 py-3 text-muted" dir="auto">{a.industry ?? "—"}</td>
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
                <p className="text-sm font-medium text-ink" dir="auto">
                  {data.accounts.find(a => a.id === r.accountId)?.name ?? r.accountId}
                </p>
                <p className="text-xs text-muted">{t("common.due", { date: df.format(new Date(r.renewalDate)) })} · {t("common.probabilityOf", { n: r.probability })}</p>
                {r.notes && <p className="text-xs text-faint" dir="auto">{r.notes}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${RENEWAL_STATUS_STYLES[r.status] ?? ""}`}>
                  {renewalLabel(r.status)}
                </span>
                <span className="font-mono text-sm text-cyan-400"><bdi dir="ltr">{fmt(r.value)}</bdi></span>
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
                <p className="text-sm font-medium text-ink" dir="auto">{e.title}</p>
                <p className="text-xs text-muted"><bdi dir="ltr">{e.type}</bdi> · <span dir="auto">{data.accounts.find(a => a.id === e.accountId)?.name ?? ""}</span></p>
                {e.description && <p className="text-xs text-faint" dir="auto">{e.description}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-xs text-muted"><bdi dir="ltr">{e.status}</bdi></span>
                <span className="font-mono text-sm text-cyan-400"><bdi dir="ltr">{fmt(e.value)}</bdi></span>
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
                  <p className="text-sm font-medium text-ink" dir="auto">{mgr.displayName}</p>
                  <p className="text-xs text-muted"><bdi dir="ltr">{mgr.email}</bdi></p>
                </div>
                <div className="text-end">
                  <p className="font-mono text-sm text-cyan-400" dir="ltr">{(mgr.accountIds as string[]).length}</p>
                  <p className="text-xs text-faint">{t("cs.ofAccounts", { capacity: mgr.capacity })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
