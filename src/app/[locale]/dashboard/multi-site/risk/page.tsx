"use client";

/**
 * Site Risk Ranking — Multi-Site Intelligence — Phase 42.
 * Reads from /api/multi-site/risk (SiteRiskSnapshot from latest benchmark).
 * Highest avgRiskScore first; insufficientData sites shown at bottom.
 */

import { useState, useEffect } from "react";
import { useTranslations }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";

interface SiteRisk {
  id:               string;
  siteId:           string;
  siteName:         string;
  assetCount:       number;
  assetsWithData:   number;
  avgRiskScore:     number | null;
  maxRiskScore:     number | null;
  minRiskScore:     number | null;
  riskDistribution: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number } | null;
  dataStatus:       "ok" | "insufficientData" | "stale";
  confidence:       "HIGH" | "MEDIUM" | "LOW";
  lastDataTimestamp: string | null;
}

interface RiskResponse {
  benchmarkId:     string;
  computedAt:      string;
  stale:           boolean;
  stalenessWarning: string | null;
  sites:           SiteRisk[];
}

function riskColor(score: number | null): string {
  if (score === null) return "text-white/30";
  if (score >= 75) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-green-400";
}

export default function SiteRiskPage() {
  const t = useTranslations("multiSite");
  const [data,    setData]    = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/multi-site/risk")
      .then(r => {
        if (r.status === 404) return null;
        return r.json() as Promise<RiskResponse>;
      })
      .then(d => setData(d))
      .catch(() => setError(t("errorLoading")))
      .finally(() => setLoading(false));
  }, [t]);

  const okSites   = data?.sites.filter(s => s.dataStatus !== "insufficientData") ?? [];
  const badSites  = data?.sites.filter(s => s.dataStatus === "insufficientData") ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("riskRanking")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("riskRankingDesc")}</p>
        </div>
        <Link
          href="/dashboard/multi-site"
          className="text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          ← {t("backToSummary")}
        </Link>
      </div>

      {loading && (
        <GlassCard className="p-6 text-center text-white/50">{t("loading")}</GlassCard>
      )}
      {error && (
        <GlassCard className="p-6 border-red-500/30">
          <p className="text-red-400 text-sm">{error}</p>
        </GlassCard>
      )}
      {!loading && !error && !data && (
        <GlassCard className="p-6 text-center">
          <p className="text-white/50">{t("noBenchmark")}</p>
          <Link href="/dashboard/multi-site/benchmarks" className="text-cyan-400 text-sm mt-2 block">
            {t("runBenchmark")} →
          </Link>
        </GlassCard>
      )}

      {data && (
        <>
          {data.stale && data.stalenessWarning && (
            <GlassCard className="p-3 border-yellow-500/30 bg-yellow-500/5">
              <p className="text-yellow-400 text-sm">{data.stalenessWarning}</p>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                    <th className="text-left py-2 pr-4">#</th>
                    <th className="text-left py-2">{t("site")}</th>
                    <th className="text-right py-2">{t("avgRisk")}</th>
                    <th className="text-right py-2">{t("maxRisk")}</th>
                    <th className="text-right py-2">{t("distribution")}</th>
                    <th className="text-right py-2">{t("confidence")}</th>
                    <th className="text-right py-2">{t("coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {okSites.map((s, i) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 text-white/30 text-xs">{i + 1}</td>
                      <td className="py-3 text-white font-medium">{s.siteName}</td>
                      <td className={`py-3 text-right font-mono font-bold ${riskColor(s.avgRiskScore)}`}>
                        {s.avgRiskScore !== null ? s.avgRiskScore.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 text-right font-mono text-white/50 text-xs">
                        {s.maxRiskScore !== null ? s.maxRiskScore.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 text-right text-xs">
                        {s.riskDistribution ? (
                          <span className="text-white/50">
                            <span className="text-green-400">{s.riskDistribution.LOW}L</span>{" "}
                            <span className="text-yellow-400">{s.riskDistribution.MEDIUM}M</span>{" "}
                            <span className="text-orange-400">{s.riskDistribution.HIGH}H</span>{" "}
                            <span className="text-red-400">{s.riskDistribution.CRITICAL}C</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`text-xs ${
                          s.confidence === "HIGH" ? "text-green-400" :
                          s.confidence === "MEDIUM" ? "text-yellow-400" : "text-orange-400"
                        }`}>{s.confidence}</span>
                      </td>
                      <td className="py-3 text-right text-white/40 text-xs">
                        {s.assetsWithData}/{s.assetCount}
                      </td>
                    </tr>
                  ))}
                  {badSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 opacity-50">
                      <td className="py-3 pr-4 text-white/20 text-xs">—</td>
                      <td className="py-3 text-white/50">{s.siteName}</td>
                      <td colSpan={5} className="py-3 text-right text-xs text-white/30">
                        {t("insufficientData")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="text-xs text-white/30 text-right">
            {t("dataFreshness")}: {new Date(data.computedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
