"use client";

/**
 * Industrial Knowledge Graph — Failure Mode Subgraph View — Phase 41.
 */

import { useState }        from "react";
import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

interface FailureGraphResult {
  failureModeId: string;
  subgraph: {
    rootNode: { id: string; label: string } | null;
    nodes:    { id: string; nodeType: string; label: string }[];
    edges:    { id: string; edgeType: string; weight: number }[];
    staleness: { lastBuiltAt: string | null; stale: boolean; stalenessWarning: string | null };
  };
  explanation: {
    failureModeLabel: string | null;
    rootCauses:       { entityId: string; label: string; weight: number; confidence: string }[];
    procedures:       { entityId: string; label: string; weight: number }[];
    affectedAssets:   { entityId: string; label: string }[];
    engineeringCases: { entityId: string; label: string }[];
  };
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH:   "text-green-400",
  MEDIUM: "text-yellow-400",
  LOW:    "text-red-400",
};

export default function FailuresGraphPage() {
  const t = useTranslations("knowledgeGraph");
  const [failureModeId, setFailureModeId] = useState("");
  const [data,    setData]    = useState<FailureGraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSearch() {
    const id = failureModeId.trim();
    if (!id) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/industrial-graph/failures/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json() as FailureGraphResult);
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
        <h1 className="text-2xl font-bold text-white mt-1">{t("failureGraph")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("failureGraphDesc")}</p>
      </div>

      <GlassCard className="p-4">
        <div className="flex gap-3">
          <input
            value={failureModeId}
            onChange={e => setFailureModeId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder={t("failureModeIdPlaceholder")}
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
          {data.subgraph.staleness.stale && (
            <div className="flex gap-2 items-center rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-amber-300 text-xs">{data.subgraph.staleness.stalenessWarning}</p>
            </div>
          )}

          <GlassCard className="px-5 py-4">
            <p className="text-white font-semibold">{data.explanation.failureModeLabel ?? data.failureModeId}</p>
            <p className="text-white/40 text-xs mt-1">{t("nodes")}: {data.subgraph.nodes.length} · {t("edges")}: {data.subgraph.edges.length}</p>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Root causes */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-orange-400 mb-3">{t("rootCauses")} ({data.explanation.rootCauses.length})</p>
              <div className="space-y-3">
                {data.explanation.rootCauses.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.rootCauses.map(rc => (
                  <div key={rc.entityId} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80 text-xs font-medium truncate">{rc.label}</span>
                      <span className={`text-xs font-mono ml-2 ${CONFIDENCE_COLORS[rc.confidence]}`}>{rc.confidence}</span>
                    </div>
                    <div className="mt-1 h-1 bg-white/10 rounded-full">
                      <div className="h-1 rounded-full bg-orange-400" style={{ width: `${rc.weight * 100}%` }} />
                    </div>
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
                ) : data.explanation.procedures.map(p => (
                  <div key={p.entityId} className="flex items-center justify-between">
                    <span className="text-white/70 text-xs truncate">{p.label}</span>
                    <span className="text-green-400 text-xs font-mono ml-2">{(p.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Affected assets */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-cyan-400 mb-3">{t("affectedAssets")} ({data.explanation.affectedAssets.length})</p>
              <div className="space-y-1">
                {data.explanation.affectedAssets.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.affectedAssets.map(a => (
                  <p key={a.entityId} className="text-white/60 text-xs">{a.label}</p>
                ))}
              </div>
            </GlassCard>

            {/* Engineering cases */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-purple-400 mb-3">{t("engineeringCases")} ({data.explanation.engineeringCases.length})</p>
              <div className="space-y-1">
                {data.explanation.engineeringCases.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.engineeringCases.map(c => (
                  <p key={c.entityId} className="text-white/60 text-xs">{c.label}</p>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
