"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatNumber } from "@/lib/i18n/format";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { toRenderableText } from "@/lib/utils/renderable";

// ── Types ─────────────────────────────────────────────────────────────────

interface GraphInsight {
  type:    string;
  message: string;
  nodeId?: string;
}

interface GraphHealth {
  overallScore:      number;
  coverageScore:     number;
  connectivityScore: number;
  qualityScore:      number;
  insights:          GraphInsight[];
}

interface KGAnalyticsResponse {
  centrality:  { nodeId: string }[];
  domainHealth: { domain: string }[];
  health:       GraphHealth;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

function ScoreRow({ label, score, display }: { label: string; score: number; display: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-3 text-[0.8125rem]">
        <span className="text-muted">{label}</span>
        <span className="font-bold tabular-nums" style={{ color: scoreColor(score) }}>{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: scoreColor(score) }}
        />
      </div>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: KGAnalyticsResponse }) {
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const { health } = data;
  const num = (v: number) => formatNumber(v, locale);

  if (!health) {
    return (
      <EmptyState
        title={t("dashboard.graph.emptyTitle")}
        message={t("dashboard.graph.emptyMessage")}
        icon="⊡"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div>
          <p className="text-[0.6875rem] font-medium text-muted uppercase tracking-widest">{t("dashboard.graph.overall")}</p>
          <span className="text-2xl font-bold metric tabular-nums" style={{ color: scoreColor(health.overallScore) }}>
            {num(health.overallScore)}
          </span>
        </div>
        <div className="text-end text-[0.6875rem] text-muted space-y-0.5">
          <p>{t("dashboard.graph.hubNodes", { count: data.centrality.length })}</p>
          <p>{t("dashboard.graph.domains", { count: data.domainHealth.length })}</p>
        </div>
      </div>
      <ScoreRow label={t("dashboard.graph.coverage")}     score={health.coverageScore}     display={num(health.coverageScore)}     />
      <ScoreRow label={t("dashboard.graph.connectivity")} score={health.connectivityScore} display={num(health.connectivityScore)} />
      <ScoreRow label={t("dashboard.graph.quality")}      score={health.qualityScore}      display={num(health.qualityScore)}      />
      {/* Engine-authored insight text: emitted by the analytics service, left
          as the service produces it (see the stage report). */}
      {health.insights.slice(0, 1).map((ins, i) => (
        <p key={i} className="text-[0.6875rem] text-muted leading-relaxed pt-1" dir="auto">
          <span className="text-signal">· </span>{toRenderableText(ins)}
        </p>
      ))}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function GraphHealthPanel() {
  const t = useTranslations("engineeringHub");
  const { data, isPending, isError, refetch } = useQuery<KGAnalyticsResponse>({
    queryKey: ["knowledge-graph-analytics"],
    queryFn:  async () => {
      const r = await fetch("/api/knowledge-graph/analytics");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.16}>
      <DashboardPanel title={t("dashboard.graph.title")} className="h-full">
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
            title={t("dashboard.graph.emptyTitle")}
            message={t("dashboard.graph.emptyMessage")}
            icon="⊡"
          />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
