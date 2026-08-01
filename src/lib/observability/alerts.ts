/**
 * PHASE 92 — operational alert manager.
 *
 * Turns confirmed operational/security conditions into deduplicated, cooldown
 * -aware, retry-bounded webhook deliveries — and is careful to never become an
 * incident of its own:
 *
 *   - DISABLED BY DEFAULT. Delivery happens only when ALERTS_ENABLED=true AND an
 *     ALERT_WEBHOOK_URL is configured. Otherwise the alert is still tracked in
 *     the in-process active-alert registry (so the operator dashboard shows it)
 *     but nothing leaves the process.
 *   - SSRF-SAFE. The destination URL is read ONLY from the environment, never
 *     from a caller argument, a request, or any observed content.
 *   - DEDUPED + COOLDOWN. Repeated raises of the same `key` inside the cooldown
 *     window update the active alert's count/lastSeen but do not re-deliver.
 *   - RETRY-BOUNDED. Delivery is retried up to a small fixed cap, then gives up
 *     and records a failure — it never loops.
 *   - SELF-OBSERVING. Every outcome increments `alert_delivery_total{result}`
 *     and logs one structured line.
 *   - NEVER CRASHES THE CALLER. `raiseAlert` returns a promise the caller may
 *     ignore (`void`); all delivery work is wrapped and swallowed.
 *
 * This module deliberately does NOT touch the user-facing notification system
 * (src/lib/events/system) — operator alerting and end-user notifications are
 * separate planes with different audiences and safety rules.
 */

import { logger } from "@/lib/logger";
import { incCounter } from "./metrics";
import { type Severity, SEVERITY_RANK, severityAtLeast } from "./log-schema";

export type AlertResult = "sent" | "failed" | "dropped" | "deduplicated" | "suppressed";

export interface AlertInput {
  /** Stable dedup key, e.g. "dependency:database:down". Low-cardinality. */
  key: string;
  title: string;
  severity: Severity;
  /** Human-safe one-liner. MUST NOT contain secrets or tenant payloads. */
  summary: string;
  /** Low-cardinality labels for context (no ids/emails/urls). */
  labels?: Record<string, string>;
  /** Correlation id tying this alert to its originating request/incident. */
  correlationId?: string;
}

export interface ActiveAlert extends AlertInput {
  firstSeen: string;
  lastSeen: string;
  count: number;
  lastDeliveredAt: string | null;
  lastResult: AlertResult | null;
}

/** Injectable delivery transport. Resolves on 2xx, rejects/returns false otherwise. */
export type AlertTransport = (url: string, body: string) => Promise<boolean>;

interface AlertConfig {
  enabled: boolean;
  webhookUrl: string | null;
  minSeverity: Severity;
  cooldownMs: number;
  maxRetries: number;
}

interface AlertState {
  active: Map<string, ActiveAlert>;
  configOverride: Partial<AlertConfig> | null;
  transportOverride: AlertTransport | null;
}

function freshState(): AlertState {
  return { active: new Map(), configOverride: null, transportOverride: null };
}

function state(): AlertState {
  const g = globalThis as unknown as { __hermesAlerts?: AlertState };
  g.__hermesAlerts ??= freshState();
  return g.__hermesAlerts;
}

function parseSeverity(raw: string | undefined, fallback: Severity): Severity {
  return raw && raw in SEVERITY_RANK ? (raw as Severity) : fallback;
}

/**
 * Accept an ALERT_WEBHOOK_URL only if it is a syntactically valid http(s) URL.
 * The destination is OPERATOR-configured (env), so a private/internal address
 * (e.g. an in-cluster Alertmanager) is intentionally allowed — the security
 * boundary is "never from a request", which the env-only read already enforces.
 * A malformed or non-http(s) value (javascript:, file:, garbage) is rejected so
 * a misconfiguration degrades to "unconfigured" rather than an odd fetch target.
 */
function validWebhookUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? raw : null;
  } catch {
    return null;
  }
}

function envConfig(): AlertConfig {
  return {
    enabled: process.env.ALERTS_ENABLED === "true",
    webhookUrl: validWebhookUrl(process.env.ALERT_WEBHOOK_URL),
    minSeverity: parseSeverity(process.env.ALERT_MIN_SEVERITY, "error"),
    cooldownMs: clampInt(process.env.ALERT_COOLDOWN_MS, 300_000, 0, 86_400_000),
    maxRetries: clampInt(process.env.ALERT_MAX_RETRIES, 2, 0, 5),
  };
}

function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function config(): AlertConfig {
  return { ...envConfig(), ...(state().configOverride ?? {}) };
}

