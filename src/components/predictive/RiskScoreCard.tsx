"use client";

import { GlassCard }              from "@/components/ui/GlassCard";
import ConfidenceIndicator        from "./ConfidenceIndicator";
import EvidencePanel              from "./EvidencePanel";
import InsufficientDataCard       from "./InsufficientDataCard";
import type { RiskScoreResult, InsufficientDataResult } from "@/lib/predictive/types";

interface Props {
  result: RiskScoreResult | InsufficientDataResult | null;
  assetId?: string;
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 40) return "text-amber-400";
  return "text-cyan-400";
}

function riskLabel(score: number): string {
  if (score >= 70) return "High Risk";
  if (score >= 40) return "Medium Risk";
  return "Low Risk";
}

export default function RiskScoreCard({ result, assetId }: Props) {
  if (!result) {
    return <InsufficientDataCard banner="No risk score available." />;
  }

  if ("state" in result) {
    return <InsufficientDataCard reason={result.reason} />;
  }

  const r = result;
  const segments = [
    { label: "Health Trend",    value: r.healthTrendScore,    max: 30 },
    { label: "Alarm Trend",     value: r.alarmTrendScore,     max: 25 },
    { label: "KPI Degradation", value: r.kpiDegradationScore, max: 20 },
    { label: "Tel. Quality",    value: r.telQualityScore,     max: 15 },
    { label: "Tel. Freshness",  value: r.telFreshnessScore,   max: 10 },
  ];

  return (
    <GlassCard className="overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-white/40 mb-1">Risk Score</p>
            <p className={`text-5xl font-bold ${riskColor(r.riskScore)}`}>{Math.round(r.riskScore)}</p>
            <p className={`text-sm mt-1 ${riskColor(r.riskScore)}`}>{riskLabel(r.riskScore)}</p>
          </div>
          <div className="text-right space-y-1">
            <ConfidenceIndicator confidence={r.confidence} />
            <p className="text-white/30 font-mono text-xs">criticality ×{r.criticalityFactor.toFixed(1)}</p>
            <p className="text-white/20 font-mono text-xs">{r.formulaVersion} / {r.weightSetVersion}</p>
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${r.riskScore >= 70 ? "bg-red-500" : r.riskScore >= 40 ? "bg-amber-500" : "bg-cyan-500"}`}
            style={{ width: `${Math.min(100, r.riskScore)}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="px-5 py-4 space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-white/40 text-xs w-28 shrink-0">{s.label}</span>
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-signal/60 rounded-full"
                style={{ width: `${s.max > 0 ? (s.value / s.max) * 100 : 0}%` }}
              />
            </div>
            <span className="text-white/50 font-mono text-xs w-12 text-right">
              {s.value.toFixed(0)}/{s.max}
            </span>
          </div>
        ))}
      </div>

      {/* Evidence */}
      {r.evidence.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-white/30 font-mono text-xs uppercase mb-2">Supporting Evidence</p>
          <EvidencePanel evidence={r.evidence} />
        </div>
      )}
    </GlassCard>
  );
}
