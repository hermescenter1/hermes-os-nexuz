"use client";

import ConfidenceIndicator    from "./ConfidenceIndicator";
import EvidencePanel          from "./EvidencePanel";
import type { MaintenanceRecommendationResult } from "@/lib/predictive/types";

interface Props {
  recommendation: MaintenanceRecommendationResult;
}

const PRIORITY_STYLES = {
  HIGH:   "border-red-500/40 bg-red-500/5",
  MEDIUM: "border-amber-500/40 bg-amber-500/5",
  LOW:    "border-white/10 bg-white/5",
};

const PRIORITY_DOT = {
  HIGH:   "bg-red-400",
  MEDIUM: "bg-amber-400",
  LOW:    "bg-white/30",
};

const TYPE_LABELS: Record<string, string> = {
  inspection:         "Inspection",
  alarm_review:       "Alarm Review",
  maintenance_review: "Maintenance Review",
  comms_inspection:   "Comms Inspection",
};

export default function RecommendationCard({ recommendation: rec }: Props) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${PRIORITY_STYLES[rec.priority]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[rec.priority]}`} />
            <span className="font-mono text-xs uppercase tracking-wider text-ink/40">
              {rec.priority} · {TYPE_LABELS[rec.recommendationType] ?? rec.recommendationType}
            </span>
          </div>
          <p className="font-semibold text-ink text-sm">{rec.title}</p>
          <p className="text-ink/60 text-xs">{rec.description}</p>
        </div>
        <ConfidenceIndicator confidence={rec.confidence} />
      </div>

      {rec.evidence.length > 0 && (
        <details className="group">
          <summary className="text-ink/30 font-mono text-xs cursor-pointer hover:text-ink/50">
            {rec.evidence.length} evidence record{rec.evidence.length !== 1 ? "s" : ""} ▾
          </summary>
          <div className="mt-2">
            <EvidencePanel evidence={rec.evidence} />
          </div>
        </details>
      )}

      <p className="text-ink/20 font-mono text-xs">{rec.formulaVersion} / {rec.weightSetVersion}</p>
    </div>
  );
}
