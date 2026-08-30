/**
 * PHASE 104-I.D2 — the one place severity becomes colour.
 *
 * Typed as `Record<AlertSeverity, …>`, never `Record<string, …>`. The shipped
 * dashboard used an untyped string map that served two different semantic
 * domains at once (lifecycle status AND trend direction), which is how the
 * literal value `"down"` ended up mapped to the SUCCESS accent. An exhaustive
 * record over a closed union makes that class of mistake unrepresentable: a new
 * severity fails the build instead of silently rendering green.
 */
import type { AlertSeverity } from "@/lib/operations/types";

export const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  critical: "text-danger",
  warning:  "text-warn",
  info:     "text-muted",
};

export const SEVERITY_FILL: Record<AlertSeverity, string> = {
  critical: "bg-danger",
  warning:  "bg-warn",
  info:     "bg-muted/60",
};

/**
 * Gate A.1 §6 — `info` no longer borrows `hs--nominal`.
 *
 * `.hs--nominal` is visually neutral (steel, not the affirmative teal), so it
 * was never painting informational alarms as success. The problem was semantic:
 * "nominal" asserts *the system is operating normally*, which is a posture claim
 * an informational ALARM has no standing to make. A reader scanning badges
 * should not see an alarm labelled with the vocabulary of health.
 *
 * `.hs-badge` carries only shape and type, so the neutral treatment is composed
 * from the metadata tokens instead — no new stylesheet class, no borrowed
 * posture.
 */
export const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: "hs-badge hs--risk",
  warning:  "hs-badge hs--warning",
  info:     "hs-badge border-line bg-surface text-metadata",
};

export const SEVERITY_ROW: Record<AlertSeverity, string> = {
  critical: "border-danger/25 bg-danger/[0.04]",
  warning:  "border-warn/25 bg-warn/[0.03]",
  info:     "border-line bg-surface",
};
