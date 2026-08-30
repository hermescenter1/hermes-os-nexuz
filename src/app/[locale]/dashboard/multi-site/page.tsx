"use client";

/**
 * Enterprise Industrial Summary — Multi-Site Intelligence Hub — Phase 42.
 * Dark glassmorphism, neon cyan/ice-blue accents. FA/EN via useTranslations.
 * Reads from /api/multi-site/summary (latest SUCCESS benchmark + live KG staleness).
 *
 * RESPONSE BOUNDARY
 * -----------------
 * This page used to do `fetch(...).then(r => r.json()).then(d => setData(d))`,
 * casting ANY body — including a `401 {"error":"Authentication required"}` — to
 * `EnterpriseSummary`. `data.riskSummary` was then `undefined`, and reading
 * `.avgOrgRiskScore` off it during render threw, taking the whole route into the
 * global error boundary. The `.catch()` never saw it: the response was valid
 * JSON, so nothing rejected.
 *
 * The fix is a closed set of states rather than a nullable payload. Every
 * outcome the network and the API can produce is classified BEFORE anything is
 * rendered, and only a body that passes `isEnterpriseSummaryResponse` reaches
 * the success branch. Optional chaining was deliberately NOT used: `data
 * .riskSummary?.avgOrgRiskScore` would have silenced the same broken contract
 * one property at a time and rendered a dashboard of blanks for what is
 * actually an auth failure.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import { Link }                from "@/i18n/navigation";
import { formatDateTime } from "@/lib/i18n/format";
import {
  isEnterpriseSummaryResponse,
  type EnterpriseSummaryResponse,
} from "@/lib/multi-site/summary-contract";

/**
 * Every state this surface can be in. A discriminated union rather than
 * `data | loading | error` booleans, so "authenticated but forbidden", "no
 * sites in scope" and "the server sent something unrecognizable" cannot
 * collapse into one another — or into a half-rendered dashboard.
 */
type ViewState =
  | { kind: "loading" }
  | { kind: "success"; data: EnterpriseSummaryResponse }
  | { kind: "empty" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "requestError" }
  | { kind: "invalidResponse" };

/** Distinguishes "body was not JSON" from a legitimately parsed `null`. */
const PARSE_FAILED = Symbol("parse-failed");

/**
 * Perform one load and classify its outcome. Never throws except for
 * `AbortError`, which signals that a newer attempt (or unmount) owns the state.
 */
