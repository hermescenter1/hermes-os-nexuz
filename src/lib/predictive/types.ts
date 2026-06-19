/**
 * Predictive Maintenance types — Phase 39.
 *
 * SAFETY INVARIANT: PM is observe/analyze only.
 * No control commands, no PLC writes, no autonomous actions.
 *
 * DATA-SUFFICIENCY GATE: all computation functions check these named thresholds
 * before emitting any number. Below the gate → insufficientData state, never a
 * fabricated prediction.
 *
 * AUDITABILITY: every persisted prediction carries formulaVersion + weightSetVersion
 * in metadata so historical predictions stay interpretable after formula changes.
 */

// ── Data-Sufficiency Gate Constants ──────────────────────────────────────────

/** Minimum AssetHealthHistory points required before computing degradation. */
export const MIN_HEALTH_POINTS_FOR_DEGRADATION = 5;

/** Minimum calendar-day span of health history required for degradation. */
export const MIN_HISTORY_DAYS_FOR_DEGRADATION = 7;

/** Minimum TelemetryRecord count for telemetry quality/freshness scoring. */
export const MIN_TELEMETRY_RECORDS_FOR_QUALITY = 20;

/** Minimum KPIRecord count required to assess KPI degradation. */
export const MIN_KPI_RECORDS_FOR_TREND = 5;

/** Minimum AssetHealthHistory points for RUL estimation (stricter than degradation). */
export const MIN_HEALTH_POINTS_FOR_RUL = 10;

/** Minimum calendar-day span for RUL estimation. */
export const MIN_HISTORY_DAYS_FOR_RUL = 14;

// ── Risk Score Weight Constants ───────────────────────────────────────────────

/** Max contribution of health trend to risk score (0–30). */
export const WEIGHT_HEALTH_TREND = 0.30;

/** Max contribution of alarm trend to risk score (0–25). */
export const WEIGHT_ALARM_TREND = 0.25;

/** Max contribution of KPI degradation to risk score (0–20). */
export const WEIGHT_KPI_DEGRADATION = 0.20;

/** Max contribution of telemetry quality to risk score (0–15). */
export const WEIGHT_TEL_QUALITY = 0.15;

/** Max contribution of telemetry freshness to risk score (0–10). */
export const WEIGHT_TEL_FRESHNESS = 0.10;

/** Criticality multiplier per IndustrialAssetType. Higher = more critical. */
export const CRITICALITY_BY_ASSET_TYPE: Record<string, number> = {
  PLC:        1.2,
  SCADA:      1.3,
  HMI:        0.9,
  MOTOR:      1.0,
  PUMP:       1.0,
  COMPRESSOR: 1.1,
  CONVEYOR:   1.0,
  SENSOR:     0.8,
  DRIVE:      1.0,
  PANEL:      1.1,
  OTHER:      1.0,
};

// ── RUL Constants ─────────────────────────────────────────────────────────────

/** Health score below which an asset needs immediate inspection (failure threshold). */
export const FAILURE_THRESHOLD_SCORE = 20;

/** Maximum RUL estimate returned — cap to prevent absurd projections. */
export const RUL_MAX_DAYS = 365;

/** Uncertainty factor: RUL range = [point × (1 - UNCERTAINTY), point × (1 + UNCERTAINTY)]. */
export const RUL_UNCERTAINTY_FACTOR = 0.30;

// ── Degradation Classification Thresholds ────────────────────────────────────

/** Slope above which the asset is classified as improving (score/day). */
export const SLOPE_IMPROVING_THRESHOLD = 0.5;

/** Slope magnitude below which the asset is classified as stable (score/day). */
export const SLOPE_STABLE_THRESHOLD = 0.1;

/** Slope below which asset is rapidly degrading (score/day, negative). */
export const SLOPE_RAPIDLY_DEGRADING_THRESHOLD = -1.5;

// ── Versioning ────────────────────────────────────────────────────────────────

export const FORMULA_VERSION = "risk_v1";
export const WEIGHT_SET_VERSION = "ws_v1";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PredictiveConfidence = "LOW" | "MEDIUM" | "HIGH";

