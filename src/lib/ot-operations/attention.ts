// PHASE 94C1 — deterministic "requires review" rules over verified DTO fields.
//
// WHAT THIS IS, AND WHAT IT REFUSES TO BE
// An OT console that says "3 gateways need attention" is making a claim an
// operator may act on. So every rule here is derived from a field the API
// genuinely returns, is documented beside its implementation, and is stated in
// language that describes a CONFIGURATION fact rather than a plant condition.
//
// WHAT IS DELIBERATELY NOT INFERRED
//   - online / offline: `lastSeenAt` records when an envelope was last
//     ACCEPTED. Silence may equally mean a healthy gateway with nothing to
//     report, a maintenance window, or a network fault — the API cannot tell
//     them apart, so neither may this module.
//   - failure, outage, compromise, unsafe condition, communication-loss
//     duration: no field supports any of them.
//   - severity ranking by elapsed time: there is no configured expectation of
//     reporting frequency to compare against.
//
// The rules are also SUBORDINATE to the server's answer: they run over the rows
// the current authorized, filtered page returned. They never fetch, never widen
// a query, and never speak about records the actor cannot see.

import type { DeviceRow, GatewayRow } from "./contract";

/**
 * The reasons a record can be flagged.
 *
 * Each is a translation key suffix under `otEdge.attention.reasons.*`, so the
 * wording is curated per locale rather than assembled from fragments.
 */
export type GatewayAttentionReason =
  /** Lifecycle is REGISTERED: provisioned but not yet put into service. */
  | "GATEWAY_AWAITING_ACTIVATION"
  /** Lifecycle is DISABLED or REVOKED: it will not be accepted if it reports. */
  | "GATEWAY_NOT_IN_SERVICE"
  /** Lifecycle is STALE — the server's own classification, echoed, not judged. */
  | "GATEWAY_MARKED_STALE"
  /** No signing reference is registered, so no envelope of its can verify. */
  | "GATEWAY_SIGNING_INCOMPLETE"
  /** No capability declared, so every payload type would be refused. */
  | "GATEWAY_NO_CAPABILITY"
  /** No envelope has ever been accepted. A fact, not a fault. */
  | "GATEWAY_NEVER_OBSERVED"
  /** Not associated with a site, so site-scoped operators cannot see it. */
  | "GATEWAY_NO_SITE";

export type DeviceAttentionReason =
  /** Lifecycle is UNKNOWN: the record carries no engineering state. */
  | "DEVICE_LIFECYCLE_UNKNOWN"
  /** Lifecycle is PLANNED or COMMISSIONING: not yet operational. */
  | "DEVICE_NOT_COMMISSIONED"
  /** Lifecycle is DECOMMISSIONED but the profile is still present. */
  | "DEVICE_DECOMMISSIONED"
  /** Not resolvable to a site, so site-scoped operators cannot see it. */
  | "DEVICE_NO_SITE";

export interface AttentionItem<R extends string> {
  /** The record's own id — used to link, never rendered as a label. */
  id: string;
  /** A safe, already-verified identifier for display. */
  label: string;
  reasons: R[];
}

/**
 * Flag one gateway.
 *
 * Order is stable so two renders of the same data produce the same list; there
 * is no ranking, because ranking would imply a severity the data cannot
 * support.
 */
export function gatewayAttention(row: GatewayRow): GatewayAttentionReason[] {
  const reasons: GatewayAttentionReason[] = [];

  // Lifecycle first: it is the server's own classification of the record, and
  // the categories are mutually exclusive.
  if (row.lifecycle === "REGISTERED") reasons.push("GATEWAY_AWAITING_ACTIVATION");
  else if (row.lifecycle === "STALE") reasons.push("GATEWAY_MARKED_STALE");
  else if (row.lifecycle === "DISABLED" || row.lifecycle === "REVOKED" || row.disabled) {
    reasons.push("GATEWAY_NOT_IN_SERVICE");
  }

  // Configuration completeness. Both make ingestion impossible today, which is
  // an actionable configuration fact rather than a diagnosis of the plant.
  if (!row.signingConfigured) reasons.push("GATEWAY_SIGNING_INCOMPLETE");
  if (row.capabilities.length === 0) reasons.push("GATEWAY_NO_CAPABILITY");

  // Observation. Reported ONLY as "no observation recorded" — never as offline.
  if (row.lastSeenAt === null) reasons.push("GATEWAY_NEVER_OBSERVED");

  if (row.siteId === null) reasons.push("GATEWAY_NO_SITE");

  return reasons;
}

