"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RegistryAssetRecord } from "@/lib/assets/types";

function healthColor(s: number) {
  if (s >= 85) return "text-signal";
  if (s >= 65) return "text-ice";
  if (s >= 40) return "text-warn";
  return "text-danger";
}
function riskBadge(r: string) {
  if (r === "HEALTHY")  return "bg-signal/[0.08] text-signal";
  if (r === "MONITOR")  return "bg-ice/[0.08] text-ice";
  if (r === "AT_RISK")  return "bg-warn/[0.10] text-warn";
  if (r === "CRITICAL") return "bg-danger/[0.10] text-danger";
  return "bg-surface2 text-faint";
}

function AssetNode({ asset, locale, depth = 0 }: { asset: RegistryAssetRecord; locale: string; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = (asset.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 hover:bg-surface3/40 rounded-lg px-2 cursor-pointer transition-colors`}
        style={{ paddingInlineStart: `${depth * 20 + 8}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-4 h-4 shrink-0 text-faint hover:text-ink"
        >
          {hasChildren ? (expanded ? "▾" : "▸") : <span className="inline-block w-4" />}
        </button>

        {/* Asset info */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <Link href={`/${locale}/assets/${asset.id}`} className="flex items-center gap-2 min-w-0 group">
            <span className="font-mono text-xs text-ice shrink-0">{asset.assetNumber}</span>
            <span className="text-sm text-ink group-hover:text-ice truncate">{asset.name}</span>
          </Link>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${riskBadge(asset.riskState)}`}>
            {asset.riskState}
          </span>
        </div>

        {/* Health score */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1.5 bg-surface3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${healthColor(asset.healthScore) === "text-signal" ? "bg-signal" : healthColor(asset.healthScore) === "text-ice" ? "bg-ice" : healthColor(asset.healthScore) === "text-warn" ? "bg-warn" : "bg-danger"}`}
              style={{ width: `${asset.healthScore}%` }}
            />
          </div>
          <span className={`text-xs font-medium tabular-nums ${healthColor(asset.healthScore)}`}>{asset.healthScore}%</span>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="border-s border-line/30 ms-6">
          {asset.children!.map(child => (
            <AssetNode key={child.id} asset={child} locale={locale} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props { assets: RegistryAssetRecord[] }

export function AssetHierarchyClient({ assets }: Props) {
  const t      = useTranslations("assetOperations");
  const locale = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{t("hierarchy.eyebrow")}</p>
        <h1 className="text-xl font-semibold text-ink">{t("hierarchy.title")}</h1>
        <p className="text-sm text-muted mt-1">{t("hierarchy.subtitle")}</p>
      </div>

      <div className="card-surface rounded-xl p-4">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-2 pb-3 border-b border-line mb-2">
          <div className="w-4 shrink-0" />
          <div className="flex-1 text-xs font-medium text-faint ps-2">{t("hierarchy.assetName")}</div>
          <div className="w-24 text-xs font-medium text-faint text-end pe-2">{t("common.health")}</div>
        </div>

        {assets.length === 0 && (
          <p className="text-center py-12 text-muted">{t("common.noAssetsFound")}</p>
        )}

        {assets.map(a => (
          <AssetNode key={a.id} asset={a} locale={locale} depth={0} />
        ))}
      </div>
    </div>
  );
}
