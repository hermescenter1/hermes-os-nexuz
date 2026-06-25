"use client";

import type { CrmHealthCategory } from "@/lib/crm/types";

interface Props {
  score:    number;
  category: CrmHealthCategory;
  compact?: boolean;
}

const CATEGORY_STYLES: Record<CrmHealthCategory, { badge: string; bar: string; label: string }> = {
  HEALTHY:  { badge: "bg-green-500/10 text-green-400 border-green-500/20",  bar: "bg-green-500",  label: "Healthy" },
  WATCH:    { badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", bar: "bg-yellow-500", label: "Watch" },
  AT_RISK:  { badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", bar: "bg-orange-500", label: "At Risk" },
  CRITICAL: { badge: "bg-red-500/10 text-red-400 border-red-500/20",        bar: "bg-red-500",    label: "Critical" },
};

export function HealthScoreCard({ score, category, compact }: Props) {
  const s = CATEGORY_STYLES[category];
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.bar}`} />
        {score} · {s.label}
      </span>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
          {s.label}
        </span>
        <span className="text-2xl font-bold text-ink">{score}<span className="text-sm font-normal text-muted">/100</span></span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${s.bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
