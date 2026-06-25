"use client";

import { useEffect, useState } from "react";
import type { CustomerSubscriptionView } from "@/lib/customer-portal/types";

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-400" : "bg-signal";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-faint">{label}</span>
        <span className="text-xs text-muted font-mono">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-line">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted mt-1">{used.toLocaleString()} / {limit.toLocaleString()}</p>
    </div>
  );
}

export function CustomerSubscriptionClient() {
  const [sub, setSub]         = useState<CustomerSubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/subscription")
      .then((r) => r.json())
      .then((d: { subscription?: CustomerSubscriptionView | null; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setSub(d.subscription ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (noAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-3">
        <h2 className="text-lg font-bold text-ink">No Subscription Data</h2>
        <p className="text-sm text-muted">Your subscription details will appear here once configured by your account manager.</p>
        <a
          href="mailto:support@hermesnovin.com"
          className="inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          Contact Sales
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan overview */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-faint">Current Plan</p>
            <h2 className="mt-1 text-2xl font-bold text-ink">{sub.planName}</h2>
            <p className="text-sm text-muted">{sub.planTier} · {sub.billingCycle}</p>
          </div>
          <span className={`shrink-0 rounded border px-3 py-1 text-sm font-mono font-semibold ${
            sub.status === "ACTIVE"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}>
            {sub.status}
          </span>
        </div>
        {sub.currentPeriodEnd && (
          <p className="text-sm text-muted">
            Current period: {sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString() : "—"}
            {" → "}
            {new Date(sub.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Usage */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-6">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Usage This Period</p>
        <UsageBar used={sub.usersCount}     limit={sub.usersLimit}     label="Users" />
        <UsageBar used={sub.storageUsedGb}  limit={sub.storageLimitGb} label="Storage (GB)" />
        <UsageBar used={sub.apiCallsMonth}  limit={sub.apiCallsLimit}  label="API Calls" />
      </div>

      {/* Features */}
      {sub.features.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-faint mb-4">Included Features</p>
          <div className="flex flex-wrap gap-2">
            {sub.features.map((f) => (
              <span key={f} className="rounded-full border border-signal/30 bg-signal/5 px-3 py-1 text-xs text-signal">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade CTA */}
      <div className="rounded-xl border border-line bg-surface p-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-ink">Need more capacity?</p>
          <p className="text-sm text-muted">Upgrade your plan for higher limits and additional features.</p>
        </div>
        <a
          href="mailto:sales@hermesnovin.com?subject=Plan Upgrade Request"
          className="shrink-0 rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          Contact Sales
        </a>
      </div>

      {/* Invoice placeholder */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-faint mb-3">Invoices</p>
        <div className="py-8 text-center text-sm text-muted">
          Invoice history and billing management will be available in a future update.
        </div>
      </div>
    </div>
  );
}
