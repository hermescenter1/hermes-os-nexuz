"use client";

import { useTranslations } from "next-intl";
import type { AssetLocation } from "@/lib/assets/types";

interface Props { locations: AssetLocation[] }

export function AssetSettingsClient({ locations }: Props) {
  const t = useTranslations("assetOperations");

  const byType: Record<string, number> = {};
  for (const l of locations) {
    byType[l.locationType] = (byType[l.locationType] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{t("settings.eyebrow")}</p>
        <h1 className="text-xl font-semibold text-ink">{t("settings.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Locations */}
      <div className="card-surface rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="eyebrow-label text-faint">{t("settings.plantLocations")}</p>
          <span className="text-xs text-ice">{locations.length} {t("settings.locationsUnit")}</span>
        </div>

        {/* Type summary */}
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.entries(byType).map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5 bg-ice/[0.06] border border-ice/15 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-ice">{count}</span>
              <span className="text-xs text-muted">{type}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {locations.map(l => (
            <div key={l.id} className="flex items-center gap-3 bg-surface2 rounded-lg px-4 py-3 border border-line/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{l.name}</span>
                  <span className="text-xs bg-surface3 text-faint px-2 py-0.5 rounded">{l.locationType}</span>
                </div>
                <p className="text-xs text-faint mt-0.5 font-mono">{l.code}</p>
              </div>
              {l.building && (
                <div className="text-xs text-faint shrink-0">
                  {[l.building, l.floor, l.room].filter(Boolean).join(" / ")}
                </div>
              )}
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.isActive ? "bg-signal" : "bg-line2"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Module configuration */}
      <div className="card-surface rounded-xl p-5">
        <p className="eyebrow-label text-faint mb-4">{t("settings.moduleConfig")}</p>
        <div className="space-y-3">
          {[
            { label: t("settings.showInactive"),    value: t("settings.valueNo") },
            { label: t("settings.critInterval"),    value: t("settings.valueSixMonths") },
            { label: t("settings.healthWarn"),      value: "70%" },
            { label: t("settings.healthCrit"),      value: "50%" },
            { label: t("settings.defaultProtocol"), value: "OPC UA" },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-line/30">
              <span className="text-sm text-muted">{row.label}</span>
              <span className="text-sm text-ink font-medium">{row.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-faint mt-4">
          {t("settings.configNote")}
        </p>
      </div>
    </div>
  );
}
