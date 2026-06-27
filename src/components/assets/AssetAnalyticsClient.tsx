"use client";

import { usePathname } from "next/navigation";
import type { RegistryAssetRecord } from "@/lib/assets/types";

const TYPE_LABELS: Record<string, string> = {
  PRODUCTION_LINE:"Production Line",MACHINE:"Machine",PLC:"PLC",HMI:"HMI",SCADA_NODE:"SCADA Node",
  ELECTRICAL_PANEL:"Elec. Panel",MCC_PANEL:"MCC Panel",VFD:"VFD",MOTOR:"Motor",PUMP:"Pump",
  VALVE:"Valve",SENSOR:"Sensor",INSTRUMENT:"Instrument",ROBOT:"Robot",CONVEYOR:"Conveyor",
  COMPRESSOR:"Compressor",UTILITY_SYSTEM:"Utility",SAFETY_SYSTEM:"Safety",
  NETWORK_DEVICE:"Network",INDUSTRIAL_PC:"IPC",
};

interface Props { assets: RegistryAssetRecord[] }

export function AssetAnalyticsClient({ assets }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");

  // Type distribution
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byCrit: Record<string, number> = {};
  const byLC: Record<string, number> = {};
  let totalHealth = 0;

  for (const a of assets) {
    byType[a.assetType]      = (byType[a.assetType]      ?? 0) + 1;
    byStatus[a.status]       = (byStatus[a.status]       ?? 0) + 1;
    byCrit[a.criticality]    = (byCrit[a.criticality]    ?? 0) + 1;
    byLC[a.lifecycleState]   = (byLC[a.lifecycleState]   ?? 0) + 1;
    totalHealth += a.healthScore;
  }
  const avgHealth = assets.length ? Math.round(totalHealth / assets.length) : 0;
  const criticalCount = byCrit["CRITICAL"] ?? 0;
  const highCount     = byCrit["HIGH"]     ?? 0;
  const activeCount   = byStatus["IN_SERVICE"] ?? 0;

  function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return (
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted">{label}</span>
          <span className="text-ink font-medium">{value} <span className="text-faint text-xs">({pct}%)</span></span>
        </div>
        <div className="h-2 bg-surface3 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "تحلیل دارایی" : "ASSET ANALYTICS"}</p>
        <h1 className="text-xl font-semibold text-ink">{isFa ? "تحلیل دارایی‌های صنعتی" : "Industrial Asset Analytics"}</h1>
        <p className="text-sm text-muted mt-1">{isFa ? "آمار و توزیع کامل دارایی‌ها" : "Full distribution and statistics across all assets"}</p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: isFa ? "میانگین سلامت" : "Avg Health", value: `${avgHealth}%`, color: "text-signal" },
          { label: isFa ? "بحرانی" : "Critical", value: criticalCount, color: "text-danger" },
          { label: isFa ? "اولویت بالا" : "High Priority", value: criticalCount + highCount, color: "text-warn" },
          { label: isFa ? "در سرویس" : "In Service", value: activeCount, color: "text-ice" },
        ].map((k, i) => (
          <div key={i} className="card-enterprise rounded-xl p-4 border-s-2 border-ice/25">
            <p className="eyebrow-label text-faint mb-1">{k.label}</p>
            <p className={`text-2xl font-semibold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By type */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "بر اساس نوع" : "By Asset Type"}</p>
          <div className="space-y-3">
            {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <BarRow key={type} label={TYPE_LABELS[type] ?? type} value={count} total={assets.length} color="bg-ice" />
            ))}
          </div>
        </div>

        {/* By criticality */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "بر اساس بحرانیت" : "By Criticality"}</p>
          <div className="space-y-3">
            {[["CRITICAL","bg-danger"],["HIGH","bg-warn"],["MEDIUM","bg-ice"],["LOW","bg-signal"],["NON_CRITICAL","bg-line2"]].map(([c, col]) => (
              <BarRow key={c} label={c} value={byCrit[c] ?? 0} total={assets.length} color={col} />
            ))}
          </div>
        </div>

        {/* By status */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "بر اساس وضعیت" : "By Status"}</p>
          <div className="space-y-3">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
              <BarRow key={s} label={s.replace(/_/g, " ")} value={c} total={assets.length} color="bg-signal" />
            ))}
          </div>
        </div>

        {/* By lifecycle state */}
        <div className="card-surface rounded-xl p-5">
          <p className="eyebrow-label text-faint mb-4">{isFa ? "بر اساس حالت چرخه عمر" : "By Lifecycle State"}</p>
          <div className="space-y-3">
            {Object.entries(byLC).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
              <BarRow key={s} label={s.replace(/_/g, " ")} value={c} total={assets.length} color="bg-ice" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
