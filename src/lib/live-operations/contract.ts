/**
 * PHASE 109-C-UI.2 — Live Operations: the domain contract.
 *
 * Pure data and predicates. No React, no `next-intl`, no I/O, no clock — the
 * caller supplies the instant, so a run is reproducible and testable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * The industrial read layer this page sits on top of degrades by returning
 * nothing:
 *
 *     src/lib/industrial/telemetry.ts:102   if (!prisma) return [];
 *     src/lib/industrial/alerts.ts:58       if (!db) return [];
 *     src/lib/industrial/sites.ts:31        if (!prisma) return [];
 *     src/lib/industrial/assets.ts:37       if (!prisma) return [];
 *
 * For most surfaces that is a reasonable degradation. On an operations screen it
 * is not: "0 unresolved issues" and "the database is unreachable" render
 * identically, and the first reading an operator takes from an empty alarm list
 * is *the plant is fine*. An empty list from a blind instrument is the most
 * dangerous screen this product could ship.
 *
 * So no value on this page is a bare number. Every one is a `Measured<T>`
 * carrying the STATE it is in, and a value may only be read when that state is
 * `OK`. Everything else — not connected, connected but empty, stale, unknown —
 * is a distinct state with its own rendering, and the type system will not let a
 * caller reach the number without deciding what to do about the others.
 */

/* ── connection ───────────────────────────────────────────────────────────── */

/**
 * Whether the server reached its data source AT ALL for this request.
 *
 * Deliberately separate from whether the source returned rows. Collapsing the
 * two is the defect this whole module exists to prevent.
 */
export type ConnectionState = "CONNECTED" | "NOT_CONNECTED";

/**
 * The state of a single measured value.
 *
 * A closed union. Adding a member is a product decision about what the page may
 * claim, not an accident of a payload shape.
 *
 *   OK             the source answered and the value is real
 *   NO_DATA        the source answered and there is genuinely nothing
 *   NOT_CONNECTED  the source was never reached — the value is UNKNOWABLE, not zero
 *   STALE          real, but older than this page is willing to present as current
 *   UNKNOWN        the source answered with something it could not classify
 *   SIMULATED      demonstration data, never produced by this module today
 */
export type DataState =
  | "OK"
  | "NO_DATA"
  | "NOT_CONNECTED"
  | "STALE"
  | "UNKNOWN"
  | "SIMULATED";

export const ALL_DATA_STATES: readonly DataState[] = [
  "OK", "NO_DATA", "NOT_CONNECTED", "STALE", "UNKNOWN", "SIMULATED",
] as const;

/** The states in which a numeric value may be shown to a reader. */
export const READABLE_STATES: readonly DataState[] = ["OK", "STALE"] as const;

export function isReadable(state: DataState): boolean {
  return (READABLE_STATES as readonly string[]).includes(state);
}

/* ── freshness ────────────────────────────────────────────────────────────── */

export type Freshness = "FRESH" | "AGEING" | "STALE" | "UNKNOWN";

/**
 * Freshness thresholds, in milliseconds, stated here rather than inline so they
 * can be argued with rather than discovered.
 *
 * These are presentation bounds for an ADVISORY screen. They are not a process
 * safety judgement and must never be used as one.
 */
export const FRESHNESS_LIMITS = {
  freshWithinMs: 5 * 60_000,     // 5 minutes
  ageingWithinMs: 60 * 60_000,   // 1 hour
} as const;

/**
 * Classify freshness from the SERVER-OBSERVED instant.
 *
 * `TelemetryRecord.timestamp` is annotated "gateway-reported, untrusted" in the
 * schema, while `receivedAt` is "ALWAYS server-set". Freshness is therefore
 * computed from the server's observation only: a gateway with a wrong clock — or
 * a hostile one — must not be able to make stale data look fresh.
 */
export function classifyFreshness(
  observedAtEpochMs: number | null,
  nowEpochMs: number,
  limits: { freshWithinMs: number; ageingWithinMs: number } = FRESHNESS_LIMITS,
): Freshness {
  if (observedAtEpochMs === null || !Number.isFinite(observedAtEpochMs)) return "UNKNOWN";
  const age = nowEpochMs - observedAtEpochMs;
  // A timestamp in the future is not fresh; it is unclassifiable. Treating it as
  // fresh would let a clock error present arbitrarily old data as current.
  if (age < 0) return "UNKNOWN";
  if (age <= limits.freshWithinMs) return "FRESH";
  if (age <= limits.ageingWithinMs) return "AGEING";
  return "STALE";
}

/* ── provenance ───────────────────────────────────────────────────────────── */

/** How a value came to be, as far as this page can honestly say. */
export type Confidence = "MEASURED" | "DERIVED" | "UNKNOWN";

