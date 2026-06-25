"use client";

import { useState, useEffect } from "react";
import { HealthScoreCard }     from "./HealthScoreCard";
import type {
  CrmAccountWithHealth, CrmOpportunity, CrmDeal,
  CrmJourneyEvent, CrmRenewalForecast, CrmExpansionOpportunity,
} from "@/lib/crm/types";

const EVENT_LABELS: Record<string, string> = {
  LEAD_CREATED: "Lead Created", LEAD_QUALIFIED: "Qualified", DEMO_REQUESTED: "Demo Requested",
  PROPOSAL_SENT: "Proposal Sent", CUSTOMER_WON: "Customer Won", PORTAL_ACTIVATED: "Portal Activated",
  ACADEMY_ENROLLED: "Academy Enrolled", SUPPORT_TICKET_CREATED: "Support Ticket",
  RENEWAL_STARTED: "Renewal Started", RENEWAL_COMPLETED: "Renewal Completed",
};

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

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;
  if (!account) return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Account not found.</div>;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "journey",  label: `Journey (${account.journeyEvents?.length ?? 0})` },
    { id: "deals",    label: `Deals (${account.deals?.length ?? 0})` },
    { id: "renewals", label: `Renewals (${account.renewals?.length ?? 0})` },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">{account.name}</h2>
            <p className="text-sm text-muted">{account.industry ?? ""} · {account.country ?? ""}</p>
            {account.website && <a href={account.website} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline">{account.website}</a>}
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
            {account.health && <HealthScoreCard score={account.health.score} category={account.health.category} />}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Annual Revenue", value: account.annualRevenue ? fmt(account.annualRevenue) : "—" },
          { label: "Employees",      value: account.employeeCount ? account.employeeCount.toLocaleString() : "—" },
          { label: "Open Deals",     value: String(account.openDeals) },
          { label: "Tier",           value: account.tier },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">{label}</p>
            <p className="mt-1 text-lg font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-0">
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

      {/* Tab panels */}
      {tab === "overview" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Active Opportunities</h3>
          {(account.opportunities ?? []).length === 0
            ? <p className="text-sm text-muted">No opportunities.</p>
            : (account.opportunities ?? []).slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{o.title}</p>
                  <p className="text-xs text-muted">{o.stage} · {o.probability}%</p>
                </div>
                <span className="font-mono text-cyan-400 text-sm">{fmt(o.value)}</span>
              </div>
            ))
          }
        </div>
      )}

      {tab === "journey" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink">Customer Journey</h3>
          {(account.journeyEvents ?? []).length === 0
            ? <p className="text-sm text-muted">No journey events.</p>
            : (
              <div className="relative border-l-2 border-cyan-500/20 ml-2 space-y-4">
                {(account.journeyEvents ?? []).map(e => (
                  <div key={e.id} className="relative ml-4">
                    <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-cyan-500 bg-bg" />
                    <p className="text-sm font-medium text-ink">{EVENT_LABELS[e.eventType] ?? e.eventType}</p>
                    {e.description && <p className="text-xs text-muted">{e.description}</p>}
                    <p className="text-xs text-faint">{new Date(e.occurredAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {tab === "deals" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Deals</h3>
          {(account.deals ?? []).length === 0
            ? <p className="text-sm text-muted">No deals.</p>
            : (account.deals ?? []).map(d => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{d.title}</p>
                  <p className="text-xs text-muted">{d.status} {d.closedAt ? `· Closed ${new Date(d.closedAt).toLocaleDateString()}` : ""}</p>
                </div>
                <span className="font-mono text-cyan-400 text-sm">{fmt(d.value)}</span>
              </div>
            ))
          }
        </div>
      )}

      {tab === "renewals" && (
        <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Renewal Forecast</h3>
          {(account.renewals ?? []).length === 0
            ? <p className="text-sm text-muted">No renewals.</p>
            : (account.renewals ?? []).map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Renewal · {r.status}</p>
                  <p className="text-xs text-muted">{new Date(r.renewalDate).toLocaleDateString()} · {r.probability}% probability</p>
                  {r.notes && <p className="text-xs text-faint">{r.notes}</p>}
                </div>
                <span className="font-mono text-cyan-400 text-sm">{fmt(r.value)}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