async function loadSummary(signal: AbortSignal): Promise<ViewState> {
  let response: Response;
  try {
    response = await fetch("/api/multi-site/summary", {
      method: "GET",
      // Authentication rides on the session cookie. Stated explicitly so a
      // future change to the fetch default cannot silently make this anonymous.
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      // The route is force-dynamic; asking for no-store keeps a back/forward
      // navigation from re-showing a summary the caller may no longer be
      // authorized to see.
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "requestError" };
  }

  // Status is inspected BEFORE the body is given any meaning.
  if (!response.ok) {
    if (response.status === 401) return { kind: "unauthorized" };
    if (response.status === 403) return { kind: "forbidden" };
    // 404 / 429 / 5xx and anything else: a controlled, retryable error state.
    return { kind: "requestError" };
  }

  const body: unknown = await response.json().catch(() => PARSE_FAILED);
  if (body === PARSE_FAILED) return { kind: "invalidResponse" };

  // A 200 is not a promise about shape. An error page from a proxy, a truncated
  // body, or a future API change all land here rather than in render.
  if (!isEnterpriseSummaryResponse(body)) return { kind: "invalidResponse" };

  if (body.noAccessibleSites) return { kind: "empty" };
  return { kind: "success", data: body };
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

/**
 * One presentation for every non-success state: a title, an explanation of what
 * actually happened, and at most one action. Keeps each state visibly distinct
 * instead of showing the same generic "failed to load" for six causes.
 */
function StatusPanel({ tone, title, hint, action }: {
  tone: "neutral" | "warning" | "error";
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  const border =
    tone === "error"   ? "border-red-500/30 bg-red-500/5"
  : tone === "warning" ? "border-yellow-500/30 bg-yellow-500/5"
  :                      "border-white/10";
  const titleColor =
    tone === "error"   ? "text-red-400"
  : tone === "warning" ? "text-yellow-400"
  :                      "text-white/80";

  return (
    <GlassCard className={`flex flex-col items-start gap-2 p-6 ${border}`}>
      <p className={`text-sm font-semibold ${titleColor}`}>{title}</p>
      <p className="text-sm text-white/50">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </GlassCard>
  );
}

export default function MultiSiteSummaryPage() {
  const locale = useLocale();
  const t = useTranslations("multiSite");
  const [state,   setState]   = useState<ViewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ kind: "loading" });
    loadSummary(controller.signal)
      .then((next) => { if (active) setState(next); })
      .catch(() => { /* aborted — a newer attempt or unmount owns the state */ });
    return () => { active = false; controller.abort(); };
    // `t` is deliberately NOT a dependency: refetching the API because a
    // translation function changed identity was never intended.
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const retryButton = (
    <button
      type="button"
      onClick={retry}
      className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-sm hover:bg-cyan-500/30 transition-colors"
    >
      {t("retry")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/*
        `flex-wrap` and `min-w-0` are load-bearing at 320px.

        This row did not wrap, and the heading block could not shrink below its
        intrinsic width, so the call-to-action was pushed past the viewport and
        the DOCUMENT scrolled sideways: +74px in German, where
        "Standort-Benchmarks" is materially longer than the English label. EN and
        FA happened to fit, which is exactly why a single-locale check would have
        missed it.

        Proven before this edit: removing the row took document overflow to 0,
        and constraining it this way in the live page took +74 to 0.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
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

      {state.kind === "loading" && (
        <GlassCard className="p-6 text-center text-white/50">{t("loading")}</GlassCard>
      )}

      {state.kind === "empty" && (
        <StatusPanel
          tone="neutral"
          title={t("noSiteAccessTitle")}
          hint={t("noSiteAccessHint")}
        />
      )}

      {state.kind === "unauthorized" && (
        <StatusPanel
          tone="warning"
          title={t("sessionExpiredTitle")}
          hint={t("sessionExpiredHint")}
          action={
            <Link
              href="/auth/login"
              className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-sm hover:bg-cyan-500/30 transition-colors"
            >
              {t("signIn")}
            </Link>
          }
        />
      )}

      {state.kind === "forbidden" && (
        <StatusPanel
          tone="warning"
          title={t("accessDeniedTitle")}
          hint={t("accessDeniedHint")}
        />
      )}

      {state.kind === "requestError" && (
        <StatusPanel
          tone="error"
          title={t("requestFailedTitle")}
          hint={t("requestFailedHint")}
          action={retryButton}
        />
      )}

      {state.kind === "invalidResponse" && (
        <StatusPanel
          tone="error"
          title={t("invalidResponseTitle")}
          hint={t("invalidResponseHint")}
          action={retryButton}
        />
      )}

      {state.kind === "success" && (
        <>
          {state.data.benchmarkStale && state.data.stalenessWarning && (
            <GlassCard className="p-3 border-yellow-500/30 bg-yellow-500/5">
              <p className="text-yellow-400 text-sm">{state.data.stalenessWarning}</p>
            </GlassCard>
          )}

          {/* Top-level KPI stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={t("sites")}
              value={state.data.siteCount}
              sub={t("activeSites")}
              accent="text-cyan-400"
            />
            <StatCard
              label={t("avgOrgRisk")}
              value={state.data.riskSummary.avgOrgRiskScore !== null
                ? state.data.riskSummary.avgOrgRiskScore.toFixed(1)
                : t("insufficientData")}
              sub={`${state.data.riskSummary.sitesRanked} ${t("sitesRanked")}`}
              accent="text-red-400"
            />
            <StatCard
              label={t("avgAvailability")}
              value={state.data.kpiSummary.avgOrgAvailability !== null
                ? `${state.data.kpiSummary.avgOrgAvailability.toFixed(1)}%`
                : t("insufficientData")}
              sub={`${state.data.kpiSummary.sitesCompared} ${t("sitesCompared")}`}
              accent="text-green-400"
            />
            <StatCard
              label={t("crossSitePatterns")}
              value={state.data.patternCount}
              sub={t("failurePatternsSub")}
              accent={state.data.patternCount > 0 ? "text-orange-400" : "text-white/50"}
            />
          </div>

          {/* KG staleness */}
          {state.data.knowledgeGraphStale && (
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

          {state.data.latestBenchmarkAt && (
            <p className="text-xs text-white/30 text-end">
              {t("dataFreshness")}: {formatDateTime(state.data.latestBenchmarkAt, locale)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
