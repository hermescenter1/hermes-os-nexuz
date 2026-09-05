"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery }        from "@tanstack/react-query";
import { formatNumber, formatPercent, INVALID_DISPLAY } from "@/lib/i18n/format";
import { enumLabel } from "@/lib/i18n/enum-label";
import { AnimatedSection } from "@/components/ui/AnimatedSection";
import { StatCard }        from "@/components/ui/StatCard";

interface DashboardResponse {
  systemSummary: {
    totalProjects:  number;
    activeProjects: number;
    totalMemories:  number;
    totalDomains:   number;
  };
  systemHealth:  { overall: number };
  projectHealth: { systemRiskLevel: string };
}

type Accent = "signal" | "warn" | "danger" | "muted";

function riskAccent(level: string): Accent {
  if (level === "critical" || level === "high") return "danger";
  if (level === "medium") return "warn";
  return "signal";
}

function healthAccent(score: number): Accent {
  return score >= 70 ? "signal" : score >= 40 ? "warn" : "danger";
}

export function MetricGrid() {
  const t = useTranslations("engineeringHub");
  const locale = useLocale();
  const { data } = useQuery<DashboardResponse>({
    queryKey: ["dashboard"],
    queryFn:  async () => {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const s  = data?.systemSummary;
  const oh = data?.systemHealth.overall ?? 0;
  const rl = data?.projectHealth.systemRiskLevel ?? "";
  const count = (value: number | undefined) =>
    value === undefined ? INVALID_DISPLAY : formatNumber(value, locale);

  return (
    <AnimatedSection delay={0}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label={t("dashboard.metrics.systemHealth")}
          value={data ? formatPercent(oh / 100, locale) : INVALID_DISPLAY}
          accent={data ? healthAccent(oh) : "muted"}
          glow={oh >= 70}
        />
        <StatCard
          label={t("dashboard.metrics.totalProjects")}
          value={count(s?.totalProjects)}
          accent="signal"
        />
        <StatCard
          label={t("dashboard.metrics.activeProjects")}
          value={count(s?.activeProjects)}
          accent="signal"
        />
        <StatCard
          label={t("dashboard.metrics.memories")}
          value={count(s?.totalMemories)}
          accent="muted"
        />
        <StatCard
          label={t("dashboard.metrics.domains")}
          value={count(s?.totalDomains)}
          accent="muted"
        />
        <StatCard
          label={t("dashboard.metrics.riskLevel")}
          value={enumLabel(t, "dashboard.risk.levels", rl, { emptyLabel: INVALID_DISPLAY })}
          accent={data ? riskAccent(rl) : "muted"}
        />
      </div>
    </AnimatedSection>
  );
}
