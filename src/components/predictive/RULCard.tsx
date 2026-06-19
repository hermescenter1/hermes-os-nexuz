"use client";

import { GlassCard }          from "@/components/ui/GlassCard";
import ConfidenceIndicator    from "./ConfidenceIndicator";
import EvidencePanel          from "./EvidencePanel";
import InsufficientDataCard   from "./InsufficientDataCard";
import type { RULResult, InsufficientDataResult } from "@/lib/predictive/types";

interface Props {
  result: RULResult | InsufficientDataResult | null;
}

export default function RULCard({ result }: Props) {
  if (!result) return <InsufficientDataCard banner="No RUL estimate available." />;

  if ("state" in result && result.state === "insufficientData") {
    return <InsufficientDataCard reason={(result as InsufficientDataResult).reason} />;
  }

  const r = result as RULResult;

  if (r.state === "insufficientData") {
    return <InsufficientDataCard />;
  }

  if (r.state === "no_degradation") {
    return (
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span className="font-mono text-xs uppercase tracking-widest text-cyan-400">No Degradation</span>
        </div>
        <p className="text-white/60 text-sm">Asset is stable or improving — no RUL estimate needed.</p>
        <p className="text-white/30 font-mono text-xs">
          Slope: {r.degradationRate !== undefined && r.degradationRate !== null ? `+${r.degradationRate.toFixed(4)}/day` : "n/a"} · Class: {r.degradationClass}
        </p>
        <ConfidenceIndicator confidence={r.confidence} />
        {r.evidence.length > 0 && <EvidencePanel evidence={r.evidence} />}
      </GlassCard>
    );
  }

  if (r.state === "at_threshold") {
    return (
      <GlassCard className="p-5 space-y-3 border-red-500/40">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
          <span className="font-mono text-xs uppercase tracking-widest text-red-400">At / Over Threshold</span>
        </div>
        <p className="text-red-300 text-sm font-semibold">Immediate inspection recommended.</p>
        <p className="text-white/50 text-xs">
          Current score: {r.currentScore?.toFixed(1) ?? "n/a"} — at or below the failure threshold.
        </p>
        <ConfidenceIndicator confidence={r.confidence} />
        {r.evidence.length > 0 && <EvidencePanel evidence={r.evidence} />}
      </GlassCard>
    );
  }

  // state === "estimated"
  return (
    <GlassCard className="overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-white/5">
        <p className="font-mono text-xs uppercase tracking-widest text-white/40 mb-2">
          Remaining Useful Life (Estimated Range)
        </p>
        <div className="flex items-end gap-3">
          <div className="text-center">
            <p className="text-white/30 text-xs mb-1">Min</p>
            <p className="text-3xl font-bold text-amber-400">{Math.round(r.minDays ?? 0)}</p>
            <p className="text-white/30 text-xs">days</p>
          </div>
          <p className="text-white/20 text-2xl mb-2">–</p>
          <div className="text-center">
            <p className="text-white/30 text-xs mb-1">Max</p>
            <p className="text-3xl font-bold text-cyan-400">{Math.round(r.maxDays ?? 0)}</p>
            <p className="text-white/30 text-xs">days</p>
          </div>
          <div className="ml-auto text-right space-y-1">
            <ConfidenceIndicator confidence={r.confidence} />
            <p className="text-white/20 font-mono text-xs">{r.formulaVersion}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-2 text-xs text-white/50">
        <div className="flex justify-between">
          <span>Current Score</span>
          <span className="font-mono">{r.currentScore?.toFixed(1) ?? "n/a"} / 100</span>
        </div>
        <div className="flex justify-between">
          <span>Degradation Rate</span>
          <span className="font-mono">{r.degradationRate?.toFixed(4) ?? "n/a"} /day</span>
        </div>
        <div className="flex justify-between">
          <span>Degradation Class</span>
          <span className="font-mono capitalize">{r.degradationClass.replace("_", " ")}</span>
        </div>
      </div>
      {r.evidence.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-white/30 font-mono text-xs uppercase mb-2">Supporting Evidence</p>
          <EvidencePanel evidence={r.evidence} />
        </div>
      )}
    </GlassCard>
  );
}
