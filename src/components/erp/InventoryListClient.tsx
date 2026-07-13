"use client";

import Link                          from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ErpInventoryItem } from "@/lib/erp/types";

export function InventoryListClient({ items }: { items: ErpInventoryItem[] }) {
  const locale = useLocale();
  const t      = useTranslations("enterpriseOperations");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("inventory.columns.sku")}</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("inventory.columns.name")}</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">{t("inventory.columns.category")}</th>
            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">{t("inventory.columns.quantity")}</th>
            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">{t("inventory.columns.reorder")}</th>
            <th className="text-left py-2 font-medium text-muted-foreground">{t("inventory.columns.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map(item => {
            const low = item.quantity <= item.reorderLevel;
            return (
              <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{item.sku}</td>
                <td className="py-2 pr-4">
                  <Link href={`/${locale}/erp/inventory/${item.id}`} className="hover:text-primary hover:underline">{item.name}</Link>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{item.category ?? "—"}</td>
                <td className={`py-2 pr-4 text-right font-medium ${low ? "text-red-500" : ""}`}>{item.quantity}</td>
                <td className="py-2 pr-4 text-right text-muted-foreground">{item.reorderLevel}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${low ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                    {low ? t("inventory.stock.low") : t("inventory.stock.ok")}
                  </span>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t("inventory.empty")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
