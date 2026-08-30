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
import { loadJson, type LoadState } from "@/lib/dashboard/load-state";
import { classifyEmpty, isEmptySiteCollection } from "@/lib/dashboard/empty-contract";
import { LoadStatePanel } from "@/components/dashboard/LoadStatePanel";

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

function isKPIResponse(v: unknown): v is KPIResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  // Validated against what the render actually reads: sites is iterated and
  // filtered, so "an object arrived" is not good enough.
  return typeof o.benchmarkId === "string"
    && typeof o.computedAt === "string"
    && typeof o.stale === "boolean"
    && typeof o.periodLabel === "string"
    && typeof o.normalizationNote === "string"
    && Array.isArray(o.sites);
}

export default function SiteKPIsPage() {
  const locale = useLocale();
  const t = useTranslations("multiSite");
  const [state, setState] = useState<LoadState<KPIResponse>>({ kind: "loading" });
  // Kept so the existing render paths below continue to read `data`, but it is
  // now non-null ONLY in the success state. A failed or malformed response can
  // no longer reach a render that expects a payload.
  const data = state.kind === "success" ? state.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    loadJson<KPIResponse>("/api/multi-site/kpis", isKPIResponse, controller.signal)
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

          <GlassCard className="p-3 bg-cyan-500/5 border-cyan-500/20">
            <p className="text-xs text-cyan-300/70">{data.normalizationNote}</p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase border-b border-white/10">
                    <th className="text-start py-2">{t("site")}</th>
                    <th className="text-end py-2">{t("availability")}</th>
                    <th className="text-end py-2">{t("efficiency")}</th>
                    <th className="text-end py-2">{t("healthScore")}</th>
                    <th className="text-end py-2">{t("coverage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {okSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-3 text-white font-medium">{s.siteName}</td>
                      <td className="py-3 text-end"><KpiCell value={s.avgAvailability} /></td>
                      <td className="py-3 text-end"><KpiCell value={s.avgEfficiency} /></td>
                      <td className="py-3 text-end"><KpiCell value={s.avgHealthScore} /></td>
                      <td className="py-3 text-end text-white/40 text-xs">
                        {s.assetsWithKpiData}/{s.assetCount}
                      </td>
                    </tr>
                  ))}
                  {badSites.map(s => (
                    <tr key={s.id} className="border-b border-white/5 opacity-50">
                      <td className="py-3 text-white/50">{s.siteName}</td>
                      <td colSpan={4} className="py-3 text-end text-xs text-white/30">
                        {t("insufficientData")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="text-xs text-white/30 text-end">
            {t("period")}: {data.periodLabel} · {t("dataFreshness")}: {formatDateTime(data.computedAt, locale)}
          </p>
        </>
      )}
    </div>
  );
}
