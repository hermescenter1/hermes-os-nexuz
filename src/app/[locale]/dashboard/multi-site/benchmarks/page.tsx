"use client";

/**
 * Multi-Site Benchmarks — Site Comparison Table — Phase 42.
 * Shows latest SUCCESS benchmark with risk + KPI + pattern child data.
 * POST trigger button re-runs computation for the org.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";

interface BenchmarkRecord {
  id:            string;
  status:        "RUNNING" | "SUCCESS" | "FAILED";
  periodLabel:   string;
  siteCount:     number;
  computedAt:    string;
  stale:         boolean;
  stalenessWarning: string | null;
  errorMessage:  string | null;
  summary:       Record<string, unknown>;
}

interface BenchmarkResponse {
  benchmark:       BenchmarkRecord;
  riskRanking:     Record<string, unknown>[];
  kpiComparison:   Record<string, unknown>[];
  failurePatterns: Record<string, unknown>[];
  computing:       boolean;
}

export default function BenchmarksPage() {
  const t = useTranslations("multiSite");
  const [data,      setData]      = useState<BenchmarkResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [running,   setRunning]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [trigErr,   setTrigErr]   = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/multi-site/benchmarks")
      .then(r => {
        if (r.status === 404) return null;
        return r.json() as Promise<BenchmarkResponse>;
      })
      .then(d => setData(d))
      .catch(() => setError(t("errorLoading")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const triggerBenchmark = async () => {
    setRunning(true);
    setTrigErr(null);
    try {
      const r = await fetch("/api/multi-site/benchmarks", { method: "POST" });
      const body = await r.json() as { error?: string };
      if (!r.ok) {
        setTrigErr(body.error ?? t("benchmarkFailed"));
      } else {
        load();
      }
    } catch {
      setTrigErr(t("benchmarkFailed"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("benchmarks")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("benchmarksDesc")}</p>
        </div>
        <button
          onClick={triggerBenchmark}
          disabled={running || data?.computing}
          className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-sm
                     hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? t("computing") : t("runBenchmark")}
        </button>
      </div>

      {trigErr && (
        <GlassCard className="p-3 border-red-500/30">
          <p className="text-red-400 text-sm">{trigErr}</p>
        </GlassCard>
      )}

      {loading && (
        <GlassCard className="p-6 text-center text-white/50">{t("loading")}</GlassCard>
      )}

      {!loading && !error && !data && (
        <GlassCard className="p-6 text-center">
          <p className="text-white/50">{t("noBenchmark")}</p>
          <p className="text-xs text-white/30 mt-2">{t("noBenchmarkHint")}</p>
        </GlassCard>
      )}

      {data && (
        <>
          {data.benchmark.stale && data.benchmark.stalenessWarning && (
            <GlassCard className="p-3 border-yellow-500/30 bg-yellow-500/5">
              <p className="text-yellow-400 text-sm">{data.benchmark.stalenessWarning}</p>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{t("latestBenchmark")}</h2>
              <span className={`text-xs px-2 py-1 rounded-full ${
                data.benchmark.status === "SUCCESS" ? "bg-green-500/20 text-green-300" :
                data.benchmark.status === "RUNNING" ? "bg-cyan-500/20 text-cyan-300 animate-pulse" :
                "bg-red-500/20 text-red-300"
              }`}>
                {data.benchmark.status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-white/40 text-xs uppercase">{t("sites")}</p>
                <p className="text-white font-medium">{data.benchmark.siteCount}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase">{t("period")}</p>
                <p className="text-white font-medium">{data.benchmark.periodLabel}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase">{t("dataFreshness")}</p>
                <p className="text-white/70 text-xs">{new Date(data.benchmark.computedAt).toLocaleString()}</p>
              </div>
            </div>
          </GlassCard>

          {/* Risk Ranking */}
          {data.riskRanking.length > 0 && (
            <GlassCard className="p-4">
              <h2 className="text-lg font-semibold text-white mb-4">{t("riskRanking")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                      <th className="text-left py-2">{t("site")}</th>
                      <th className="text-right py-2">{t("avgRisk")}</th>
                      <th className="text-right py-2">{t("maxRisk")}</th>
                      <th className="text-right py-2">{t("confidence")}</th>
                      <th className="text-right py-2">{t("assets")}</th>
                      <th className="text-right py-2">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.riskRanking.map((s, i) => (
                      <tr key={String(s.id)} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2 text-white">{String(s.siteName)}</td>
                        <td className="py-2 text-right text-red-400 font-mono">
                          {s.avgRiskScore !== null ? Number(s.avgRiskScore).toFixed(1) : t("na")}
                        </td>
                        <td className="py-2 text-right text-red-300/70 font-mono text-xs">
                          {s.maxRiskScore !== null ? Number(s.maxRiskScore).toFixed(1) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <span className={`text-xs ${
                            s.confidence === "HIGH" ? "text-green-400" :
                            s.confidence === "MEDIUM" ? "text-yellow-400" : "text-orange-400"
                          }`}>{String(s.confidence)}</span>
                        </td>
                        <td className="py-2 text-right text-white/50 text-xs">
                          {String(s.assetsWithData)}/{String(s.assetCount)}
                        </td>
                        <td className="py-2 text-right">
                          {String(s.dataStatus) === "insufficientData" && (
                            <span className="text-xs text-white/30">{t("insufficientData")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* KPI Comparison */}
          {data.kpiComparison.length > 0 && (
            <GlassCard className="p-4">
              <h2 className="text-lg font-semibold text-white mb-1">{t("kpiComparison")}</h2>
              <p className="text-xs text-white/30 mb-4">{t("kpiNormalizationNote")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                      <th className="text-left py-2">{t("site")}</th>
                      <th className="text-right py-2">{t("availability")}</th>
                      <th className="text-right py-2">{t("efficiency")}</th>
                      <th className="text-right py-2">{t("healthScore")}</th>
                      <th className="text-right py-2">{t("assets")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.kpiComparison.map(s => (
                      <tr key={String(s.id)} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2 text-white">{String(s.siteName)}</td>
                        <td className="py-2 text-right text-green-400 font-mono">
                          {s.avgAvailability !== null ? `${Number(s.avgAvailability).toFixed(1)}%` : <span className="text-white/30">{t("notComparable")}</span>}
                        </td>
                        <td className="py-2 text-right text-cyan-400 font-mono">
                          {s.avgEfficiency !== null ? `${Number(s.avgEfficiency).toFixed(1)}%` : <span className="text-white/30">{t("notComparable")}</span>}
                        </td>
                        <td className="py-2 text-right text-blue-400 font-mono">
                          {s.avgHealthScore !== null ? `${Number(s.avgHealthScore).toFixed(1)}%` : <span className="text-white/30">{t("notComparable")}</span>}
                        </td>
                        <td className="py-2 text-right text-white/50 text-xs">
                          {String(s.assetsWithKpiData)}/{String(s.assetCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Failure Patterns */}
          {data.failurePatterns.length > 0 && (
            <GlassCard className="p-4">
              <h2 className="text-lg font-semibold text-white mb-4">{t("failurePatterns")}</h2>
              <div className="flex flex-col gap-3">
                {data.failurePatterns.map(p => (
                  <div key={String(p.id)} className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-medium text-sm">{String(p.failureModeName)}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">
                        {String(p.siteCount)} {t("sites")} · {String(p.caseCount)} {t("cases")}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-1">
                      {(p.affectedAssetTypes as string[]).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}
