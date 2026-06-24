"use client";

import { GlassCard }       from "@/components/ui/GlassCard";
import type { CopilotEvidence } from "@/lib/copilot/types";

interface Props { evidence: CopilotEvidence[] }

export default function EvidencePanel({ evidence }: Props) {
  if (evidence.length === 0) return null;
  return (
    <GlassCard title="Evidence">
      <div className="divide-y divide-white/5">
        {evidence.map((e, i) => (
          <div key={i} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-mono text-xs uppercase">[{e.type}]</span>
              {e.recordId && (
                <span className="text-ink/20 font-mono text-xs">#{e.recordId.slice(0, 8)}</span>
              )}
            </div>
            <p className="text-ink/60 text-xs mt-0.5">{e.description}</p>
            {e.timeframe && <p className="text-ink/30 text-xs">{e.timeframe}</p>}
            {e.value !== undefined && (
              <p className="text-ink/50 text-xs font-mono">value: {e.value}</p>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
