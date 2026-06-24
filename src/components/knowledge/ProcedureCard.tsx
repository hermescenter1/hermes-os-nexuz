import { GlassCard }        from "@/components/ui/GlassCard";
import type { ProcedureRecord } from "@/lib/knowledge/types";

interface Props { procedure: ProcedureRecord }

const APPROVAL_COLORS: Record<string, string> = {
  draft:    "text-ink/40  border-white/10",
  review:   "text-amber-300 border-amber-500/20",
  approved: "text-cyan-300  border-cyan-500/20",
};

export function ProcedureCard({ procedure: p }: Props) {
  const approvalCls = APPROVAL_COLORS[p.status] ?? APPROVAL_COLORS.draft;

  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink text-sm leading-tight" dir="auto">{p.title}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded border font-mono ${approvalCls}`}>
          {p.status}
        </span>
      </div>

      {p.description && (
        <p className="text-ink/40 text-xs leading-relaxed" dir="auto">{p.description}</p>
      )}

      {p.safetyNotes && (
        <div className="flex items-start gap-2 rounded border border-amber-500/15 bg-amber-500/5 px-2 py-1.5">
          <span className="text-amber-400 text-xs shrink-0">⚠</span>
          <p className="text-amber-300 text-xs leading-relaxed" dir="auto">{p.safetyNotes}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 text-xs text-ink/25 font-mono">
        <span>v{p.version}</span>
        {p.estimatedHours != null && <span>{p.estimatedHours}h</span>}
        {p.assetTypes?.[0] && <span>{p.assetTypes[0]}</span>}
        {p.updatedAt && (
          <span className="ml-auto">{new Date(p.updatedAt).toLocaleDateString()}</span>
        )}
      </div>
    </GlassCard>
  );
}
