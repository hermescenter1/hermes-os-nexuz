"use client";

/**
 * Industrial Knowledge Graph — Evidence Path View — Phase 41.
 * Find the strongest-evidence path between any two graph nodes.
 */

import { useState }        from "react";
import { useTranslations, useLocale } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";
import { formatDateTime } from "@/lib/i18n/format";

interface PathResult {
  fromId:    string;
  toId:      string;
  found:     boolean;
  totalCost: number;
  path:      {
    node:         { id: string; nodeType: string; label: string; entityId: string };
    incomingEdge: { edgeType: string; weight: number; evidence: Record<string, unknown> } | null;
  }[];
  evidenceSummary: { edgeType: string; weight: number }[];
  staleness: { lastBuiltAt: string | null; stale: boolean; stalenessWarning: string | null };
}

const EDGE_COLORS: Record<string, string> = {
  HAS_FAILURE_MODE: "text-red-300",
  CAUSED_BY:        "text-orange-300",
  MITIGATED_BY:     "text-green-300",
  DOCUMENTED_IN:    "text-purple-300",
  OBSERVED_ON:      "text-pink-300",
  CONNECTED_TO:     "text-cyan-300",
  DEPENDS_ON:       "text-teal-300",
  INDICATES_RISK:   "text-yellow-300",
  RELATED_TO:       "text-white/40",
};

export default function PathsPage() {
  const locale = useLocale();
  const t = useTranslations("knowledgeGraph");
  const [fromId,  setFromId]  = useState("");
  const [toId,    setToId]    = useState("");
  const [data,    setData]    = useState<PathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSearch() {
    const from = fromId.trim();
    const to   = toId.trim();
    if (!from || !to) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/industrial-graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json() as PathResult);
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
        <h1 className="text-2xl font-bold text-white mt-1">{t("paths")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("pathsDesc")}</p>
      </div>

      {/* Algorithm note */}
      <GlassCard className="px-4 py-3">
        <p className="text-white/40 text-xs">{t("pathAlgorithmNote")}</p>
      </GlassCard>

      {/* Inputs */}
      <GlassCard className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-white/40 text-xs font-mono uppercase tracking-widest block mb-1">{t("fromNode")}</label>
            <input
              value={fromId}
              onChange={e => setFromId(e.target.value)}
              placeholder={t("nodeIdPlaceholder")}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div>
            <label className="text-white/40 text-xs font-mono uppercase tracking-widest block mb-1">{t("toNode")}</label>
            <input
              value={toId}
              onChange={e => setToId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder={t("nodeIdPlaceholder")}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !fromId.trim() || !toId.trim()}
          className="px-5 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-mono hover:bg-cyan-500/20 transition-colors disabled:opacity-60"
        >
          {loading ? t("loading") : t("findPath")}
        </button>
      </GlassCard>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data && (
        <div className="space-y-4">
          {data.staleness.stale && (
            <div className="flex gap-2 items-center rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-amber-300 text-xs">{data.staleness.stalenessWarning}</p>
            </div>
          )}

          {!data.found ? (
            <GlassCard className="px-5 py-6 text-center">
              <p className="text-white/50 text-sm">{t("noPathFound")}</p>
              <p className="text-white/30 text-xs mt-1">{t("noPathFoundHint")}</p>
            </GlassCard>
          ) : (
            <>
              <GlassCard className="px-5 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-white font-semibold">{t("pathFound")}</p>
                    <p className="text-white/40 text-xs mt-0.5">{data.path.length - 1} {t("hops")} · {t("totalCost")}: {data.totalCost.toFixed(3)}</p>
                  </div>
                  <span className="ml-auto text-xs text-white/30 font-mono">{t("lastBuilt")}: {data.staleness.lastBuiltAt ? formatDateTime(data.staleness.lastBuiltAt, locale) : "—"}</span>
                </div>
              </GlassCard>

              {/* Path visualization */}
              <GlassCard className="px-5 py-4">
                <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-4">{t("evidencePath")}</p>
                <div className="space-y-2">
                  {data.path.map((hop, i) => (
                    <div key={i}>
                      {hop.incomingEdge && (
                        <div className="flex items-center gap-2 pl-6 mb-1">
                          <div className="w-px h-4 bg-white/10" />
                          <span className={`text-xs font-mono ${EDGE_COLORS[hop.incomingEdge.edgeType] ?? "text-white/30"}`}>
                            {hop.incomingEdge.edgeType}
                          </span>
                          <span className="text-white/20 text-xs">{(hop.incomingEdge.weight * 100).toFixed(0)}%</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                        <span className="text-xs font-mono text-cyan-400/60 w-28 shrink-0">{hop.node.nodeType}</span>
                        <span className="text-white/80 text-xs font-medium">{hop.node.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* Evidence summary */}
              {data.evidenceSummary.length > 0 && (
                <GlassCard className="px-5 py-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-3">{t("evidence")}</p>
                  <div className="space-y-2">
                    {data.evidenceSummary.map((e, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`text-xs font-mono ${EDGE_COLORS[e.edgeType] ?? "text-white/40"}`}>{e.edgeType}</span>
                        <div className="flex-1 h-1 bg-white/10 rounded-full">
                          <div className="h-1 rounded-full bg-cyan-400" style={{ width: `${e.weight * 100}%` }} />
                        </div>
                        <span className="text-white/40 text-xs font-mono w-10 text-right">{(e.weight * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
