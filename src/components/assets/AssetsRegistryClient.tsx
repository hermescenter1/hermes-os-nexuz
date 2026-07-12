"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RegistryAssetRecord } from "@/lib/assets/types";

const TYPE_OPTS = ["ALL","PRODUCTION_LINE","MACHINE","PLC","HMI","SCADA_NODE","ELECTRICAL_PANEL","MCC_PANEL","VFD","MOTOR","PUMP","VALVE","SENSOR","INSTRUMENT","ROBOT","CONVEYOR","COMPRESSOR","UTILITY_SYSTEM","SAFETY_SYSTEM","NETWORK_DEVICE","INDUSTRIAL_PC"];
const STATUS_OPTS = ["ALL","IN_SERVICE","DEGRADED","UNDER_MAINTENANCE","STANDBY","PLANNED","COMMISSIONED","RETIRED","DECOMMISSIONED"];
const CRIT_OPTS  = ["ALL","CRITICAL","HIGH","MEDIUM","LOW","NON_CRITICAL"];

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

interface Props { assets: RegistryAssetRecord[] }

export function AssetsRegistryClient({ assets }: Props) {
  const t       = useTranslations("assetOperations");
  const locale  = useLocale();
  const [search, setSearch] = useState("");
  const [typeF,  setTypeF]  = useState("ALL");
  const [statF,  setStatF]  = useState("ALL");
  const [critF,  setCritF]  = useState("ALL");

  // Raw enum -> display label; falls back to the raw value when unmapped.
  const typeLabel = (ty: string) => (t.has(`enums.typeCompact.${ty}`) ? t(`enums.typeCompact.${ty}`) : ty);

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
        <p className="eyebrow-mono text-ice mb-1">{t("registry.eyebrow")}</p>
        <h1 className="text-xl font-semibold text-ink">{t("registry.title")}</h1>
        <p className="text-sm text-muted mt-1">{filtered.length} {t("registry.assetsUnit")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("registry.searchPh")}
          className="bg-surface border border-line text-sm text-ink rounded-lg px-3 py-1.5 focus:outline-none focus:border-ice/50 w-56"
        />
        <select value={typeF} onChange={e => setTypeF(e.target.value)} className={selectCls}>
          {TYPE_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? t("registry.allTypes") : typeLabel(o)}</option>)}
        </select>
        <select value={statF} onChange={e => setStatF(e.target.value)} className={selectCls}>
          {STATUS_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? t("registry.allStatus") : o.replace(/_/g, " ")}</option>)}
        </select>
        <select value={critF} onChange={e => setCritF(e.target.value)} className={selectCls}>
          {CRIT_OPTS.map(o => <option key={o} value={o}>{o === "ALL" ? t("registry.allCriticality") : o}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2">
                {[
                  t("registry.colNumber"),
                  t("registry.colName"),
                  t("registry.colType"),
                  t("registry.colStatus"),
                  t("registry.colCriticality"),
                  t("registry.colHealth"),
                  t("registry.colLocation"),
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
                    {t("common.noAssetsFound")}
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
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{typeLabel(a.assetType)}</td>
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
                      {t("registry.details")}
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
