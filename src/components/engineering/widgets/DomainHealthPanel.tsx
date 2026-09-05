"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatNumber, formatPercent } from "@/lib/i18n/format";
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
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const top5 = [...domains]
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 5);

  if (top5.length === 0) {
    return (
      <EmptyState
        title={t("dashboard.domainHealth.emptyTitle")}
        message={t("dashboard.domainHealth.emptyMessage")}
        icon="◈"
      />
    );
  }

  return (
    <div className="space-y-3">
      {top5.map(d => (
        <GlassCard key={d.name} className="px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
          {/* Domain names are user data — capitalised, never translated. */}
            <span className="text-[0.8125rem] font-medium text-ink capitalize min-w-0 truncate" dir="auto">{d.name}</span>
            <div className="flex items-center gap-3 text-[0.6875rem] flex-none">
              <span className="text-muted">{t("dashboard.domainHealth.memories", { count: d.memoryCount })}</span>
              <span className="font-bold tabular-nums" style={{ color: scoreColor(d.healthScore) }}>
                {formatNumber(d.healthScore, locale)}
              </span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${d.healthScore}%`, background: scoreColor(d.healthScore) }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted">
            <span>{t("dashboard.domainHealth.confidence", { value: formatPercent(d.avgConfidence / 100, locale) })}</span>
            <span>{t("dashboard.domainHealth.successRate", { value: formatPercent(d.successRate / 100, locale) })}</span>
          </div>
        </GlassCard>
      ))}
      {total > 5 && (
        <p className="text-[0.6875rem] text-muted text-center pt-1">
          {t("dashboard.domainHealth.more", { count: total - 5 })}
        </p>
      )}
    </div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────

export function DomainHealthPanel() {
  const t = useTranslations("engineeringHub");
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
        title={t("dashboard.domainHealth.title")}
        subtitle={data ? t("dashboard.domainHealth.subtitle", { count: data.totalDomains }) : undefined}
        className="h-full"
      >
        {isPending ? (
          <LoadingState compact label={t("dashboard.loadingMetrics")} />
        ) : isError ? (
          <ErrorState
            title={t("dashboard.states.errorTitle")}
            message={t("dashboard.states.errorMessage")}
            retryLabel={t("dashboard.states.retry")}
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <EmptyState
            title={t("dashboard.domainHealth.unavailableTitle")}
            message={t("dashboard.domainHealth.unavailableMessage")}
            icon="◈"
          />
        ) : (
          <Content domains={data.domains} total={data.totalDomains} />
        )}
      </DashboardPanel>
    </AnimatedSection>
  );
}
