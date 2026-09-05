"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatNumber, formatPercent } from "@/lib/i18n/format";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { toRenderableText } from "@/lib/utils/renderable";

// ── Types ─────────────────────────────────────────────────────────────────

interface RankingEntry {
  projectId:   string;
  projectName: string;
  successRate: number;
}

interface ProjectLeader {
  projectId:   string;
  projectName: string;
}

interface BenchmarkInsight {
  type:         string;
  description:  string;
  projectId?:   string;
  projectName?: string;
  value:        string | number;
}

interface BenchmarkResponse {
  summary: {
    totalProjects:     number;
    activeProjects:    number;
    completedProjects: number;
    archivedProjects:  number;
  };
  leaders: {
    highestSuccessRate: ProjectLeader | null;
    highestRisk:        ProjectLeader | null;
    mostActive:         ProjectLeader | null;
    bestConfidence:     ProjectLeader | null;
  };
  rankings: {
    successRate: RankingEntry[];
  };
  insights: BenchmarkInsight[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rateColor(rate: number) {
  return rate >= 70 ? "var(--signal)" : rate >= 40 ? "var(--warn)" : "var(--danger)";
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: BenchmarkResponse }) {
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const top5 = data.rankings.successRate.slice(0, 5);

  if (top5.length === 0) {
    return (
      <EmptyState
        title={t("dashboard.benchmark.emptyTitle")}
        message={t("dashboard.benchmark.emptyMessage")}
        icon="⊞"
      />
    );
  }

  return (
    <div className="space-y-1">
      {top5.map((p, i) => (
        <div key={p.projectId} className="flex items-center gap-3 py-1.5">
          <span className="text-[0.8125rem] text-muted w-6 flex-none tabular-nums">{formatNumber(i + 1, locale)}</span>
          {/* Project names are user data and are never translated. */}
          <span className="text-[0.8125rem] text-ink flex-1 truncate" dir="auto">{p.projectName}</span>
          <span className="text-[0.8125rem] font-bold tabular-nums" style={{ color: rateColor(p.successRate) }}>
            {formatPercent(p.successRate / 100, locale)}
          </span>
        </div>
      ))}

      {data.leaders.highestSuccessRate && (
        <div className="pt-3 mt-1 border-t border-line">
          <p className="text-[0.6875rem] font-medium text-muted uppercase tracking-widest mb-1.5">{t("dashboard.benchmark.leader")}</p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal flex-none" />
            <span className="text-[0.8125rem] text-signal font-medium" dir="auto">
              {data.leaders.highestSuccessRate.projectName}
            </span>
          </div>
        </div>
      )}

      {data.insights.length > 0 && (
        <div className="pt-3 mt-1 border-t border-line space-y-1.5">
          {data.insights.slice(0, 2).map((ins, i) => (
            <p key={i} className="text-[0.6875rem] text-muted leading-relaxed flex gap-2" dir="auto">
              <span className="text-signal flex-none">·</span>
              <span>{toRenderableText(ins)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function BenchmarkPanel() {
  const t = useTranslations("engineeringHub");
  const { data, isPending, isError, refetch } = useQuery<BenchmarkResponse>({
    queryKey: ["projects-benchmark"],
    queryFn:  async () => {
      const r = await fetch("/api/projects/benchmark");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.12}>
      <DashboardPanel
        title={t("dashboard.benchmark.title")}
        subtitle={data ? t("dashboard.benchmark.subtitle", { count: data.summary.totalProjects }) : undefined}
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
            title={t("dashboard.benchmark.unavailableTitle")}
            message={t("dashboard.benchmark.unavailableMessage")}
            icon="⊞"
          />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
