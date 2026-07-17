/**
 * PHASE 87F — dashboard experience primitives.
 *
 * DS-token building blocks for the premium operational command surface on the
 * authenticated dashboard landing. Presentational; they receive already-fetched,
 * already-authorized snapshot data (no data fetching, no authorization here) and
 * take an injected Link so they stay locale-correct without importing routing.
 */
export { DashboardSection, type DashboardSectionProps } from "./DashboardSection";
export { OperationalStatusHeader, type OperationalStatusHeaderProps } from "./OperationalStatusHeader";
export { AttentionPanel, type AttentionItem } from "./AttentionPanel";
export { RiskEvidence, type RiskEvidenceProps, type RiskFactor } from "./RiskEvidence";
export { SafeActionGrid, type SafeAction } from "./SafeActionGrid";
export { DashboardSkeleton, DataUnavailableState } from "./DashboardStates";
export {
  posture,
  SEVERITY_DOT,
  SEVERITY_TEXT,
  SEVERITY_GLYPH,
  SEVERITY_RANK,
  POSTURE_TONE,
  type DashboardPosture,
} from "./severity";
