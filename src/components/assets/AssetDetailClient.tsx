"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type {
  RegistryAssetRecord, AssetCriticalityAssessment, AssetHealthSnapshot,
  AssetLifecycleEvent, AssetMaintenanceLink, AssetDocumentLink,
  AssetTelemetryLink, AssetTag,
} from "@/lib/assets/types";

type FullAsset = RegistryAssetRecord & {
  criticalities:   AssetCriticalityAssessment[];
  healthSnapshots: AssetHealthSnapshot[];
  lifecycleEvents: AssetLifecycleEvent[];
  maintenanceLinks:AssetMaintenanceLink[];
  documentLinks:   AssetDocumentLink[];
  telemetryLinks:  AssetTelemetryLink[];
  assetTags:       AssetTag[];
};

function riskBadge(r: string) {
  if (r === "HEALTHY")  return "bg-signal/[0.08] text-signal";
  if (r === "MONITOR")  return "bg-ice/[0.08] text-ice";
  if (r === "AT_RISK")  return "bg-warn/[0.10] text-warn";
  if (r === "CRITICAL") return "bg-danger/[0.10] text-danger";
  return "bg-surface2 text-faint";
}
function critBadge(c: string) {
  if (c === "CRITICAL")   return "bg-danger/[0.10] text-danger";
  if (c === "HIGH")       return "bg-warn/[0.10] text-warn";
  if (c === "MEDIUM")     return "bg-ice/[0.08] text-ice";
  if (c === "LOW")        return "bg-signal/[0.08] text-signal";
  return "bg-surface2 text-faint";
}
function statusBadge(s: string) {
  if (s === "IN_SERVICE")        return "bg-signal/[0.08] text-signal";
  if (s === "DEGRADED")          return "bg-warn/[0.10] text-warn";
  if (s === "UNDER_MAINTENANCE") return "bg-ice/[0.08] text-ice";
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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1.5 border-b border-line/30">
      <span className="text-xs text-faint">{label}</span>
      <span className="text-xs text-ink">{value}</span>
    </div>
  );
}

interface Props { asset: FullAsset }

