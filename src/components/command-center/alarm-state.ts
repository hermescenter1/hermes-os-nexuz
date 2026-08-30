/**
 * PHASE 104-I.D2 — Alarm Center state model (Reference B).
 *
 * Pure, framework-free logic. It lives in a `.ts` file on purpose: the vitest
 * transform in this repository cannot import `.tsx` into a unit test, so any
 * logic worth asserting has to sit outside the component.
 *
 * The single rule this module exists to enforce: **an unknown value is never
 * silently turned into a known one.** Zero is a measurement; absent is not.
 * Every state below is reachable from a real response the API can actually
 * produce, and none of them is inferred from another.
 */

import type { OperationsAlert, AlertSeverity, CategoryCount } from "@/lib/operations/types";

/** The exact payload GET /api/operations/alerts returns on success. */
export interface AlertsPayload {
  alerts:     OperationsAlert[];
  byCategory: CategoryCount[];
  counts:     { total: number; critical: number; warning: number; info: number };
  builtAt:    string;
}

/**
 * Why a load did not produce data. These are DISTINCT on purpose — reporting a
 * transport failure as "no active alarms" is the single most dangerous thing an
 * alarm surface can do, so the type system refuses to let the two collapse.
 */
export type AlarmFailure =
  | { kind: "unavailable"; status: number }
  | { kind: "rateLimited";  status: 429 }
  | { kind: "malformed" }
  | { kind: "network" };

export type AlarmState =
  | { phase: "loading" }
  | { phase: "failed";  failure: AlarmFailure }
  | { phase: "ready";   payload: AlertsPayload };

export type SeverityFilter = AlertSeverity | "all";

/** Severity order used for both sorting and visual precedence. */
export const SEVERITY_ORDER: readonly AlertSeverity[] = ["critical", "warning", "info"];

/**
 * Interpret a fetch outcome.
 *
 * The shipped client called `.json()` on every response regardless of status,
 * so a 500 body (`{error:"alerts_unavailable"}`) was stored AS IF it were data.
 * `counts` was then undefined and the render threw. This function is the reason
 * that cannot happen again: a non-OK status can only ever become a `failed`
 * state, and an OK body still has to prove it carries the fields being read.
 */
export function interpretResponse(status: number, ok: boolean, body: unknown): AlarmState {
  if (!ok) {
    if (status === 429) return { phase: "failed", failure: { kind: "rateLimited", status: 429 } };
    return { phase: "failed", failure: { kind: "unavailable", status } };
  }
  if (!isAlertsPayload(body)) return { phase: "failed", failure: { kind: "malformed" } };
  return { phase: "ready", payload: body };
}

/**
 * FULL validation of a 200 response — Gate A.1 §4.
 *
 * The first version of this function only checked that two arrays existed, that
 * `builtAt` was a string and that four numbers were finite. That let a whole
 * family of malformed-but-200 payloads reach the ready state: alerts with no
 * fields at all, unknown severities, negative or fractional counts, a `total`
 * that disagreed with the number of alerts, a category ledger that disagreed
 * with the alerts, and duplicate ids.
 *
 * The rule is the same one the whole surface is built on: a response that
 * cannot be trusted is a FAILURE, never data and never a crash. Every check
 * below rejects into `failed/malformed`.
 */
const SEVERITIES = new Set<string>(["critical", "warning", "info"]);

/** A count must be a real, non-negative, whole number. */
export function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function isStringField(v: unknown): v is string {
  return typeof v === "string";
}