export function deviceAttention(row: DeviceRow): DeviceAttentionReason[] {
  const reasons: DeviceAttentionReason[] = [];

  if (row.lifecycle === "UNKNOWN") reasons.push("DEVICE_LIFECYCLE_UNKNOWN");
  else if (row.lifecycle === "PLANNED" || row.lifecycle === "COMMISSIONING") {
    reasons.push("DEVICE_NOT_COMMISSIONED");
  } else if (row.lifecycle === "DECOMMISSIONED") reasons.push("DEVICE_DECOMMISSIONED");

  if (row.siteId === null) reasons.push("DEVICE_NO_SITE");

  return reasons;
}

/**
 * Collect the flagged gateways on the current page.
 *
 * `limit` bounds what is rendered, not what is computed: the count reported to
 * the operator is the full number flagged, so a truncated panel never
 * understates the situation.
 */
export function gatewayAttentionItems(
  rows: readonly GatewayRow[],
  limit = 5,
): { items: Array<AttentionItem<GatewayAttentionReason>>; total: number } {
  const flagged = rows
    .map((row) => ({ id: row.id, label: row.displayName || row.gatewayId, reasons: gatewayAttention(row) }))
    .filter((item) => item.reasons.length > 0);
  return { items: flagged.slice(0, limit), total: flagged.length };
}

export function deviceAttentionItems(
  rows: readonly DeviceRow[],
  limit = 5,
): { items: Array<AttentionItem<DeviceAttentionReason>>; total: number } {
  const flagged = rows
    .map((row) => ({
      // A device DTO carries no name; the engineering identifier is the only
      // human-meaningful value the contract guarantees, and the record id is
      // the honest last resort rather than an invented label.
      id: row.id,
      label: row.engineeringId ?? row.id,
      reasons: deviceAttention(row),
    }))
    .filter((item) => item.reasons.length > 0);
  return { items: flagged.slice(0, limit), total: flagged.length };
}

/* ── Page-level counts for the overview ─────────────────────────────────── */

export interface GatewayPageSummary {
  /** How many rows this page carries. Never presented as an org-wide figure. */
  shown: number;
  /** The server's total for the CURRENT filter — taken from the response. */
  total: number;
  inService: number;
  notInService: number;
  awaitingActivation: number;
  neverObserved: number;
  signingIncomplete: number;
}

/**
 * Summarise the rows on the current page.
 *
 * Every figure is a count of rows the server returned. Nothing is extrapolated
 * to the whole tenant, because a page is not a census — and the UI labels these
 * as "on this page" for exactly that reason.
 */
export function summariseGateways(rows: readonly GatewayRow[], total: number): GatewayPageSummary {
  let inService = 0;
  let notInService = 0;
  let awaitingActivation = 0;
  let neverObserved = 0;
  let signingIncomplete = 0;

  for (const row of rows) {
    if (row.lifecycle === "ACTIVE" && !row.disabled) inService += 1;
    if (row.disabled || row.lifecycle === "DISABLED" || row.lifecycle === "REVOKED") notInService += 1;
    if (row.lifecycle === "REGISTERED") awaitingActivation += 1;
    if (row.lastSeenAt === null) neverObserved += 1;
    if (!row.signingConfigured) signingIncomplete += 1;
  }

  return {
    shown: rows.length,
    total,
    inService,
    notInService,
    awaitingActivation,
    neverObserved,
    signingIncomplete,
  };
}

export interface DevicePageSummary {
  shown: number;
  total: number;
  operational: number;
  inCommissioning: number;
  lifecycleUnknown: number;
  /** Distinct sites represented on this page — not a tenant-wide site count. */
  sitesOnPage: number;
}

export function summariseDevices(rows: readonly DeviceRow[], total: number): DevicePageSummary {
  const sites = new Set<string>();
  let operational = 0;
  let inCommissioning = 0;
  let lifecycleUnknown = 0;

  for (const row of rows) {
    if (row.siteId) sites.add(row.siteId);
    if (row.lifecycle === "OPERATIONAL") operational += 1;
    if (row.lifecycle === "PLANNED" || row.lifecycle === "COMMISSIONING") inCommissioning += 1;
    if (row.lifecycle === "UNKNOWN") lifecycleUnknown += 1;
  }

  return { shown: rows.length, total, operational, inCommissioning, lifecycleUnknown, sitesOnPage: sites.size };
}
