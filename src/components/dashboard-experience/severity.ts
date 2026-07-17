// PHASE 87F — shared severity → token mapping (JSX-free so it's unit-testable
// and importable by both server and client dashboard components). Severity is
// NEVER conveyed by color alone: every consumer pairs the tone with a text
// label + an icon glyph.

import type { Severity } from "@/lib/services/types";

export type DashboardPosture = "operational" | "elevated" | "critical";

export const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-status-danger",
  high: "bg-status-danger/70",
  medium: "bg-status-warning",
  low: "bg-text-muted/50",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-status-danger",
  high: "text-status-danger",
  medium: "text-status-warning",
  low: "text-text-muted",
};

/** Non-color redundant marker so severity is not color-only. */
export const SEVERITY_GLYPH: Record<Severity, string> = {
  critical: "▲",
  high: "▲",
  medium: "◆",
  low: "•",
};

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Overall operational posture from the real snapshot severity counts:
 * any critical → critical; else any high → elevated; else operational.
 */
export function posture(criticalCount: number, highCount: number): DashboardPosture {
  if (criticalCount > 0) return "critical";
  if (highCount > 0) return "elevated";
  return "operational";
}

export const POSTURE_TONE: Record<DashboardPosture, { dot: string; text: string; ring: string }> = {
  operational: { dot: "bg-status-success", text: "text-status-success", ring: "border-status-success-border" },
  elevated: { dot: "bg-status-warning", text: "text-status-warning", ring: "border-status-warning-border" },
  critical: { dot: "bg-status-danger", text: "text-status-danger", ring: "border-border-danger" },
};
