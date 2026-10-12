/**
 * Executive Management Center — the measurement contract.
 *
 * This module is PURE. It performs no I/O, reads no database, imports no Prisma
 * client and knows nothing about tenants. It exists so that the three things an
 * executive screen gets wrong most often are decided in one testable place
 * instead of inline at twelve call sites:
 *
 *   1. ABSENCE IS NOT HEALTH. A metric with no source, an empty tenant, a
 *      refused permission and a value of zero are five different states. They
 *      are five different values here, and none of them is `0`.
 *   2. A PERCENT CHANGE IS NOT ALWAYS DEFINABLE. A zero denominator, a period
 *      that has not finished yet and a missing baseline each make the percentage
 *      meaningless. Each is its own outcome, so the UI can say WHY there is no
 *      arrow instead of printing `0%` or `Infinity%`.
 *   3. SILENCE IS NOT FRESHNESS. A gateway that never reported is not "up to
 *      date", and a timestamp in the future is a data-quality fault, not the
 *      newest reading.
 *
 * Every value a section publishes carries its own provenance: what it means,
 * where it came from, which window it covers, when it was last computed and
 * where the underlying records are. A number without that envelope cannot be
 * rendered by this surface.
 */

/* ── Section lifecycle ─────────────────────────────────────────────────────── */

/**
 * The state of one dashboard section. Deliberately exhaustive, because the
 * failure mode this replaces is a section that renders `0` for all five.
 *
 *   OPERATIONAL — a real source answered and there is data.
 *   EMPTY       — a real source answered and this tenant genuinely has no rows.
 *   FORBIDDEN   — the reader's role or site grants do not cover this section.
 *   UNAVAILABLE — the source exists but failed or timed out for this request.
 *   NO_SOURCE   — no data source for this exists in the product yet.
 *
 * EMPTY and NO_SOURCE are kept apart on purpose: "you have no overdue invoices"
 * and "this product cannot tell you about invoices" are not the same sentence,
 * and collapsing them is how a dashboard comes to look healthy because it is
 * blind.
 */
export type SectionStatus =
  | "OPERATIONAL"
  | "EMPTY"
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "NO_SOURCE";

/** A section status that carries no data, and the reason it carries none. */
export const NON_DATA_STATUSES: readonly SectionStatus[] = [
  "FORBIDDEN",
  "UNAVAILABLE",
  "NO_SOURCE",
] as const;

/* ── Provenance ────────────────────────────────────────────────────────────── */

/**
 * The window a measurement covers.
 *
 * `complete` is the honest answer to "has this window finished?". Today's
 * partial day is not comparable to a full previous day, and `computeDelta`
 * refuses to compare against an incomplete baseline rather than quietly
 * understating it.
 */
export interface PeriodDescriptor {
  /** Inclusive start, ISO-8601 with offset. */
  readonly fromIso: string;
  /** Exclusive end, ISO-8601 with offset. */
  readonly toIso: string;
  /** IANA zone the boundaries were computed in, e.g. "Asia/Tehran". */
  readonly timeZone: string;
  /** False while the window is still running. */
  readonly complete: boolean;
}

/**
 * Where a number came from and what it means.
 *
 * All human-readable text is an i18n KEY, never a literal: this envelope is
 * serialised to the client and rendered in fa, en and de.
 */
export interface MetricProvenance {
  /** i18n key: what this metric counts, in one sentence. */
  readonly definitionKey: string;
  /** i18n key: the named system of record, e.g. `executive.sources.erpTask`. */
  readonly sourceKey: string;
  /** The window the value covers, or null for a point-in-time count. */
  readonly period: PeriodDescriptor | null;
  /** When this value was computed, ISO-8601. Never the browser's clock. */
  readonly computedAtIso: string;
  /**
   * The newest moment the underlying records reflect — the data cutoff. For a
   * live count this equals `computedAtIso`; for a cached or snapshot value it is
   * older, and the UI must show the older one.
   */
  readonly dataAsOfIso: string;
  /**
   * Locale-relative path to the records behind the number, without the locale
   * prefix (e.g. `dashboard/executive/tasks?overdue=1`). Null when the records
   * have no reachable surface yet.
   *
   * Following this link re-checks the reader's permission at the destination;
   * presence here is a navigation hint, never a grant.
   */
  readonly detailPath: string | null;
}

/* ── Period change ─────────────────────────────────────────────────────────── */

/**
 * Why a period-over-period comparison could not be made.
 *
 *   PARTIAL_PERIOD — the baseline window has not finished, so comparing an
 *                    unfinished day against a finished one invents a trend.
 *   NO_BASELINE    — no previous value exists (first period, or retention has
 *                    aged it out).
 *   NO_CURRENT     — the current value itself is absent, so there is nothing to
 *                    compare.
 */
