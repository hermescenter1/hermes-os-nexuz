"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PLATFORM_COMPONENTS }        from "@/lib/industrial/platform-facts";
import type { BrainMemoryStats }       from "@/lib/services/types";

interface BrainRow {
  id:         string;
  ts:         number;
  question:   string;
  locale:     string;
  domains:    { id: string; score: number }[];
  confidence: number;
  unknown?:   boolean;
}

interface BrainResponse {
  recent: BrainRow[];
  stats:  BrainMemoryStats;
}

const INTENT_TYPES = [
  "dependency_question",
  "health_question",
  "alarm_question",
  "kpi_question",
  "anomaly_question",
  "general_status_question",
];

const stateColor: Record<string, string> = {
  online:    "text-signal",
  simulated: "text-warn",
  phase2:    "text-muted",
};
const stateDot: Record<string, string> = {
  online:    "bg-signal",
  simulated: "bg-warn",
  phase2:    "bg-muted/50",
};

export default function CopilotPage() {
  const t      = useTranslations("copilot");
  const td     = useTranslations("brain.domains");
  const locale = useLocale();
  const [data, setData] = useState<BrainResponse | null>(null);

  useEffect(() => {
    let live = true;
    // SECURITY-6 amendment: this page is reachable by the broad dashboard
    // capability (incl. customer/vendor), so it reads the synthetic
    // /api/copilot/demo aggregate — never the real, unscoped cross-user
    // history behind the authoring-gated /api/brain.
    fetch("/api/copilot/demo?n=8", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: BrainResponse) => { if (live) setData(j); })
      .catch(() => {/* best-effort */});
    return () => { live = false; };
  }, []);

  const nf  = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "٪" : "%";
  const tf  = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const stats    = data?.stats;
  const recent   = data?.recent ?? [];
  const total    = stats?.count ?? 0;
  const known    = stats?.knownCount ?? 0;
  const knownPct = total > 0 ? Math.round((known / total) * 100) : 0;
  const avgConf  = Math.round((stats?.avgConfidence ?? 0) * 100);

  return (
    <div className="max-w-7xl mx-auto px-6 sm:px-8 pb-20">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
        <h1 className="type-page-title">{t("title")}</h1>
        <p className="mt-2 type-secondary max-w-2xl">{t("subtitle")}</p>
      </div>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <div className="flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6" style={{ background: "var(--surface)" }}>
        <div className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Total Analyses</p>
          <p className="metric text-2xl text-ink">{nf.format(total)}</p>
          <p className="mt-1 type-caption">this session</p>
        </div>
        <div className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Known %</p>
          <p className={`metric text-2xl ${knownPct >= 70 ? "text-signal" : knownPct >= 40 ? "text-warn" : "text-ink"}`}>
            {total > 0 ? `${nf.format(knownPct)}${pct}` : "—"}
          </p>
          <p className="mt-1 type-caption">{nf.format(known)} classified</p>
        </div>
        <div className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Avg Confidence</p>
          <p className={`metric text-2xl ${avgConf >= 70 ? "text-signal" : avgConf >= 40 ? "text-warn" : "text-ink"}`}>
            {total > 0 ? `${nf.format(avgConf)}${pct}` : "—"}
          </p>
          <p className="mt-1 type-caption">deterministic scoring</p>
        </div>
        <div className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Guardrail Hits</p>
          <p className={`metric text-2xl ${(stats?.guardrailHits ?? 0) > 0 ? "text-warn" : "text-ink"}`}>
            {nf.format(stats?.guardrailHits ?? 0)}
          </p>
          <p className="mt-1 type-caption">blocked queries</p>
        </div>
        <div className="flex-1 min-w-[110px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Intents Covered</p>
          <p className="metric text-2xl text-ink">{INTENT_TYPES.length}</p>
          <p className="mt-1 type-caption">query classifications</p>
        </div>
      </div>

      {/* ── Primary + Secondary layout ──────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* PRIMARY (2/3): Intelligence feed + recent queries */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* How Copilot works */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">Capability Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: t("queryTitle"),           desc: t("queryDesc"),           accent: "var(--signal)" },
                { title: t("insightsTitle"),         desc: t("insightsDesc"),        accent: "var(--ice)" },
                { title: t("recommendationsTitle"),  desc: t("recommendationsDesc"), accent: "var(--steel)" },
              ].map((cap) => (
                <div key={cap.title} className="rounded-lg border border-line/60 bg-surface2/50 p-4">
                  <div
                    className="h-[2px] w-8 rounded mb-3"
                    style={{ background: cap.accent, opacity: 0.7 }}
                  />
                  <p className="font-body text-sm font-semibold text-ink mb-1.5">{cap.title}</p>
                  <p className="type-caption leading-relaxed">{cap.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Recent analyses */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">Recent Analyses</h2>
            {recent.length > 0 ? (
              <ul className="space-y-2.5">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 rounded-lg border border-line/50 bg-surface2/40 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-ink truncate mb-1">{row.question}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {row.domains.slice(0, 2).map((d) => (
                          <span key={d.id} className="rounded border border-line px-1.5 py-0.5 font-body text-[0.60rem] text-muted">
                            {td(d.id)}
                          </span>
                        ))}
                        {row.unknown && (
                          <span className="rounded border border-warn/30 px-1.5 py-0.5 font-body text-[0.60rem] text-warn">
                            Unknown
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`font-mono text-xs ${
                        row.confidence >= 0.75 ? "text-signal" : row.confidence >= 0.40 ? "text-warn" : "text-danger"
                      }`}>
                        {nf.format(Math.round(row.confidence * 100))}{pct}
                      </span>
                      <span className="font-mono text-[0.60rem] text-faint">{tf.format(row.ts)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center">
                <p className="type-secondary">{t("noConversations")}</p>
                <p className="mt-1 type-caption">Use the Copilot query interface to begin</p>
              </div>
            )}
          </section>

          {/* Intent coverage grid */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">{t("intentsTitle")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {INTENT_TYPES.map((intent) => (
                <div key={intent} className="flex items-center gap-2 rounded-lg border border-line/50 bg-surface2/40 px-3 py-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal/50 flex-shrink-0" />
                  <p className="font-mono text-[0.65rem] text-muted truncate">{intent}</p>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* SECONDARY (1/3): System status + safety */}
        <div className="flex flex-col gap-5">

          {/* Platform components */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">System Status</h2>
            <ul className="space-y-3 mb-5">
              {PLATFORM_COMPONENTS.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-ink">
                    {c.key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className={`flex items-center gap-1.5 font-body text-xs ${stateColor[c.state]}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot[c.state]}`} />
                    {c.state.charAt(0).toUpperCase() + c.state.slice(1)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Session note */}
            <div className="border-t border-line pt-4">
              <p className="type-caption leading-relaxed">
                Session-scoped intelligence. Analyses reset on server restart in session mode.
              </p>
            </div>
          </section>

          {/* Safety framework */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">{t("safetyTitle")}</h2>
            <ul className="space-y-3 mb-5">
              {[
                { text: t("safetyReadOnly"),        icon: "◈" },
                { text: t("safetyDeterministic"),   icon: "◎" },
                { text: t("safetyNoLLM"),           icon: "⊕" },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2.5">
                  <span className="text-signal text-sm flex-shrink-0 mt-0.5">{item.icon}</span>
                  <p className="font-body text-xs text-muted leading-relaxed">{item.text}</p>
                </li>
              ))}
            </ul>

            {/* Confidence legend */}
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">Confidence Scale</p>
              <div className="space-y-2">
                {[
                  { label: "HIGH",   range: "≥ 75%",   color: "text-signal" },
                  { label: "MEDIUM", range: "40–74%",  color: "text-warn" },
                  { label: "LOW",    range: "< 40%",   color: "text-danger" },
                ].map((tier) => (
                  <div key={tier.label} className="flex items-center justify-between">
                    <span className={`font-mono text-xs ${tier.color}`}>{tier.label}</span>
                    <span className="type-caption">{tier.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Domain distribution */}
          {stats?.byDomain && Object.keys(stats.byDomain).length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
              <h2 className="type-panel-title mb-4">Domain Distribution</h2>
              <ul className="space-y-2">
                {Object.entries(stats.byDomain)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([domain, count]) => (
                    <li key={domain} className="flex items-center justify-between">
                      <span className="font-body text-xs text-muted">{td(domain)}</span>
                      <span className="font-mono text-xs text-ink">{nf.format(count)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
