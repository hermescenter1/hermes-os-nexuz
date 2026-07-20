"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BrainMemoryStats } from "@/lib/services/types";
import {
  PLATFORM_FACTS,
  PLATFORM_COMPONENTS,
  getDynamicPlatformFacts,
  type ComponentState,
} from "@/lib/industrial/platform-facts";

interface RecentRow {
  id: string;
  ts: number;
  question: string;
  locale: "fa" | "en";
  domains: { id: string; score: number }[];
  confidence: number;
  unknown?: boolean;
}

interface BrainStatsResponse {
  recent: RecentRow[];
  stats: BrainMemoryStats;
}

const POLL_MS = 8_000;

/* Health is derived deterministically from session signals — no telemetry. */
function deriveHealth(stats: BrainMemoryStats): "nominal" | "watch" | "degraded" {
  const total = stats.count || 0;
  if (total === 0) return "nominal";
  const unknownRatio = stats.unknownCount / total;
  if (unknownRatio > 0.6) return "degraded";
  if (unknownRatio > 0.35 || stats.guardrailHits > 0) return "watch";
  return "nominal";
}

const stateTone: Record<ComponentState, string> = {
  online: "text-signal",
  simulated: "text-[var(--warn)]",
  phase2: "text-muted",
};
const stateDot: Record<ComponentState, string> = {
  online: "bg-signal",
  simulated: "bg-[var(--warn)]",
  phase2: "bg-muted/60",
};
const healthTone: Record<string, string> = {
  nominal: "text-signal",
  watch: "text-[var(--warn)]",
  degraded: "text-[var(--danger)]",
};

function KpiCard({
  label,
  value,
  accent = false,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl border border-line bg-surface p-5 transition-all hover:border-line2"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.20)" }}
    >
      <p className="type-eyebrow mb-3">{label}</p>
      <p className={`metric text-2xl ${tone ?? (accent ? "text-signal" : "text-ink")}`}>
        {value}
        {suffix && <span className="ms-1 font-body text-sm font-normal text-muted">{suffix}</span>}
      </p>
    </div>
  );
}

function ExecPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-6 ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.20)" }}
    >
      <h3 className="type-panel-title mb-4">{title}</h3>
      {children}
    </section>
  );
}

export function ExecutiveOverview() {
  const t = useTranslations("dashboard.exec");
  const td = useTranslations("brain.domains");
  const locale = useLocale();
  const [data, setData] = useState<BrainStatsResponse | null>(null);
  // Phase 11B-B: database-mode live counts; defaults to (and falls back to)
  // the static PLATFORM_FACTS baseline so this never blocks rendering.
  const [facts, setFacts] = useState(PLATFORM_FACTS);

  useEffect(() => {
    let live = true;
    getDynamicPlatformFacts().then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    async function tick() {
      try {
        // SECURITY-6 amendment: broad-role dashboard surface (incl.
        // customer/vendor) — read the synthetic demo aggregate, not the
        // authoring-only cross-user history behind /api/brain.
        const r = await fetch("/api/copilot/demo?n=5", { cache: "no-store" });
        if (!r.ok || !live) return;
        const j = (await r.json()) as BrainStatsResponse;
        if (live) setData(j);
      } catch {
        /* session intelligence is best-effort; telemetry below is unaffected */
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";
  const tf = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const stats = data?.stats;
  const recent = data?.recent ?? [];
  const health = stats ? deriveHealth(stats) : "nominal";

  const topEntries = (rec: Record<string, number> | undefined, n: number) =>
    Object.entries(rec ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  const topDomains = topEntries(stats?.byDomain, 4);
  const topVendors = topEntries(stats?.byVendor, 4);

  return (
    <div className="mb-8 space-y-4">
      {/* 1 — Executive KPI Cards */}
      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-muted">
          {t("sectionKpi")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label={t("kpi.totalAnalyses")} value={nf.format(stats?.count ?? 0)} accent />
          <KpiCard label={t("kpi.knownAnalyses")} value={nf.format(stats?.knownCount ?? 0)} />
          <KpiCard label={t("kpi.unknownAnalyses")} value={nf.format(stats?.unknownCount ?? 0)} />
          <KpiCard
            label={t("kpi.avgConfidence")}
            value={pf.format(Math.round((stats?.avgConfidence ?? 0) * 100))}
            suffix={pct}
          />
          <KpiCard label={t("kpi.engineeringCases")} value={nf.format(facts.engineeringCases)} />
          <KpiCard label={t("kpi.knowledgeLibraries")} value={nf.format(facts.knowledgeLibraries)} />
          <KpiCard label={t("kpi.supportedVendors")} value={nf.format(facts.supportedVendors)} />
          <KpiCard
            label={t("kpi.systemHealth")}
            value={t(`health.${health}`)}
            tone={healthTone[health]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 2 — Brain Intelligence Summary */}
        <ExecPanel title={t("sectionIntel")} className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Top Domains */}
            <div>
              <p className="font-body text-xs text-muted">{t("intel.topDomains")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {topDomains.length > 0 ? (
                  topDomains.map(([d, n]) => (
                    <span
                      key={d}
                      className="rounded-full border border-line px-2.5 py-1 font-body text-[0.7rem] text-ink"
                    >
                      {td(d)} <span className="font-mono text-muted">{nf.format(n)}</span>
                    </span>
                  ))
                ) : (
                  <span className="font-body text-xs text-muted/70">—</span>
                )}
              </div>
            </div>
            {/* Top Vendors */}
            <div>
              <p className="font-body text-xs text-muted">{t("intel.topVendors")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {topVendors.length > 0 ? (
                  topVendors.map(([v, n]) => (
                    <span
                      key={v}
                      className="rounded-full border border-line px-2.5 py-1 font-body text-[0.7rem] text-ink"
                      dir="ltr"
                    >
                      {v} <span className="font-mono text-muted">{nf.format(n)}</span>
                    </span>
                  ))
                ) : (
                  <span className="font-body text-xs text-muted/70">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Guardrail Hits */}
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
            <span className="font-body text-xs text-muted">{t("intel.guardrailHits")}</span>
            <span className="metric text-lg text-ink">{nf.format(stats?.guardrailHits ?? 0)}</span>
          </div>

          {/* Recent Analyses */}
          <div className="mt-5">
            <p className="font-body text-xs text-muted">{t("intel.recentAnalyses")}</p>
            {recent.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-body text-xs text-ink">
                      {r.question}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[0.65rem] ${
                        r.unknown
                          ? "border border-[var(--warn)]/40 text-[var(--warn)]"
                          : "border border-line text-muted"
                      }`}
                    >
                      {r.unknown ? t("intel.unknownTag") : r.domains[0]?.id ? td(r.domains[0].id) : "—"}
                    </span>
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted/70" dir="ltr">
                      {tf.format(r.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 font-body text-xs text-muted/70">{t("intel.none")}</p>
            )}
          </div>
        </ExecPanel>

        {/* 3 — Industrial Platform Status */}
        <ExecPanel title={t("sectionStatus")}>
          <ul className="space-y-3">
            {PLATFORM_COMPONENTS.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2">
                <span className="font-body text-sm text-ink">{t(`status.${c.key}`)}</span>
                <span className={`flex items-center gap-2 font-body text-xs ${stateTone[c.state]}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot[c.state]}`} />
                  {t(`status.${c.state}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-4 font-body text-[0.7rem] leading-relaxed text-muted/80">
            {t("sessionNote")}
          </p>
        </ExecPanel>
      </div>
    </div>
  );
}
