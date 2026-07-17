"use client";

// PHASE 87G AMENDMENT 1 — localized account profile. Same fetch/tabs; journey
// event types map to localized labels (values internal, unknown types fall
// back to the raw identifier); money/dates bidi-safe; deal/expansion status
// values remain raw machine identifiers (no verified enum in types).

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HealthScoreCard }     from "./HealthScoreCard";
import type {
  CrmAccountWithHealth, CrmOpportunity, CrmDeal,
  CrmJourneyEvent, CrmRenewalForecast, CrmExpansionOpportunity,
} from "@/lib/crm/types";

const JOURNEY_EVENT_KEYS = new Set([
  "LEAD_CREATED", "LEAD_QUALIFIED", "DEMO_REQUESTED", "PROPOSAL_SENT",
  "CUSTOMER_WON", "PORTAL_ACTIVATED", "ACADEMY_ENROLLED",
  "SUPPORT_TICKET_CREATED", "RENEWAL_STARTED", "RENEWAL_COMPLETED",
]);

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

type AccountDetail = CrmAccountWithHealth & {
  contacts:      unknown[];
  opportunities: CrmOpportunity[];
  deals:         CrmDeal[];
  journeyEvents: CrmJourneyEvent[];
  renewals:      CrmRenewalForecast[];
  expansions:    CrmExpansionOpportunity[];
};

export function AccountDetailClient({ accountId }: { accountId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"overview"|"journey"|"deals"|"renewals">("overview");

  useEffect(() => {
    fetch(`/api/crm/accounts/${accountId}`)
      .then(r => r.json())
      .then(d => setAccount(d.account ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId]);

  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
  const nfInt = new Intl.NumberFormat(locale);

  if (loading) return (
    <div className="h-64 rounded-xl border border-line bg-surface animate-pulse">
      <span className="sr-only" role="status">{t("common.loading")}</span>
    </div>
  );
  if (!account) return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">{t("accountDetail.notFound")}</div>;

  const tierLabel = (tier: string) =>
    tier === "ENTERPRISE" || tier === "PREMIUM" || tier === "STANDARD" ? t(`tier.${tier}`) : tier;
  const journeyLabel = (eventType: string) =>
    JOURNEY_EVENT_KEYS.has(eventType) ? t(`journeyEvent.${eventType}`) : eventType;

  const tabs = [
    { id: "overview", label: t("accountDetail.tabOverview") },
    { id: "journey",  label: t("accountDetail.tabJourney",  { count: account.journeyEvents?.length ?? 0 }) },
    { id: "deals",    label: t("accountDetail.tabDeals",    { count: account.deals?.length ?? 0 }) },
    { id: "renewals", label: t("accountDetail.tabRenewals", { count: account.renewals?.length ?? 0 }) },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink" dir="auto">{account.name}</h2>
            <p className="text-sm text-muted" dir="auto">{account.industry ?? ""} · {account.country ?? ""}</p>
            {account.website && <a href={account.website} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline"><bdi dir="ltr">{account.website}</bdi></a>}
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
            {account.health && <HealthScoreCard score={account.health.score} category={account.health.category} />}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("accountDetail.annualRevenue"), value: account.annualRevenue ? <bdi dir="ltr">{fmt(account.annualRevenue)}</bdi> : "—" },
          { label: t("accountDetail.employees"),     value: account.employeeCount ? <span dir="ltr">{nfInt.format(account.employeeCount)}</span> : "—" },
          { label: t("accountDetail.openDeals"),     value: <span dir="ltr">{String(account.openDeals)}</span> },
          { label: t("accountDetail.tierLabel"),     value: tierLabel(account.tier) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">{label}</p>
            <p className="mt-1 text-lg font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-0" role="tablist">
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

      {/* Tab panels */}
      {tab === "overview" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">{t("accountDetail.activeOpportunities")}</h3>
          {(account.opportunities ?? []).length === 0
            ? <p className="text-sm text-muted">{t("accountDetail.noOpportunities")}</p>
            : (account.opportunities ?? []).slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink" dir="auto">{o.title}</p>
                  <p className="text-xs text-muted">{t(`stage.${o.stage}`)} · <span dir="ltr">{o.probability}%</span></p>
                </div>
                <span className="font-mono text-cyan-400 text-sm"><bdi dir="ltr">{fmt(o.value)}</bdi></span>
              </div>
            ))
          }
        </div>
      )}

      {tab === "journey" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">{t("accountDetail.customerJourney")}</h3>
          {(account.journeyEvents ?? []).length === 0
            ? <p className="text-sm text-muted">{t("accountDetail.noJourney")}</p>
            : (
              <div className="relative border-s-2 border-cyan-500/20 ms-2 space-y-4">
                {(account.journeyEvents ?? []).map(e => (
                  <div key={e.id} className="relative ms-4">
                    <span className="absolute -start-[21px] top-1 h-3 w-3 rounded-full border-2 border-cyan-500 bg-bg" aria-hidden="true" />
                    <p className="text-sm font-medium text-ink">{journeyLabel(e.eventType)}</p>
                    {e.description && <p className="text-xs text-muted" dir="auto">{e.description}</p>}
                    <p className="text-xs text-faint">{df.format(new Date(e.occurredAt))}</p>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {tab === "deals" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t("accountDetail.deals")}</h3>
          {(account.deals ?? []).length === 0
            ? <p className="text-sm text-muted">{t("accountDetail.noDeals")}</p>
            : (account.deals ?? []).map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink" dir="auto">{d.title}</p>
                  <p className="text-xs text-muted"><bdi dir="ltr">{d.status}</bdi> {d.closedAt ? `· ${t("accountDetail.closedOn", { date: df.format(new Date(d.closedAt)) })}` : ""}</p>
                </div>
                <span className="font-mono text-cyan-400 text-sm"><bdi dir="ltr">{fmt(d.value)}</bdi></span>
              </div>
            ))
          }
        </div>
      )}

      {tab === "renewals" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t("accountDetail.renewalForecast")}</h3>
          {(account.renewals ?? []).length === 0
            ? <p className="text-sm text-muted">{t("accountDetail.noRenewals")}</p>
            : (account.renewals ?? []).map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{t("accountDetail.renewal")} · <bdi dir="ltr">{r.status}</bdi></p>
                  <p className="text-xs text-muted">{df.format(new Date(r.renewalDate))} · {t("common.probabilityOf", { n: r.probability })}</p>
                  {r.notes && <p className="text-xs text-faint" dir="auto">{r.notes}</p>}
                </div>
                <span className="font-mono text-cyan-400 text-sm"><bdi dir="ltr">{fmt(r.value)}</bdi></span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
