"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }              from "@tanstack/react-query";
import { AnimatedSection }       from "@/components/ui/AnimatedSection";
import { MetricGrid }            from "./widgets/MetricGrid";
import { IntelligenceScoreCard } from "./widgets/IntelligenceScoreCard";
import { RiskOverviewPanel }     from "./widgets/RiskOverviewPanel";
import { DomainHealthPanel }     from "./widgets/DomainHealthPanel";
import { BenchmarkPanel }        from "./widgets/BenchmarkPanel";
import { GraphHealthPanel }      from "./widgets/GraphHealthPanel";
import { AgentSummaryPanel }     from "./widgets/AgentSummaryPanel";
import { formatDateTime } from "@/lib/i18n/format";
import { enumLabel } from "@/lib/i18n/enum-label";

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardMeta {
  generatedAt: string;
  storageMode: string;
}

// ── View ──────────────────────────────────────────────────────────────────

export function DashboardView() {
  const locale = useLocale();
  const t = useTranslations("engineeringHub");
  const { data } = useQuery<DashboardMeta>({
    queryKey: ["dashboard"],
    queryFn:  async () => {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Page header */}
      <AnimatedSection delay={0}>
        <div>
          {/* PHASE 107 — demoted from <h1>: the Engineering TopBar now owns the
              single page heading for every route in this app family, so a
              second h1 here would give this one route two. */}
          <h2 className="text-xl font-bold text-ink font-display">{t("executiveDashboard")}</h2>
          <p className="text-[0.8125rem] text-muted mt-0.5" suppressHydrationWarning>
            {data?.generatedAt
              ? t("dashboard.lastUpdated", { timestamp: formatDateTime(data.generatedAt, locale) })
              : t("dashboard.loadingMetrics")}
            {data?.storageMode && (
              <span
                className="ms-2 text-[0.6875rem] font-medium uppercase tracking-widest text-signal/70"
                title={t("dashboard.sourceLabel")}
              >
                <span className="sr-only">{t("dashboard.sourceLabel")}: </span>
                {/* Closed two-value enum ("database" | "session"). Routed through
                    the catalogue; an unrecognised value falls back to a
                    humanized form rather than leaking a raw identifier. */}
                {enumLabel(t, "dashboard.source", data.storageMode)}
              </span>
            )}
          </p>
        </div>
      </AnimatedSection>

      {/* ─── Row 1: Metric grid ─────────────────────────────────────── */}
      <MetricGrid />

      {/* ─── Row 2: Intelligence score + Risk overview ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <IntelligenceScoreCard />
        </div>
        <div className="lg:col-span-3">
          <RiskOverviewPanel />
        </div>
      </div>

      {/* ─── Row 3: Benchmark + Domain health ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BenchmarkPanel />
        <DomainHealthPanel />
      </div>

      {/* ─── Row 4: Graph health + Agent summary ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraphHealthPanel />
        <AgentSummaryPanel />
      </div>

    </div>
  );
}
