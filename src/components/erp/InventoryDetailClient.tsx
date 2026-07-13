"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpInventoryItemFull } from "@/lib/erp/types";

const MOVE_COLOR: Record<string, string> = {
  IN:       "text-green-400",
  OUT:      "text-red-400",
  ADJUST:   "text-yellow-400",
  TRANSFER: "text-blue-400",
  SCRAP:    "text-muted-foreground",
};

export function InventoryDetailClient({ item }: { item: ErpInventoryItemFull }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");
  const low    = item.quantity <= item.reorderLevel;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          {item.category && <div className="text-sm text-muted-foreground">{item.category}</div>}
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${low ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
          {low ? t("inventory.stock.low") : t("inventory.stock.inStock")}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("inventory.metrics.quantity"),  value: item.quantity },
          { label: t("inventory.metrics.reserved"),  value: item.reserved },
          { label: t("inventory.metrics.reorderAt"), value: item.reorderLevel },
          { label: t("inventory.metrics.unitCost"),  value: item.unitCost ? `$${item.unitCost}` : "—" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
            <div className="font-bold text-xl">{m.value}</div>
          </div>
        ))}
      </div>

      {item.location && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <span className="text-muted-foreground mr-2">{t("inventory.location")}:</span>
          <span>{item.location}</span>
        </div>
      )}

      {item.movements && item.movements.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">{t("inventory.recentMovements")}</h3>
          <div className="space-y-2 text-sm">
            {item.movements.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1 border-b last:border-0">
                <span className={`font-medium ${MOVE_COLOR[m.type] ?? ""}`}>{m.type}</span>
                <span className="font-medium">{m.quantity > 0 ? "+" : ""}{m.quantity}</span>
                <span className="text-muted-foreground text-xs">{new Date(m.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/${locale}/erp/inventory`} className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        {t("inventory.backToInventory")}
      </Link>
    </div>
  );
}
