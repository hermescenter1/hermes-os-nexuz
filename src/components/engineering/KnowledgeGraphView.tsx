"use client";

import { useQuery }         from "@tanstack/react-query";
import { AnimatedSection }  from "@/components/ui/AnimatedSection";
import { StatCard }         from "@/components/ui/StatCard";
import { DashboardPanel }   from "@/components/ui/DashboardPanel";
import { GlassCard }        from "@/components/ui/GlassCard";
import { LoadingState }     from "@/components/ui/LoadingState";
import { ErrorState }       from "@/components/ui/ErrorState";
import { EmptyState }       from "@/components/ui/EmptyState";

// ── Types ──────────────────────────────────────────────────────────────────

interface NodeCentrality {
  nodeId:   string;
  nodeType: string;
  label:    string;
  degree:   number;
}

interface DomainHealth {
  domain:          string;
  memoryCount:     number;
  avgConfidence:   number;
  successRate:     number;
  connectionCount: number;
  healthScore:     number;
}

interface GraphHealth {
  overallScore:      number;
  coverageScore:     number;
  connectivityScore: number;
  qualityScore:      number;
  insights:          string[];
}

interface KGAnalyticsResponse {
  storageMode:        string;
  centrality:         NodeCentrality[];
  domainHealth:       DomainHealth[];
  projectConnectivity: unknown[];
  health:             GraphHealth;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono" style={{ color: scoreColor(score) }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: scoreColor(score) }} />
      </div>
    </div>
  );
}

const NODE_TYPE_COLOR: Record<string, string> = {
  memory:   "text-signal",
  project:  "text-[--warn]",
  domain:   "text-muted",
  solution: "text-[--signal]",
  risk:     "text-[--danger]",
};

// ── Main view ──────────────────────────────────────────────────────────────

export function KnowledgeGraphView() {
  const { data, isPending, isError, refetch } = useQuery<KGAnalyticsResponse>({
    queryKey: ["knowledge-graph-analytics"],
    queryFn:  async () => {
      const r = await fetch("/api/knowledge-graph/analytics");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
  });

  if (isPending) return <LoadingState label="Analysing knowledge graph…" />;
  if (isError)   return <ErrorState onRetry={() => refetch()} />;

  const health  = data?.health;
  const domains = data?.domainHealth ?? [];
  const hubs    = (data?.centrality ?? []).slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Health scores */}
      <AnimatedSection delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Graph Health"    value={health?.overallScore      ?? 0}
            accent={!health ? "muted" : health.overallScore >= 70 ? "signal" : "warn"} glow />
          <StatCard label="Coverage Score"  value={health?.coverageScore     ?? 0} accent="muted" />
          <StatCard label="Connectivity"    value={health?.connectivityScore ?? 0} accent="muted" />
          <StatCard label="Quality Score"   value={health?.qualityScore      ?? 0} accent="muted" />
        </div>
      </AnimatedSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Domain health table */}
        <AnimatedSection delay={0.1}>
          <DashboardPanel
            title="Domain Health"
            subtitle={`${domains.length} domain${domains.length !== 1 ? "s" : ""} in graph`}
          >
            {domains.length === 0 ? (
              <EmptyState title="No domain data" message="Domains appear as memories are linked." icon="⊡" />
            ) : (
              <div className="space-y-3">
                {domains.map(d => (
                  <GlassCard key={d.domain} className="px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-ink">{d.domain}</span>
                      <span className="text-xs font-mono font-bold"
                        style={{ color: scoreColor(d.healthScore) }}>
                        {d.healthScore}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-line overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${d.healthScore}%`, background: scoreColor(d.healthScore) }} />
                    </div>
                    <div className="flex gap-4 text-[10px] font-mono text-muted">
                      <span>{d.memoryCount} memories</span>
                      <span>conf {d.avgConfidence}%</span>
                      <span>success {d.successRate}%</span>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </DashboardPanel>
        </AnimatedSection>

        {/* Right column */}
        <div className="space-y-6">

          {/* Health breakdown */}
          <AnimatedSection delay={0.14}>
            <DashboardPanel title="Health Breakdown">
              {!health ? (
                <EmptyState title="No data" message="Run queries to build the graph." />
              ) : (
                <div className="space-y-4">
                  <ScoreBar score={health.coverageScore}     label="Coverage"     />
                  <ScoreBar score={health.connectivityScore} label="Connectivity" />
                  <ScoreBar score={health.qualityScore}      label="Quality"      />
                </div>
              )}
            </DashboardPanel>
          </AnimatedSection>

          {/* Hub nodes */}
          {hubs.length > 0 && (
            <AnimatedSection delay={0.2}>
              <DashboardPanel
                title="Hub Nodes"
                subtitle="Highest connectivity"
              >
                <div className="space-y-2">
                  {hubs.map(n => (
                    <div key={n.nodeId} className="flex items-center gap-3 py-1">
                      <span className={`text-[10px] font-mono w-16 flex-none ${NODE_TYPE_COLOR[n.nodeType] ?? "text-muted"}`}>
                        {n.nodeType}
                      </span>
                      <span className="text-xs text-ink flex-1 truncate">{n.label}</span>
                      <span className="text-xs font-mono text-muted">{n.degree}°</span>
                    </div>
                  ))}
                </div>
              </DashboardPanel>
            </AnimatedSection>
          )}

          {/* Insights */}
          {health && health.insights.length > 0 && (
            <AnimatedSection delay={0.26}>
              <DashboardPanel title="Graph Insights">
                <ul className="space-y-2">
                  {health.insights.map((ins, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted">
                      <span className="text-signal flex-none">·</span>
                      <span className="leading-relaxed">{ins}</span>
                    </li>
                  ))}
                </ul>
              </DashboardPanel>
            </AnimatedSection>
          )}
        </div>
      </div>
    </div>
  );
}
