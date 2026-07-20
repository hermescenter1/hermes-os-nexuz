"use client";

import { useLocale } from "next-intl";
import { useQuery }         from "@tanstack/react-query";
import { AnimatedSection }  from "@/components/ui/AnimatedSection";
import { DashboardPanel }   from "@/components/ui/DashboardPanel";
import { GlassCard }        from "@/components/ui/GlassCard";
import { LoadingState }     from "@/components/ui/LoadingState";
import { ErrorState }       from "@/components/ui/ErrorState";
import { EmptyState }       from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/i18n/format";

// ── Types ──────────────────────────────────────────────────────────────────

interface AgentData {
  agentId:  string;
  status:   "success" | "degraded";
  score:    number;
  findings: string[];
  data:     Record<string, unknown>;
}

interface Correlation {
  type:        string;
  description: string;
  severity:    "info" | "warning" | "critical";
}

interface PrioritizedAction {
  rank:   number;
  action: string;
  impact: "high" | "medium" | "low";
  agents: string[];
}

interface SynthesisData {
  systemCoherenceScore: number;
  correlations:         Correlation[];
  prioritizedActions:   PrioritizedAction[];
  intelligenceGrade:    string;
}

interface IntelligenceResponse {
  storageMode:  string;
  generatedAt:  string;
  overallScore: number;
  memory:       AgentData;
  project:      AgentData;
  domain:       AgentData;
  synthesis:    AgentData & { data: SynthesisData };
}

// ── Score helpers ──────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

function gradeColor(g: string) {
  return g === "A" || g === "B" ? "text-signal" : g === "C" ? "text-[--warn]" : "text-[--danger]";
}

function severityColor(s: "info" | "warning" | "critical") {
  return s === "critical" ? "text-[--danger]" : s === "warning" ? "text-[--warn]" : "text-muted";
}

function impactBadge(impact: "high" | "medium" | "low") {
  const map = {
    high:   "bg-[--danger]/10 text-[--danger] border-[--danger]/20",
    medium: "bg-[--warn]/10 text-[--warn] border-[--warn]/20",
    low:    "bg-signal/10 text-signal border-signal/20",
  };
  return map[impact];
}

// ── ScoreRing ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r  = 38;
  const c  = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="flex-none">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx="50" cy="50" r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth="7"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x="50" y="46" textAnchor="middle" dominantBaseline="middle"
        fill="var(--ink)" fontSize="20" fontWeight="700" fontFamily="var(--font-display)">
        {score}
      </text>
      <text x="50" y="62" textAnchor="middle" dominantBaseline="middle"
        fill="var(--muted)" fontSize="9" fontFamily="var(--font-mono)">
        /100
      </text>
    </svg>
  );
}

// ── ScoreBar ───────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${score}%`, background: scoreColor(score) }}
      />
    </div>
  );
}

// ── AgentCard ──────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  memory:    "Memory Agent",
  project:   "Project Agent",
  domain:    "Domain Agent",
  synthesis: "Synthesis Agent",
};

function AgentCard({ agent }: { agent: AgentData }) {
  return (
    <GlassCard hover className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-muted">
          {AGENT_LABELS[agent.agentId] ?? agent.agentId}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
          agent.status === "success"
            ? "text-signal bg-signal/10 border-signal/20"
            : "text-[--warn] bg-[--warn]/10 border-[--warn]/20"
        }`}>
          {agent.status}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="metric text-3xl" style={{ color: scoreColor(agent.score) }}>
          {agent.score}
        </span>
        <div className="flex-1">
          <ScoreBar score={agent.score} />
          <p className="text-[10px] text-muted mt-1">score / 100</p>
        </div>
      </div>
      <ul className="space-y-1">
        {agent.findings.slice(0, 3).map((f, i) => (
          <li key={i} className="text-xs text-muted flex gap-2">
            <span className="text-signal mt-0.5 flex-none">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export function IntelligenceView() {
  const locale = useLocale();
  const { data, isPending, isError, refetch } = useQuery<IntelligenceResponse>({
    queryKey: ["intelligence-agents"],
    queryFn:  async () => {
      const r = await fetch("/api/intelligence/agents");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  if (isPending) return <LoadingState label="Running intelligence agents…" />;
  if (isError)   return <ErrorState onRetry={() => refetch()} />;
  if (!data)     return <EmptyState title="No data" message="The intelligence service returned no data." />;

  const { overallScore, memory, project, domain, synthesis } = data;
  const synthData = synthesis.data as SynthesisData;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header row */}
      <AnimatedSection delay={0}>
        <GlassCard neon className="p-6 flex flex-wrap items-center gap-6">
          <ScoreRing score={overallScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-bold text-ink font-display">
                System Intelligence
              </h1>
              <span className={`text-4xl font-bold metric ${gradeColor(synthData.intelligenceGrade)}`}>
                {synthData.intelligenceGrade}
              </span>
            </div>
            <p className="text-xs text-muted" suppressHydrationWarning>
              Generated {formatDateTime(data.generatedAt, locale)} ·{" "}
              Coherence {synthData.systemCoherenceScore}/100
            </p>
          </div>
        </GlassCard>
      </AnimatedSection>

      {/* Agent cards */}
      <AnimatedSection delay={0.08}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[memory, project, domain, synthesis].map(agent => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      </AnimatedSection>

      {/* Correlations + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AnimatedSection delay={0.16}>
          <DashboardPanel
            title="System Correlations"
            subtitle={`${synthData.correlations.length} detected`}
          >
            {synthData.correlations.length === 0 ? (
              <EmptyState title="No correlations" message="System is well balanced." icon="✓" />
            ) : (
              <ul className="space-y-3">
                {synthData.correlations.map((c, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`text-sm mt-0.5 flex-none ${severityColor(c.severity)}`}>
                      {c.severity === "critical" ? "●" : c.severity === "warning" ? "◐" : "○"}
                    </span>
                    <div>
                      <p className="text-xs font-mono text-muted uppercase">{c.type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-ink mt-0.5 leading-relaxed">{c.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>
        </AnimatedSection>

        <AnimatedSection delay={0.22}>
          <DashboardPanel
            title="Prioritized Actions"
            subtitle={`Top ${synthData.prioritizedActions.length} recommendations`}
          >
            {synthData.prioritizedActions.length === 0 ? (
              <EmptyState title="Nothing to do" message="System is in optimal state." icon="✓" />
            ) : (
              <ul className="space-y-3">
                {synthData.prioritizedActions.map(a => (
                  <li key={a.rank} className="flex gap-3 items-start">
                    <span className="text-xs font-mono text-muted w-4 flex-none mt-0.5">
                      {a.rank}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-ink leading-relaxed">{a.action}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${impactBadge(a.impact)}`}>
                          {a.impact}
                        </span>
                        {a.agents.map(ag => (
                          <span key={ag} className="text-[10px] font-mono text-muted">
                            {ag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>
        </AnimatedSection>
      </div>
    </div>
  );
}
