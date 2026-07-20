"use client";

/**
 * Industrial Knowledge Graph — Overview Dashboard — Phase 41.
 * Dark glassmorphism, neon cyan/ice-blue accents. FA/EN via useTranslations.
 * Lightweight cards/lists only — no heavy visualization library.
 */

import { useState, useEffect } from "react";
import { useTranslations, useLocale }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";
import { formatDateTime } from "@/lib/i18n/format";

interface GraphOverview {
  nodeCount:   number;
  edgeCount:   number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  staleness: {
    lastBuiltAt:      string | null;
    stale:            boolean;
    stalenessWarning: string | null;
  };
}

const NODE_TYPE_COLORS: Record<string, string> = {
  ASSET:             "text-cyan-400",
  FAILURE_MODE:      "text-red-400",
  ROOT_CAUSE:        "text-orange-400",
  PROCEDURE:         "text-green-400",
  ENGINEERING_CASE:  "text-purple-400",
  PREDICTIVE_RISK:   "text-yellow-400",
  TELEMETRY_TAG:     "text-blue-400",
  DIGITAL_TWIN_NODE: "text-teal-400",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  HAS_FAILURE_MODE:  "text-red-300",
  CAUSED_BY:         "text-orange-300",
  MITIGATED_BY:      "text-green-300",
  DOCUMENTED_IN:     "text-purple-300",
  OBSERVED_ON:       "text-pink-300",
  CONNECTED_TO:      "text-cyan-300",
  DEPENDS_ON:        "text-teal-300",
  INDICATES_RISK:    "text-yellow-300",
  RELATED_TO:        "text-white/40",
};

export default function KnowledgeGraphPage() {
  const locale = useLocale();
  const t = useTranslations("knowledgeGraph");
  const [data,    setData]    = useState<GraphOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial-graph")
      .then(r => r.json())
      .then((d: GraphOverview) => setData(d))
      .catch(() => setError("Failed to load graph"))
      .finally(() => setLoading(false));
  }, []);

  const nav = [
    { href: "knowledge-graph/assets",    label: t("assetGraph"),     desc: t("assetGraphDesc") },
    { href: "knowledge-graph/failures",  label: t("failureGraph"),   desc: t("failureGraphDesc") },
    { href: "knowledge-graph/procedures", label: t("procedureGraph"), desc: t("procedureGraphDesc") },
    { href: "knowledge-graph/paths",     label: t("paths"),          desc: t("pathsDesc") },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("subtitle")}</p>
      </div>

      {/* Staleness banner */}
      {data?.staleness.stale && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
          <div>
            <p className="text-amber-300 text-sm font-semibold">{t("graphHealth.stale")}</p>
            {data.staleness.stalenessWarning && (
              <p className="text-amber-300/70 text-xs mt-0.5">{data.staleness.stalenessWarning}</p>
            )}
          </div>
        </div>
      )}

      {/* Last built indicator */}
      <div className="flex items-center gap-2 text-xs text-white/30">
        <span className="font-mono uppercase tracking-widest">{t("lastBuilt")}:</span>
        <span className={data?.staleness.lastBuiltAt ? "text-white/50" : "text-amber-400"}>
          {data?.staleness.lastBuiltAt
            ? formatDateTime(data.staleness.lastBuiltAt, locale)
            : t("graphHealth.neverBuilt")}
        </span>
        {!data?.staleness.stale && (
          <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-green-400">{t("graphHealth.fresh")}</span>
        )}
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="text-white/30 text-sm">{t("loading")}</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassCard className="px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-white/30">{t("nodes")}</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{data.nodeCount}</p>
          </GlassCard>
          <GlassCard className="px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-widest text-white/30">{t("edges")}</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{data.edgeCount}</p>
          </GlassCard>
          <GlassCard className="px-4 py-3 col-span-2">
            <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-2">{t("nodesByType")}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.nodesByType).map(([type, count]) => (
                <span key={type} className={`text-xs font-mono ${NODE_TYPE_COLORS[type] ?? "text-white/50"}`}>
                  {type}: {count}
                </span>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Edge type breakdown */}
      {data && Object.keys(data.edgesByType).length > 0 && (
        <GlassCard className="px-5 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-3">{t("edgesByType")}</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.edgesByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`text-xs font-mono ${EDGE_TYPE_COLORS[type] ?? "text-white/50"}`}>{type}</span>
                <span className="text-white/30 text-xs">{count}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Rebuild action */}
      <GlassCard className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">{t("rebuild")}</p>
            <p className="text-white/40 text-xs mt-0.5">{t("rebuildDesc")}</p>
          </div>
          <RebuildButton label={t("rebuildBtn")} rebuildingLabel={t("rebuilding")} doneLabel={t("rebuildDone")} />
        </div>
      </GlassCard>

      {/* Navigation cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nav.map(n => (
          <Link key={n.href} href={n.href}>
            <GlassCard hover className="p-5 space-y-2">
              <p className="font-semibold text-white">{n.label}</p>
              <p className="text-white/40 text-sm">{n.desc}</p>
            </GlassCard>
          </Link>
        ))}
      </div>

      {/* Design pillars */}
      <GlassCard>
        <div className="px-5 py-4 space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30">{t("graphHealth.design")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/50">
            {[
              [t("graphHealth.derived"), t("graphHealth.derivedDesc")],
              [t("graphHealth.dijkstra"), t("graphHealth.dijkstraDesc")],
              [t("graphHealth.weights"), t("graphHealth.weightsDesc")],
              [t("graphHealth.orphans"), t("graphHealth.orphansDesc")],
              [t("graphHealth.idempotent"), t("graphHealth.idempotentDesc")],
              [t("graphHealth.transaction"), t("graphHealth.transactionDesc")],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                <p className="text-cyan-400 font-mono text-xs mb-0.5">{k}</p>
                <p className="text-white/40">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function RebuildButton({ label, rebuildingLabel, doneLabel }: { label: string; rebuildingLabel: string; doneLabel: string }) {
  const [state, setState] = useState<"idle" | "rebuilding" | "done" | "error">("idle");

  async function handleRebuild() {
    setState("rebuilding");
    try {
      const res = await fetch("/api/industrial-graph/rebuild", { method: "POST" });
      setState(res.ok ? "done" : "error");
      if (res.ok) setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("error");
    }
  }

  const text = state === "rebuilding" ? rebuildingLabel : state === "done" ? doneLabel : state === "error" ? "Error" : label;
  const cls  = state === "rebuilding" ? "opacity-60 cursor-not-allowed" : state === "done" ? "bg-green-500/20 border-green-500/30 text-green-400" : state === "error" ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20";

  return (
    <button
      onClick={handleRebuild}
      disabled={state === "rebuilding"}
      className={`rounded-lg border px-4 py-2 text-sm font-mono transition-colors ${cls}`}
    >
      {text}
    </button>
  );
}
