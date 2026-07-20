"use client";

import { useTranslations, useLocale } from "next-intl";
import { GlassCard }      from "@/components/ui/GlassCard";
import type { TwinNodeRecord } from "@/lib/digital-twin/types";
import { formatDate } from "@/lib/i18n/format";

interface Props {
  nodes: TwinNodeRecord[];
}

const TYPE_COLORS: Record<string, string> = {
  SITE:   "text-cyan-400",
  AREA:   "text-blue-400",
  LINE:   "text-indigo-400",
  CELL:   "text-violet-400",
  ASSET:  "text-emerald-400",
  SYSTEM: "text-amber-400",
};

export default function NodesList({ nodes }: Props) {
  const locale = useLocale();
  const t = useTranslations("digitalTwin");

  if (nodes.length === 0) {
    return (
      <GlassCard title="">
        <p className="text-ink/40 text-sm py-8 text-center">{t("noNodes")}</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard title={t("nodes")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-ink/50">
              <th className="text-left py-2 pr-4">{t("displayName")}</th>
              <th className="text-left py-2 pr-4">{t("nodeType")}</th>
              <th className="text-left py-2 pr-4">{t("assetId")}</th>
              <th className="text-left py-2">{t("created")}</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 pr-4 text-ink font-medium">{n.displayName}</td>
                <td className={`py-2 pr-4 font-mono text-xs ${TYPE_COLORS[n.nodeType] ?? "text-ink/70"}`}>
                  {n.nodeType}
                </td>
                <td className="py-2 pr-4 text-ink/50 font-mono text-xs">{n.assetId ?? "—"}</td>
                <td className="py-2 text-ink/40 text-xs">
                  {formatDate(n.createdAt, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
