import { GlassCard }         from "@/components/ui/GlassCard";
import type { FailureModeRecord } from "@/lib/knowledge/types";

interface Props { failureMode: FailureModeRecord }

const SEVERITY_COLORS: Record<string, string> = {
  LOW:      "text-emerald-300 border-emerald-500/20",
  MEDIUM:   "text-amber-300   border-amber-500/20",
  HIGH:     "text-orange-300  border-orange-500/20",
  CRITICAL: "text-red-300     border-red-500/20",
};

export function FailureModeCard({ failureMode: fm }: Props) {
  const severityCls = SEVERITY_COLORS[fm.severity] ?? SEVERITY_COLORS.LOW;

  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white text-sm leading-tight" dir="auto">{fm.name}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded border font-mono ${severityCls}`}>
          {fm.severity}
        </span>
      </div>

      {fm.description && (
        <p className="text-white/40 text-xs leading-relaxed" dir="auto">{fm.description}</p>
      )}

      {fm.symptoms && fm.symptoms.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {fm.symptoms.slice(0, 5).map((s, i) => (
            <span key={i} className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/40" dir="auto">
              {s}
            </span>
          ))}
          {fm.symptoms.length > 5 && (
            <span className="text-xs text-white/20">+{fm.symptoms.length - 5}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 text-xs text-white/25">
        {fm.assetTypes?.[0] && <span>{fm.assetTypes[0]}</span>}
        {fm.updatedAt && (
          <span className="ml-auto">{new Date(fm.updatedAt).toLocaleDateString()}</span>
        )}
      </div>
    </GlassCard>
  );
}
