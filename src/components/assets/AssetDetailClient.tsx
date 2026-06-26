"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  IndustrialAsset, AssetCriticalityAssessment, AssetHealthSnapshot,
  AssetLifecycleEvent, AssetMaintenanceLink, AssetDocumentLink,
  AssetTelemetryLink, AssetTag,
} from "@/lib/assets/types";

type FullAsset = IndustrialAsset & {
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
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";

  const latestHealth = asset.healthSnapshots?.[0];
  const latestCrit   = asset.criticalities?.[0];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-faint">
        <Link href={`/${locale}/assets/registry`} className="hover:text-ice">{isFa ? "فهرست دارایی‌ها" : "Registry"}</Link>
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
            <span className="text-xs text-faint">{isFa ? "امتیاز سلامت" : "Health Score"}</span>
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
          <p className="eyebrow-label text-faint mb-4">{isFa ? "مشخصات فنی" : "Technical Profile"}</p>
          <div>
            <InfoRow label={isFa ? "نوع دارایی" : "Asset Type"} value={asset.assetType.replace(/_/g, " ")} />
            <InfoRow label={isFa ? "سازنده" : "Manufacturer"} value={asset.manufacturer} />
            <InfoRow label={isFa ? "مدل" : "Model"} value={asset.model} />
            <InfoRow label={isFa ? "شماره سریال" : "Serial Number"} value={asset.serialNumber} />
            <InfoRow label={isFa ? "نسخه میان‌افزار" : "Firmware"} value={asset.firmwareVersion} />
            <InfoRow label={isFa ? "مکان" : "Location"} value={asset.location?.name} />
            <InfoRow label={isFa ? "تاریخ نصب" : "Installation Date"}
              value={asset.installationDate ? new Date(asset.installationDate).toLocaleDateString() : null} />
            <InfoRow label={isFa ? "تاریخ راه‌اندازی" : "Commission Date"}
              value={asset.commissionDate ? new Date(asset.commissionDate).toLocaleDateString() : null} />
            <InfoRow label={isFa ? "انقضای گارانتی" : "Warranty Expiry"}
              value={asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : null} />
            <InfoRow label={isFa ? "عمر مورد انتظار" : "Expected Life"}
              value={asset.expectedLifeYears ? `${asset.expectedLifeYears} years` : null} />
            <InfoRow label={isFa ? "حالت چرخه عمر" : "Lifecycle State"} value={asset.lifecycleState.replace(/_/g, " ")} />
          </div>

          {/* Technical specs */}
          {Object.keys(asset.technicalSpecs).length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs text-faint mb-2">{isFa ? "مشخصات" : "Specifications"}</p>
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
          <p className="eyebrow-label text-faint mb-4">{isFa ? "آخرین داده سلامت" : "Latest Health Snapshot"}</p>
          {latestHealth ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {latestHealth.vibrationRms !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{isFa ? "ارتعاش RMS" : "Vibration RMS"}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.vibrationRms?.toFixed(1)}<span className="text-xs text-faint ms-1">mm/s</span></p>
                  </div>
                )}
                {latestHealth.temperature !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{isFa ? "دما" : "Temperature"}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.temperature?.toFixed(0)}<span className="text-xs text-faint ms-1">°C</span></p>
                  </div>
                )}
                {latestHealth.pressure !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{isFa ? "فشار" : "Pressure"}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.pressure?.toFixed(1)}<span className="text-xs text-faint ms-1">bar</span></p>
                  </div>
                )}
                {latestHealth.currentDraw !== null && (
                  <div className="bg-surface2 rounded-lg p-3">
                    <p className="text-xs text-faint">{isFa ? "جریان" : "Current Draw"}</p>
                    <p className="text-lg font-semibold text-ink">{latestHealth.currentDraw?.toFixed(0)}<span className="text-xs text-faint ms-1">A</span></p>
                  </div>
                )}
              </div>
              {latestHealth.notes && <p className="text-xs text-faint border-t border-line pt-3">{latestHealth.notes}</p>}
              <p className="text-xs text-faint/60">{new Date(latestHealth.takenAt).toLocaleDateString()}</p>
            </div>
          ) : (
            <p className="text-muted text-sm">{isFa ? "بدون داده سلامت" : "No health snapshots available"}</p>
          )}

          {/* Criticality assessment */}
          {latestCrit && (
            <div className="mt-5 border-t border-line pt-5">
              <p className="eyebrow-label text-faint mb-3">{isFa ? "ارزیابی بحرانیت" : "Criticality Assessment"}</p>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-lg font-semibold ${latestCrit.overallScore >= 80 ? "text-danger" : latestCrit.overallScore >= 60 ? "text-warn" : "text-ice"}`}>
                  {latestCrit.overallScore.toFixed(1)}
                </span>
                <span className="text-xs text-faint">{isFa ? "امتیاز کلی" : "overall score"}</span>
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
          <p className="eyebrow-label text-faint mb-4">{isFa ? "تاریخچه چرخه عمر" : "Lifecycle History"}</p>
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
          <p className="eyebrow-label text-faint mb-3">{isFa ? "نگهداشت" : "Maintenance"}</p>
          {asset.maintenanceLinks.length === 0 ? (
            <p className="text-xs text-faint">{isFa ? "بدون دستورکار" : "No work orders"}</p>
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
          <p className="eyebrow-label text-faint mb-3">{isFa ? "اسناد" : "Documents"}</p>
          {asset.documentLinks.length === 0 ? (
            <p className="text-xs text-faint">{isFa ? "بدون سند" : "No documents linked"}</p>
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
          <p className="eyebrow-label text-faint mb-3">{isFa ? "تله‌متری" : "Telemetry"}</p>
          {asset.telemetryLinks.length === 0 ? (
            <p className="text-xs text-faint">{isFa ? "بدون تگ" : "No tags linked"}</p>
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
          <p className="eyebrow-label text-faint mb-3">{isFa ? "برچسب‌ها" : "Tags"}</p>
          <div className="flex flex-wrap gap-2">
            {asset.assetTags.map(t => (
              <div key={t.id} className="flex items-center gap-1 bg-surface2 border border-line/50 rounded px-2 py-1">
                <span className="text-xs text-faint">{t.key}:</span>
                <span className="text-xs text-ink">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
