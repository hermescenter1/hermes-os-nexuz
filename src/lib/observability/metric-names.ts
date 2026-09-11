/**
 * PHASE 92 — metric catalogue with explicit label + cardinality budgets.
 *
 * Every operational metric is declared here ONCE, together with the exact set
 * of label keys it may carry and a hard cap on the number of distinct label
 * series it may create. Nothing else may emit a metric: `metrics.ts` rejects a
 * name it does not find in this catalogue.
 *
 * CARDINALITY IS A SECURITY + COST CONTROL, not a style preference:
 *   - No label may carry a user id, email, IP, token, raw URL, resource id or
 *     organization id. Those are unbounded and turn a metric store into a
 *     deanonymisation side-channel and an OOM vector. The allowed label keys
 *     below are all closed, low-cardinality dimensions (method, status class,
 *     outcome, dependency name, severity, a fixed event enum).
 *   - `maxSeries` is the backstop: if emitted labels would exceed it, the
 *     sample is folded into an `overflow="true"` series instead of growing the
 *     map without bound (see metrics.ts).
 *
 * Tenant isolation NEVER depends on metrics — these are aggregate operational
 * counters with no per-tenant dimension by construction.
 */

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricDef {
  type: MetricType;
  help: string;
  /** Closed set of allowed label keys. Any other key is dropped. */
  labels: readonly string[];
  /** Hard cap on distinct label-value series before overflow folding. */
  maxSeries: number;
  /** Histogram bucket upper bounds (inclusive), ascending. Histograms only. */
  buckets?: readonly number[];
}

/** Latency buckets in milliseconds, shared by the request/query histograms. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

/**
 * The complete catalogue. Names follow Prometheus convention
 * (`snake_case`, `_total` suffix for counters, unit suffix for histograms).
 */
export const METRICS = {
  // ── HTTP request plane ─────────────────────────────────────────────────────
  http_requests_total: {
    type: "counter",
    help: "Total HTTP requests handled, by method and status class.",
    labels: ["method", "status_class"], // status_class ∈ 2xx|3xx|4xx|5xx
    maxSeries: 64,
  },
  http_request_duration_ms: {
    type: "histogram",
    help: "HTTP request duration in milliseconds, by method.",
    labels: ["method"],
    maxSeries: 16,
    buckets: LATENCY_BUCKETS_MS,
  },

  // ── Authn / authz ──────────────────────────────────────────────────────────
  auth_failures_total: {
    type: "counter",
    help: "Authentication failures (no/invalid session, bad credentials).",
    labels: ["reason"], // closed enum from the security taxonomy
    maxSeries: 32,
  },
  authz_denials_total: {
    type: "counter",
    help: "Authorization denials (role/membership/scope/tenant).",
    labels: ["reason"],
    maxSeries: 32,
  },

  // ── Sessions (Phase 91) ────────────────────────────────────────────────────
  session_operations_total: {
    type: "counter",
    help: "Session lifecycle operations.",
    labels: ["operation"], // issued|revoked|revoke_others|replay_blocked|expired
    maxSeries: 16,
  },

  // ── Security events ────────────────────────────────────────────────────────
  security_events_total: {
    type: "counter",
    help: "Security events by taxonomy event name and severity.",
    labels: ["event", "severity"],
    maxSeries: 128,
  },

  // ── Errors ─────────────────────────────────────────────────────────────────
  errors_total: {
    type: "counter",
    help: "Aggregated application errors, by severity.",
    labels: ["severity"],
    maxSeries: 8,
  },

  // ── Dependencies ───────────────────────────────────────────────────────────
  dependency_up: {
    type: "gauge",
    help: "Dependency readiness (1 = up, 0 = down/degraded), by dependency.",
    labels: ["dependency"], // database|redis
    maxSeries: 8,
  },
  dependency_latency_ms: {
    type: "histogram",
    help: "Dependency probe latency in milliseconds, by dependency.",
    labels: ["dependency"],
    maxSeries: 8,
    buckets: LATENCY_BUCKETS_MS,
  },
  redis_degraded_total: {
    type: "counter",
    help: "Transitions into Redis in-process fallback (degraded) mode.",
    labels: ["limiter"], // api|auth
    maxSeries: 8,
  },
  email_failures_total: {
    type: "counter",
    help: "Email transport delivery failures.",
    labels: [],
    maxSeries: 1,
  },

  // ── Alerting (self-observation) ────────────────────────────────────────────
  alert_delivery_total: {
    type: "counter",
    help: "Alert delivery attempts by result.",
    labels: ["result"], // sent|failed|dropped|deduplicated|suppressed
    maxSeries: 16,
  },

  // ── Industrial metering outbox (Phase 109-C-UI.2-R8) ───────────────────────
  //
  // R7 made industrial metering durable by writing an outbox row inside the
  // run's transaction; R8 connected a worker to deliver it. These are the
  // numbers that answer "is that worker actually running", and they carry NO
  // tenant dimension — the outbox rows are per-organisation, these gauges are
  // estate-wide totals by construction.
  //
  // `oldest_pending_age_seconds` is the one that matters most. Totals can look
  // healthy while nothing has moved for hours; an age that only grows is the
  // signature of a worker that has stopped.
  industrial_metering_outbox_pending: {
    type: "gauge",
    help: "Metering events awaiting first delivery.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_outbox_retrying: {
    type: "gauge",
    help: "Metering events that failed at least once and are scheduled to retry.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_outbox_delivered: {
    type: "gauge",
    help: "Metering events delivered to UsageRecord.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_outbox_dead_letter: {
    type: "gauge",
    help: "Metering events abandoned after the bounded retry budget. Never silently dropped.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_oldest_pending_age_seconds: {
    type: "gauge",
    help: "Age of the oldest undelivered metering event. Grows without bound if the worker stops.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_delivered_total: {
    type: "counter",
    help: "Metering events delivered, cumulative.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_retries_total: {
    type: "counter",
    help: "Metering delivery attempts that failed and were rescheduled.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_dead_letter_total: {
    type: "counter",
    help: "Metering events moved to DEAD_LETTER, cumulative.",
    labels: [],
    maxSeries: 1,
  },
  industrial_metering_worker_passes_total: {
    type: "counter",
    help: "Worker passes by outcome. `not_leader` is normal on a non-holding replica.",
    labels: ["outcome"], // ok|not_leader|error
    maxSeries: 8,
  },

  // ── Meta ───────────────────────────────────────────────────────────────────
  metrics_series_dropped_total: {
    type: "counter",
    help: "Metric samples folded into an overflow series due to cardinality cap.",
    labels: ["metric"],
    maxSeries: 64,
  },
} as const satisfies Record<string, MetricDef>;

export type MetricName = keyof typeof METRICS;

/** Bucket the numeric HTTP status into a low-cardinality class label. */
export function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "1xx";
}
