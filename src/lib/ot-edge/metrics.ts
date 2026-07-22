// PHASE 94B3 — private operational metrics for the OT surface.
//
// LOW CARDINALITY IS A SECURITY PROPERTY HERE, NOT A PERFORMANCE ONE.
// A counter labelled with organizationId or projectId turns an internal metrics
// surface into a tenant directory: anyone who can read it learns which
// customers exist and how much engineering data each holds. So the label
// vocabulary is a CLOSED SET declared here, and `record` refuses anything else
// rather than trusting call sites to remember.
//
// Metrics are counters and durations only — never a value from an imported
// manifest, never an identifier.

import { logger } from "@/lib/logger";

export const OT_METRICS = [
  "ot_import_started",
  "ot_import_completed",
  "ot_import_failed",
  "ot_import_validation_failed",
  "ot_import_duration_ms",
  "ot_analysis_duration_ms",
  "ot_findings_total",
  "ot_envelope_accepted",
  "ot_envelope_signature_invalid",
  "ot_envelope_timestamp_rejected",
  "ot_envelope_checksum_mismatch",
  "ot_envelope_replay_conflict",
  "ot_idempotency_collision",
  // PHASE 94B3.3 — outcome of a human finding-review transition.
  "ot_finding_transition",
] as const;
export type OtMetric = (typeof OT_METRICS)[number];

/**
 * The ONLY label keys permitted, each with a closed value set.
 *
 * Every value here is drawn from an enum the platform controls, so the
 * cardinality of any series is bounded by the code, not by tenant data.
 */
const LABEL_VOCABULARY = {
  severity: ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
  sourceType: ["TIA_EXPORT", "PLC_EXPORT", "HMI_EXPORT", "SCADA_EXPORT", "GENERIC", "SIMULATOR"],
  outcome: ["ok", "rejected", "conflict", "error"],
  payloadType: [
    "PROJECT_METADATA",
    "TAG_METADATA",
    "ALARM_METADATA",
    "NETWORK_METADATA",
    "READ_ONLY_TELEMETRY",
  ],
} as const;

export type OtMetricLabels = Partial<{
  [K in keyof typeof LABEL_VOCABULARY]: (typeof LABEL_VOCABULARY)[K][number];
}>;

/** Label keys that must never appear, whatever a future caller tries. */
export const FORBIDDEN_LABELS = Object.freeze([
  "organizationId",
  "orgId",
  "siteId",
  "gatewayId",
  "projectId",
  "importId",
  "findingId",
  "userId",
  "actorId",
  "tagName",
  "alarmCode",
  "signingKeyRef",
  "nonce",
  "idempotencyKey",
  "checksum",
] as const);

/** A label bag is safe when every key is known AND every value is in its set. */
export function isSafeLabels(labels: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(labels)) {
    if (!Object.prototype.hasOwnProperty.call(LABEL_VOCABULARY, key)) return false;
    const allowed = LABEL_VOCABULARY[key as keyof typeof LABEL_VOCABULARY] as readonly string[];
    if (typeof value !== "string" || !allowed.includes(value)) return false;
  }
  return true;
}

/** The sink. Swappable so tests observe emissions without a metrics backend. */
export interface MetricSink {
  emit(metric: OtMetric, value: number, labels: OtMetricLabels): void;
}

/**
 * Default sink: the platform's structured logger.
 *
 * Reuses the existing observability path rather than adding a vendor. The
 * logger already redacts secret-shaped keys, and nothing high-cardinality can
 * reach it because `record` has already rejected unknown labels.
 */
export const loggerMetricSink: MetricSink = {
  emit(metric, value, labels) {
    logger.info("metric", { metric, value, ...labels });
  },
};

/**
 * Record a metric.
 *
 * Unsafe labels are DROPPED, not thrown: a mistyped label must never take down
 * an import that is otherwise succeeding. The drop is itself reported (without
 * the offending values) so the mistake is visible in CI and staging.
 */
export function record(
  sink: MetricSink,
  metric: OtMetric,
  value = 1,
  labels: OtMetricLabels = {},
): void {
  if (!isSafeLabels(labels as Record<string, unknown>)) {
    logger.warn("metric.labels_rejected", { metric, keys: Object.keys(labels).sort() });
    sink.emit(metric, value, {});
    return;
  }
  sink.emit(metric, value, labels);
}

/** Wall-clock duration helper; the clock is injected so tests stay deterministic. */
export function durationMs(startedAt: number, nowMs: number): number {
  const d = nowMs - startedAt;
  return Number.isFinite(d) && d >= 0 ? d : 0;
}
