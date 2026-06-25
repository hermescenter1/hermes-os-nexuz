"use client";

import { useState, useEffect } from "react";
import type { CrmOpportunity, CrmAccount, CrmOpportunityStage } from "@/lib/crm/types";

const STAGE_STYLES: Record<CrmOpportunityStage, string> = {
  DISCOVERY:"bg-slate-500/10 text-slate-400 border-slate-500/20",
  QUALIFICATION:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  PROPOSAL:"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  TECHNICAL_REVIEW:"bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  COMMERCIAL_REVIEW:"bg-violet-500/10 text-violet-400 border-violet-500/20",
  NEGOTIATION:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  WON:"bg-green-500/10 text-green-400 border-green-500/20",
  LOST:"bg-red-500/10 text-red-400 border-red-500/20",
};

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function OpportunityDetailClient({ oppId }: { oppId: string }) {
  const [opp,     setOpp]     = useState<(CrmOpportunity & { account: CrmAccount | null }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crm/opportunities/${oppId}`)
      .then(r => r.json())
      .then(d => setOpp(d.opportunity ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [oppId]);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;
  if (!opp)   return <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Opportunity not found.</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">{opp.title}</h2>
          {opp.account && <p className="text-sm text-muted">{opp.account.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${STAGE_STYLES[opp.stage]}`}>
            {opp.stage.replace("_", " ")}
          </span>
          <span className="font-mono text-xl font-bold text-cyan-400">{fmt(opp.value)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-4 text-sm font-semibold text-ink">Opportunity Details</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["Probability",   `${opp.probability}%`],
            ["Expected Close", opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString() : "—"],
            ["Account",       opp.account?.name ?? "—"],
            ["Weighted Value", fmt(opp.value * (opp.probability / 100))],
            ["Created",       new Date(opp.createdAt).toLocaleDateString()],
            ["Updated",       new Date(opp.updatedAt).toLocaleDateString()],
            ...(opp.lostReason ? [["Lost Reason", opp.lostReason] as [string, string]] : []),
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-4 py-3">
              <dt className="font-mono text-xs uppercase tracking-widest text-faint">{k}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {opp.notes && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h3 className="mb-3 text-sm font-semibold text-ink">Notes</h3>
          <p className="text-sm text-muted leading-relaxed">{opp.notes}</p>
        </div>
      )}

      {/* Probability bar */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">Win Probability</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted">0%</span>
            <span className="font-mono font-bold text-cyan-400">{opp.probability}%</span>
            <span className="text-muted">100%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${opp.probability}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
