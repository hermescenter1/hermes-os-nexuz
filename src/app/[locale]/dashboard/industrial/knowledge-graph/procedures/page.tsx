"use client";

/**
 * Industrial Knowledge Graph — Procedure Impact View — Phase 41.
 */

import { useState }        from "react";
import { useTranslations } from "next-intl";
import { GlassCard }       from "@/components/ui/GlassCard";

interface ProcedureGraphResult {
  procedureId: string;
  subgraph: {
    rootNode: { id: string; label: string } | null;
    nodes:    { id: string; nodeType: string; label: string }[];
    edges:    { id: string; edgeType: string; weight: number }[];
    staleness: { lastBuiltAt: string | null; stale: boolean; stalenessWarning: string | null };
  };
  explanation: {
    procedureLabel:  string | null;
    mitigates:       { entityId: string; label: string; weight: number; severity: string }[];
    applicableAssets: { entityId: string; label: string }[];
    evidencePath:    { nodeLabel: string; nodeType: string; incomingEdge: { edgeType: string; weight: number } | null }[];
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW:      "text-green-400",
  MEDIUM:   "text-yellow-400",
  HIGH:     "text-orange-400",
  CRITICAL: "text-red-400",
};

export default function ProcedureGraphPage() {
  const t = useTranslations("knowledgeGraph");
  const [procedureId, setProcedureId] = useState("");
  const [data,    setData]    = useState<ProcedureGraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSearch() {
    const id = procedureId.trim();
    if (!id) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/industrial-graph/procedures/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json() as ProcedureGraphResult);
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
        <h1 className="text-2xl font-bold text-white mt-1">{t("procedureGraph")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("procedureGraphDesc")}</p>
      </div>

      <GlassCard className="p-4">
        <div className="flex gap-3">
          <input
            value={procedureId}
            onChange={e => setProcedureId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder={t("procedureIdPlaceholder")}
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
            <p className="text-white font-semibold">{data.explanation.procedureLabel ?? data.procedureId}</p>
            <p className="text-white/40 text-xs mt-1">{t("nodes")}: {data.subgraph.nodes.length} · {t("edges")}: {data.subgraph.edges.length}</p>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mitigates */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-red-400 mb-3">{t("mitigates")} ({data.explanation.mitigates.length})</p>
              <div className="space-y-2">
                {data.explanation.mitigates.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.mitigates.map(m => (
                  <div key={m.entityId} className="flex items-center justify-between">
                    <span className="text-white/70 text-xs truncate">{m.label}</span>
                    <span className={`text-xs font-mono ml-2 ${SEVERITY_COLORS[m.severity] ?? "text-white/40"}`}>{m.severity}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Applicable assets */}
            <GlassCard className="p-4">
              <p className="font-mono text-xs uppercase tracking-widest text-cyan-400 mb-3">{t("applicableAssets")} ({data.explanation.applicableAssets.length})</p>
              <div className="space-y-1">
                {data.explanation.applicableAssets.length === 0 ? (
                  <p className="text-white/30 text-xs">{t("noData")}</p>
                ) : data.explanation.applicableAssets.map(a => (
                  <p key={a.entityId} className="text-white/60 text-xs">{a.label}</p>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* Evidence path */}
          {data.explanation.evidencePath.length > 0 && (
            <GlassCard className="px-5 py-4">
              <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-3">{t("evidencePath")}</p>
              <div className="space-y-1">
                {data.explanation.evidencePath.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {step.incomingEdge && (
                      <span className="text-cyan-400/50 font-mono">→ {step.incomingEdge.edgeType}</span>
                    )}
                    <span className="text-white/60 truncate">{step.nodeLabel}</span>
                    <span className="text-white/20 font-mono">[{step.nodeType}]</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
