"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IndustrialAsset } from "@/lib/assets/types";

const TYPE_OPTS = ["ALL","PRODUCTION_LINE","MACHINE","PLC","HMI","SCADA_NODE","ELECTRICAL_PANEL","MCC_PANEL","VFD","MOTOR","PUMP","VALVE","SENSOR","INSTRUMENT","ROBOT","CONVEYOR","COMPRESSOR","UTILITY_SYSTEM","SAFETY_SYSTEM","NETWORK_DEVICE","INDUSTRIAL_PC"];
const STATUS_OPTS = ["ALL","IN_SERVICE","DEGRADED","UNDER_MAINTENANCE","STANDBY","PLANNED","COMMISSIONED","RETIRED","DECOMMISSIONED"];
const CRIT_OPTS  = ["ALL","CRITICAL","HIGH","MEDIUM","LOW","NON_CRITICAL"];

const TYPE_LABELS: Record<string, string> = {
  PRODUCTION_LINE:"Production Line",MACHINE:"Machine",PLC:"PLC",HMI:"HMI",SCADA_NODE:"SCADA Node",
  ELECTRICAL_PANEL:"Elec. Panel",MCC_PANEL:"MCC Panel",VFD:"VFD",MOTOR:"Motor",PUMP:"Pump",
  VALVE:"Valve",SENSOR:"Sensor",INSTRUMENT:"Instrument",ROBOT:"Robot",CONVEYOR:"Conveyor",
  COMPRESSOR:"Compressor",UTILITY_SYSTEM:"Utility",SAFETY_SYSTEM:"Safety",
  NETWORK_DEVICE:"Network",INDUSTRIAL_PC:"IPC",
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
  if (s === "STANDBY")           return "bg-surface2 text-faint";
  return "bg-surface2 text-faint";
}
function healthColor(n: number) {
  if (n >= 85) return "bg-signal";
  if (n >= 65) return "bg-ice";
  if (n >= 40) return "bg-warn";
  return "bg-danger";
}

interface Props { assets: IndustrialAsset[] }

export function AssetsRegistryClient({ assets }: Props) {
  const pathname = usePathname();
  const isFa    = pathname.startsWith("/fa");
  const locale  = isFa ? "fa" : "en";
  const [search, setSearch] = useState("");
  const [typeF,  setTypeF]  = useState("ALL");
  const [statF,  setStatF]  = useState("ALL");
  const [critF,  setCritF]  = useState("ALL");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => {
      if (typeF !== "ALL" && a.assetType   !== typeF) return false;
      if (statF !== "ALL" && a.status      !== statF) return false;
      if (critF !== "ALL" && a.criticality !== critF) return false;
      if (q && !(
        a.name.toLowerCase().includes(q) ||
        a.assetNumber.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [assets, search, typeF, statF, critF]);

  const selectCls = "bg-surface border border-line text-sm text-muted rounded-lg px-3 py-1.5 focus:outline-none focus:border-ice/50";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="eyebrow-mono text-ice mb-1">{isFa ? "فهرست دارایی‌ها" : "ASSET REGISTRY"}</p>
        <h1 className="text-xl font-semibold text-ink">{isFa ? "فهرست دارایی‌های صنعتی" : "Industrial Asset Registry"}</h1>
        <p className="text-sm text-muted mt-1">{filtered.length} {isFa ? "دارایی" : "assets"}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isFa ? "جست‌وجو…" : "Search assets…"}
          className="bg-surface border border-line text-sm text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:border-ice/50 w-56"
        />
        <select value={typeF} onChange={e => setTypeF(e.target.value)} className={selectCls}>
          {TYPE_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? (isFa ? "همه نوع‌ها" : "All Types") : TYPE_LABELS[o]}</option>)}
        </select>
        <select value={statF} onChange={e => setStatF(e.target.value)} className={selectCls}>
          {STATUS_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? (isFa ? "همه وضعیت‌ها" : "All Status") : o.replace(/_/g, " ")}</option>)}
        </select>
        <select value={critF} onChange={e => setCritF(e.target.value)} className={selectCls}>
          {CRIT_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? (isFa ? "همه سطوح" : "All Criticality") : o}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                {[
                  isFa ? "شماره" : "Asset #",
                  isFa ? "نام" : "Name",
                  isFa ? "نوع" : "Type",
                  isFa ? "وضعیت" : "Status",
                  isFa ? "بحرانیت" : "Criticality",
                  isFa ? "سلامت" : "Health",
                  isFa ? "مکان" : "Location",
                  "",
                ].map((h, i) => (
                  <th key={i} className="text-start px-4 py-3 text-xs font-medium text-faint whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted">
                    {isFa ? "دارایی‌ای یافت نشد" : "No assets found"}
                  </td>
                </tr>
              )}
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-line/50 hover:bg-surface2/40 transition-colors">
                  <td className="px-4 py-3 text-ice font-mono text-xs whitespace-nowrap">{a.assetNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink whitespace-nowrap">{a.name}</p>
                    {a.manufacturer && <p className="text-xs text-faint">{a.manufacturer}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{TYPE_LABELS[a.assetType] ?? a.assetType}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(a.status)}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${critBadge(a.criticality)}`}>
                      {a.criticality}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${healthColor(a.healthScore)}`}
                          style={{ width: `${a.healthScore}%` }} />
                      </div>
                      <span className="text-xs text-muted tabular-nums w-8 text-end">{a.healthScore}%</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${riskBadge(a.riskState)}`}>
                      {a.riskState}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{a.location?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/${locale}/assets/${a.id}`}
                      className="text-xs text-ice hover:underline whitespace-nowrap">
                      {isFa ? "جزئیات" : "Details"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
