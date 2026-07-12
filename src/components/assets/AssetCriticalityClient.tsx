"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RegistryAssetRecord, AssetCriticalityAssessment } from "@/lib/assets/types";

function critBadge(c: string) {
  if (c === "CRITICAL") return "bg-danger/[0.10] text-danger";
  if (c === "HIGH")     return "bg-warn/[0.10] text-warn";
  if (c === "MEDIUM")   return "bg-ice/[0.08] text-ice";
  if (c === "LOW")      return "bg-signal/[0.08] text-signal";
  return "bg-surface2 text-faint";
}
function scoreColor(n: number) {
  if (n >= 80) return "text-danger";
  if (n >= 60) return "text-warn";
  if (n >= 40) return "text-ice";
  return "text-signal";
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round((value / 5) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-faint">{label}</span>
        <span className="text-muted">{value}/5</span>
      </div>
      <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 4 ? "bg-danger" : value >= 3 ? "bg-warn" : "bg-ice"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface AssetWithCriticality extends RegistryAssetRecord {
  criticalities: AssetCriticalityAssessment[];
}

interface Props { assets: AssetWithCriticality[] }

export function AssetCriticalityClient({ assets }: Props) {
  const t      = useTranslations("assetOperations");
  const locale = useLocale();
  const sorted = [...assets].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NON_CRITICAL: 4 };
    return (order[a.criticality as keyof typeof order] ?? 9) - (order[b.criticality as keyof typeof order] ?? 9);
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{t("criticalityPage.eyebrow")}</p>
        <h1 className="text-xl font-semibold text-ink">{t("criticalityPage.title")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("criticalityPage.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sorted.map(a => {
          const assessment = a.criticalities?.[0];
          return (
            <div key={a.id} className="card-surface rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-ice mb-1">{a.assetNumber}</p>
                  <Link href={`/${locale}/assets/${a.id}`} className="text-sm font-medium text-ink hover:text-ice truncate block">
                    {a.name}
                  </Link>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ms-2 ${critBadge(a.criticality)}`}>
                  {a.criticality}
                </span>
              </div>

              {assessment ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`text-2xl font-semibold tabular-nums ${scoreColor(assessment.overallScore)}`}>
                      {assessment.overallScore.toFixed(1)}
                    </span>
                    <span className="text-xs text-faint">{t("common.overallScore")}</span>
                  </div>
                  <div className="space-y-2">
                    <DimensionBar label={t("criticalityPage.safetyImpact")}          value={assessment.safetyImpact} />
                    <DimensionBar label={t("criticalityPage.productionImpact")}       value={assessment.productionImpact} />
                    <DimensionBar label={t("criticalityPage.maintenanceImpact")}      value={assessment.maintenanceImpact} />
                    <DimensionBar label={t("criticalityPage.downtimeRisk")}           value={assessment.downtimeRisk} />
                    <DimensionBar label={t("criticalityPage.replacementDifficulty")}  value={assessment.replacementDifficulty} />
                  </div>
                  {assessment.notes && (
                    <p className="text-xs text-faint mt-3 border-t border-line pt-3">{assessment.notes}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-faint italic">{t("criticalityPage.noAssessment")}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
