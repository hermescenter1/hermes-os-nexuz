"use client";

import { useTranslations, useLocale }  from "next-intl";
import { GlassCard }        from "@/components/ui/GlassCard";
import type { CopilotInsightRecord, CopilotInsightSeverity } from "@/lib/copilot/types";
import { formatDate } from "@/lib/i18n/format";

interface Props { insight: CopilotInsightRecord }

const SEVERITY_STYLES: Record<CopilotInsightSeverity, string> = {
  CRITICAL: "border-red-500/40 bg-red-500/5 text-red-400",
  WARNING:  "border-amber-500/40 bg-amber-500/5 text-amber-400",
  INFO:     "border-cyan-500/20 bg-cyan-500/5 text-cyan-400",
};

export default function InsightCard({ insight }: Props) {
  const locale = useLocale();
  const t = useTranslations("copilot");
  const style = SEVERITY_STYLES[insight.severity];
  return (
    <div className={`rounded border px-4 py-3 ${style}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider mb-1 opacity-70">{insight.severity}</p>
          <p className="font-semibold text-ink text-sm">{insight.title}</p>
          <p className="mt-1 text-ink/60 text-xs">{insight.description}</p>
        </div>
        <p className="text-ink/30 text-xs whitespace-nowrap">
          {formatDate(insight.createdAt, locale, { timeStyle: "medium" })}
        </p>
      </div>
      {insight.assetId && (
        <p className="mt-2 text-ink/30 font-mono text-xs">asset: {insight.assetId.slice(0, 12)}…</p>
      )}
    </div>
  );
}
