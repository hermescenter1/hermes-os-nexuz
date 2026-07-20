"use client";

/**
 * Site KPI Comparison — Multi-Site Intelligence — Phase 42.
 * Reads from /api/multi-site/kpis (SiteKPIComparison from latest benchmark).
 * Compares rate-normalized availability / efficiency / healthScore (0–100).
 * Raw runtime/downtime counts are excluded — not cross-site comparable.
 */

import { useState, useEffect } from "react";
import { useTranslations, useLocale }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";
import { formatDateTime } from "@/lib/i18n/format";

interface SiteKPI {
  id:                string;
  siteId:            string;
  siteName:          string;
  periodLabel:       string;
  avgAvailability:   number | null;
  avgEfficiency:     number | null;
  avgHealthScore:    number | null;
  assetCount:        number;
  assetsWithKpiData: number;
  dataStatus:        "ok" | "insufficientData" | "stale";
  lastDataTimestamp: string | null;
}

interface KPIResponse {
  benchmarkId:        string;
  computedAt:         string;
  stale:              boolean;
  stalenessWarning:   string | null;
  periodLabel:        string;
  normalizationNote:  string;
  sites:              SiteKPI[];
}

function KpiCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-white/25 text-xs">—</span>;
  const color = value >= 80 ? "text-green-400" : value >= 60 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-mono font-bold ${color}`}>{value.toFixed(1)}%</span>;
}

export default function SiteKPIsPage() {
  const locale = useLocale();
  const t = useTranslations("multiSite");
  const [data,    setData]    = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/multi-site/kpis")
      .then(r => {
        if (r.status === 404) return null;
        return r.json() as Promise<KPIResponse>;
      })
      .then(d => setData(d))
      .catch(() => setError(t("errorLoading")))
      .finally(() => setLoading(false));
  }, [t]);

  const okSites  = data?.sites.filter(s => s.dataStatus !== "insufficientData") ?? [];
  const badSites = data?.sites.filter(s => s.dataStatus === "insufficientData") ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("kpiComparison")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("kpiComparisonDesc")}</p>
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

          <GlassCard className="p-3 bg-cyan-500/5 border-cyan-500/20">
            <p className="text-xs text-cyan-300/70">{data.normalizationNote}</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                    <th className="text-left py-2">{t("site")}</th>
                    <th className="text-right py-2">{t("availability")}</th>
                    <th className="text-right py-2">{t("efficiency")}</th>
                    <th className="text-right py-2">{t("healthScore")}</th>
                    <th className="text-right py-2">{t("coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {okSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 text-white font-medium">{s.siteName}</td>
                      <td className="py-3 text-right"><KpiCell value={s.avgAvailability} /></td>
                      <td className="py-3 text-right"><KpiCell value={s.avgEfficiency} /></td>
                      <td className="py-3 text-right"><KpiCell value={s.avgHealthScore} /></td>
                      <td className="py-3 text-right text-white/40 text-xs">
                        {s.assetsWithKpiData}/{s.assetCount}
                      </td>
                    </tr>
                  ))}
                  {badSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 opacity-50">
                      <td className="py-3 text-white/50">{s.siteName}</td>
                      <td colSpan={4} className="py-3 text-right text-xs text-white/30">
                        {t("insufficientData")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="text-xs text-white/30 text-right">
            {t("period")}: {data.periodLabel} · {t("dataFreshness")}: {formatDateTime(data.computedAt, locale)}
          </p>
        </>
      )}
    </div>
  );
}
