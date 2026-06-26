"use client";

import type { MaintenanceCost } from "@/lib/cmms/types";

const CAT_COLOR: Record<string, string> = {
  LABOR:      "text-blue-400",
  PARTS:      "text-yellow-400",
  CONTRACTOR: "text-purple-400",
  OVERHEAD:   "text-orange-400",
};

export function CostDashboardClient({
  costs, total,
}: { costs: MaintenanceCost[]; total: number }) {
  const byCategory: Record<string, number> = {};
  for (const c of costs) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + c.amount;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold">${Math.round(total).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Cost</div>
        </div>
        {Object.entries(byCategory).map(([cat, amt]) => (
          <div key={cat} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className={`text-2xl font-bold ${CAT_COLOR[cat] ?? ""}`}>${Math.round(amt).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">{cat}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted-foreground">
              <th className="text-left px-4 py-3">Task ID</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Invoice</th>
              <th className="text-right px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {costs.map(c => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{c.taskId}</td>
                <td className={`px-4 py-3 text-xs font-medium ${CAT_COLOR[c.category] ?? ""}`}>{c.category}</td>
                <td className="px-4 py-3 text-xs max-w-[250px] truncate">{c.description}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{c.invoiceRef ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-right font-medium">${c.amount.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t border-white/20 font-bold">
              <td colSpan={5} className="px-4 py-3 text-xs text-right">Total</td>
              <td className="px-4 py-3 text-xs text-right text-primary">${Math.round(total).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
