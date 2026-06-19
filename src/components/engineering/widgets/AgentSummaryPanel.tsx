"use client";

import { useQuery }        from "@tanstack/react-query";
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

const AGENT_LABELS: Record<string, string> = {
  memory:    "Memory",
  project:   "Project",
  domain:    "Domain",
  synthesis: "Synthesis",
};

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: IntelligenceResponse }) {
  const agents = [data.memory, data.project, data.domain, data.synthesis];
  const synthData = data.synthesis.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted">Coherence</span>
          <span className="font-mono font-bold" style={{ color: scoreColor(synthData.systemCoherenceScore) }}>
            {synthData.systemCoherenceScore}/100
          </span>
        </div>
        <span className="font-mono text-muted">
          Grade{" "}
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
            <span className="text-xs font-mono text-muted w-20 flex-none">
              {AGENT_LABELS[agent.agentId] ?? agent.agentId}
            </span>
            <div className="flex-1 h-1 rounded-full bg-line overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${agent.score}%`, background: scoreColor(agent.score) }}
              />
            </div>
            <div className="flex items-center gap-2 flex-none">
              <span className="text-xs font-mono font-bold" style={{ color: scoreColor(agent.score) }}>
                {agent.score}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
                agent.status === "success"
                  ? "text-signal bg-signal/10 border-signal/20"
                  : "text-[--warn] bg-[--warn]/10 border-[--warn]/20"
              }`}>
                {agent.status}
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
              <p key={a.agentId} className="text-[10px] text-muted flex gap-2">
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
        title="Multi-Agent Intelligence"
        subtitle={data ? `Overall ${data.overallScore}/100` : undefined}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? (
          <EmptyState title="No agent data" message="Intelligence agents have not run yet." />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
