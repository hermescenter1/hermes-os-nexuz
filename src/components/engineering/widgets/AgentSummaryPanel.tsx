"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatNumber } from "@/lib/i18n/format";
import { enumLabel } from "@/lib/i18n/enum-label";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";

// ── Types ─────────────────────────────────────────────────────────────────

interface AgentData {
  agentId:  string;
  status:   "success" | "degraded";
  score:    number;
  findings: string[];
}

interface SynthesisData {
  systemCoherenceScore: number;
  intelligenceGrade:    string;
}

interface IntelligenceResponse {
  overallScore: number;
  memory:       AgentData;
  project:      AgentData;
  domain:       AgentData;
  synthesis:    AgentData & { data: SynthesisData };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: IntelligenceResponse }) {
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const agents = [data.memory, data.project, data.domain, data.synthesis];
  const synthData = data.synthesis.data;
  const num = (v: number) => formatNumber(v, locale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[0.8125rem] pb-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          {/* One localized sentence with the score inside it, not a label
              fragment glued to a number. */}
          <span className="font-medium tabular-nums" style={{ color: scoreColor(synthData.systemCoherenceScore) }}>
            {t("dashboard.intelligence.coherence", {
              score: t("dashboard.intelligence.scoreOutOf", { score: num(synthData.systemCoherenceScore) }),
            })}
          </span>
        </div>
        <span className="text-muted">
          {t("dashboard.intelligence.grade")}{" "}
          <span className={`font-bold ${
            synthData.intelligenceGrade === "A" || synthData.intelligenceGrade === "B"
              ? "text-signal"
              : synthData.intelligenceGrade === "C"
              ? "text-[--warn]"
              : "text-[--danger]"
          }`}>
            {synthData.intelligenceGrade}
          </span>
        </span>
      </div>

      <div className="space-y-3">
        {agents.map(agent => (
          <div key={agent.agentId} className="flex items-center gap-3">
            <span className="text-[0.8125rem] text-muted w-24 flex-none truncate">
              {enumLabel(t, "dashboard.intelligence.agents", agent.agentId)}
            </span>
            <div className="flex-1 h-1 rounded-full bg-line overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${agent.score}%`, background: scoreColor(agent.score) }}
              />
            </div>
            <div className="flex items-center gap-2 flex-none">
              <span className="text-[0.8125rem] font-bold tabular-nums" style={{ color: scoreColor(agent.score) }}>
                {num(agent.score)}
              </span>
              {/* The status is carried by the WORD, from the catalogue — the
                  colour is an additional cue, never the only one. */}
              <span className={`text-[0.6875rem] px-1.5 py-0.5 rounded-full border ${
                agent.status === "success"
                  ? "text-signal bg-signal/10 border-signal/20"
                  : "text-[--warn] bg-[--warn]/10 border-[--warn]/20"
              }`}>
                {enumLabel(t, "dashboard.intelligence.status", agent.status)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {agents.some(a => a.findings.length > 0) && (
        <div className="pt-3 border-t border-line space-y-1">
          {agents
            .filter(a => a.findings.length > 0)
            .slice(0, 2)
            .map(a => (
              <p key={a.agentId} className="text-[0.6875rem] text-muted flex gap-2" dir="auto">
                <span className="text-signal flex-none">·</span>
                <span className="leading-relaxed">{a.findings[0]}</span>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function AgentSummaryPanel() {
  const t = useTranslations("engineeringHub");
  const { data, isPending, isError, refetch } = useQuery<IntelligenceResponse>({
    queryKey: ["intelligence-agents"],
    queryFn:  async () => {
      const r = await fetch("/api/intelligence/agents");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.2}>
      <DashboardPanel
        title={t("dashboard.intelligence.panelTitle")}
        subtitle={data ? t("dashboard.intelligence.overall", { score: data.overallScore }) : undefined}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact label={t("dashboard.intelligence.loading")} />
        ) : isError ? (
          <ErrorState
            title={t("dashboard.states.errorTitle")}
            message={t("dashboard.states.errorMessage")}
            retryLabel={t("dashboard.states.retry")}
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <EmptyState
            title={t("dashboard.intelligence.emptyTitle")}
            message={t("dashboard.intelligence.emptyMessage")}
          />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
