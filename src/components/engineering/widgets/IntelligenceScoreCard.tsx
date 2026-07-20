"use client";

import { useLocale } from "next-intl";

import { useQuery }        from "@tanstack/react-query";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { GlassCard }       from "@/components/ui/GlassCard";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { formatDate } from "@/lib/i18n/format";

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

function ScoreRing({ score }: { score: number }) {
  const r   = 34;
  const c   = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="flex-none">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth="6"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x="44" y="41" textAnchor="middle" dominantBaseline="middle"
        fill="var(--ink)" fontSize="18" fontWeight="700" fontFamily="var(--font-display)">
        {score}
      </text>
      <text x="44" y="56" textAnchor="middle" dominantBaseline="middle"
        fill="var(--muted)" fontSize="8" fontFamily="var(--font-mono)">
        /100
      </text>
    </svg>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: IntelligenceResponse }) {
  const locale = useLocale();
  const synthData = data.synthesis.data;
  const agents    = [data.memory, data.project, data.domain, data.synthesis];

  return (
    <div className="flex flex-wrap items-center gap-6">
      <ScoreRing score={data.overallScore} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <h2 className="text-lg font-bold text-ink">System Intelligence</h2>
          <span className={`text-3xl font-bold metric ${gradeClass(synthData.intelligenceGrade)}`}>
            {synthData.intelligenceGrade}
          </span>
        </div>
        <p className="text-xs text-muted mb-3" suppressHydrationWarning>
          Coherence {synthData.systemCoherenceScore}/100
          {" · "}
          {formatDate(data.generatedAt, locale, { timeStyle: "medium" })}
        </p>
        <div className="flex gap-4 flex-wrap">
          {agents.map(a => (
            <div key={a.agentId} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${
                a.status === "success" ? "bg-signal" : "bg-[--warn]"
              }`} />
              <span className="text-[10px] font-mono text-muted capitalize">{a.agentId}</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: scoreColor(a.score) }}>
                {a.score}
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
        {isPending && <LoadingState compact label="Running agents…" />}
        {isError   && <ErrorState onRetry={() => refetch()} />}
        {data      && <Content data={data} />}
      </GlassCard>
    </AnimatedSection>
  );
}