export function isValidAlert(v: unknown): v is OperationsAlert {
  if (v === null || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  const strings = ["id", "label", "category", "vendor", "vendorName", "deviceId", "deviceLabel", "caseId"];
  if (!strings.every((k) => isStringField(a[k]))) return false;
  if (a.id === "") return false;
  if (typeof a.severity !== "string" || !SEVERITIES.has(a.severity)) return false;
  // `status` is a constant the builder writes; it must still be a string.
  return isStringField(a.status);
}

export function isValidCategory(v: unknown): v is CategoryCount {
  if (v === null || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  if (!isStringField(c.category) || c.category === "") return false;
  if (!isCount(c.count)) return false;
  return typeof c.severity === "string" && SEVERITIES.has(c.severity);
}

export function isAlertsPayload(v: unknown): v is AlertsPayload {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;

  if (!Array.isArray(o.alerts) || !Array.isArray(o.byCategory)) return false;
  if (!isStringField(o.builtAt)) return false;

  const c = o.counts;
  if (c === null || typeof c !== "object") return false;
  const cc = c as Record<string, unknown>;
  if (!(["total", "critical", "warning", "info"] as const).every((k) => isCount(cc[k]))) return false;

  // Every element must itself be well formed — an array of junk is not an array
  // of alerts.
  if (!o.alerts.every(isValidAlert)) return false;
  if (!o.byCategory.every(isValidCategory)) return false;

  const alerts = o.alerts as OperationsAlert[];
  const cats = o.byCategory as CategoryCount[];

  // Identity: duplicate ids would double-count and make selection ambiguous.
  if (new Set(alerts.map((a) => a.id)).size !== alerts.length) return false;
  if (new Set(cats.map((x) => x.category)).size !== cats.length) return false;

  // Arithmetic: the header must agree with the body it summarises.
  if ((cc.total as number) !== alerts.length) return false;
  const bySeverity = { critical: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>;
  for (const a of alerts) bySeverity[a.severity]++;
  for (const sev of SEVERITY_ORDER) {
    if ((cc[sev] as number) !== bySeverity[sev]) return false;
  }
  if (bySeverity.critical + bySeverity.warning + bySeverity.info !== (cc.total as number)) return false;

  // The category ledger must agree with the alerts it claims to describe.
  const byCategory = new Map<string, number>();
  for (const a of alerts) byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + 1);
  if (byCategory.size !== cats.length) return false;
  for (const x of cats) {
    if (byCategory.get(x.category) !== x.count) return false;
  }

  return true;
}

/**
 * What the queue should render.
 *
 * `empty` (the estate genuinely reports no alarms) and `filtered` (alarms exist
 * but this filter excludes them) are different facts and get different copy —
 * the brief requires the distinction and a single "nothing here" message would
 * erase it.
 */
export type QueueView =
  | { kind: "list";     alerts: OperationsAlert[] }
  | { kind: "empty" }
  | { kind: "filtered"; filter: Exclude<SeverityFilter, "all">; totalAvailable: number };

export function selectQueue(payload: AlertsPayload, filter: SeverityFilter): QueueView {
  const all = payload.alerts;
  if (all.length === 0) return { kind: "empty" };
  // Handling "all" first narrows `filter` to a concrete severity for the rest of
  // the function, so the `filtered` result can carry it without a cast.
  if (filter === "all") return { kind: "list", alerts: all };
  const visible = all.filter((a) => a.severity === filter);
  if (visible.length === 0) return { kind: "filtered", filter, totalAvailable: all.length };
  return { kind: "list", alerts: visible };
}

/**
 * Severity band segments for the posture ledger.
 *
 * Widths are proportions of a REAL total. When the total is 0 there is no
 * proportion to draw and the caller must render the empty state instead of a
 * full-width bar in the success colour.
 */
export interface LedgerSegment {
  severity: AlertSeverity;
  count:    number;
  /** Integer percent 0–100 of the real total; 0 when nothing observed. */
  percent:  number;
}

export function buildLedger(counts: AlertsPayload["counts"]): LedgerSegment[] {
  const total = counts.total;
  return SEVERITY_ORDER.map((severity) => {
    const count = counts[severity];
    return {
      severity,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

/** The highest severity actually observed, or null when nothing is observed. */
export function dominantSeverity(counts: AlertsPayload["counts"]): AlertSeverity | null {
  for (const s of SEVERITY_ORDER) if (counts[s] > 0) return s;
  return null;
}

/**
 * Distinct vendors present in the feed.
 *
 * Blank vendor ids are excluded rather than counted as a nameless vendor: the
 * builder leaves `vendor` empty when it cannot resolve the device, so counting
 * "" would report a vendor that does not exist.
 */
export function distinctVendors(alerts: OperationsAlert[]): number {
  return new Set(alerts.map((a) => a.vendor).filter((v) => v.length > 0)).size;
}

/**
 * Freshness of the payload relative to now.
 *
 * `unknown` is returned for an unparseable or future-dated `builtAt` — the UI
 * must then say so rather than print a plausible-looking age.
 */
export type Freshness =
  | { kind: "fresh";   ageSeconds: number }
  | { kind: "stale";   ageSeconds: number }
  | { kind: "unknown" };

/** Beyond this the graph snapshot is presented as stale, not current. */
export const STALE_AFTER_SECONDS = 15 * 60;

/**
 * How long until this payload stops being current — Gate A.1 §5.
 *
 * Freshness used to be evaluated once, at render. A surface opened while the
 * data was fresh would keep asserting "Current" indefinitely, because nothing
 * ever re-evaluated it: the label aged out of truth while the page sat there.
 *
 * Returns the milliseconds remaining, or `null` when there is nothing to wait
 * for (already stale, or a timestamp that cannot be read — both are terminal
 * and neither can become fresh again).
 */
export function msUntilStale(builtAt: string, now: number): number | null {
  const t = Date.parse(builtAt);
  if (Number.isNaN(t)) return null;
  const deadline = t + STALE_AFTER_SECONDS * 1000;
  const remaining = deadline - now;
  return remaining > 0 ? remaining : null;
}

/**
 * Re-evaluate freshness exactly when it changes, and not before.
 *
 * A single timer scheduled for the crossing point, rather than a poll: no
 * request is made, no state is mutated, and the surface does not busy-wake.
 * Returns a cleanup function that cancels the pending timer.
 */
export function scheduleFreshnessCheck(
  builtAt: string,
  now: number,
  onStale: () => void,
  setTimer: (fn: () => void, ms: number) => unknown = setTimeout,
  clearTimer: (h: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
): () => void {
  const ms = msUntilStale(builtAt, now);
  if (ms === null) return () => {};
  // +1s so the callback lands strictly past the threshold, never exactly on it.
  const handle = setTimer(onStale, ms + 1000);
  return () => clearTimer(handle);
}

export function assessFreshness(builtAt: string, now: number): Freshness {
  const t = Date.parse(builtAt);
  if (Number.isNaN(t)) return { kind: "unknown" };
  const ageSeconds = Math.floor((now - t) / 1000);
  if (ageSeconds < 0) return { kind: "unknown" };
  return ageSeconds > STALE_AFTER_SECONDS
    ? { kind: "stale", ageSeconds }
    : { kind: "fresh", ageSeconds };
}
