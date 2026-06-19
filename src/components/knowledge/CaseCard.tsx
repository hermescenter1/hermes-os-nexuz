import { GlassCard }     from "@/components/ui/GlassCard";
import type { CaseRecord } from "@/lib/knowledge/types";

interface Props { engineeringCase: CaseRecord }

const STATUS_COLORS: Record<string, string> = {
  open:     "text-amber-300 border-amber-500/20",
  resolved: "text-cyan-300  border-cyan-500/20",
  closed:   "text-white/30  border-white/10",
};

export function CaseCard({ engineeringCase: c }: Props) {
  const statusCls = STATUS_COLORS[c.status] ?? STATUS_COLORS.open;

  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white text-sm leading-tight" dir="auto">{c.title}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded border font-mono ${statusCls}`}>
          {c.status}
        </span>
      </div>

      {c.symptoms && c.symptoms.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.symptoms.slice(0, 4).map((s, i) => (
            <span key={i} className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/40" dir="auto">
              {s}
            </span>
          ))}
          {c.symptoms.length > 4 && (
            <span className="text-xs text-white/20">+{c.symptoms.length - 4}</span>
          )}
        </div>
      )}

      {c.diagnosis && (
        <p className="text-white/40 text-xs leading-relaxed" dir="auto">{c.diagnosis}</p>
      )}

      {c.lessonsLearned && (
        <div className="rounded border border-cyan-500/10 bg-cyan-500/5 px-2 py-1.5">
          <p className="text-cyan-300 text-xs leading-relaxed" dir="auto">{c.lessonsLearned}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 text-xs text-white/25">
        {c.assetTypes?.[0] && <span>{c.assetTypes[0]}</span>}
        {c.updatedAt && (
          <span className="ml-auto">{new Date(c.updatedAt).toLocaleDateString()}</span>
        )}
      </div>
    </GlassCard>
  );
}
