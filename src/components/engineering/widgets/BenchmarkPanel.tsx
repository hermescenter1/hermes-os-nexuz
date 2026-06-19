"use client";

import { useQuery }        from "@tanstack/react-query";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";

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
  insights: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rateColor(rate: number) {
  return rate >= 70 ? "var(--signal)" : rate >= 40 ? "var(--warn)" : "var(--danger)";
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: BenchmarkResponse }) {
  const top5 = data.rankings.successRate.slice(0, 5);

  if (top5.length === 0) {
    return (
      <EmptyState
        title="No benchmarks"
        message="Add projects to see performance rankings."
        icon="⊞"
      />
    );
  }

  return (
    <div className="space-y-1">
      {top5.map((p, i) => (
        <div key={p.projectId} className="flex items-center gap-3 py-1.5">
          <span className="text-xs font-mono text-muted w-5 flex-none">#{i + 1}</span>
          <span className="text-xs text-ink flex-1 truncate">{p.projectName}</span>
          <span className="text-xs font-mono font-bold" style={{ color: rateColor(p.successRate) }}>
            {p.successRate}%
          </span>
        </div>
      ))}

      {data.leaders.highestSuccessRate && (
        <div className="pt-3 mt-1 border-t border-line">
          <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1.5">Leader</p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal flex-none" />
            <span className="text-xs text-signal font-medium">
              {data.leaders.highestSuccessRate.projectName}
            </span>
          </div>
        </div>
      )}

      {data.insights.length > 0 && (
        <div className="pt-3 mt-1 border-t border-line space-y-1.5">
          {data.insights.slice(0, 2).map((ins, i) => (
            <p key={i} className="text-[10px] text-muted leading-relaxed flex gap-2">
              <span className="text-signal flex-none">·</span>
              <span>{ins}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function BenchmarkPanel() {
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
        title="Benchmark Rankings"
        subtitle={data ? `${data.summary.totalProjects} project${data.summary.totalProjects !== 1 ? "s" : ""} ranked` : undefined}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? (
          <EmptyState title="No benchmark data" message="Benchmark data unavailable." icon="⊞" />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