/** Default transport: POST JSON to the configured webhook. Node/undici fetch. */
async function defaultTransport(url: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Do NOT follow redirects: the POST must reach exactly the configured
      // endpoint and never be bounced (e.g. to a cloud metadata address). A 3xx
      // is treated as a delivery failure, not a hop to a new host.
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function transport(): AlertTransport {
  return state().transportOverride ?? defaultTransport;
}

function record(result: AlertResult, alert: ActiveAlert): void {
  alert.lastResult = result;
  incCounter("alert_delivery_total", { result });
  // Only an actual DELIVERY outcome (sent/failed) is worth a log line. The
  // "dropped" (disabled/unconfigured), "suppressed" (below floor) and
  // "deduplicated" (cooldown) results are the common, expected path — logging
  // them would spam the stream when alerting is intentionally off. The metric
  // (alert_delivery_total{result}) still records every outcome.
  if (result !== "sent" && result !== "failed") return;
  const level = result === "failed" ? "error" : "info";
  logger[level](
    `alert.${result}`,
    {
      event: "alert_delivery",
      alertKey: alert.key,
      severity: alert.severity,
      result,
      count: alert.count,
      ...(alert.labels ? { labels: alert.labels } : {}),
    },
    alert.correlationId,
  );
}

/**
 * Raise (or refresh) an alert. Returns a promise that resolves to the delivery
 * result; callers who don't care may `void raiseAlert(...)`. Never throws.
 */
export async function raiseAlert(input: AlertInput): Promise<AlertResult> {
  try {
    const cfg = config();
    const now = new Date().toISOString();
    const st = state();

    let alert = st.active.get(input.key);
    if (alert) {
      alert.lastSeen = now;
      alert.count += 1;
      // Refresh mutable descriptive fields to the latest raise.
      alert.title = input.title;
      alert.severity = input.severity;
      alert.summary = input.summary;
      alert.labels = input.labels;
      alert.correlationId = input.correlationId ?? alert.correlationId;
    } else {
      alert = {
        ...input,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        lastDeliveredAt: null,
        lastResult: null,
      };
      st.active.set(input.key, alert);
    }

    // Below the configured floor — track it, but do not deliver.
    if (!severityAtLeast(alert.severity, cfg.minSeverity)) {
      record("suppressed", alert);
      return "suppressed";
    }

    // Cooldown: already delivered recently for this key.
    if (alert.lastDeliveredAt) {
      const sinceMs = Date.now() - Date.parse(alert.lastDeliveredAt);
      if (sinceMs < cfg.cooldownMs) {
        record("deduplicated", alert);
        return "deduplicated";
      }
    }

    // Disabled or unconfigured — tracked only, never dialed.
    if (!cfg.enabled || !cfg.webhookUrl) {
      record("dropped", alert);
      return "dropped";
    }

    const result = await deliverWithRetry(cfg, alert);
    if (result === "sent") alert.lastDeliveredAt = new Date().toISOString();
    record(result, alert);
    return result;
  } catch {
    // Alerting must never crash the primary path.
    return "failed";
  }
}

async function deliverWithRetry(cfg: AlertConfig, alert: ActiveAlert): Promise<AlertResult> {
  const body = JSON.stringify({
    key: alert.key,
    title: alert.title,
    severity: alert.severity,
    summary: alert.summary,
    labels: alert.labels ?? {},
    correlationId: alert.correlationId ?? null,
    firstSeen: alert.firstSeen,
    lastSeen: alert.lastSeen,
    count: alert.count,
  });
  const send = transport();
  const attempts = cfg.maxRetries + 1;
  for (let i = 0; i < attempts; i++) {
    let ok = false;
    try {
      ok = await send(cfg.webhookUrl as string, body);
    } catch {
      ok = false;
    }
    if (ok) return "sent";
  }
  return "failed";
}

/** Snapshot of active alerts for the operator dashboard. Bounded by dedup keys. */
export function getActiveAlerts(): ActiveAlert[] {
  return [...state().active.values()].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      Date.parse(b.lastSeen) - Date.parse(a.lastSeen),
  );
}

/** Clear one resolved alert by key. */
export function clearAlert(key: string): void {
  state().active.delete(key);
}

// ── Test / operator seams ─────────────────────────────────────────────────────

/** Override config for tests (merged over env). Pass null to clear. */
export function configureAlertsForTest(override: Partial<AlertConfig> | null): void {
  state().configOverride = override;
}

/** Inject a delivery transport for tests. Pass null to restore the default. */
export function setAlertTransportForTest(t: AlertTransport | null): void {
  state().transportOverride = t;
}

/** Reset all alert state. Test-only. */
export function resetAlerts(): void {
  const g = globalThis as unknown as { __hermesAlerts?: AlertState };
  g.__hermesAlerts = freshState();
}
