"use client";

import { useTranslations } from "next-intl";
import { GlassCard }      from "@/components/ui/GlassCard";
import type { TwinRelationRecord } from "@/lib/digital-twin/types";
import { BIDIRECTIONAL_RELATIONS } from "@/lib/digital-twin/types";

interface Props {
  relations: TwinRelationRecord[];
}

const REL_COLORS: Record<string, string> = {
  PART_OF:      "text-blue-400",
  CONNECTED_TO: "text-cyan-400",
  CONTROLS:     "text-red-400",
  MONITORS:     "text-violet-400",
  FEEDS:        "text-emerald-400",
  BACKUP_FOR:   "text-amber-400",
};

export default function RelationsList({ relations }: Props) {
  const t = useTranslations("digitalTwin");

  if (relations.length === 0) {
    return (
      <GlassCard title="">
        <p className="text-ink/40 text-sm py-8 text-center">{t("noRelations")}</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard title={t("relations")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-ink/50">
              <th className="text-left py-2 pr-4">{t("source")}</th>
              <th className="text-left py-2 pr-4">{t("relationType")}</th>
              <th className="text-left py-2">{t("target")}</th>
            </tr>
          </thead>
          <tbody>
            {relations.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2 pr-4 text-ink/70 font-mono text-xs">{r.sourceNodeId.slice(0, 8)}…</td>
                <td className={`py-2 pr-4 font-mono text-xs font-semibold ${REL_COLORS[r.relationType] ?? "text-ink/70"}`}>
                  {r.relationType}
                  {BIDIRECTIONAL_RELATIONS.has(r.relationType) && (
                    <span className="ml-1 text-ink/30">↔</span>
                  )}
                </td>
                <td className="py-2 text-ink/70 font-mono text-xs">{r.targetNodeId.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
