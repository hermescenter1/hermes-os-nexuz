"use client";

/**
 * Knowledge Coverage by Site — Multi-Site Intelligence — Phase 42.
 * Live-computed from /api/multi-site/knowledge-coverage.
 * coverageScore = (assetsWithLinks / assetCount) × 100.
 */

import { useState, useEffect } from "react";
import { useTranslations }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";

interface SiteKnowledge {
  siteId:         string;
  siteName:       string;
  assetCount:     number;
  assetsWithLinks: number;
  coverageScore:  number;
  linksByType:    Record<string, number>;
}

interface KnowledgeResponse {
  sites: SiteKnowledge[];
}

function CoverageBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-400" : score >= 50 ? "bg-yellow-400" : score >= 25 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-white/70">{score.toFixed(0)}%</span>
    </div>
  );
}

export default function SiteKnowledgeCoveragePage() {
  const t = useTranslations("multiSite");
  const [data,    setData]    = useState<KnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/multi-site/knowledge-coverage")
      .then(r => r.json() as Promise<KnowledgeResponse>)
      .then(d => setData(d))
      .catch(() => setError(t("errorLoading")))
      .finally(() => setLoading(false));
  }, [t]);

  const sorted = [...(data?.sites ?? [])].sort((a, b) => b.coverageScore - a.coverageScore);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("knowledgeCoverage")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("knowledgeCoverageDesc")}</p>
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

      {sorted.length > 0 && (
        <GlassCard className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                  <th className="text-left py-2">#</th>
                  <th className="text-left py-2">{t("site")}</th>
                  <th className="text-right py-2">{t("coverage")}</th>
                  <th className="text-right py-2">{t("assetsLinked")}</th>
                  <th className="text-left py-2 pl-4">{t("linksByType")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => {
                  const linkTypes = Object.entries(s.linksByType);
                  return (
                    <tr key={s.siteId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 text-white/30 text-xs pr-3">{i + 1}</td>
                      <td className="py-3 text-white font-medium">{s.siteName}</td>
                      <td className="py-3 text-right">
                        <CoverageBar score={s.coverageScore} />
                      </td>
                      <td className="py-3 text-right text-white/50 text-xs">
                        {s.assetsWithLinks}/{s.assetCount}
                      </td>
                      <td className="py-3 pl-4 text-xs text-white/40">
                        {linkTypes.length > 0
                          ? linkTypes.map(([k, v]) => `${k}:${v}`).join(" · ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {!loading && !error && sorted.length === 0 && (
        <GlassCard className="p-6 text-center">
          <p className="text-white/50">{t("noKnowledgeData")}</p>
        </GlassCard>
      )}
    </div>
  );
}
