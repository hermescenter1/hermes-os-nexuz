"use client";

/**
 * Industrial Knowledge Graph — Asset Subgraph View — Phase 41.
 */

import { useState }        from "react";
import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

interface AssetGraphResult {
  assetId:  string;
  subgraph: {
    rootNode: { id: string; label: string; nodeType: string } | null;
    nodes:    { id: string; nodeType: string; label: string; entityId: string }[];
    edges:    { id: string; edgeType: string; sourceNodeId: string; targetNodeId: string; weight: number }[];
    staleness: { lastBuiltAt: string | null; stale: boolean; stalenessWarning: string | null };
  };
  explanation: {
    assetLabel:    string | null;
    overallRisk:   string;
    failureModes:  { entityId: string; label: string; weight: number }[];
    rootCauses:    { entityId: string; label: string; weight: number }[];
    procedures:    { entityId: string; label: string }[];
    riskNodes:     { weight: number; evidence: Record<string, unknown> }[];
  };
}

const RISK_COLORS: Record<string, string> = {
  LOW:      "text-green-400 border-green-400/20 bg-green-400/5",
  MEDIUM:   "text-yellow-400 border-yellow-400/20 bg-yellow-400/5",
  HIGH:     "text-orange-400 border-orange-400/20 bg-orange-400/5",
  CRITICAL: "text-red-400 border-red-400/20 bg-red-400/5",
  UNKNOWN:  "text-white/30 border-white/10 bg-white/5",
};

export default function AssetGraphPage() {
  const t = useTranslations("knowledgeGraph");
  const [assetId, setAssetId] = useState("");
  const [data,    setData]    = useState<AssetGraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSearch() {
    const id = assetId.trim();
    if (!id) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/industrial-graph/assets/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json() as AssetGraphResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-cyan-400">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("assetGraph")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("assetGraphDesc")}</p>
      </div>

      {/* Search input */}
      <GlassCard className="p-4">
        <div className="flex gap-3">
          <input
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder={t("assetIdPlaceholder")}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-mono hover:bg-cyan-500/20 transition-colors disabled:opacity-60"
          >
            {loading ? t("loading") : t("search")}
          </button>
        </div>
      </GlassCard>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data && (
        <div className="space-y-4">
          {/* Staleness */}
          {data.subgraph.staleness.stale && (
            <div className="flex gap-2 items-center rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-amber-300 text-xs">{data.subgraph.staleness.stalenessWarning}</p>
            </div>
          )}

          {/* Risk summary */}
          <GlassCard className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{data.explanation.assetLabel ?? data.assetId}</p>
                <p className="text-white/40 text-xs mt-0.5">{t("nodes")}: {data.subgraph.nodes.length} · {t("edges")}: {data.subgraph.edges.length}</p>
              </div>
              <span className={`rounded-lg border px-3 py-1 text-sm font-mono ${RISK_COLORS[data.explanation.overallRisk]}`}>
                {data.explanation.overallRisk}
              </span>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Failure modes */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-red-400 mb-3">{t("failureModes")} ({data.explanation.failureModes.length})</p>
              <div className="space-y-2">
                {data.explanation.failureModes.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.failureModes.map(fm => (
                  <div key={fm.entityId} className="flex items-center justify-between">
                    <span className="text-white/70 text-xs truncate">{fm.label}</span>
                    <span className="text-red-400 text-xs font-mono ml-2">{(fm.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Root causes */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-orange-400 mb-3">{t("rootCauses")} ({data.explanation.rootCauses.length})</p>
              <div className="space-y-2">
                {data.explanation.rootCauses.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.rootCauses.slice(0, 8).map(rc => (
                  <div key={rc.entityId} className="flex items-center justify-between">
                    <span className="text-white/70 text-xs truncate">{rc.label}</span>
                    <span className="text-orange-400 text-xs font-mono ml-2">{(rc.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Procedures */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-green-400 mb-3">{t("procedures")} ({data.explanation.procedures.length})</p>
              <div className="space-y-2">
                {data.explanation.procedures.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.procedures.slice(0, 8).map(p => (
                  <p key={p.entityId} className="text-white/70 text-xs">{p.label}</p>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* All nodes in subgraph */}
          <GlassCard className="px-5 py-4">
            <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-3">{t("subgraphNodes")}</p>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {data.subgraph.nodes.map(n => (
                <div key={n.id} className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-cyan-400/60 w-24 shrink-0">{n.nodeType}</span>
                  <span className="text-white/60 truncate">{n.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
