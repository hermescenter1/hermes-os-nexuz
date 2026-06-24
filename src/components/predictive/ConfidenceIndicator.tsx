"use client";

import type { PredictiveConfidence } from "@/lib/predictive/types";

interface Props {
  confidence: PredictiveConfidence;
  label?: string;
}

const STYLES: Record<PredictiveConfidence, { dot: string; text: string; label: string }> = {
  HIGH:   { dot: "bg-cyan-400",   text: "text-cyan-400",   label: "High" },
  MEDIUM: { dot: "bg-amber-400",  text: "text-amber-400",  label: "Medium" },
  LOW:    { dot: "bg-white/30",   text: "text-ink/40",   label: "Low" },
};

export default function ConfidenceIndicator({ confidence, label }: Props) {
  const s = STYLES[confidence];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className={`font-mono text-xs ${s.text}`}>
        {label ?? s.label} Confidence
      </span>
    </span>
  );
}
