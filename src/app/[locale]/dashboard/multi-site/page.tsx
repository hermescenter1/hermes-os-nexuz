"use client";

/**
 * Enterprise Industrial Summary — Multi-Site Intelligence Hub — Phase 42.
 * Dark glassmorphism, neon cyan/ice-blue accents. FA/EN via useTranslations.
 * Reads from /api/multi-site/summary (latest SUCCESS benchmark + live KG staleness).
 */

import { useState, useEffect } from "react";
import { useTranslations }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";

interface EnterpriseSummary {
  organizationId:     string;
  siteCount:          number;
  latestBenchmarkId:  string | null;
  latestBenchmarkAt:  string | null;
  benchmarkStale:     boolean;
  stalenessWarning:   string | null;
  riskSummary: {
    sitesRanked:        number;
    highestRiskSiteId:  string | null;
    avgOrgRiskScore:    number | null;
  };
  kpiSummary: {
    sitesCompared:      number;
    avgOrgAvailability: number | null;
    avgOrgHealthScore:  number | null;
  };
  patternCount:           number;
  knowledgeGraphStale:    boolean;
  knowledgeGraphBuiltAt:  string | null;
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <GlassCard className="flex flex-col gap-1 p-4">
      <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-cyan-400"}`}>{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </GlassCard>
  );
}

export default function MultiSiteSummaryPage() {
  const t = useTranslations("multiSite");
  const [data,    setData]    = useState<EnterpriseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/multi-site/summary")
      .then(r => r.json())
      .then((d: EnterpriseSummary) => setData(d))
      .catch(() => setError(t("errorLoading")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("enterpriseSummary")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("enterpriseSummaryDesc")}</p>
        </div>
        <Link
          href="/dashboard/multi-site/benchmarks"
          className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-sm hover:bg-cyan-500/30 transition-colors"
        >
          {t("benchmarks")}
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

      {data && !loading && !error && (
        <>
          {data.benchmarkStale && data.stalenessWarning && (
            <GlassCard className="p-3 border-yellow-500/30 bg-yellow-500/5">
              <p className="text-yellow-400 text-sm">{data.stalenessWarning}</p>
            </GlassCard>
          )}

          {/* Top-level KPI stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={t("sites")}
              value={data.siteCount}
              sub={t("activeSites")}
              accent="text-cyan-400"
            />
            <StatCard
              label={t("avgOrgRisk")}
              value={data.riskSummary.avgOrgRiskScore !== null
                ? data.riskSummary.avgOrgRiskScore.toFixed(1)
                : t("insufficientData")}
              sub={`${data.riskSummary.sitesRanked} ${t("sitesRanked")}`}
              accent="text-red-400"
            />
            <StatCard
              label={t("avgAvailability")}
              value={data.kpiSummary.avgOrgAvailability !== null
                ? `${data.kpiSummary.avgOrgAvailability.toFixed(1)}%`
                : t("insufficientData")}
              sub={`${data.kpiSummary.sitesCompared} ${t("sitesCompared")}`}
              accent="text-green-400"
            />
            <StatCard
              label={t("crossSitePatterns")}
              value={data.patternCount}
              sub={t("failurePatternsSub")}
              accent={data.patternCount > 0 ? "text-orange-400" : "text-white/50"}
            />
          </div>

          {/* KG staleness */}
          {data.knowledgeGraphStale && (
            <GlassCard className="p-3 border-orange-500/30 bg-orange-500/5">
              <p className="text-orange-400 text-sm">{t("kgStaleWarning")}</p>
            </GlassCard>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { href: "/dashboard/multi-site/risk",      label: t("riskRanking"),      accent: "border-red-500/40 text-red-300" },
              { href: "/dashboard/multi-site/kpis",      label: t("kpiComparison"),    accent: "border-green-500/40 text-green-300" },
              { href: "/dashboard/multi-site/failures",  label: t("failurePatterns"),  accent: "border-orange-500/40 text-orange-300" },
              { href: "/dashboard/multi-site/knowledge", label: t("knowledgeCoverage"), accent: "border-purple-500/40 text-purple-300" },
              { href: "/dashboard/multi-site/benchmarks",label: t("benchmarks"),        accent: "border-cyan-500/40 text-cyan-300" },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`block p-4 rounded-xl border bg-white/5 hover:bg-white/10 transition-colors ${link.accent}`}
              >
                <p className="font-medium">{link.label}</p>
              </Link>
            ))}
          </div>

          {data.latestBenchmarkAt && (
            <p className="text-xs text-white/30 text-right">
              {t("dataFreshness")}: {new Date(data.latestBenchmarkAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
