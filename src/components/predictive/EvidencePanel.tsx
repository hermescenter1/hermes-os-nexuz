"use client";

import type { PredictiveEvidence } from "@/lib/predictive/types";

interface Props {
  evidence: PredictiveEvidence[];
}

const TYPE_COLOR: Record<string, string> = {
  health:    "text-green-400",
  kpi:       "text-cyan-400",
  telemetry: "text-blue-400",
  alarm:     "text-amber-400",
  asset:     "text-purple-400",
  insight:   "text-pink-400",
};

export default function EvidencePanel({ evidence }: Props) {
  if (!evidence || evidence.length === 0) {
    return <p className="text-ink/30 text-xs font-mono">No linked evidence records.</p>;
  }
  return (
    <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
      {evidence.map((e, i) => (
        <div key={i} className="px-4 py-2 bg-white/5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-xs uppercase ${TYPE_COLOR[e.type] ?? "text-ink/50"}`}>
              [{e.type}]
            </span>
            {e.recordId && (
              <span className="text-ink/20 font-mono text-xs">#{e.recordId.slice(0, 8)}</span>
            )}
            {e.timeframe && (
              <span className="text-ink/30 text-xs">{e.timeframe}</span>
            )}
          </div>
          <p className="text-ink/60 text-xs mt-0.5">{e.description}</p>
          {e.value !== undefined && (
            <p className="text-ink/40 text-xs font-mono">value: {typeof e.value === "number" ? e.value.toFixed(3) : e.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}
