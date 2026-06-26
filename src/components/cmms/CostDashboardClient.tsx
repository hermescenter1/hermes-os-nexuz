"use client";
import { usePathname } from "next/navigation";
import type { MaintenanceCost } from "@/lib/cmms/types";

const CAT_STYLE: Record<string, { color: string; border: string }> = {
  LABOR:      { color: "text-ice",    border: "border-ice/20"    },
  PARTS:      { color: "text-warn",   border: "border-warn/20"   },
  CONTRACTOR: { color: "text-muted",  border: "border-line"      },
  OVERHEAD:   { color: "text-faint",  border: "border-line"      },
};

export function CostDashboardClient({ costs, total }: { costs: MaintenanceCost[]; total: number }) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");

  const byCategory: Record<string, number> = {};
  for (const c of costs) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-enterprise rounded-xl p-4 border-s-2 border-signal/30">
          <div className="text-2xl font-bold font-mono text-signal">${Math.round(total).toLocaleString()}</div>
          <div className="text-xs text-muted mt-1.5">{isFa ? "کل هزینه" : "Total Cost"}</div>
        </div>
        {Object.entries(byCategory).map(([cat, amt]) => {
          const s = CAT_STYLE[cat] ?? { color: "text-muted", border: "border-line" };
          return (
            <div key={cat} className={`card-enterprise rounded-xl p-4 border-s-2 ${s.border}`}>
              <div className={`text-2xl font-bold font-mono ${s.color}`}>${Math.round(amt).toLocaleString()}</div>
              <div className="text-xs text-muted mt-1.5">{cat}</div>
            </div>
          );
        })}
      </div>

      {/* Cost ledger table */}
      <div className="card-enterprise rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{isFa ? "جزئیات هزینه‌ها" : "Cost Ledger"}</h3>
          <span className="text-xs text-faint">{costs.length} {isFa ? "ورودی" : "entries"}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface2">
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden md:table-cell">{isFa ? "دستورکار" : "Task ID"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "دسته" : "Category"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "شرح" : "Description"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden lg:table-cell">{isFa ? "تاریخ" : "Date"}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide hidden xl:table-cell">{isFa ? "فاکتور" : "Invoice"}</th>
              <th className="text-end px-4 py-3 text-xs font-semibold text-faint uppercase tracking-wide">{isFa ? "مبلغ" : "Amount"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {costs.map(c => {
              const s = CAT_STYLE[c.category] ?? { color: "text-muted", border: "" };
              return (
                <tr key={c.id} className="hover:bg-surface2 transition-colors">
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs font-mono text-faint">{c.taskId.slice(0, 8)}…</span>
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${s.color}`}>{c.category}</td>
                  <td className="px-4 py-3 max-w-[250px]">
                    <span className="text-xs text-muted truncate block">{c.description}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-faint font-mono">{new Date(c.date).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-faint">{c.invoiceRef ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <span className="text-xs font-mono font-semibold text-ink">${c.amount.toLocaleString()}</span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-line bg-surface2">
              <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-muted text-end">
                {isFa ? "جمع کل" : "Total"}
              </td>
              <td className="px-4 py-3 text-end">
                <span className="text-sm font-bold font-mono text-signal">${Math.round(total).toLocaleString()}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