export function AssetDetailClient({ asset }: Props) {
  const t      = useTranslations("assetOperations");
  const locale = useLocale();

  const latestHealth = asset.healthSnapshots?.[0];
  const latestCrit   = asset.criticalities?.[0];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-faint">
        <Link href={`/${locale}/assets/registry`} className="hover:text-ice">{t("detail.breadcrumbRegistry")}</Link>
        <span>/</span>
        <span className="text-muted">{asset.assetNumber}</span>
      </div>

      {/* Identity header */}
      <div className="card-enterprise rounded-xl p-6 border-s-4 border-ice/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-ice mb-1">{asset.assetNumber}</p>
            <h1 className="text-2xl font-semibold text-ink">{asset.name}</h1>
            {asset.description && <p className="text-sm text-muted mt-2 max-w-2xl">{asset.description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusBadge(asset.status)}`}>
              {asset.status.replace(/_/g, " ")}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${critBadge(asset.criticality)}`}>
              {asset.criticality}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${riskBadge(asset.riskState)}`}>
              {asset.riskState}
            </span>
          </div>
        </div>

        {/* Health score */}
        <div className="mt-5">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-xs text-faint">{t("common.healthScore")}</span>
            <span className={`text-3xl font-semibold ${healthText(asset.healthScore)}`}>{asset.healthScore}%</span>
          </div>
          <div className="h-2 bg-surface3 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${healthBar(asset.healthScore)}`}
              style={{ width: `${asset.healthScore}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Technical profile */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{t("detail.technicalProfile")}</p>
          <div>
            <InfoRow label={t("detail.assetType")} value={asset.assetType.replace(/_/g, " ")} />
            <InfoRow label={t("detail.manufacturer")} value={asset.manufacturer} />
            <InfoRow label={t("detail.model")} value={asset.model} />
            <InfoRow label={t("detail.serialNumber")} value={asset.serialNumber} />
            <InfoRow label={t("detail.firmware")} value={asset.firmwareVersion} />
            <InfoRow label={t("detail.location")} value={asset.location?.name} />
            <InfoRow label={t("detail.installationDate")}
              value={asset.installationDate ? new Date(asset.installationDate).toLocaleDateString() : null} />
            <InfoRow label={t("detail.commissionDate")}
              value={asset.commissionDate ? new Date(asset.commissionDate).toLocaleDateString() : null} />
            <InfoRow label={t("detail.warrantyExpiry")}
              value={asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : null} />
            <InfoRow label={t("detail.expectedLife")}
              value={asset.expectedLifeYears ? `${asset.expectedLifeYears} ${t("detail.years")}` : null} />
            <InfoRow label={t("detail.lifecycleState")} value={asset.lifecycleState.replace(/_/g, " ")} />
          </div>

          {/* Technical specs */}
          {Object.keys(asset.technicalSpecs).length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs text-faint mb-2">{t("detail.specifications")}</p>
              {Object.entries(asset.technicalSpecs).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-2 py-1 border-b border-line/30">
                  <span className="text-xs text-faint">{k}</span>
                  <span className="text-xs text-ink">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest health snapshot */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{t("detail.latestHealthSnapshot")}</p>
          {latestHealth ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {latestHealth.vibrationRms !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{t("detail.vibrationRms")}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.vibrationRms?.toFixed(1)}<span className="text-xs text-faint ms-1">mm/s</span></p>
                  </div>
                )}
                {latestHealth.temperature !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{t("detail.temperature")}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.temperature?.toFixed(0)}<span className="text-xs text-faint ms-1">°C</span></p>
                  </div>
                )}
                {latestHealth.pressure !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{t("detail.pressure")}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.pressure?.toFixed(1)}<span className="text-xs text-faint ms-1">bar</span></p>
                  </div>
                )}
                {latestHealth.currentDraw !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{t("detail.currentDraw")}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.currentDraw?.toFixed(0)}<span className="text-xs text-faint ms-1">A</span></p>
                  </div>
                )}
              </div>
              {latestHealth.notes && <p className="text-xs text-faint border-t border-line pt-3">{latestHealth.notes}</p>}
              <p className="text-xs text-faint/60">{new Date(latestHealth.takenAt).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-muted text-sm">{t("detail.noHealthSnapshots")}</p>
          )}

          {/* Criticality assessment */}
          {latestCrit && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="eyebrow-label text-faint mb-3">{t("detail.criticalityAssessment")}</p>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-lg font-semibold ${latestCrit.overallScore >= 80 ? "text-danger" : latestCrit.overallScore >= 60 ? "text-warn" : "text-ice"}`}>
                  {latestCrit.overallScore.toFixed(1)}
                </span>
                <span className="text-xs text-faint">{t("common.overallScore")}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${critBadge(latestCrit.criticality)}`}>
                  {latestCrit.criticality}
                </span>
              </div>
              {latestCrit.notes && <p className="text-xs text-faint">{latestCrit.notes}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Lifecycle events */}
      {asset.lifecycleEvents.length > 0 && (
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{t("detail.lifecycleHistory")}</p>
          <div className="space-y-3">
            {asset.lifecycleEvents.slice(0, 5).map(ev => (
              <div key={ev.id} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-ice mt-1.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink">{ev.eventType.replace(/_/g, " ")}</span>
                    <span className="text-xs text-faint">{new Date(ev.occurredAt).toLocaleDateString()}</span>
                  </div>
                  {ev.notes && <p className="text-xs text-muted mt-0.5">{ev.notes}</p>}
                </div>
                <span className="text-xs text-ice shrink-0">{ev.toState.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance + Document + Telemetry links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Maintenance */}
        <div className="card-surface rounded-xl p-4">
          <p className="eyebrow-label text-faint mb-3">{t("detail.maintenance")}</p>
          {asset.maintenanceLinks.length === 0 ? (
            <p className="text-xs text-faint">{t("detail.noWorkOrders")}</p>
          ) : (
            <div className="space-y-2">
              {asset.maintenanceLinks.map(lnk => (
                <div key={lnk.id} className="text-xs">
                  <p className="text-ice font-mono">{lnk.workOrderId ?? lnk.planId ?? lnk.linkType}</p>
                  {lnk.notes && <p className="text-faint mt-0.5">{lnk.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="card-surface rounded-xl p-4">
          <p className="eyebrow-label text-faint mb-3">{t("detail.documents")}</p>
          {asset.documentLinks.length === 0 ? (
            <p className="text-xs text-faint">{t("detail.noDocuments")}</p>
          ) : (
            <div className="space-y-2">
              {asset.documentLinks.map(doc => (
                <div key={doc.id} className="text-xs">
                  <p className="text-ink font-medium">{doc.title}</p>
                  <p className="text-faint">{doc.docType}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Telemetry */}
        <div className="card-surface rounded-xl p-4">
          <p className="eyebrow-label text-faint mb-3">{t("detail.telemetry")}</p>
          {asset.telemetryLinks.length === 0 ? (
            <p className="text-xs text-faint">{t("detail.noTags")}</p>
          ) : (
            <div className="space-y-2">
              {asset.telemetryLinks.map(tl => (
                <div key={tl.id} className="text-xs">
                  <p className="font-mono text-ice text-xs">{tl.tagPath}</p>
                  <p className="text-faint">{tl.protocol}{tl.unit ? ` · ${tl.unit}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      {asset.assetTags.length > 0 && (
        <div className="card-surface rounded-xl p-4">
          <p className="eyebrow-label text-faint mb-3">{t("detail.tags")}</p>
          <div className="flex flex-wrap gap-2">
            {asset.assetTags.map(tag => (
              <div key={tag.id} className="flex items-center gap-1 bg-surface2 border border-line/50 rounded px-2 py-1">
                <span className="text-xs text-faint">{tag.key}:</span>
                <span className="text-xs text-ink">{tag.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