export type DegradationClass =
  | "improving"
  | "stable"
  | "degrading"
  | "rapidly_degrading"
  | "insufficientData";

export type FailureProbabilityLevel = "LOW" | "MEDIUM" | "HIGH" | "insufficientData";

export type RULState =
  | "estimated"        // normal: minDays/maxDays are populated
  | "no_degradation"   // slope ≥ 0 — no deterioration detected
  | "at_threshold"     // current score ≤ FAILURE_THRESHOLD — immediate inspection
  | "insufficientData"; // data gate not met

/**
 * A traceable piece of evidence linking a prediction to a real DB record.
 * Every risk score, RUL, recommendation, and failure probability MUST carry
 * at least one evidence item referencing a real record ID.
 */
export interface PredictiveEvidence {
  type:        "health" | "kpi" | "telemetry" | "alarm" | "asset" | "insight";
  recordId?:   string;  // DB record ID for traceability
  assetId?:    string;
  tag?:        string;
  timeframe?:  string;
  value?:      number;
  description: string;
}

export interface InsufficientDataResult {
  state:      "insufficientData";
  confidence: "LOW";
  reason:     string;
  assetId:    string;
}

export interface RiskScoreResult {
  assetId:              string;
  riskScore:            number;        // 0–100
  confidence:           PredictiveConfidence;
  healthTrendScore:     number;        // 0–30
  alarmTrendScore:      number;        // 0–25
  kpiDegradationScore:  number;        // 0–20
  telQualityScore:      number;        // 0–15
  telFreshnessScore:    number;        // 0–10
  criticalityFactor:    number;
  evidence:             PredictiveEvidence[];
  formulaVersion:       string;
  weightSetVersion:     string;
}

export interface DegradationResult {
  assetId:          string;
  slopePerDay:      number;          // health score change per day (negative = degrading)
  degradationClass: DegradationClass;
  confidence:       PredictiveConfidence;
  sampleCount:      number;
  coverageDays:     number;
  method:           "theil_sen";     // always Theil-Sen in this implementation
  evidence:         PredictiveEvidence[];
}

export interface FailureProbabilityResult {
  assetId:          string;
  probability:      FailureProbabilityLevel;
  confidence:       PredictiveConfidence;
  riskScore:        number;
  degradationClass: DegradationClass;
  alarmTrend:       "rising" | "stable" | "falling" | "unknown";
  healthTrend:      "improving" | "stable" | "declining" | "unknown";
  evidence:         PredictiveEvidence[];
  formulaVersion:   string;
  weightSetVersion: string;
}

export interface RULResult {
  assetId:         string;
  state:           RULState;
  minDays?:        number;
  maxDays?:        number;
  currentScore?:   number;
  degradationRate?: number;         // score/day (negative)
  degradationClass: DegradationClass;
  confidence:      PredictiveConfidence;
  evidence:        PredictiveEvidence[];
  formulaVersion:  string;
  weightSetVersion: string;
}

export interface MaintenanceRecommendationResult {
  id:                   string;     // deterministic slug
  assetId:              string;
  recommendationType:   "inspection" | "alarm_review" | "maintenance_review" | "comms_inspection";
  priority:             "HIGH" | "MEDIUM" | "LOW";
  title:                string;
  description:          string;
  confidence:           PredictiveConfidence;
  evidence:             PredictiveEvidence[];
  evidenceRecordIds:    string[];
  formulaVersion:       string;
  weightSetVersion:     string;
}

export interface BaselineResult {
  assetId:            string;
  windowDays:         number;
  avgHealthScore:     number | null;
  stdDevHealthScore:  number | null;
  avgEfficiency:      number | null;
  avgAvailability:    number | null;
  avgRuntime:         number | null;
  avgDowntime:        number | null;
  avgAlarmRate:       number | null;
  sampleCount:        number;
  coverageDays:       number;
  meetsDataGate:      boolean;
}

export interface PredictiveContext {
  assetId:         string;
  riskScore:       RiskScoreResult | null;
  rul:             RULResult | null;
  failureProbability: FailureProbabilityResult | null;
  recommendations: MaintenanceRecommendationResult[];
  degradation:     DegradationResult | null;
  baseline:        BaselineResult | null;
}
