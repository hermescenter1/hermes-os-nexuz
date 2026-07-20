"use client";

import { useLocale } from "next-intl";
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

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardMeta {
  generatedAt: string;
  storageMode: string;
}

// ── View ──────────────────────────────────────────────────────────────────

export function DashboardView() {
  const locale = useLocale();
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
          <h1 className="text-xl font-bold text-ink font-display">Executive Dashboard</h1>
          <p className="text-xs text-muted mt-0.5" suppressHydrationWarning>
            {data?.generatedAt
              ? `Last updated ${formatDateTime(data.generatedAt, locale)}`
              : "Loading system metrics…"}
            {data?.storageMode && (
              <span className="ms-2 text-[10px] font-mono uppercase tracking-widest text-signal/60">
                {data.storageMode}
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
