"use client";

import { useQuery }        from "@tanstack/react-query";
import { DashboardPanel }  from "@/components/ui/DashboardPanel";
import { GlassCard }       from "@/components/ui/GlassCard";
import { LoadingState }    from "@/components/ui/LoadingState";
import { ErrorState }      from "@/components/ui/ErrorState";
import { EmptyState }      from "@/components/ui/EmptyState";
import { AnimatedSection } from "@/components/ui/AnimatedSection";

// ── Types ─────────────────────────────────────────────────────────────────

interface Domain {
  name:          string;
  memoryCount:   number;
  healthScore:   number;
  successRate:   number;
  avgConfidence: number;
}

interface DomainsResponse {
  totalDomains: number;
  domains:      Domain[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

// ── Content ───────────────────────────────────────────────────────────────

function Content({ domains, total }: { domains: Domain[]; total: number }) {
  const top5 = [...domains]
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 5);

  if (top5.length === 0) {
    return (
      <EmptyState
        title="No domains"
        message="Domains appear as memories are linked."
        icon="◈"
      />
    );
  }

  return (
    <div className="space-y-3">
      {top5.map(d => (
        <GlassCard key={d.name} className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-ink capitalize">{d.name}</span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-muted">{d.memoryCount}m</span>
              <span className="font-bold" style={{ color: scoreColor(d.healthScore) }}>
                {d.healthScore}
              </span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${d.healthScore}%`, background: scoreColor(d.healthScore) }}
            />
          </div>
          <div className="flex gap-4 text-[10px] font-mono text-muted">
            <span>conf {d.avgConfidence}%</span>
            <span>success {d.successRate}%</span>
          </div>
        </GlassCard>
      ))}
      {total > 5 && (
        <p className="text-[10px] font-mono text-muted text-center pt-1">
          +{total - 5} more domains
        </p>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function DomainHealthPanel() {
  const { data, isPending, isError, refetch } = useQuery<DomainsResponse>({
    queryKey: ["domains"],
    queryFn:  async () => {
      const r = await fetch("/api/domains");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <AnimatedSection delay={0.12}>
      <DashboardPanel
        title="Domain Health"
        subtitle={data ? `${data.totalDomains} domain${data.totalDomains !== 1 ? "s" : ""}` : undefined}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? (
          <EmptyState title="No domain data" message="Domain data unavailable." icon="◈" />
        ) : (
          <Content domains={data.domains} total={data.totalDomains} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
