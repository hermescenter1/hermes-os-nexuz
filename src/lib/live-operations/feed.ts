/**
 * PHASE 109-C-UI.2 — Live Operations: the server-side feed.
 *
 * Runs on the SERVER only. There is no API route and no client fetch for this
 * page, deliberately:
 *
 *   - every read is already behind `requirePlatformAuth` → `requireOrgActor` →
 *     `requirePermission` at the page, so a new public endpoint would add an
 *     attack surface without adding a capability;
 *   - the sibling multi-site page documents what a client fetch costs here — it
 *     cast a `401 {"error":…}` body straight into a dashboard shape and rendered
 *     a screen of blanks for what was actually an auth failure. Reading on the
 *     server removes that failure mode rather than handling it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO THINGS THIS MODULE REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. It never reports "nothing" without saying whether it was CONNECTED. The
 *    libraries underneath return `[]` when the database is unreachable, which on
 *    an operations screen reads as "the plant is fine". This module asks
 *    `getPrisma()` itself, once, before anything else, and every result it
 *    produces carries that answer.
 *
 * 2. It never presents the static engineering catalogue as plant activity.
 *    `/api/operations/*` is built from `buildEngGraph()`, is identical for every
 *    organisation and is guarded only by an anonymous rate limiter. Those are
 *    ALARM DEFINITIONS, not events. Nothing here reads them.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getAllowedSiteIds } from "@/lib/site/context";
import { listSites } from "@/lib/industrial/sites";
import { listAssets } from "@/lib/industrial/assets";
import { getOrgAlerts, type AssetAlertRecord } from "@/lib/industrial/alerts";

import {
  applyFilter,
  classifyFreshness,
  isSeverity,
  measured,
  sortEvents,
  unavailable,
  unreachedProvenance,
  type ConnectionState,
  type DataState,
  type EvidenceRef,
  type LiveOperationsFeed,
  type LiveOperationsFilter,
  type LiveOperationsSummary,
  type OperationalEvent,
  type Provenance,
  type SourceHealth,
} from "./contract";

/** Stable source identifiers. Never prose, never translated. */
export const SOURCES = {
  sites: "postgres:IndustrialSite",
  assets: "postgres:IndustrialAsset",
  alerts: "postgres:AssetAlert",
} as const;

/**
 * Capabilities this deployment genuinely does not have.
 *
 * Stated as identifiers so the interface can explain an ABSENT control instead
 * of rendering a disabled one that implies the feature is one permission away.
 */
export const UNAVAILABLE_CAPABILITIES = [
  // No historian or streaming transport is wired; the page reads records, it
  // does not subscribe to a live feed.
  "liveStream",
  // `AssetAlert` has no acknowledgement column and no acknowledge mutation
  // exists, so acknowledgement is READ from `dismissed`/`resolvedAt` and cannot
  // be written from here.
  "acknowledgeFromThisSurface",
  // Nothing in this product may command equipment. There is no control path,
  // and this page must never suggest one.
  "safeActionExecution",
] as const;

function provenanceFor(
  source: string,
  connection: ConnectionState,
  observedAtEpochMs: number | null,
  nowEpochMs: number,
  confidence: Provenance["confidence"] = "MEASURED",
): Provenance {
  if (connection === "NOT_CONNECTED") return unreachedProvenance(source);
  return {
    source,
    connection,
    observedAtEpochMs,
    reportedAtEpochMs: null,
    freshness: classifyFreshness(observedAtEpochMs, nowEpochMs),
    confidence,
  };
}

