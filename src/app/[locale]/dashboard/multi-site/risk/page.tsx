"use client";

/**
 * Site Risk Ranking — Multi-Site Intelligence — Phase 42.
 * Reads from /api/multi-site/risk (SiteRiskSnapshot from latest benchmark).
 * Highest avgRiskScore first; insufficientData sites shown at bottom.
 */

import { useState, useEffect } from "react";
import { useTranslations, useLocale }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";
import { formatDateTime } from "@/lib/i18n/format";
import { loadJson, type LoadState } from "@/lib/dashboard/load-state";
import { classifyEmpty, isEmptySiteCollection } from "@/lib/dashboard/empty-contract";
import { LoadStatePanel } from "@/components/dashboard/LoadStatePanel";

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

function isRiskResponse(v: unknown): v is RiskResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.benchmarkId === "string"
    && typeof o.computedAt === "string"
    && typeof o.stale === "boolean"
    && Array.isArray(o.sites);
}

export default function SiteRiskPage() {
  const locale = useLocale();
  const t = useTranslations("multiSite");
  const [state, setState] = useState<LoadState<RiskResponse>>({ kind: "loading" });
  // Kept so the existing render paths below continue to read `data`, but it is
  // now non-null ONLY in the success state. A failed or malformed response can
  // no longer reach a render that expects a payload.
  const data = state.kind === "success" ? state.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    loadJson<RiskResponse>("/api/multi-site/risk", isRiskResponse, controller.signal)
      .then((next) => {
        // A valid payload carrying nothing is EMPTY, which is a different fact
        // from the request having failed.
        setState(classifyEmpty(next, isEmptySiteCollection));
      })
      .catch((err: unknown) => {
        // AbortError means a newer request or an unmount owns the state now.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "requestError" });
      });
    return () => controller.abort();
  }, []);

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

      {state.kind === "loading" && (
        <GlassCard className="p-6 text-center text-white/50">{t("loading")}</GlassCard>
      )}
      {state.kind === "unauthorized" && (
        <LoadStatePanel
          testId="unauthorized"
          tone="warning"
          title={t("sessionExpiredTitle")}
          hint={t("sessionExpiredHint")}
          action={
            <Link href="/auth/login" className="text-cyan-400 text-sm underline">
              {t("signIn")}
            </Link>
          }
        />
      )}
      {state.kind === "forbidden" && (
        <LoadStatePanel testId="forbidden" tone="warning" title={t("accessDeniedTitle")} hint={t("accessDeniedHint")} />
      )}
      {state.kind === "notFound" && (
        <LoadStatePanel testId="not-found" title={t("noBenchmark")} />
      )}
      {state.kind === "invalidResponse" && (
        <LoadStatePanel testId="invalid-response" tone="danger" title={t("invalidResponseTitle")} hint={t("invalidResponseHint")} />
      )}
      {state.kind === "requestError" && (
        <LoadStatePanel testId="request-error" tone="danger" title={t("requestFailedTitle")} hint={t("requestFailedHint")} />
      )}
      {state.kind === "empty" && (
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
                    <th className="text-start py-2 pr-4">#</th>
                    <th className="text-start py-2">{t("site")}</th>
                    <th className="text-end py-2">{t("avgRisk")}</th>
                    <th className="text-end py-2">{t("maxRisk")}</th>
                    <th className="text-end py-2">{t("distribution")}</th>
                    <th className="text-end py-2">{t("confidence")}</th>
                    <th className="text-end py-2">{t("coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {okSites.map((s, i) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 text-white/30 text-xs">{i + 1}</td>
                      <td className="py-3 text-white font-medium">{s.siteName}</td>
                      <td className={`py-3 text-end font-mono font-bold ${riskColor(s.avgRiskScore)}`}>
                        {s.avgRiskScore !== null ? s.avgRiskScore.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 text-end font-mono text-white/50 text-xs">
                        {s.maxRiskScore !== null ? s.maxRiskScore.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 text-end text-xs">
                        {s.riskDistribution ? (
                          <span className="text-white/50">
                            <span className="text-green-400">{s.riskDistribution.LOW}L</span>{" "}
                            <span className="text-yellow-400">{s.riskDistribution.MEDIUM}M</span>{" "}
                            <span className="text-orange-400">{s.riskDistribution.HIGH}H</span>{" "}
                            <span className="text-red-400">{s.riskDistribution.CRITICAL}C</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 text-end">
                        <span className={`text-xs ${
                          s.confidence === "HIGH" ? "text-green-400" :
                          s.confidence === "MEDIUM" ? "text-yellow-400" : "text-orange-400"
                        }`}>{s.confidence}</span>
                      </td>
                      <td className="py-3 text-end text-white/40 text-xs">
                        {s.assetsWithData}/{s.assetCount}
                      </td>
                    </tr>
                  ))}
                  {badSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 opacity-50">
                      <td className="py-3 pr-4 text-white/20 text-xs">—</td>
                      <td className="py-3 text-white/50">{s.siteName}</td>
                      <td colSpan={5} className="py-3 text-end text-xs text-white/30">
                        {t("insufficientData")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="text-xs text-white/30 text-end">
            {t("dataFreshness")}: {formatDateTime(data.computedAt, locale)}
          </p>
        </>
      )}
    </div>
  );
}
