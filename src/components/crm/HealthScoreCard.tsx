"use client";

// PHASE 87G AMENDMENT 1 — localized health badge. Category VALUES stay API
// enums; the display label comes from crm.health. Score stays LTR.

import { useTranslations } from "next-intl";
import type { CrmHealthCategory } from "@/lib/crm/types";

interface Props {
  score:    number;
  category: CrmHealthCategory;
  compact?: boolean;
}

const CATEGORY_STYLES: Record<CrmHealthCategory, { badge: string; bar: string }> = {
  HEALTHY:  { badge: "bg-green-500/10 text-green-400 border-green-500/20",    bar: "bg-green-500"  },
  WATCH:    { badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", bar: "bg-yellow-500" },
  AT_RISK:  { badge: "bg-orange-500/10 text-orange-400 border-orange-500/20", bar: "bg-orange-500" },
  CRITICAL: { badge: "bg-red-500/10 text-red-400 border-red-500/20",          bar: "bg-red-500"    },
};

export function HealthScoreCard({ score, category, compact }: Props) {
  const t = useTranslations("crm.health");
  const s = CATEGORY_STYLES[category];
  const label = t(category);
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${s.bar}`} aria-hidden="true" />
        <span dir="ltr">{score}</span> · {label}
      </span>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
          {label}
        </span>
        <span className="text-2xl font-bold text-ink" dir="ltr">{score}<span className="text-sm font-normal text-muted">/100</span></span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${s.bar}`} style={{ inlineSize: `${score}%` }} />
      </div>
    </div>
  );
}
