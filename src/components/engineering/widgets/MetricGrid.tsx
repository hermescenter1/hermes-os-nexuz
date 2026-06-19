"use client";

import { useQuery }        from "@tanstack/react-query";
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
  const rl = data?.projectHealth.systemRiskLevel ?? "—";

  return (
    <AnimatedSection delay={0}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="System Health"
          value={data ? `${oh}%` : "—"}
          accent={data ? healthAccent(oh) : "muted"}
          glow={oh >= 70}
        />
        <StatCard
          label="Total Projects"
          value={s?.totalProjects ?? "—"}
          accent="signal"
        />
        <StatCard
          label="Active Projects"
          value={s?.activeProjects ?? "—"}
          accent="signal"
        />
        <StatCard
          label="Memories"
          value={s?.totalMemories ?? "—"}
          accent="muted"
        />
        <StatCard
          label="Domains"
          value={s?.totalDomains ?? "—"}
          accent="muted"
        />
        <StatCard
          label="Risk Level"
          value={rl === "—" ? "—" : rl.toUpperCase()}
          accent={data ? riskAccent(rl) : "muted"}
        />
      </div>
    </AnimatedSection>
  );
}
