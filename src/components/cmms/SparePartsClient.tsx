"use client";

import type { MaintenanceSparePart } from "@/lib/cmms/types";

export function SparePartsClient({ parts }: { parts: MaintenanceSparePart[] }) {
  const lowStock   = parts.filter(p => p.stockQty <= p.minStockQty);
  const outOfStock = parts.filter(p => p.stockQty === 0);
  const totalValue = parts.reduce((s, p) => s + p.unitCost * p.stockQty, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold">{parts.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Parts</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{outOfStock.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Out of Stock</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{lowStock.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Low Stock</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold text-green-400">${Math.round(totalValue).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Inventory Value</div>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-2">⚠️ Low Stock Alerts ({lowStock.length})</h3>
          <div className="space-y-1">
            {lowStock.map(p => (
              <div key={p.id} className="text-xs flex items-center justify-between">
                <span className="font-mono">{p.partNumber}</span>
                <span className="text-muted-foreground">{p.name}</span>
                <span className={p.stockQty === 0 ? "text-red-400 font-bold" : "text-yellow-400"}>
                  {p.stockQty}/{p.minStockQty} {p.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted-foreground">
              <th className="text-left px-4 py-3">Part Number</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Manufacturer</th>
              <th className="text-right px-4 py-3">Stock</th>
              <th className="text-right px-4 py-3">Min</th>
              <th className="text-right px-4 py-3">Unit Cost</th>
              <th className="text-left px-4 py-3">Location</th>
            </tr>
          </thead>
          <tbody>
            {parts.map(p => {
              const isLow = p.stockQty <= p.minStockQty;
              return (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-xs font-mono text-primary">{p.partNumber}</td>
                  <td className="px-4 py-3 text-xs font-medium max-w-[200px] truncate">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.manufacturer ?? "—"}</td>
                  <td className={`px-4 py-3 text-xs text-right font-bold ${isLow ? (p.stockQty === 0 ? "text-red-400" : "text-yellow-400") : "text-green-400"}`}>
                    {p.stockQty} {p.unit}
                  </td>
                  <td className="px-4 py-3 text-xs text-right text-muted-foreground">{p.minStockQty}</td>
                  <td className="px-4 py-3 text-xs text-right">${p.unitCost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{p.location ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
