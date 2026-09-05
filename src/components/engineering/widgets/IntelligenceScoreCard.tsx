"use client";

import { useLocale, useTranslations } from "next-intl";

import { useQuery }        from "@tanstack/react-query";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { GlassCard }       from "@/components/ui/GlassCard";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { enumLabel } from "@/lib/i18n/enum-label";

// ── Types ─────────────────────────────────────────────────────────────────

interface AgentData {
  agentId: string;
  status:  "success" | "degraded";
  score:   number;
}

interface SynthesisData {
  systemCoherenceScore: number;
  intelligenceGrade:    string;
}

interface IntelligenceResponse {
  overallScore: number;
  generatedAt:  string;
  memory:       AgentData;
  project:      AgentData;
  domain:       AgentData;
  synthesis:    AgentData & { data: SynthesisData };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

function gradeClass(g: string) {
  return g === "A" || g === "B"
    ? "text-signal"
    : g === "C"
    ? "text-[--warn]"
    : "text-[--danger]";
}

// ── Score ring ────────────────────────────────────────────────────────────

function ScoreRing({ score, display, label }: { score: number; display: string; label: string }) {
  const r   = 34;
  const c   = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="flex-none" role="img" aria-label={label}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth="6"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x="44" y="41" textAnchor="middle" dominantBaseline="middle" aria-hidden="true"
        fill="var(--ink)" fontSize="18" fontWeight="700" fontFamily="var(--font-display)">
        {display}
      </text>
      <text x="44" y="57" textAnchor="middle" dominantBaseline="middle" aria-hidden="true"
        direction="ltr" fill="var(--muted)" fontSize="11" fontFamily="var(--font-mono)">
        /100
      </text>
    </svg>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: IntelligenceResponse }) {
  const locale = useLocale();
  const t = useTranslations("engineeringHub");
  const synthData = data.synthesis.data;
  const agents    = [data.memory, data.project, data.domain, data.synthesis];
  const num = (v: number) => formatNumber(v, locale);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <ScoreRing
        score={data.overallScore}
        display={num(data.overallScore)}
        label={t("dashboard.intelligence.scoreOutOf", { score: num(data.overallScore) })}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <h2 className="text-lg font-bold text-ink">{t("dashboard.intelligence.title")}</h2>
          <span className={`text-3xl font-bold metric ${gradeClass(synthData.intelligenceGrade)}`}>
            {synthData.intelligenceGrade}
          </span>
        </div>
        <p className="text-[0.8125rem] text-muted mb-3" suppressHydrationWarning>
          {t("dashboard.intelligence.coherence", {
            score: t("dashboard.intelligence.scoreOutOf", { score: num(synthData.systemCoherenceScore) }),
          })}
          {" · "}
          {formatDate(data.generatedAt, locale, { timeStyle: "medium" })}
        </p>
        <div className="flex gap-4 flex-wrap">
          {agents.map(a => (
            <div key={a.agentId} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${
                a.status === "success" ? "bg-signal" : "bg-[--warn]"
              }`} />
              <span className="text-[0.6875rem] text-muted">
                {enumLabel(t, "dashboard.intelligence.agents", a.agentId)}
              </span>
              <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: scoreColor(a.score) }}>
                {num(a.score)}
              </span>
              <span className="sr-only">
                {enumLabel(t, "dashboard.intelligence.status", a.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function IntelligenceScoreCard() {
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
    <AnimatedSection delay={0.04}>
      <GlassCard neon className="p-6 h-full">
        {isPending && <LoadingState compact label={t("dashboard.intelligence.loading")} />}
        {isError   && (
          <ErrorState
            title={t("dashboard.states.errorTitle")}
            message={t("dashboard.states.errorMessage")}
            retryLabel={t("dashboard.states.retry")}
            onRetry={() => refetch()}
          />
        )}
        {data      && <Content data={data} />}
      </GlassCard>
    </AnimatedSection>
  );
}
