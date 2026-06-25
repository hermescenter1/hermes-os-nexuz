"use client";

import { useState, useEffect } from "react";
import Link                    from "next/link";
import { usePathname }         from "next/navigation";
import { HealthScoreCard }     from "./HealthScoreCard";
import type { CrmAccountWithHealth } from "@/lib/crm/types";

const TIER_STYLES: Record<string, string> = {
  ENTERPRISE: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  PREMIUM:    "bg-violet-500/10 text-violet-400 border-violet-500/20",
  STANDARD:   "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function AccountListClient() {
  const [accounts, setAccounts] = useState<CrmAccountWithHealth[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const pathname = usePathname();
  const base = pathname.startsWith("/fa") ? "/fa" : "/en";

  useEffect(() => {
    fetch("/api/crm/accounts")
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = accounts.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.industry ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search accounts…"
        className="w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-cyan-500/40 focus:outline-none"
      />

      {loading && <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />}

      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          No accounts found.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {["Account","Industry","Tier","Health","Open Deals","Country"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/crm/accounts/${a.id}`} className="font-medium text-ink hover:text-cyan-400 transition-colors">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.industry ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TIER_STYLES[a.tier] ?? TIER_STYLES.STANDARD}`}>
                      {a.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.health
                      ? <HealthScoreCard score={a.health.score} category={a.health.category} compact />
                      : <span className="text-faint text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 font-mono text-cyan-400">{a.openDeals}</td>
                  <td className="px-4 py-3 text-muted">{a.country ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
