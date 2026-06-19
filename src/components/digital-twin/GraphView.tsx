"use client";

import { useTranslations }        from "next-intl";
import { GlassCard }              from "@/components/ui/GlassCard";
import type { GraphNode, TwinRelationRecord } from "@/lib/digital-twin/types";

interface Props {
  nodes:     Record<string, GraphNode>;
  relations: TwinRelationRecord[];
}

const TYPE_DOT: Record<string, string> = {
  SITE:   "bg-cyan-400",
  AREA:   "bg-blue-400",
  LINE:   "bg-indigo-400",
  CELL:   "bg-violet-400",
  ASSET:  "bg-emerald-400",
  SYSTEM: "bg-amber-400",
};

export default function GraphView({ nodes, relations }: Props) {
  const t = useTranslations("digitalTwin");
  const nodeList = Object.values(nodes);

  return (
    <GlassCard title={t("graphView")}>
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-white/40">{t("nodes")}:</span>{" "}
            <span className="text-white font-medium">{nodeList.length}</span>
          </div>
          <div>
            <span className="text-white/40">{t("relations")}:</span>{" "}
            <span className="text-white font-medium">{relations.length}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(TYPE_DOT).map(([type, cls]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-white/50">
              <div className={`w-2 h-2 rounded-full ${cls}`} />
              {type}
            </div>
          ))}
        </div>

        {/* Node list — visual placeholder until a real graph renderer is added */}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {nodeList.map((n) => (
            <div key={n.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-white/5">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TYPE_DOT[n.nodeType] ?? "bg-white/30"}`} />
              <span className="text-white/80 text-sm truncate">{n.displayName}</span>
              <span className="text-white/30 text-xs ml-auto">{n.nodeType}</span>
              {n.children.length > 0 && (
                <span className="text-white/30 text-xs">{n.children.length} {t("children")}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
