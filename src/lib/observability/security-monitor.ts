/**
 * PHASE 92 — security-event taxonomy, ring buffer and thresholded alerting.
 *
 * The Phase 90 helpers (logAuthFailure / logAuthzDenial / logInfraFailure) emit
 * disclosure-safe log lines. This module adds the three things an SRE needs on
 * top of the log stream:
 *
 *   1. A CLOSED TAXONOMY of security event types with default severities, so
 *      "what happened" is a stable enum, not free text.
 *   2. An in-process RING BUFFER of recent events (safe fields only) that the
 *      incident timeline reconstructs an ordered story from — the log stream
 *      lives in the shipper, but the app can answer "what did we see for this
 *      correlation id" without a round-trip.
 *   3. METRICS + THRESHOLDED ALERTS: every event increments a bounded counter;
 *      high-severity events and abnormal rates raise deduplicated alerts.
 *
 * DISCLOSURE RULE (inherited): only the attempt is described — operation,
 * reason, opaque caller-supplied ids, server-derived identity. Never resolved
 * resource contents, another tenant's data, or any credential. All identity and
 * tenant attribution is SERVER-DERIVED by the caller; this module trusts what it
 * is given and never reads a client body.
 */

import { logger } from "@/lib/logger";
import { incCounter } from "./metrics";
import { raiseAlert } from "./alerts";
import { type Severity, type Outcome } from "./log-schema";

/**
 * Closed taxonomy: event slug → default severity. Callers may override the
 * severity, but the slug must come from here.
 */
export const SECURITY_EVENTS = {
  login_success:              "info",
  login_failure:             "warning",
  account_lockout:           "warning",
  account_unlock:            "info",
  session_expired:           "info",
  session_invalid:           "warning",
  refresh_replay:            "critical",
  session_revoked:           "info",
  session_revoke_all:        "warning",
  role_changed:              "warning",
  status_changed:            "warning",
  privileged_operation:      "info",
  cross_tenant_denied:       "error",
  owner_context_ambiguous:   "warning",
  owner_context_unavailable: "error",
  suspicious_request_id:     "warning",
  audit_persistence_degraded:"error",
  // Generic denials from the shared guards (Phase 90 helpers feed these).
  auth_failure:              "warning",
  authz_denied:              "warning",
} as const satisfies Record<string, Severity>;

export type SecurityEventName = keyof typeof SECURITY_EVENTS;

export interface SecurityEventRecord {
  ts: string;
  event: SecurityEventName;
  severity: Severity;
  outcome: Outcome;
  correlationId?: string;
  operation?: string;
  reason?: string;
  userId?: string;
  orgId?: string;
  siteId?: string;
  role?: string;
  resourceId?: string;
  resourceType?: string;
}

export interface SecurityEventInput {
  event: SecurityEventName;
  /** Overrides the taxonomy default. */
  severity?: Severity;
  outcome?: Outcome;
  /** Correlation id from resolveRequestId — ties the event to its request. */
  correlationId?: string;
  operation?: string;
  reason?: string;
  userId?: string;
  orgId?: string;
  siteId?: string;
  role?: string;
  resourceId?: string;
  resourceType?: string;
}

const RING_MAX = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_THRESHOLD = 20; // events of one type within the window before a rate alert

function ring(): SecurityEventRecord[] {
  const g = globalThis as unknown as { __hermesSecurityRing?: SecurityEventRecord[] };
  g.__hermesSecurityRing ??= [];
  return g.__hermesSecurityRing;
}

function rateWindow(): Map<SecurityEventName, number[]> {
  const g = globalThis as unknown as { __hermesSecurityRate?: Map<SecurityEventName, number[]> };
  g.__hermesSecurityRate ??= new Map();
  return g.__hermesSecurityRate;
}

/** Keep only the safe, low-cardinality fields on the ring record. */
function toRecord(input: SecurityEventInput, severity: Severity, outcome: Outcome): SecurityEventRecord {
  return {
    ts: new Date().toISOString(),
    event: input.event,
    severity,
    outcome,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.orgId ? { orgId: input.orgId } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
  };
}

