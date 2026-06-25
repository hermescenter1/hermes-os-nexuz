"use client";

import { useEffect, useState } from "react";
import type { AdminCustomerListItem } from "@/lib/customer-portal/types";

const TIER_COLORS: Record<string, string> = {
  ENTERPRISE:   "border-signal/30 bg-signal/10 text-signal",
  PROFESSIONAL: "border-ice/30 bg-ice/10 text-ice",
  STANDARD:     "border-line text-muted",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "border-signal/30 bg-signal/10 text-signal",
  INACTIVE:  "border-line text-faint",
  SUSPENDED: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function CustomerAdminClient() {
  const [accounts, setAccounts] = useState<AdminCustomerListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<string>("ALL");

  useEffect(() => {
    const url = filter === "ALL" ? "/api/admin/customers" : `/api/admin/customers?status=${filter}`;
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: { accounts?: AdminCustomerListItem[] }) => setAccounts(d.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["ALL", "ACTIVE", "INACTIVE", "SUSPENDED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-muted hover:text-ink"
            }`}
          >
            {f === "ALL" ? "All Accounts" : f}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Accounts",  value: accounts.length },
          { label: "Active",          value: accounts.filter((a) => a.status === "ACTIVE").length },
          { label: "Open Tickets",    value: accounts.reduce((s, a) => s + a.openTickets, 0) },
          { label: "Active Projects", value: accounts.reduce((s, a) => s + a.activeProjects, 0) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4 text-center">
            <p className="text-2xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-2">
          <h2 className="text-lg font-bold text-ink">No Customer Accounts</h2>
          <p className="text-sm text-muted">Create customer portal accounts via the API or by provisioning through the admin panel.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-faint">Account</th>
                  <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-faint">Industry</th>
                  <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-faint">Tier</th>
                  <th className="px-5 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-faint">Status</th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-faint">Health</th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-faint">Tickets</th>
                  <th className="px-5 py-3 text-right font-mono text-[10px] uppercase tracking-widest text-faint">Projects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-ink">{a.displayName}</p>
                      <p className="text-xs text-faint font-mono">{a.accountNumber}</p>
                    </td>
                    <td className="px-5 py-4 text-muted">{a.industry ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${TIER_COLORS[a.tier] ?? "border-line text-muted"}`}>
                        {a.tier}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${STATUS_COLORS[a.status] ?? "border-line text-muted"}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {a.healthScore != null ? (
                        <span className={`font-mono font-bold ${a.healthScore >= 80 ? "text-signal" : a.healthScore >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {Math.round(a.healthScore)}%
                        </span>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`font-mono ${a.openTickets > 0 ? "text-amber-400" : "text-faint"}`}>{a.openTickets}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono text-muted">{a.activeProjects}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