export type DeltaIncomparableReason = "PARTIAL_PERIOD" | "NO_BASELINE" | "NO_CURRENT";

/**
 * A period-over-period change.
 *
 *   CHANGE        — both values are present and the denominator is non-zero.
 *                   `percent` is signed and rounded to one decimal.
 *   FROM_ZERO     — the baseline was exactly zero. There is no percentage: a
 *                   change from 0 to 4 is not "+400%", it is "+4 from none".
 *   NO_CHANGE     — the values are equal, including 0 → 0.
 *   INCOMPARABLE  — see DeltaIncomparableReason.
 */
export type MetricDelta =
  | {
      readonly kind: "CHANGE";
      readonly absolute: number;
      readonly percent: number;
      /**
       * True when |previous| is below LOW_BASELINE_FLOOR. The percentage is
       * arithmetically correct but rhetorically misleading (1 → 3 is "+200%"),
       * so the UI leads with `absolute` when this is set.
       */
      readonly lowBaseline: boolean;
    }
  | { readonly kind: "FROM_ZERO"; readonly absolute: number }
  | { readonly kind: "NO_CHANGE" }
  | { readonly kind: "INCOMPARABLE"; readonly reason: DeltaIncomparableReason };

/**
 * Below this baseline a percentage is reported but flagged as low-confidence.
 * Five is not a statistical threshold; it is the point at which a single record
 * moves the percentage by twenty points or more.
 */
export const LOW_BASELINE_FLOOR = 5;

