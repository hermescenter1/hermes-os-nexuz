"use client";

import { useState }         from "react";
import { useQuery }         from "@tanstack/react-query";
import { AnimatedSection }  from "@/components/ui/AnimatedSection";
import { StatCard }         from "@/components/ui/StatCard";
import { DashboardPanel }   from "@/components/ui/DashboardPanel";
import { GlassCard }        from "@/components/ui/GlassCard";
import { LoadingState }     from "@/components/ui/LoadingState";
import { ErrorState }       from "@/components/ui/ErrorState";
import { EmptyState }       from "@/components/ui/EmptyState";

// ── Types ──────────────────────────────────────────────────────────────────

interface Memory {
  id:              string;
  query:           string;
  domain:          string;
  analysisSummary: string;
  confidence:      number;
  outcome:         "unknown" | "success" | "partial" | "failed";
  projectId?:      string;
  createdAt:       string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const OUTCOME_BADGE: Record<string, string> = {
  success: "text-signal bg-signal/10 border-signal/20",
  partial: "text-[--warn] bg-[--warn]/10 border-[--warn]/20",
  failed:  "text-[--danger] bg-[--danger]/10 border-[--danger]/20",
  unknown: "text-muted bg-surface border-line",
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "var(--signal)" : value >= 40 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-muted w-7 text-right">{value}%</span>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export function MemoryView() {
  const [search, setSearch] = useState("");

  const { data, isPending, isError, refetch } = useQuery<{ memories: Memory[] }>({
    queryKey: ["memories"],
    queryFn:  async () => {
      const r = await fetch("/api/memory?limit=100");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
  });

  if (isPending) return <LoadingState label="Loading engineering memory…" />;
  if (isError)   return <ErrorState onRetry={() => refetch()} />;

  const all = data?.memories ?? [];

  // Derived stats
  const avgConf = all.length
    ? Math.round(all.reduce((s, m) => s + m.confidence, 0) / all.length)
    : 0;
  const successCount = all.filter(m => m.outcome === "success").length;
  const domains      = [...new Set(all.map(m => m.domain))];

  // Filter
  const filtered = search
    ? all.filter(
        m =>
          m.query.toLowerCase().includes(search.toLowerCase()) ||
          m.domain.toLowerCase().includes(search.toLowerCase()) ||
          m.analysisSummary.toLowerCase().includes(search.toLowerCase())
      )
    : all;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Stats */}
      <AnimatedSection delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Memories" value={all.length} accent="signal" />
          <StatCard label="Avg Confidence" value={`${avgConf}%`}
            accent={avgConf >= 70 ? "signal" : avgConf >= 40 ? "warn" : "danger"} />
          <StatCard label="Successes" value={successCount}
            subtitle={`${all.length ? Math.round(successCount / all.length * 100) : 0}% of total`} />
          <StatCard label="Domains Covered" value={domains.length} accent="muted" />
        </div>
      </AnimatedSection>

      {/* Memory list */}
      <AnimatedSection delay={0.1}>
        <DashboardPanel
          title="Engineering Memories"
          subtitle={`${filtered.length} of ${all.length} shown`}
          actions={
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs bg-surface border border-line rounded-lg px-3 py-1.5 text-ink placeholder:text-muted
                         focus:outline-none focus:border-signal/40 transition-colors w-44"
            />
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              title={search ? "No matches" : "No memories yet"}
              message={
                search
                  ? "Try a different search term."
                  : "Memories are captured automatically when HERMES_AUTO_MEMORY_ENABLED=true, or created via POST /api/memory."
              }
              icon="◎"
            />
          ) : (
            <div className="space-y-3">
              {filtered.slice(0, 50).map((m, i) => (
                <AnimatedSection key={m.id} delay={0.02 * Math.min(i, 10)}>
                  <GlassCard hover className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-ink font-medium leading-relaxed flex-1 line-clamp-2">
                        {m.query}
                      </p>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex-none ${OUTCOME_BADGE[m.outcome]}`}>
                        {m.outcome}
                      </span>
                    </div>
                    {m.analysisSummary && (
                      <p className="text-xs text-muted leading-relaxed line-clamp-2">
                        {m.analysisSummary}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-[10px] font-mono text-signal">{m.domain}</span>
                      <div className="flex-1">
                        <ConfidenceBar value={m.confidence} />
                      </div>
                      <span className="text-[10px] font-mono text-muted flex-none">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </GlassCard>
                </AnimatedSection>
              ))}
              {filtered.length > 50 && (
                <p className="text-xs text-muted text-center py-2">
                  Showing 50 of {filtered.length} results
                </p>
              )}
            </div>
          )}
        </DashboardPanel>
      </AnimatedSection>
    </div>
  );
}
