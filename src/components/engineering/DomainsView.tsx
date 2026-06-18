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

interface Domain {
  name:            string;
  memoryCount:     number;
  avgConfidence:   number;
  successRate:     number;
  failureRate:     number;
  feedbackRate:    number;
  healthScore:     number;
}

interface DomainsResponse {
  storageMode:  string;
  totalDomains: number;
  domains:      Domain[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 75 ? "var(--signal)" : s >= 50 ? "var(--warn)" : "var(--danger)";
}

function ScorePill({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="metric text-sm font-bold" style={{ color: scoreColor(value) }}>
        {value}
      </span>
      <span className="text-[10px] font-mono text-muted">{label}</span>
    </div>
  );
}

function HealthArc({ score }: { score: number }) {
  const r   = 28;
  const c   = Math.PI * r;           // half circumference (arc, not full circle)
  const pct = Math.min(100, score);
  return (
    <svg width="68" height="40" viewBox="0 0 68 40" className="flex-none">
      <path d="M6 36 A28 28 0 0 1 62 36" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M6 36 A28 28 0 0 1 62 36" fill="none"
        stroke={scoreColor(score)} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x="34" y="36" textAnchor="middle" dominantBaseline="auto"
        fill="var(--ink)" fontSize="11" fontWeight="700" fontFamily="var(--font-display)">
        {score}
      </text>
    </svg>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────

export function DomainsView() {
  const { data, isPending, isError, refetch } = useQuery<DomainsResponse>({
    queryKey: ["domains"],
    queryFn:  async () => {
      const r = await fetch("/api/domains");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
  });

  if (isPending) return <LoadingState label="Loading domain expertise…" />;
  if (isError)   return <ErrorState onRetry={() => refetch()} />;

  const domains = data?.domains ?? [];
  const total   = data?.totalDomains ?? domains.length;

  const avgHealth  = domains.length
    ? Math.round(domains.reduce((s, d) => s + d.healthScore, 0) / domains.length)
    : 0;
  const topDomain  = domains.length
    ? [...domains].sort((a, b) => b.healthScore - a.healthScore)[0]
    : null;
  const gapDomains = domains.filter(d => d.memoryCount < 3).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Stats */}
      <AnimatedSection delay={0}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Domains"   value={total} accent="signal" />
          <StatCard label="Avg Health"      value={`${avgHealth}%`}
            accent={avgHealth >= 70 ? "signal" : avgHealth >= 40 ? "warn" : "danger"} />
          <StatCard label="Top Domain"      value={topDomain?.name ?? "—"} accent="muted" />
          <StatCard label="Coverage Gaps"   value={gapDomains}
            accent={gapDomains > 0 ? "warn" : "signal"}
            subtitle="domains with < 3 memories" />
        </div>
      </AnimatedSection>

      {/* Domain cards */}
      <AnimatedSection delay={0.1}>
        <DashboardPanel
          title="Domain Expertise Map"
          subtitle={`${domains.length} active domain${domains.length !== 1 ? "s" : ""}`}
        >
          {domains.length === 0 ? (
            <EmptyState
              title="No domains yet"
              message="Domains are derived from engineering memories. Add memories with domain tags via POST /api/memory."
              icon="◈"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {domains.map((d, i) => (
                <AnimatedSection key={d.name} delay={0.04 * Math.min(i, 8)}>
                  <GlassCard
                    hover
                    glow={d.healthScore >= 75}
                    className="p-5 flex flex-col gap-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-ink capitalize">{d.name}</h3>
                        <p className="text-[10px] font-mono text-muted mt-0.5">
                          {d.memoryCount} memor{d.memoryCount !== 1 ? "ies" : "y"}
                        </p>
                      </div>
                      <HealthArc score={d.healthScore} />
                    </div>

                    {/* Metric row */}
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-line">
                      <ScorePill value={d.avgConfidence} label="Conf" />
                      <ScorePill value={d.successRate}   label="Success" />
                      <ScorePill value={d.feedbackRate}  label="Feedback" />
                    </div>

                    {/* Confidence bar */}
                    <div className="h-1 rounded-full bg-line overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${d.avgConfidence}%`, background: scoreColor(d.avgConfidence) }} />
                    </div>
                  </GlassCard>
                </AnimatedSection>
              ))}
            </div>
          )}
        </DashboardPanel>
      </AnimatedSection>
    </div>
  );
}
