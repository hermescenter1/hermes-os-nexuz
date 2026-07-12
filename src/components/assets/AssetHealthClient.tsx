"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RegistryAssetRecord, AssetHealthSnapshot } from "@/lib/assets/types";

function riskBadge(r: string) {
  if (r === "HEALTHY")  return "bg-signal/[0.08] text-signal";
  if (r === "MONITOR")  return "bg-ice/[0.08] text-ice";
  if (r === "AT_RISK")  return "bg-warn/[0.10] text-warn";
  if (r === "CRITICAL") return "bg-danger/[0.10] text-danger";
  return "bg-surface2 text-faint";
}
function healthBar(n: number) {
  if (n >= 85) return "bg-signal";
  if (n >= 65) return "bg-ice";
  if (n >= 40) return "bg-warn";
  return "bg-danger";
}
function healthText(n: number) {
  if (n >= 85) return "text-signal";
  if (n >= 65) return "text-ice";
  if (n >= 40) return "text-warn";
  return "text-danger";
}

interface AssetWithHealth extends RegistryAssetRecord {
  healthSnapshots: AssetHealthSnapshot[];
}

interface Props { assets: AssetWithHealth[] }

export function AssetHealthClient({ assets }: Props) {
  const t      = useTranslations("assetOperations");
  const locale = useLocale();
  const sorted = [...assets].sort((a, b) => a.healthScore - b.healthScore);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{t("health.eyebrow")}</p>
        <h1 className="text-xl font-semibold text-ink">{t("health.title")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("health.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sorted.map(a => {
          const latestSnap = a.healthSnapshots?.[0];
          return (
            <div key={a.id} className="card-surface rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-ice mb-0.5">{a.assetNumber}</p>
                  <Link href={`/${locale}/assets/${a.id}`} className="text-sm font-medium text-ink hover:text-ice">
                    {a.name}
                  </Link>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ms-2 ${riskBadge(a.riskState)}`}>
                  {a.riskState}
                </span>
              </div>

              {/* Health score bar */}
              <div className="mb-4">
                <div className="flex items-end justify-between mb-1.5">
                  <span className="text-xs text-faint">{t("common.healthScore")}</span>
                  <span className={`text-xl font-semibold tabular-nums ${healthText(a.healthScore)}`}>{a.healthScore}%</span>
                </div>
                <div className="h-2 bg-surface3 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${healthBar(a.healthScore)}`}
                    style={{ width: `${a.healthScore}%` }} />
                </div>
              </div>

              {/* Latest sensor readings */}
              {latestSnap && (
                <div className="grid grid-cols-2 gap-2">
                  {latestSnap.vibrationRms !== null && (
                    <div className="bg-surface2 rounded-lg p-2">
                      <p className="text-xs text-faint">{t("health.vibrationRms")}</p>
                      <p className="text-sm font-medium text-ink">{latestSnap.vibrationRms?.toFixed(1)} <span className="text-faint text-xs">mm/s</span></p>
                    </div>
                  )}
                  {latestSnap.temperature !== null && (
                    <div className="bg-surface2 rounded-lg p-2">
                      <p className="text-xs text-faint">{t("health.temperature")}</p>
                      <p className="text-sm font-medium text-ink">{latestSnap.temperature?.toFixed(0)} <span className="text-faint text-xs">°C</span></p>
                    </div>
                  )}
                  {latestSnap.pressure !== null && (
                    <div className="bg-surface2 rounded-lg p-2">
                      <p className="text-xs text-faint">{t("health.pressure")}</p>
                      <p className="text-sm font-medium text-ink">{latestSnap.pressure?.toFixed(1)} <span className="text-faint text-xs">bar</span></p>
                    </div>
                  )}
                  {latestSnap.currentDraw !== null && (
                    <div className="bg-surface2 rounded-lg p-2">
                      <p className="text-xs text-faint">{t("health.currentDraw")}</p>
                      <p className="text-sm font-medium text-ink">{latestSnap.currentDraw?.toFixed(0)} <span className="text-faint text-xs">A</span></p>
                    </div>
                  )}
                </div>
              )}
              {latestSnap?.notes && (
                <p className="text-xs text-faint mt-3 border-t border-line pt-3">{latestSnap.notes}</p>
              )}
              {latestSnap && (
                <p className="text-xs text-faint/60 mt-2">{t("health.recorded")}: {new Date(latestSnap.takenAt).toLocaleDateString()}</p>
              )}
              {!latestSnap && (
                <p className="text-xs text-faint italic">{t("health.noHealthData")}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
