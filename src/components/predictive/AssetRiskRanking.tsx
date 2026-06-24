"use client";

import type { RiskScoreResult, InsufficientDataResult } from "@/lib/predictive/types";

interface Entry {
  assetId:   string;
  assetName: string;
  result:    RiskScoreResult | InsufficientDataResult;
}

interface Props { entries: Entry[] }

function badge(score: number) {
  if (score >= 70) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (score >= 40) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
}

export default function AssetRiskRanking({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => {
    const sa = "state" in a.result ? -1 : (a.result as RiskScoreResult).riskScore;
    const sb = "state" in b.result ? -1 : (b.result as RiskScoreResult).riskScore;
    return sb - sa;
  });

  if (sorted.length === 0) {
    return <p className="text-ink/30 text-sm text-center py-8">No assets found.</p>;
  }

  return (
    <div className="space-y-2">
      {sorted.map((e, i) => {
        const hasData = !("state" in e.result);
        const r       = hasData ? (e.result as RiskScoreResult) : null;
        return (
          <div
            key={e.assetId}
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <span className="text-ink/20 font-mono text-xs w-5 shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-ink text-sm font-medium truncate">{e.assetName}</p>
              <p className="text-ink/30 font-mono text-xs truncate">{e.assetId}</p>
            </div>
            {r ? (
              <>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-mono text-xs ${badge(r.riskScore)}`}>
                  {Math.round(r.riskScore)}
                </span>
                <span className="text-ink/30 font-mono text-xs w-16 text-right">{r.confidence}</span>
              </>
            ) : (
              <span className="text-ink/20 font-mono text-xs">no data</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
