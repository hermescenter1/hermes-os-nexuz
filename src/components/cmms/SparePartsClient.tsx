"use client";
import { useTranslations, useLocale } from "next-intl";
import type { MaintenanceSparePart } from "@/lib/cmms/types";
import { formatNumber } from "@/lib/i18n/format";

export function SparePartsClient({ parts }: { parts: MaintenanceSparePart[] }) {
  const locale = useLocale();
  const t          = useTranslations("maintenanceOperations");
  const lowStock   = parts.filter(p => p.stockQty <= p.minStockQty);
  const outOfStock = parts.filter(p => p.stockQty === 0);
  const totalValue = parts.reduce((s, p) => s + p.unitCost * p.stockQty, 0);

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t("spares.kpiTotal"),      value: parts.length,                                   ac: "text-ink",    b: "border-line"      },
          { label: t("spares.kpiOutOfStock"), value: outOfStock.length,                              ac: outOfStock.length > 0 ? "text-danger" : "text-signal",  b: outOfStock.length > 0 ? "border-danger/30" : "border-signal/20" },
          { label: t("spares.kpiLowStock"),   value: lowStock.length,                                ac: lowStock.length > 0 ? "text-warn" : "text-signal",      b: lowStock.length > 0 ? "border-warn/30" : "border-signal/20"   },
          { label: t("spares.kpiValue"),      value: `$${formatNumber(Math.round(totalValue), locale)}`,   ac: "text-signal", b: "border-signal/20" },
        ].map(s => (
          <div key={s.label} className={`card-enterprise rounded-xl p-4 border-s-2 ${s.b}`}>
            <div className={`text-2xl font-bold font-mono ${s.ac}`}>{s.value}</div>
            <div className="text-xs text-muted mt-1.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="card-enterprise rounded-xl p-4 border border-warn/20 bg-warn/[0.04]">
          <div className="flex items-center gap-2 mb-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-warn">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
            </svg>
            <h3 className="text-sm font-semibold text-warn">{t("spares.lowStockAlerts")} ({lowStock.length})</h3>
          </div>
          <div className="space-y-1.5">
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-faint">{p.partNumber}</span>
                <span className="text-muted truncate mx-3 flex-1">{p.name}</span>
                <span className={`font-mono font-bold ${p.stockQty === 0 ? "text-danger" : "text-warn"}`}>
                  {p.stockQty}/{p.minStockQty} {p.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parts table */}
      <div className="card-enterprise rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface2">
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("spares.colPartNumber")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("spares.colName")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{t("spares.colCategory")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{t("spares.colManufacturer")}</th>
              <th className="text-end px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{t("spares.colStock")}</th>
              <th className="text-end px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{t("spares.colMin")}</th>
              <th className="text-end px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{t("spares.colUnitCost")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden xl:table-cell">{t("spares.colLocation")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {parts.map(p => {
              const isLow  = p.stockQty <= p.minStockQty;
              const isOut  = p.stockQty === 0;
              return (
                <tr key={p.id} className="hover:bg-surface2 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-signal">{p.partNumber}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="text-sm font-medium text-ink truncate block">{p.name}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-muted">{p.category ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted">{p.manufacturer ?? "—"}</span>
                  </td>
                  <td className={`px-4 py-3 text-end text-xs font-bold font-mono ${isOut ? "text-danger" : isLow ? "text-warn" : "text-signal"}`}>
                    {p.stockQty} {p.unit}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-end">
                    <span className="text-xs font-mono text-faint">{p.minStockQty}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-end">
                    <span className="text-xs font-mono text-muted">${p.unitCost.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell max-w-[160px]">
                    <span className="text-xs text-faint truncate block">{p.location ?? "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
