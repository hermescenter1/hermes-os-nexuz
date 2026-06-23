"use client";

import { useQuery }        from "@tanstack/react-query";
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

function ScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-bold" style={{ color: scoreColor(score) }}>{score}</span>
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
  const { health } = data;

  if (!health) {
    return (
      <EmptyState
        title="No graph data"
        message="Run queries to build the knowledge graph."
        icon="⊡"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div>
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest">Overall</p>
          <span className="text-2xl font-bold metric" style={{ color: scoreColor(health.overallScore) }}>
            {health.overallScore}
          </span>
        </div>
        <div className="text-right text-[10px] font-mono text-muted space-y-0.5">
          <p>{data.centrality.length} hub nodes</p>
          <p>{data.domainHealth.length} domains</p>
        </div>
      </div>
      <ScoreRow label="Coverage"     score={health.coverageScore}     />
      <ScoreRow label="Connectivity" score={health.connectivityScore} />
      <ScoreRow label="Quality"      score={health.qualityScore}      />
      {health.insights.slice(0, 1).map((ins, i) => (
        <p key={i} className="text-[10px] text-muted leading-relaxed pt-1">
          <span className="text-signal">· </span>{toRenderableText(ins)}
        </p>
      ))}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function GraphHealthPanel() {
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
      <DashboardPanel title="Knowledge Graph Health" className="h-full">
        {isPending ? (
          <LoadingState compact />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? (
          <EmptyState title="No graph data" message="Run queries to build the knowledge graph." icon="⊡" />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