function epoch(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Map an alert row onto an operational event.
 *
 * `siteId` comes from the ASSET, resolved through the site-scoped asset list —
 * never from the alert, which has no site column. An alert whose asset is not in
 * the reader's scope produces `null` here and is dropped by the caller.
 */
function toEvent(
  alert: AssetAlertRecord,
  siteByAsset: ReadonlyMap<string, string>,
  assetNameById: ReadonlyMap<string, string>,
): OperationalEvent | null {
  const observedAtEpochMs = epoch(alert.createdAt);
  // A record whose server timestamp cannot be parsed cannot be placed on a
  // timeline. Dropping it is honest; guessing "now" would fabricate recency.
  if (observedAtEpochMs === null) return null;
  if (!isSeverity(alert.severity)) return null;

  const siteId = siteByAsset.get(alert.assetId) ?? null;

  const evidence: EvidenceRef[] = [
    { kind: "asset", id: alert.assetId, label: assetNameById.get(alert.assetId) ?? alert.assetId },
  ];
  if (siteId) evidence.push({ kind: "site", id: siteId, label: siteId });

  return {
    id: alert.id,
    organizationId: alert.organizationId,
    siteId,
    assetId: alert.assetId,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    origin: "PLANT_RECORD",
    observedAtEpochMs,
    acknowledgement: alert.resolvedAt
      ? "RESOLVED"
      : alert.dismissed
        ? "ACKNOWLEDGED"
        : "UNACKNOWLEDGED",
    owner: alert.dismissedBy ?? null,
    evidence,
  };
}

export interface FeedRequest {
  readonly organizationId: string;
  readonly userId: string;
  readonly filter: LiveOperationsFilter;
  readonly nowEpochMs: number;
}

/**
 * Build the feed.
 *
 * The order is load-bearing: connection first, then scope, then data. A caller
 * cannot reach the data without the first two having been decided.
 */
export async function buildLiveOperationsFeed(req: FeedRequest): Promise<LiveOperationsFeed> {
  const { organizationId, userId, filter, nowEpochMs } = req;

  // ── 1. connection, asked once and explicitly ────────────────────────────
  const prisma = await getPrisma();
  const connection: ConnectionState = prisma ? "CONNECTED" : "NOT_CONNECTED";

  const sources: SourceHealth[] = [];
  const health = (source: string, observedAtEpochMs: number | null): SourceHealth => ({
    source,
    connection,
    freshness:
      connection === "NOT_CONNECTED"
        ? "UNKNOWN"
        : classifyFreshness(observedAtEpochMs, nowEpochMs),
    observedAtEpochMs: connection === "NOT_CONNECTED" ? null : observedAtEpochMs,
  });

  if (connection === "NOT_CONNECTED") {
    for (const s of Object.values(SOURCES)) sources.push(health(s, null));
    return {
      generatedAtEpochMs: nowEpochMs,
      connection,
      organizationId,
      allowedSiteIds: [],
      filter,
      summary: {
        activeSignals: unavailable<number>(SOURCES.assets),
        unresolvedIssues: unavailable<number>(SOURCES.alerts),
        staleSources: unavailable<number>(SOURCES.alerts),
        pendingValidations: unavailable<number>(SOURCES.alerts),
        recentEvents: unavailable<number>(SOURCES.alerts),
      },
      events: [],
      // NOT the same as "no events". This is the whole point of the module.
      eventsState: "NOT_CONNECTED",
      sources,
      unavailableCapabilities: [...UNAVAILABLE_CAPABILITIES],
    };
  }

  // ── 2. scope, fail-closed ───────────────────────────────────────────────
  // `getAllowedSiteIds` returns [] on any throw and [] for a non-member. An
  // empty list means NO site access — it is never widened to "all sites".
  const allowedSiteIds = await getAllowedSiteIds(userId, organizationId);

  const sites = await listSites(organizationId, allowedSiteIds);
  const assets = await listAssets(organizationId, { allowedSiteIds });

  const siteByAsset = new Map(assets.map((a) => [a.id, a.siteId]));
  const assetNameById = new Map(assets.map((a) => [a.id, a.name]));

  // ── 3. events ───────────────────────────────────────────────────────────
  //
  // F-02 is now closed at its root (109-C-UI.2-R1): `getOrgAlerts` takes the
  // caller's permitted sites and resolves them into an `assetId IN (...)`
  // predicate, because `AssetAlert` has no `siteId` of its own. So the rows
  // arriving here are already site-scoped by the database.
  //
  // The re-attribution below STAYS. It is not redundancy for its own sake: this
  // page's whole claim is that a reader sees their own plant and nothing else,
  // and that claim should not rest on a single predicate in another module. An
  // alert whose asset is not in the site-scoped asset map is still dropped.
  const rawAlerts = await getOrgAlerts(organizationId, {
    includeDismissed: true,
    allowedSiteIds,
  });

  const scoped: OperationalEvent[] = [];
  let droppedOutOfScope = 0;
  for (const alert of rawAlerts) {
    if (!siteByAsset.has(alert.assetId)) {
      droppedOutOfScope += 1;
      continue;
    }
    const event = toEvent(alert, siteByAsset, assetNameById);
    if (event) scoped.push(event);
  }
  void droppedOutOfScope; // counted for the security test, not shown to readers

  const visible = sortEvents(applyFilter(scoped, filter, nowEpochMs));

  const newestObserved = scoped.reduce<number | null>(
    (acc, e) => (acc === null || e.observedAtEpochMs > acc ? e.observedAtEpochMs : acc),
    null,
  );

  sources.push(
    health(SOURCES.sites, sites.length > 0 ? nowEpochMs : null),
    health(SOURCES.assets, assets.length > 0 ? nowEpochMs : null),
    health(SOURCES.alerts, newestObserved),
  );

  const alertProvenance = provenanceFor(SOURCES.alerts, connection, newestObserved, nowEpochMs);
  const assetProvenance = provenanceFor(
    SOURCES.assets,
    connection,
    assets.length > 0 ? nowEpochMs : null,
    nowEpochMs,
  );

  const unresolved = visible.filter((e) => e.acknowledgement === "UNACKNOWLEDGED").length;
  const pending = visible.filter(
    (e) => e.acknowledgement === "UNACKNOWLEDGED" && (e.severity === "CRITICAL" || e.severity === "HIGH"),
  ).length;
  const staleCount = sources.filter((s) => s.freshness === "STALE").length;

  const summary: LiveOperationsSummary = {
    activeSignals: measured(assets.length, assetProvenance, { emptyWhen: (n) => n === 0 }),
    unresolvedIssues: measured(unresolved, alertProvenance, { emptyWhen: () => scoped.length === 0 }),
    // A count of zero stale sources is a real, useful answer — not "no data".
    staleSources: measured(staleCount, alertProvenance),
    pendingValidations: measured(pending, alertProvenance, { emptyWhen: () => scoped.length === 0 }),
    recentEvents: measured(visible.length, alertProvenance, { emptyWhen: () => scoped.length === 0 }),
  };

  const eventsState: DataState =
    allowedSiteIds.length === 0 ? "NO_DATA" : visible.length > 0 ? "OK" : "NO_DATA";

  return {
    generatedAtEpochMs: nowEpochMs,
    connection,
    organizationId,
    allowedSiteIds,
    filter,
    summary,
    events: visible,
    eventsState,
    sources,
    unavailableCapabilities: [...UNAVAILABLE_CAPABILITIES],
  };
}
