"use client";

// PHASE 107 STAGE 6-A — the portal's landing screen no longer greets a failed
// request with "No Account Found". `noAccount` stays the API's own signal and
// keeps its wording; every other outcome now says what actually happened.

import { useLocale } from "next-intl";
import { Link }                from "@/i18n/navigation";
import type { CustomerOverview } from "@/lib/customer-portal/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { ResourceFailureNotice } from "@/components/ui/ResourceFailureNotice";
import { useResource } from "@/lib/client/use-resource";
import { requestJson } from "@/lib/client/resource-request";

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-1">
      <p className="font-mono text-xs uppercase tracking-widest text-metadata">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function CustomerOverviewClient() {
  const locale = useLocale();
  const overviewState = useResource<CustomerOverview | null>(
    (signal) => requestJson(
      "/api/customer/overview",
      (body) => {
        if (!body || typeof body !== "object") return undefined;
        const d = body as { overview?: CustomerOverview | null; noAccount?: boolean };

        /*
         * PHASE 107 STAGE 6-A.3 — the PRESENCE CHECK COMES FIRST.
         *
         * `if (d.noAccount) return null` ran before the envelope was verified,
         * so a malformed `200 {"noAccount": true}` short-circuited to `null` and
         * the reader was told they have no portal account — a statement about
         * their account derived from a body that never described it.
         *
         * The route (src/app/api/customer/overview/route.ts) has exactly two
         * success shapes and BOTH carry `overview`:
         *     { overview: null, noAccount: true }
         *     { overview }
         * so its absence is a broken contract in every shape.
         *
         * Found by the order-sensitive selector audit, which reads statements in
         * sequence; the previous text-matching version certified this as safe
         * because a presence check appeared *somewhere* in the function.
         */
        if (d.overview === undefined) return undefined;

        if (d.noAccount) return null;
        return d.overview;
      },
      { signal },
    ),
    [],
  );

  if (overviewState.status === "LOADING") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} data-async-state="loading" className="h-24 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (overviewState.status === "ERROR" && overviewState.failure) {
    return (
      <div className="rounded-2xl border border-line bg-surface">
        <ResourceFailureNotice code={overviewState.failure} onRetry={overviewState.retry} />
      </div>
    );
  }

  const data = overviewState.data;

  if (!data?.account) {
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
            <p className="font-mono text-xs uppercase tracking-widest text-metadata">Account</p>
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
              <p className="font-mono text-xs uppercase tracking-widest text-metadata">Subscription</p>
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
              <p className="text-metadata text-xs">Users</p>
              <p className="text-ink font-medium">{subscription.usersCount} / {subscription.usersLimit}</p>
            </div>
            <div>
              <p className="text-metadata text-xs">Storage</p>
              <p className="text-ink font-medium">{subscription.storageUsedGb.toFixed(1)} / {subscription.storageLimitGb} GB</p>
            </div>
            <div>
              <p className="text-metadata text-xs">API Calls</p>
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
            <p className="font-mono text-xs uppercase tracking-widest text-metadata">Recent Activity</p>
            <Link href="/customer/activity" className="text-xs text-signal hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-line">
            {recentActivity.slice(0, 5).map((log) => (
              <li key={log.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <span className="text-sm text-ink">{log.description}</span>
                <span className="shrink-0 text-xs text-metadata">
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
