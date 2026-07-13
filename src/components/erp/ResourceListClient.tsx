"use client";

import { useTranslations } from "next-intl";
import type { ErpResource } from "@/lib/erp/types";

const TYPE_COLOR: Record<string, string> = {
  HUMAN:     "bg-blue-500/15 text-blue-400",
  EQUIPMENT: "bg-orange-500/15 text-orange-400",
  SOFTWARE:  "bg-purple-500/15 text-purple-400",
  VEHICLE:   "bg-green-500/15 text-green-400",
  FACILITY:  "bg-yellow-500/15 text-yellow-400",
  TOOL:      "bg-muted text-muted-foreground",
};

export function ResourceListClient({ resources }: { resources: ErpResource[] }) {
  const t = useTranslations("enterpriseOperations");

  return (
    <div className="space-y-2">
      {resources.map(r => (
        <div key={r.id} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{r.name}</div>
            {r.description && <div className="text-xs text-muted-foreground truncate">{r.description}</div>}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs">
            {r.costRate != null && <span className="text-muted-foreground">${r.costRate}/h</span>}
            <span className={`px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[r.type] ?? ""}`}>
              {t(`resources.types.${r.type}`)}
            </span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${r.isAvailable ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {r.isAvailable ? t("resources.available") : t("resources.inUse")}
            </span>
          </div>
        </div>
      ))}
      {resources.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("resources.noResourcesFound")}</div>
      )}
    </div>
  );
}
