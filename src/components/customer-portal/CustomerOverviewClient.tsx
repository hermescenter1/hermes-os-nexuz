"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";
import type { CustomerOverview } from "@/lib/customer-portal/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-1">
      <p className="font-mono text-xs uppercase tracking-widest text-faint">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function CustomerOverviewClient() {
  const locale = useLocale();
  const [data, setData]       = useState<CustomerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/overview")
      .then((r) => r.json())
      .then((d: { overview?: CustomerOverview | null; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setData(d.overview ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (noAccount || !data?.account) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-8 py-16 text-center space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Customer Portal</p>
        <h2 className="text-xl font-bold text-ink">No Account Found</h2>
        <p className="text-sm text-muted max-w-sm mx-auto">
          Your organization does not have a customer portal account yet. Please contact your account manager or the Hermes OS team.
        </p>
      </div>
    );
  }

  const { account, openTickets, activeProjects, totalDocuments, subscription, recentActivity } = data;

  return (
    <div className="space-y-8">
      {/* Account header */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Account</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{account.displayName}</h2>
            <p className="mt-1 text-sm text-muted">
              {account.accountNumber} · {account.industry ?? "General"} · {account.tier}
            </p>
          </div>
          <span className={`shrink-0 rounded border px-3 py-1 text-xs font-mono font-semibold ${
            account.status === "ACTIVE"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-amber-400/30 bg-amber-400/10 text-amber-400"
          }`}>
            {account.status}
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Open Tickets"    value={openTickets}    sub="Awaiting response" />
        <KpiCard label="Active Projects" value={activeProjects} sub="In progress" />
        <KpiCard label="Documents"       value={totalDocuments} sub="In your library" />
        <KpiCard
          label="Health Score"
          value={account.healthScore ? `${Math.round(account.healthScore)}%` : "—"}
          sub="Account health"
        />
      </div>

      {/* Subscription summary */}
      {subscription && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-faint">Subscription</p>
              <p className="mt-1 font-semibold text-ink">{subscription.planName} · {subscription.billingCycle}</p>
            </div>
            <span className={`rounded border px-3 py-1 text-xs font-mono font-semibold ${
              subscription.status === "ACTIVE"
                ? "border-signal/30 bg-signal/10 text-signal"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {subscription.status}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-faint text-xs">Users</p>
              <p className="text-ink font-medium">{subscription.usersCount} / {subscription.usersLimit}</p>
            </div>
            <div>
              <p className="text-faint text-xs">Storage</p>
              <p className="text-ink font-medium">{subscription.storageUsedGb.toFixed(1)} / {subscription.storageLimitGb} GB</p>
            </div>
            <div>
              <p className="text-faint text-xs">API Calls</p>
              <p className="text-ink font-medium">{formatNumber(subscription.apiCallsMonth, locale)} / {formatNumber(subscription.apiCallsLimit, locale)}</p>
            </div>
          </div>
          <Link href="/customer/subscription" className="mt-4 inline-block text-sm text-signal hover:underline">
            View full subscription →
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { href: "/customer/support",  label: "Open Ticket",   color: "signal" },
          { href: "/customer/projects", label: "View Projects", color: "ice" },
          { href: "/customer/documents",label: "Documents",     color: "ice" },
          { href: "/customer/training", label: "Training",      color: "ice" },
        ].map(({ href, label, color }) => (
          <Link
            key={href}
            href={href as "/customer"}
            className={`rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:bg-surface-2 ${
              color === "signal"
                ? "border-signal/30 bg-signal/5 text-signal"
                : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          <div className="px-6 py-4 border-b border-line flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Recent Activity</p>
            <Link href="/customer/activity" className="text-xs text-signal hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-line">
            {recentActivity.slice(0, 5).map((log) => (
              <li key={log.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <span className="text-sm text-ink">{log.description}</span>
                <span className="shrink-0 text-xs text-faint">
                  {formatDate(log.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
