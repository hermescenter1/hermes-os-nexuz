"use client";

import { useTranslations, useLocale } from "next-intl";
import { GlassCard }      from "@/components/ui/GlassCard";
import type { AssetHealthScore } from "@/lib/digital-twin/types";
import { formatDateTime } from "@/lib/i18n/format";

interface Props {
  health: AssetHealthScore;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBarWidth(score: number): string {
  return `${Math.round(score)}%`;
}

export default function HealthScore({ health }: Props) {
  const locale = useLocale();
  const t = useTranslations("digitalTwin");

  return (
    <GlassCard title={t("healthScore")}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className={`text-4xl font-bold ${scoreColor(health.score)}`}>{health.score}</span>
          <div>
            <p className="text-ink/50 text-xs">{t("overallScore")}</p>
            {health.stale && (
              <p className="text-amber-400 text-xs mt-0.5">{t("dataMayBeStale")}</p>
            )}
          </div>
        </div>

        {/* Score breakdown bars */}
        <div className="space-y-2">
          {[
            { label: t("freshness"), score: health.freshnessScore, max: 40 },
            { label: t("quality"),   score: health.qualityScore,   max: 35 },
            { label: t("status"),    score: health.statusScore,    max: 25 },
          ].map(({ label, score, max }) => (
            <div key={label}>
              <div className="flex justify-between text-xs text-ink/50 mb-1">
                <span>{label}</span>
                <span>{score}/{max}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: scoreBarWidth((score / max) * 100) }}
                />
              </div>
            </div>
          ))}
        </div>

        {health.lastTelemetryAt && (
          <p className="text-ink/30 text-xs">
            {t("lastTelemetry")}: {formatDateTime(health.lastTelemetryAt, locale)}
          </p>
        )}
      </div>
    </GlassCard>
  );
}