/** Signed percentage, one decimal. `-0` is normalised to `0`. */
function roundPercent(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Compare a current value against its baseline.
 *
 * Both `current` and `previous` accept null, because "the source answered and
 * the count is zero" and "there is no value" are different inputs and must not
 * be normalised to 0 by the caller.
 *
 * `baselineComplete` describes the BASELINE window, not the current one: the
 * current period is expected to be partial on a live dashboard, and that is not
 * what makes a comparison invalid.
 */
export function computeDelta(args: {
  current: number | null;
  previous: number | null;
  baselineComplete: boolean;
}): MetricDelta {
  const { current, previous, baselineComplete } = args;

  if (current === null || !Number.isFinite(current)) {
    return { kind: "INCOMPARABLE", reason: "NO_CURRENT" };
  }
  if (previous === null || !Number.isFinite(previous)) {
    return { kind: "INCOMPARABLE", reason: "NO_BASELINE" };
  }
  if (!baselineComplete) {
    return { kind: "INCOMPARABLE", reason: "PARTIAL_PERIOD" };
  }

  const absolute = current - previous;
  if (absolute === 0) return { kind: "NO_CHANGE" };
  if (previous === 0) return { kind: "FROM_ZERO", absolute };

  return {
    kind: "CHANGE",
    absolute,
    percent: roundPercent((absolute / Math.abs(previous)) * 100),
    lowBaseline: Math.abs(previous) < LOW_BASELINE_FLOOR,
  };
}

/* ── Data freshness ────────────────────────────────────────────────────────── */

/**
 * How current a data source is.
 *
 *   FRESH        — reported within the fresh window.
 *   STALE        — reported, but older than the fresh window.
 *   DISCONNECTED — silent beyond the disconnect threshold.
 *   NEVER        — has never reported. NOT a synonym for DISCONNECTED: a
 *                  gateway that was installed this morning and one that died
 *                  last week need different responses from a manager.
 *   INVALID      — the newest timestamp is in the future beyond clock tolerance,
 *                  which is a data-quality fault and never "the latest reading".
 */
export type SourceFreshness = "FRESH" | "STALE" | "DISCONNECTED" | "NEVER" | "INVALID";

export interface FreshnessThresholds {
  /** At or under this age the source is FRESH. */
  readonly freshMs: number;
  /** Beyond this age the source is DISCONNECTED. */
  readonly disconnectedMs: number;
  /** Future-dated tolerance before a timestamp is called INVALID. */
  readonly clockToleranceMs: number;
}

/**
 * Defaults chosen against the ingest path this dashboard reads, not invented:
 * gateway heartbeats and telemetry are server-stamped on arrival
 * (`TelemetryRecord.receivedAt`, `IndustrialGateway.lastSeenAt`), so a quarter
 * of an hour of silence is already abnormal, and six hours is beyond any
 * plausible transient.
 */
export const DEFAULT_FRESHNESS: FreshnessThresholds = {
  freshMs: 15 * 60_000,
  disconnectedMs: 6 * 60 * 60_000,
  clockToleranceMs: 60_000,
};

export interface FreshnessVerdict {
  readonly freshness: SourceFreshness;
  /** Age in milliseconds, or null when there is no timestamp to age. */
  readonly ageMs: number | null;
  /** The newest signal, echoed back so the UI never recomputes it. */
  readonly lastSignalIso: string | null;
}

/**
 * Classify a source by the age of its newest signal.
 *
 * `lastSignalMs` is null when the source has never reported. That is the one
 * input that must never be defaulted to `now` by a caller: doing so is exactly
 * how a silent plant renders as a healthy one.
 */
export function classifyFreshness(args: {
  lastSignalMs: number | null;
  nowMs: number;
  thresholds?: FreshnessThresholds;
}): FreshnessVerdict {
  const { lastSignalMs, nowMs } = args;
  const t = args.thresholds ?? DEFAULT_FRESHNESS;

  if (lastSignalMs === null || !Number.isFinite(lastSignalMs)) {
    return { freshness: "NEVER", ageMs: null, lastSignalIso: null };
  }

  const lastSignalIso = new Date(lastSignalMs).toISOString();
  const ageMs = nowMs - lastSignalMs;

  if (ageMs < -t.clockToleranceMs) {
    return { freshness: "INVALID", ageMs, lastSignalIso };
  }
  // Inside the tolerance band a tiny negative age is ordinary clock jitter.
  const age = Math.max(0, ageMs);
  if (age <= t.freshMs) return { freshness: "FRESH", ageMs: age, lastSignalIso };
  if (age <= t.disconnectedMs) return { freshness: "STALE", ageMs: age, lastSignalIso };
  return { freshness: "DISCONNECTED", ageMs: age, lastSignalIso };
}

/** Freshness values that mean "do not present this as the current picture". */
export const UNTRUSTWORTHY_FRESHNESS: readonly SourceFreshness[] = [
  "DISCONNECTED",
  "NEVER",
  "INVALID",
] as const;

export function isTrustworthy(freshness: SourceFreshness): boolean {
  return !UNTRUSTWORTHY_FRESHNESS.includes(freshness);
}

/* ── The published shapes ──────────────────────────────────────────────────── */

/** One headline number, with everything needed to defend it. */
export interface ExecutiveMetric {
  /** Stable identifier, also the i18n label key suffix. */
  readonly key: string;
  /** Null whenever the value is genuinely unknown — never coerced to 0. */
  readonly value: number | null;
  readonly delta: MetricDelta;
  readonly provenance: MetricProvenance;
}

/**
 * A section of the dashboard. `data` is non-null only when `status` is
 * OPERATIONAL; every other status carries no data by construction, which is
 * asserted by `sectionIsConsistent` and by the contract tests.
 */
export interface ExecutiveSection<T> {
  readonly status: SectionStatus;
  readonly data: T | null;
  /**
   * i18n key naming the permission or source that produced a non-OPERATIONAL
   * status, so the UI can say "your role does not include industrial
   * operations" rather than "no data".
   */
  readonly reasonKey: string | null;
}

export function operationalSection<T>(data: T): ExecutiveSection<T> {
  return { status: "OPERATIONAL", data, reasonKey: null };
}

export function emptySection<T>(reasonKey: string): ExecutiveSection<T> {
  return { status: "EMPTY", data: null, reasonKey };
}

export function refusedSection<T>(
  status: Extract<SectionStatus, "FORBIDDEN" | "UNAVAILABLE" | "NO_SOURCE">,
  reasonKey: string,
): ExecutiveSection<T> {
  return { status, data: null, reasonKey };
}

/**
 * The invariant the whole surface rests on: only OPERATIONAL carries data, and
 * every non-OPERATIONAL status states a reason. Exported so it can be asserted
 * at the API boundary as well as in tests — a section that fails this is a bug
 * that would otherwise reach the screen as a plausible empty panel.
 */
export function sectionIsConsistent<T>(section: ExecutiveSection<T>): boolean {
  if (section.status === "OPERATIONAL") return section.data !== null;
  return section.data === null && typeof section.reasonKey === "string" && section.reasonKey.length > 0;
}

/* ── Reader scope (types only; resolution lives in ./scope) ────────────────── */

/**
 * The three independently-checked authority axes.
 *
 * Declared HERE, in the pure layer, so the aggregation can depend on the SHAPE
 * of a reader's authority without importing the resolver — which pulls in the
 * session, the organization chain and `next/headers`. That import edge is what
 * made the aggregation unloadable outside a request context.
 */
export interface ExecutiveAuthority {
  readonly operations: boolean;
  readonly financial: boolean;
  readonly industrial: boolean;
}

/** A resolved reader. Produced only by `./scope`, never by a client payload. */
export interface ExecutiveScope {
  readonly userId: string;
  readonly organizationId: string;
  readonly memberId: string;
  /** The organization role, as stored. */
  readonly role: string;
  readonly authority: ExecutiveAuthority;
  /**
   * The sites this reader may see. `[]` means none, and industrial queries fail
   * closed on it rather than widening to the organization.
   */
  readonly allowedSiteIds: readonly string[];
  readonly timeZone: string;
  readonly dayCutoffMinutes: number;
  readonly correlationId: string;
}
