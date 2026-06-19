"use client";

import { useQuery }        from "@tanstack/react-query";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardResponse {
  projectHealth: {
    avgFailureRate:   number;
    highRiskProjects: number;
    systemRiskLevel:  "low" | "medium" | "high" | "critical";
    byStatus:         { active: number; archived: number; completed: number };
  };
  systemHealth:  { overall: number; memory: number; projects: number; graph: number };
  memoryHealth:  { successRate: number; avgConfidence: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RISK_STYLE: Record<string, { color: string; label: string }> = {
  critical: { color: "var(--danger)", label: "CRITICAL" },
  high:     { color: "var(--danger)", label: "HIGH"     },
  medium:   { color: "var(--warn)",   label: "MEDIUM"   },
  low:      { color: "var(--signal)", label: "LOW"      },
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? "var(--signal)" : score >= 40 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ data }: { data: DashboardResponse }) {
  const { projectHealth, systemHealth } = data;
  const rs = RISK_STYLE[projectHealth.systemRiskLevel] ?? RISK_STYLE.low;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <span className="text-2xl font-bold metric" style={{ color: rs.color }}>
          {rs.label}
        </span>
        <div className="text-xs text-muted space-y-1">
          <p>
            {projectHealth.highRiskProjects} high-risk project
            {projectHealth.highRiskProjects !== 1 ? "s" : ""}
          </p>
          <p>Avg failure rate: {projectHealth.avgFailureRate}%</p>
          <p>
            {projectHealth.byStatus.active} active ·{" "}
            {projectHealth.byStatus.completed} completed ·{" "}
            {projectHealth.byStatus.archived} archived
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <ScoreBar label="Memory health"   score={systemHealth.memory}   />
        <ScoreBar label="Projects health" score={systemHealth.projects} />
        <ScoreBar label="Graph health"    score={systemHealth.graph}    />
      </div>
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function RiskOverviewPanel() {
  const { data, isPending, isError, refetch } = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn:  async () => {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.08}>
      <DashboardPanel title="Risk Overview" subtitle="System risk assessment" className="h-full">
        {isPending ? (
          <LoadingState compact />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? (
          <EmptyState title="No risk data" message="Dashboard data unavailable." />
        ) : (
          <Content data={data} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
