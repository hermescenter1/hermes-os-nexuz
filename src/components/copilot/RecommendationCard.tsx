"use client";

import { GlassCard }        from "@/components/ui/GlassCard";
import type { CopilotRecommendation } from "@/lib/copilot/types";

interface Props { recommendation: CopilotRecommendation }

const PRIORITY_STYLES = {
  HIGH:   "text-red-400",
  MEDIUM: "text-amber-400",
  LOW:    "text-cyan-400",
};

export default function RecommendationCard({ recommendation: r }: Props) {
  return (
    <GlassCard title="">
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs uppercase ${PRIORITY_STYLES[r.priority]}`}>{r.priority}</span>
          <span className="text-ink font-semibold text-sm">{r.title}</span>
        </div>
        <p className="text-ink/60 text-xs">{r.description}</p>
        {r.evidence.length > 0 && (
          <div className="pt-1 border-t border-white/5">
            <p className="text-ink/30 text-xs font-mono mb-1">evidence</p>
            {r.evidence.map((e, i) => (
              <p key={i} className="text-ink/40 text-xs">
                [{e.type}] {e.description}
                {e.recordId && <span className="ml-1 text-ink/20">#{e.recordId.slice(0, 8)}</span>}
              </p>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
