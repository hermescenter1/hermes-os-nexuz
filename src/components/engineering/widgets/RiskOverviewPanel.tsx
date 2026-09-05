"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatPercent, formatNumber } from "@/lib/i18n/format";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardResponse {
  projectHealth: {
    avgFailureRate:   number;
    highRiskProjects: number;
    systemRiskLevel:  "low" | "medium" | "high" | "critical";
    byStatus:         { active: number; archived: number; completed: number };
  };
  systemHealth:  { overall: number; memory: number; projects: number; graph: number };
  memoryHealth:  { successRate: number; avgConfidence: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  critical: "var(--danger)",
  high:     "var(--danger)",
  medium:   "var(--warn)",
  low:      "var(--signal)",
};

function ScoreBar({ label, score, display }: { label: string; score: number; display: string }) {
  const color = score >= 70 ? "var(--signal)" : score >= 40 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-[0.8125rem]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums font-medium" style={{ color }}>{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: DashboardResponse }) {
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const { projectHealth, systemHealth } = data;
  const level = projectHealth.systemRiskLevel;
  const color = RISK_COLOR[level] ?? RISK_COLOR.low;
  const score = (value: number) => formatNumber(value, locale);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="text-2xl font-bold metric" style={{ color }}>
          {t(`dashboard.risk.levels.${level}`)}
        </span>
        <div className="min-w-0 flex-1 text-[0.8125rem] text-muted space-y-1">
          {/* One ICU message each: the counts were English concatenations with a
              manual "s" plural, which no other language can follow. */}
          <p>{t("dashboard.risk.highRiskProjects", { count: projectHealth.highRiskProjects })}</p>
          <p>{t("dashboard.risk.avgFailureRate", { rate: formatPercent(projectHealth.avgFailureRate / 100, locale) })}</p>
          <p>
            {t("dashboard.risk.statusBreakdown", {
              active:    score(projectHealth.byStatus.active),
              completed: score(projectHealth.byStatus.completed),
              archived:  score(projectHealth.byStatus.archived),
            })}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <ScoreBar label={t("dashboard.risk.memoryHealth")}   score={systemHealth.memory}   display={score(systemHealth.memory)}   />
        <ScoreBar label={t("dashboard.risk.projectsHealth")} score={systemHealth.projects} display={score(systemHealth.projects)} />
        <ScoreBar label={t("dashboard.risk.graphHealth")}    score={systemHealth.graph}    display={score(systemHealth.graph)}    />
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function RiskOverviewPanel() {
  const t = useTranslations("engineeringHub");
  const { data, isPending, isError, refetch } = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn:  async () => {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.08}>
      <DashboardPanel
        title={t("dashboard.risk.title")}
        subtitle={t("dashboard.risk.subtitle")}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact label={t("dashboard.loadingMetrics")} />
        ) : isError ? (
          <ErrorState
            title={t("dashboard.states.errorTitle")}
            message={t("dashboard.states.errorMessage")}
            retryLabel={t("dashboard.states.retry")}
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <EmptyState
            title={t("dashboard.risk.emptyTitle")}
            message={t("dashboard.risk.emptyMessage")}
          />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