/** Increment the specific bounded counter(s) for this event. */
function meter(rec: SecurityEventRecord): void {
  incCounter("security_events_total", { event: rec.event, severity: rec.severity });
  switch (rec.event) {
    case "auth_failure":
    case "login_failure":
    case "session_invalid":
    case "session_expired":
      incCounter("auth_failures_total", { reason: rec.reason ?? "unspecified" });
      break;
    case "authz_denied":
    case "cross_tenant_denied":
      incCounter("authz_denials_total", { reason: rec.reason ?? "unspecified" });
      break;
    case "refresh_replay":
      incCounter("session_operations_total", { operation: "replay_blocked" });
      break;
    case "session_revoked":
      incCounter("session_operations_total", { operation: "revoked" });
      break;
    case "session_revoke_all":
      incCounter("session_operations_total", { operation: "revoke_others" });
      break;
    case "audit_persistence_degraded":
      // fold into errors severity bucket for the dashboard error rate
      incCounter("errors_total", { severity: rec.severity });
      break;
  }
}

/** Track rate and return true when the per-event threshold is crossed. */
function rateExceeded(event: SecurityEventName): boolean {
  const map = rateWindow();
  const now = Date.now();
  const arr = (map.get(event) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  map.set(event, arr);
  return arr.length >= RATE_THRESHOLD;
}

/**
 * The metric + ring + alert side of a security event, WITHOUT logging. Used by
 * the Phase 90 log helpers (which already emit the line) so every existing
 * denial site gains metrics/ring/alert coverage with no double-logging.
 * Never throws.
 */
export function observeSecurityEvent(input: SecurityEventInput): void {
  try {
    const severity = input.severity ?? SECURITY_EVENTS[input.event];
    const outcome = input.outcome ?? "denied";
    const rec = toRecord(input, severity, outcome);

    const buf = ring();
    buf.push(rec);
    if (buf.length > RING_MAX) buf.splice(0, buf.length - RING_MAX);

    meter(rec);

    // High-severity events alert immediately (deduped by the alert cooldown).
    if (severity === "critical" || severity === "error") {
      void raiseAlert({
        key: `security:${input.event}`,
        title: `Security event: ${input.event}`,
        severity,
        summary: `${input.event}${input.reason ? ` (${input.reason})` : ""}`,
        labels: { event: input.event },
        correlationId: input.correlationId,
      });
    } else if (rateExceeded(input.event)) {
      // A spike of lower-severity events (probing) escalates to an error alert.
      void raiseAlert({
        key: `security:rate:${input.event}`,
        title: `Elevated rate of ${input.event}`,
        severity: "error",
        summary: `>= ${RATE_THRESHOLD} ${input.event} events within ${RATE_WINDOW_MS / 1000}s`,
        labels: { event: input.event },
        correlationId: input.correlationId,
      });
    }
  } catch { /* observability must never break the caller */ }
}

/**
 * Full security-event entry point for NEW call sites (Phase 91 auth/session):
 * emits a disclosure-safe log line AND observes metrics/ring/alerts.
 * Never throws.
 */
export function recordSecurityEvent(input: SecurityEventInput): void {
  try {
    const severity = input.severity ?? SECURITY_EVENTS[input.event];
    const outcome = input.outcome ?? "denied";
    const level = severity === "critical" || severity === "error" ? "error"
      : severity === "warning" ? "warn" : "info";
    logger[level](
      `security.${input.event}`,
      {
        event: input.event,
        severity,
        outcome,
        ...(input.operation ? { operation: input.operation } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.orgId ? { orgId: input.orgId } : {}),
        ...(input.siteId ? { siteId: input.siteId } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.resourceId ? { resourceId: input.resourceId } : {}),
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
      },
      input.correlationId,
    );
  } catch { /* never throw */ }
  observeSecurityEvent(input);
}

/** Recent security events, newest first, optionally filtered by correlation id. */
export function getSecurityEvents(opts?: { correlationId?: string; limit?: number }): SecurityEventRecord[] {
  const limit = opts?.limit && opts.limit > 0 ? Math.min(opts.limit, RING_MAX) : 200;
  let events = [...ring()];
  if (opts?.correlationId) events = events.filter((e) => e.correlationId === opts.correlationId);
  return events.reverse().slice(0, limit);
}

/** Reset ring + rate state. Test-only. */
export function resetSecurityMonitor(): void {
  const g = globalThis as unknown as {
    __hermesSecurityRing?: SecurityEventRecord[];
    __hermesSecurityRate?: Map<SecurityEventName, number[]>;
  };
  g.__hermesSecurityRing = [];
  g.__hermesSecurityRate = new Map();
}
