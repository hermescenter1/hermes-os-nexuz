"use client";

import { useState, useEffect } from "react";
import Link                    from "next/link";
import { usePathname }         from "next/navigation";
import type { CrmOpportunity, CrmOpportunityStage } from "@/lib/crm/types";

const STAGES: CrmOpportunityStage[] = [
  "DISCOVERY","QUALIFICATION","PROPOSAL","TECHNICAL_REVIEW",
  "COMMERCIAL_REVIEW","NEGOTIATION","WON","LOST",
];
const STAGE_LABELS: Record<CrmOpportunityStage, string> = {
  DISCOVERY:"Discovery", QUALIFICATION:"Qualification", PROPOSAL:"Proposal",
  TECHNICAL_REVIEW:"Tech Review", COMMERCIAL_REVIEW:"Commercial", NEGOTIATION:"Negotiation",
  WON:"Won", LOST:"Lost",
};
const STAGE_COLORS: Record<CrmOpportunityStage, string> = {
  DISCOVERY:"border-slate-500/30 bg-slate-500/5", QUALIFICATION:"border-blue-500/30 bg-blue-500/5",
  PROPOSAL:"border-cyan-500/30 bg-cyan-500/5", TECHNICAL_REVIEW:"border-indigo-500/30 bg-indigo-500/5",
  COMMERCIAL_REVIEW:"border-violet-500/30 bg-violet-500/5", NEGOTIATION:"border-amber-500/30 bg-amber-500/5",
  WON:"border-green-500/30 bg-green-500/5", LOST:"border-red-500/30 bg-red-500/5",
};

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function OpportunityPipelineClient() {
  const [opps,    setOpps]    = useState<CrmOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"kanban" | "list">("kanban");
  const pathname = usePathname();
  const base = pathname.startsWith("/fa") ? "/fa" : "/en";

  useEffect(() => {
    fetch("/api/crm/opportunities")
      .then(r => r.json())
      .then(d => setOpps(d.opportunities ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (view === "list") {
    return (
      <div className="space-y-4">
        <button onClick={() => setView("kanban")} className="text-xs text-cyan-400 hover:underline">Switch to Kanban</button>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                {["Title","Stage","Value","Probability","Close Date"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {opps.map(o => (
                <tr key={o.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/crm/opportunities/${o.id}`} className="font-medium text-ink hover:text-cyan-400 transition-colors truncate block max-w-[240px]">
                      {o.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted">{STAGE_LABELS[o.stage]}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-cyan-400">{fmt(o.value)}</td>
                  <td className="px-4 py-3 text-muted">{o.probability}%</td>
                  <td className="px-4 py-3 text-muted text-xs">{o.expectedCloseDate ? new Date(o.expectedCloseDate).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Kanban
  const byStage = STAGES.reduce<Record<string, CrmOpportunity[]>>((acc, s) => {
    acc[s] = opps.filter(o => o.stage === s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <button onClick={() => setView("list")} className="text-xs text-cyan-400 hover:underline">Switch to List</button>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {STAGES.map(stage => {
            const cards = byStage[stage] ?? [];
            const total = cards.reduce((s, o) => s + o.value, 0);
            return (
              <div key={stage} className={`w-60 rounded-xl border p-4 space-y-3 ${STAGE_COLORS[stage]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">{STAGE_LABELS[stage]}</span>
                  <span className="text-xs text-muted">{cards.length}</span>
                </div>
                {total > 0 && <p className="font-mono text-xs text-cyan-400">{fmt(total)}</p>}
                <div className="space-y-2">
                  {cards.length === 0 && <p className="text-xs text-faint italic">Empty</p>}
                  {cards.map(o => (
                    <Link key={o.id} href={`${base}/crm/opportunities/${o.id}`}>
                      <div className="rounded-lg border border-line bg-bg p-3 hover:border-cyan-500/30 transition-colors cursor-pointer">
                        <p className="text-xs font-medium text-ink line-clamp-2">{o.title}</p>
                        <p className="mt-1 font-mono text-xs text-cyan-400">{fmt(o.value)}</p>
                        <p className="text-xs text-faint">{o.probability}% probability</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