export interface Provenance {
  /** Stable identifier of the origin, e.g. `postgres:AssetAlert`. Never prose. */
  readonly source: string;
  readonly connection: ConnectionState;
  /** Server-observed instant. The only instant freshness may be derived from. */
  readonly observedAtEpochMs: number | null;
  /**
   * The instant the source CLAIMED. Recorded for display beside the observed
   * one, never used for freshness — see `classifyFreshness`.
   */
  readonly reportedAtEpochMs: number | null;
  readonly freshness: Freshness;
  readonly confidence: Confidence;
}

/** Provenance for a source that was never reached. */
export function unreachedProvenance(source: string): Provenance {
  return {
    source,
    connection: "NOT_CONNECTED",
    observedAtEpochMs: null,
    reportedAtEpochMs: null,
    freshness: "UNKNOWN",
    confidence: "UNKNOWN",
  };
}

/* ── the measured value ───────────────────────────────────────────────────── */

/**
 * A value and the state it is in.
 *
 * `value` is `null` in every state except `OK` and `STALE`. That is enforced by
 * the constructors below rather than by convention, so no caller can build a
 * `NOT_CONNECTED` measurement that still carries a number for a careless
 * renderer to find.
 */
export interface Measured<T> {
  readonly state: DataState;
  readonly value: T | null;
  readonly provenance: Provenance;
}

export function measured<T>(
  value: T,
  provenance: Provenance,
  opts: { emptyWhen?: (v: T) => boolean } = {},
): Measured<T> {
  if (provenance.connection === "NOT_CONNECTED") {
    // Defence in depth: a caller that hands us a value from an unreached source
    // has a bug, and the honest answer is still "not connected".
    return { state: "NOT_CONNECTED", value: null, provenance };
  }
  if (opts.emptyWhen?.(value)) {
    return { state: "NO_DATA", value: null, provenance };
  }
  if (provenance.freshness === "STALE") {
    return { state: "STALE", value, provenance };
  }
  return { state: "OK", value, provenance };
}

export function unavailable<T>(source: string): Measured<T> {
  return { state: "NOT_CONNECTED", value: null, provenance: unreachedProvenance(source) };
}

/* ── operational events ───────────────────────────────────────────────────── */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const ALL_SEVERITIES: readonly Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** Ordering for display. Lower sorts first. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

export function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (ALL_SEVERITIES as readonly string[]).includes(v);
}

/**
 * Where an event came from. `CATALOGUE` exists so the distinction can be
 * REPRESENTED and refused, not so it can be displayed: the static engineering
 * corpus behind `/api/operations/*` is identical for every organisation and is
 * never an operational event. `isOperationalOrigin` is the gate.
 */
export type EventOrigin = "PLANT_RECORD" | "DERIVED" | "CATALOGUE";

export function isOperationalOrigin(origin: EventOrigin): boolean {
  return origin === "PLANT_RECORD" || origin === "DERIVED";
}

export type AcknowledgementState = "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";

/**
 * The acknowledgement vocabulary, in escalation order.
 *
 * Exported for the same reason as ALL_SEVERITIES: the interface must be able to
 * offer EVERY value the filter accepts. A value the parser honours but the
 * screen cannot show or clear is an invisible filter.
 */
export const ALL_ACKNOWLEDGEMENTS: readonly AcknowledgementState[] = [
  "UNACKNOWLEDGED",
  "ACKNOWLEDGED",
  "RESOLVED",
] as const;

export function isAcknowledgement(v: unknown): v is AcknowledgementState {
  return typeof v === "string" && (ALL_ACKNOWLEDGEMENTS as readonly string[]).includes(v);
}

export interface OperationalEvent {
  readonly id: string;
  readonly organizationId: string;
  /**
   * Null when the record carries no site attribution.
   *
   * `AssetAlert` has no `siteId` column, so an alert cannot be filtered by site
   * at the database. This field is `null` for those records rather than guessed,
   * and `siteFilterable` below is what stops an unfilterable record from being
   * presented inside a site-scoped view.
   */
  readonly siteId: string | null;
  readonly assetId: string | null;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly origin: EventOrigin;
  /** Server-observed. Never the source's own claim. */
  readonly observedAtEpochMs: number;
  readonly acknowledgement: AcknowledgementState;
  readonly owner: string | null;
  readonly evidence: readonly EvidenceRef[];
}

/** A pointer into another surface. Never a copy of its content. */
export interface EvidenceRef {
  readonly kind: "asset" | "site" | "telemetry-tag" | "diagnostic-case" | "document";
  readonly id: string;
  readonly label: string;
}

/**
 * May this record be shown inside a site-scoped view?
 *
 * A record with no `siteId` cannot be proved to belong to a site the reader may
 * see. Under an explicit site filter it is therefore EXCLUDED rather than shown,
 * because "we could not tell" must never resolve to "show it" on a screen that
 * separates one company's plant from another's.
 */
export function siteFilterable(event: OperationalEvent): boolean {
  return event.siteId !== null;
}

/* ── filters ──────────────────────────────────────────────────────────────── */

