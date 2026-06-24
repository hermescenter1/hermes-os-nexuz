"use client";

import { GlassCard }        from "@/components/ui/GlassCard";
import InsufficientDataCard from "./InsufficientDataCard";
import type { BaselineResult, InsufficientDataResult } from "@/lib/predictive/types";

interface Props {
  baseline: BaselineResult | InsufficientDataResult | null;
}

function fmt(v: number | null | undefined, dp = 1): string {
  return v != null ? v.toFixed(dp) : "—";
}

export default function BaselineCard({ baseline }: Props) {
  if (!baseline) return <InsufficientDataCard banner="No baseline computed yet for this asset." />;
  if ("state" in baseline) return <InsufficientDataCard reason={(baseline as InsufficientDataResult).reason} />;

  const b = baseline as BaselineResult;
  const rows = [
    { label: "Avg Health Score",  value: `${fmt(b.avgHealthScore)} ± ${fmt(b.stdDevHealthScore)}` },
    { label: "Avg Efficiency",    value: fmt(b.avgEfficiency) + "%" },
    { label: "Avg Availability",  value: fmt(b.avgAvailability) + "%" },
    { label: "Avg Alarm Rate",    value: b.avgAlarmRate != null ? `${(b.avgAlarmRate * 100).toFixed(1)}%` : "—" },
    { label: "Sample Count",      value: String(b.sampleCount) },
    { label: "Coverage",          value: `${b.coverageDays.toFixed(1)} days (${b.windowDays}d window)` },
  ];

  return (
    <GlassCard>
      <div className="px-5 pt-5 pb-2 border-b border-white/5">
        <p className="font-mono text-xs uppercase tracking-widest text-ink/40">
          Baseline · {b.windowDays}-day window
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-5 py-2.5">
            <span className="text-ink/50 text-xs">{r.label}</span>
            <span className="text-ink font-mono text-xs">{r.value}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
