"use client";

/**
 * Cross-Site Failure Patterns — Multi-Site Intelligence — Phase 42.
 * Reads from /api/multi-site/failure-patterns (CrossSiteFailurePattern from benchmark).
 * A pattern = same IndustrialFailureMode appearing in cases across 2+ distinct sites.
 * Deterministic — no fuzzy matching.
 */

import { useState, useEffect } from "react";
import { useTranslations, useLocale }     from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import Link                    from "next/link";
import { formatDateTime } from "@/lib/i18n/format";
import { loadJson, type LoadState } from "@/lib/dashboard/load-state";
import { classifyEmpty, isEmptyPatternCollection } from "@/lib/dashboard/empty-contract";
import { LoadStatePanel } from "@/components/dashboard/LoadStatePanel";

interface FailurePattern {
  id:                 string;
  failureModeId:      string;
  failureModeName:    string;
  severity:           string | null;
  siteIds:            string[];
  siteCount:          number;
  caseCount:          number;
  affectedAssetTypes: string[];
  evidence:           {
    caseIds: string[];
    bySite:  Record<string, { caseIds: string[]; assetIds: string[] }>;
  };
}

interface PatternResponse {
  benchmarkId:       string;
  computedAt:        string;
  stale:             boolean;
  stalenessWarning:  string | null;
  matchingCriterion: string;
  patterns:          FailurePattern[];
}

function SeverityBadge({ severity }: { severity: string | null }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-500/20 text-red-300 border-red-500/40",
    HIGH:     "bg-orange-500/20 text-orange-300 border-orange-500/40",
    MEDIUM:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    LOW:      "bg-green-500/20 text-green-300 border-green-500/40",
  };
  const cls = (severity && map[severity]) ?? "bg-white/10 text-white/40 border-white/20";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {severity ?? "UNKNOWN"}
    </span>
  );
}

function isPatternResponse(v: unknown): v is PatternResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.benchmarkId === "string"
    && typeof o.computedAt === "string"
    && typeof o.stale === "boolean"
    && typeof o.matchingCriterion === "string"
    && Array.isArray(o.patterns);
}

export default function CrossSiteFailuresPage() {
  const locale = useLocale();
  const t = useTranslations("multiSite");
  const [state, setState] = useState<LoadState<PatternResponse>>({ kind: "loading" });
  // Kept so the existing render paths below continue to read `data`, but it is
  // now non-null ONLY in the success state. A failed or malformed response can
  // no longer reach a render that expects a payload.
  const data = state.kind === "success" ? state.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    loadJson<PatternResponse>("/api/multi-site/failure-patterns", isPatternResponse, controller.signal)
      .then((next) => {
        // A valid payload carrying nothing is EMPTY, which is a different fact
        // from the request having failed.
        setState(classifyEmpty(next, isEmptyPatternCollection));
      })
      .catch((err: unknown) => {
        // AbortError means a newer request or an unmount owns the state now.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "requestError" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("failurePatterns")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("failurePatternsDesc")}</p>
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

          <GlassCard className="p-3 bg-orange-500/5 border-orange-500/20">
            <p className="text-xs text-orange-300/70">{data.matchingCriterion}</p>
          </GlassCard>

          {data.patterns.length === 0 && (
            <GlassCard className="p-6 text-center">
              <p className="text-white/50">{t("noPatternsFound")}</p>
              <p className="text-xs text-white/30 mt-1">{t("noPatternsFoundHint")}</p>
            </GlassCard>
          )}

          <div className="flex flex-col gap-4">
            {data.patterns.map(p => (
              <GlassCard key={p.id} className="p-4 border-orange-500/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-white font-semibold">{p.failureModeName}</h3>
                      <SeverityBadge severity={p.severity} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/50">
                      <span>{p.siteCount} {t("sites")}</span>
                      <span>{p.caseCount} {t("cases")}</span>
                      {p.affectedAssetTypes.length > 0 && (
                        <span>{t("assetTypes")}: {p.affectedAssetTypes.join(", ")}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(p.evidence.bySite).map(([siteId, siteEvidence]) => (
                        <span
                          key={siteId}
                          className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60"
                          title={`${siteEvidence.caseIds.length} cases, ${siteEvidence.assetIds.length} assets`}
                        >
                          {siteId.slice(0, 8)}… ({siteEvidence.caseIds.length})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          {data.patterns.length > 0 && (
            <p className="text-xs text-white/30 text-end">
              {t("dataFreshness")}: {formatDateTime(data.computedAt, locale)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
