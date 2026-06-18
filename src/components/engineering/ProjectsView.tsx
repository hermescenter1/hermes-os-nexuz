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

interface Project {
  id:          string;
  name:        string;
  description: string;
  status:      "active" | "archived" | "completed";
  createdAt:   string;
  updatedAt:   string;
}

interface ProjectStat {
  projectId:       string;
  projectName:     string;
  memoryCount:     number;
  successRate:     number;
  failureRate:     number;
  avgConfidence:   number;
}

interface AnalyticsSummary {
  totalProjects:  number;
  activeProjects: number;
  avgFailureRate: number;
  totalMemories:  number;
}

interface AnalyticsResponse {
  summary:      AnalyticsSummary;
  projectStats: ProjectStat[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:    "text-signal bg-signal/10 border-signal/20",
  archived:  "text-muted bg-surface border-line",
  completed: "text-[--warn] bg-[--warn]/10 border-[--warn]/20",
};

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// ── Main view ──────────────────────────────────────────────────────────────

export function ProjectsView() {
  const projects = useQuery<{ projects: Project[] }>({
    queryKey: ["projects"],
    queryFn:  async () => {
      const r = await fetch("/api/projects");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
  });

  const analytics = useQuery<AnalyticsResponse>({
    queryKey: ["projects-analytics"],
    queryFn:  async () => {
      const r = await fetch("/api/projects/analytics");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
  });

  if (projects.isPending) return <LoadingState label="Loading projects…" />;
  if (projects.isError)   return <ErrorState onRetry={() => projects.refetch()} />;

  const list    = projects.data?.projects ?? [];
  const summary = analytics.data?.summary;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Stats row */}
      <AnimatedSection delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Projects"
            value={summary?.totalProjects ?? list.length}
            accent="signal"
          />
          <StatCard
            label="Active"
            value={summary?.activeProjects ?? list.filter(p => p.status === "active").length}
            accent="signal"
          />
          <StatCard
            label="Avg Failure Rate"
            value={summary ? `${summary.avgFailureRate}%` : "—"}
            accent={!summary ? "muted" : summary.avgFailureRate > 40 ? "danger" : "signal"}
            subtitle={analytics.isPending ? "Loading…" : undefined}
          />
          <StatCard
            label="Total Memories"
            value={summary?.totalMemories ?? "—"}
            accent="muted"
          />
        </div>
      </AnimatedSection>

      {/* Project grid */}
      <AnimatedSection delay={0.1}>
        <DashboardPanel
          title="Project Portfolio"
          subtitle={`${list.length} project${list.length !== 1 ? "s" : ""}`}
        >
          {list.length === 0 ? (
            <EmptyState
              title="No projects yet"
              message="Create projects via POST /api/projects and link engineering memories to them."
              icon="⊞"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map((p, i) => {
                const stat = analytics.data?.projectStats?.find(s => s.projectId === p.id);
                return (
                  <AnimatedSection key={p.id} delay={0.04 * i}>
                    <GlassCard hover className="p-5 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-ink leading-snug">{p.name}</h3>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-none ${STATUS_BADGE[p.status] ?? STATUS_BADGE.archived}`}>
                          {p.status}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted leading-relaxed line-clamp-2">
                          {p.description}
                        </p>
                      )}
                      {stat && (
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line">
                          {[
                            { l: "Memories",  v: stat.memoryCount      },
                            { l: "Success",   v: `${stat.successRate}%` },
                            { l: "Avg Conf",  v: `${stat.avgConfidence}%` },
                          ].map(({ l, v }) => (
                            <div key={l} className="text-center">
                              <p className="metric text-sm text-signal">{v}</p>
                              <p className="text-[10px] text-muted mt-0.5">{l}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] font-mono text-muted">
                        Updated {timeAgo(p.updatedAt)}
                      </p>
                    </GlassCard>
                  </AnimatedSection>
                );
              })}
            </div>
          )}
        </DashboardPanel>
      </AnimatedSection>
    </div>
  );
}
