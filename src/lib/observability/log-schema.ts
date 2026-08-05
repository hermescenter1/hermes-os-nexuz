/**
 * PHASE 92 — versioned structured-log contract.
 *
 * The JSON logger (src/lib/logger/index.ts) has emitted a stable line shape
 * since Phase 45, but nothing documented or versioned it, so downstream
 * consumers (log shippers, the incident timeline, alert rules) had to reverse
 * -engineer the field names from code. This module is the single source of
 * truth: it names every field, fixes the schema version, and enumerates the
 * closed vocabularies (outcomes, severities) that the rest of the
 * observability plane keys off.
 *
 * COMPATIBILITY: the v1 field names below are exactly the keys the logger has
 * always written (`ts`, `level`, `svc`, `reqId`, `msg`, `event`, `operation`,
 * `outcome`, …). Phase 92 only ADDS `schemaVersion` and `env`; it renames
 * nothing, so existing log pipelines and the Phase 90 observability tests keep
 * working. Bump LOG_SCHEMA_VERSION only on a breaking field change.
 *
 * This module is intentionally dependency-free and side-effect-free so it can
 * be imported from Edge and Node runtimes alike.
 */

/** Current structured-log schema version. Bump only on a breaking change. */
export const LOG_SCHEMA_VERSION = 1 as const;

/**
 * Stable v1 field names. Kept as a const map so consumers reference
 * `LOG_FIELDS.correlationId` rather than a bare string literal that could
 * drift.
 */
export const LOG_FIELDS = {
  schemaVersion: "schemaVersion",
  timestamp: "ts",
  level: "level",
  service: "svc",
  environment: "env",
  message: "msg",
  requestId: "reqId",
  correlationId: "correlationId",
  traceId: "traceId",
  spanId: "spanId",
  event: "event",
  operation: "operation",
  outcome: "outcome",
  userId: "userId",
  organizationId: "orgId",
  siteId: "siteId",
  durationMs: "durationMs",
  errorClass: "errorClass",
  errorFingerprint: "errorFingerprint",
} as const;

/**
 * Closed vocabulary of operation outcomes. `attempted` marks a mutation that
 * started but whose success is not (yet) known; `degraded` marks a dependency
 * that answered from a fallback path rather than failing outright.
 */
export const OUTCOMES = ["success", "attempted", "denied", "failed", "degraded"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Severity ladder shared by security events, error aggregation and alerts, so a
 * single threshold means the same thing everywhere.
 */
export const SEVERITIES = ["info", "warning", "error", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Numeric rank for threshold comparisons (`>= "error"`). */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 10,
  warning: 20,
  error: 30,
  critical: 40,
};

/** True when `a` is at least as severe as `b`. */
export function severityAtLeast(a: Severity, b: Severity): boolean {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b];
}

/** Logical service name stamped on every line. */
export const SERVICE_NAME = "hermes-os";

/**
 * Deployment environment, derived from the runtime — never a client value.
 * Kept here (not in the logger) so metrics and alerts stamp the same value.
 */
export function resolveEnvironment(): string {
  return process.env.NODE_ENV ?? "unknown";
}
