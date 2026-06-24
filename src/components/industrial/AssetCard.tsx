"use client";

import { Link }             from "@/i18n/navigation";
import { useLocale }        from "next-intl";
import type { AssetRecord } from "@/lib/industrial/types";
import { AssetTypeIcon, ASSET_TYPE_LABEL } from "./AssetTypeIcon";
import { AssetHealthBadge }                from "./AssetHealthBadge";

interface AssetCardProps {
  asset:         AssetRecord;
  healthStatus?: string;
  healthScore?:  number | null;
  riskScore?:    number | null;
}

const STATUS_CONFIG: Record<string, { dot: string; color: string }> = {
  ACTIVE:      { dot: "bg-signal",    color: "rgba(var(--signal-rgb), 0.20)" },
  INACTIVE:    { dot: "bg-muted",     color: "rgba(138, 160, 180, 0.15)" },
  MAINTENANCE: { dot: "bg-warn",      color: "rgba(var(--warn-rgb), 0.18)" },
  OFFLINE:     { dot: "bg-danger",    color: "rgba(var(--danger-rgb), 0.18)" },
};

const RISK_COLOR = (score: number) =>
  score >= 76 ? "var(--danger)"
  : score >= 51 ? "#e8643c"
  : score >= 26 ? "var(--warn)"
  : "var(--signal)";

export function AssetCard({ asset, healthStatus, healthScore, riskScore }: AssetCardProps) {
  const locale = useLocale();
  const cfg    = STATUS_CONFIG[asset.status] ?? STATUS_CONFIG.INACTIVE;
  const label  = ASSET_TYPE_LABEL[asset.assetType] ?? asset.assetType;

  return (
    <Link
      href={`/${locale}/dashboard/industrial/assets/${asset.id}`}
      className="block group"
    >
      <div
        className="relative rounded-xl border border-line glass glass-hover overflow-hidden"
        style={{ padding: "16px" }}
      >
        {/* Top accent */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
          }}
        />

        {/* Header: icon + type + status dot */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 flex-shrink-0"
              style={{
                background: "rgba(var(--signal-rgb), 0.07)",
                border:     "1px solid rgba(var(--signal-rgb), 0.18)",
              }}
            >
              <AssetTypeIcon type={asset.assetType} className="w-5 h-5 text-signal" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-signal/80">
                {label}
              </p>
              <p className="font-semibold text-sm text-ink truncate group-hover:text-signal"
                style={{ transition: "color var(--t-fast)" }}>
                {asset.name}
              </p>
            </div>
          </div>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`}
            style={{ boxShadow: `0 0 5px ${cfg.color}` }}
            title={asset.status}
          />
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          {asset.manufacturer && (
            <span className="text-muted text-xs">{asset.manufacturer}</span>
          )}
          {asset.model && (
            <span className="text-muted text-xs">{asset.model}</span>
          )}
          <span className="text-muted text-xs font-mono" dir="ltr">
            {asset.protocol.replace(/_/g, "-")}
          </span>
        </div>

        {/* Health / risk badges */}
        {(healthStatus || (riskScore !== undefined && riskScore !== null)) && (
          <div className="flex items-center gap-2 flex-wrap">
            {healthStatus && (
              <AssetHealthBadge status={healthStatus} score={healthScore} size="sm" />
            )}
            {riskScore !== null && riskScore !== undefined && (
              <span
                className="font-mono text-[0.65rem] px-1.5 py-0.5 rounded"
                style={{
                  color:      RISK_COLOR(riskScore),
                  background: `${RISK_COLOR(riskScore)}15`,
                  border:     `1px solid ${RISK_COLOR(riskScore)}30`,
                }}
              >
                Risk {Math.round(riskScore)}
              </span>
            )}
          </div>
        )}

        {/* Arrow indicator */}
        <div
          className="absolute bottom-3 end-3 opacity-0 group-hover:opacity-50"
          style={{ transition: "opacity var(--t-fast)" }}
        >
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 text-signal">
            <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}