export type TimeRangeKey = "1h" | "24h" | "7d" | "30d";

export const ALL_TIME_RANGES: readonly TimeRangeKey[] = ["1h", "24h", "7d", "30d"] as const;

export const TIME_RANGE_MS: Readonly<Record<TimeRangeKey, number>> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

export interface LiveOperationsFilter {
  readonly siteId: string | null;
  readonly severity: Severity | null;
  readonly acknowledgement: AcknowledgementState | null;
  readonly timeRange: TimeRangeKey;
}

export const DEFAULT_FILTER: LiveOperationsFilter = Object.freeze({
  siteId: null,
  severity: null,
  acknowledgement: null,
  timeRange: "24h",
});

/**
 * Parse untrusted query parameters into a filter.
 *
 * Refusal by allowlist, never sanitisation: anything unrecognised falls back to
 * the default rather than being passed through to a query. `siteId` is accepted
 * only if it appears in `allowedSiteIds`, so a hand-typed id for another
 * company's site is rejected here as well as at the query — a filter is not an
 * authorization boundary, but it must not be a way around one either.
 */
export function parseFilter(
  params: Readonly<Record<string, string | string[] | undefined>>,
  allowedSiteIds: readonly string[],
): LiveOperationsFilter {
  const one = (k: string): string | null => {
    const v = params[k];
    if (typeof v === "string") return v;
    // A repeated parameter is ambiguous. Ambiguity resolves to the default.
    return null;
  };

  const rawSite = one("site");
  const severity = one("severity");
  const ack = one("ack");
  const range = one("range");

  return {
    siteId: rawSite !== null && allowedSiteIds.includes(rawSite) ? rawSite : null,
    severity: isSeverity(severity) ? severity : null,
    acknowledgement: isAcknowledgement(ack) ? ack : null,
    timeRange: (ALL_TIME_RANGES as readonly string[]).includes(range ?? "")
      ? (range as TimeRangeKey)
      : DEFAULT_FILTER.timeRange,
  };
}

/**
 * Apply a filter to already-authorized events.
 *
 * This is PRESENTATION filtering. It runs after the tenant and site boundary has
 * been enforced at the query, and it is never the only thing standing between
 * two organisations.
 */
export function applyFilter(
  events: readonly OperationalEvent[],
  filter: LiveOperationsFilter,
  nowEpochMs: number,
): readonly OperationalEvent[] {
  const since = nowEpochMs - TIME_RANGE_MS[filter.timeRange];
  return events.filter((e) => {
    if (e.observedAtEpochMs < since) return false;
    if (filter.severity !== null && e.severity !== filter.severity) return false;
    if (filter.acknowledgement !== null && e.acknowledgement !== filter.acknowledgement) return false;
    if (filter.siteId !== null) {
      // Unattributable records are excluded under an explicit site filter.
      if (!siteFilterable(e)) return false;
      if (e.siteId !== filter.siteId) return false;
    }
    return true;
  });
}

/** Deterministic ordering: severity, then most recently observed, then id. */
export function sortEvents(events: readonly OperationalEvent[]): readonly OperationalEvent[] {
  return [...events].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.observedAtEpochMs - a.observedAtEpochMs ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/* ── the feed ─────────────────────────────────────────────────────────────── */

export interface SourceHealth {
  readonly source: string;
  readonly connection: ConnectionState;
  readonly freshness: Freshness;
  readonly observedAtEpochMs: number | null;
}

export interface LiveOperationsSummary {
  readonly activeSignals: Measured<number>;
  readonly unresolvedIssues: Measured<number>;
  readonly staleSources: Measured<number>;
  readonly pendingValidations: Measured<number>;
  readonly recentEvents: Measured<number>;
}

export interface LiveOperationsFeed {
  readonly generatedAtEpochMs: number;
  readonly connection: ConnectionState;
  readonly organizationId: string;
  /** Sites the reader may see. Empty means no site access, not "all sites". */
  readonly allowedSiteIds: readonly string[];
  readonly filter: LiveOperationsFilter;
  readonly summary: LiveOperationsSummary;
  readonly events: readonly OperationalEvent[];
  readonly eventsState: DataState;
  readonly sources: readonly SourceHealth[];
  /**
   * Capabilities this deployment genuinely does not have, stated so the UI can
   * say why a control is absent instead of rendering a dead one.
   */
  readonly unavailableCapabilities: readonly string[];
}

/** Every source that could not be reached. */
export function unreachedSources(feed: LiveOperationsFeed): readonly SourceHealth[] {
  return feed.sources.filter((s) => s.connection === "NOT_CONNECTED");
}

/**
 * Is this feed safe to read as an operational picture?
 *
 * False whenever any source was unreachable: a partial picture presented as a
 * whole one is the failure this module exists to prevent.
 */
export function isCompletePicture(feed: LiveOperationsFeed): boolean {
  return feed.connection === "CONNECTED" && unreachedSources(feed).length === 0;
}
