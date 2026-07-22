// PHASE 94B.1 — the OT list-query filter contract.
//
// WHY A DEDICATED PARSER AND NOT AN EXTENSION OF `parseQuery`
// `parseQuery` in route-kit.ts is shared by every Phase 94 list route,
// including the engineering surfaces this phase does not touch. Teaching it to
// reject unknown parameters would change behaviour for routes nobody audited
// here. This module is additive and applies only where a route opts in.
//
// THE PROBLEM THIS SOLVES
// Before this phase the list routes read only page/pageSize/sortBy/sortDir, and
// `parseQuery` IGNORES anything else. A dashboard that sent `?lifecycle=ACTIVE`
// received the unfiltered page and would have presented it as filtered — the
// interface would have lied about what an operator was looking at. Silence was
// the defect; every key declared here is either honoured or refused.
//
// EVERY VALUE IS ALLOW-LISTED, NEVER INTERPOLATED
// The accepted sets below are copied from the Prisma enums and pinned to them
// by a test that re-reads schema.prisma. A value outside a set is refused with
// a 400 that never echoes what the caller sent, so this endpoint cannot be used
// to probe which enum members exist.
//
// FILTERS ARE SUBORDINATE TO TENANCY
// Nothing here resolves an organization, a site allow-list or an actor. A
// filter is a NARROWING predicate that the repository composes underneath the
// trusted scope with AND; it can never widen a result set. In particular
// `siteId` cannot reach a site the actor is not already allowed to see — it
// intersects with the scope, and an unauthorised site simply yields no rows,
// which is also why it discloses nothing.

import { NextResponse } from "next/server";
import { badRequest } from "./route-kit";

/* ── Allow-lists (mirror the Prisma enums exactly) ──────────────────────── */

/** `enum EdgeGatewayLifecycle` — prisma/schema.prisma */
export const GATEWAY_LIFECYCLE_VALUES = [
  "REGISTERED",
  "ACTIVE",
  "STALE",
  "DISABLED",
  "REVOKED",
  "SIMULATOR",
] as const;

/** `enum EdgeGatewayCapability` — prisma/schema.prisma */
export const GATEWAY_CAPABILITY_VALUES = [
  "PROJECT_METADATA_IMPORT",
  "TAG_METADATA_IMPORT",
  "ALARM_METADATA_IMPORT",
  "NETWORK_METADATA_IMPORT",
  "READ_ONLY_TELEMETRY",
  "SIMULATION",
] as const;

/** `enum OtLifecycleState` — prisma/schema.prisma */
export const DEVICE_LIFECYCLE_VALUES = [
  "PLANNED",
  "COMMISSIONING",
  "OPERATIONAL",
  "MAINTENANCE",
  "DECOMMISSIONED",
  "UNKNOWN",
] as const;

/** `enum OtDeviceCategory` — prisma/schema.prisma */
export const DEVICE_CATEGORY_VALUES = [
  "PLC",
  "HMI",
  "SCADA_SERVER",
  "VFD",
  "MCC",
  "REMOTE_IO",
  "INDUSTRIAL_PC",
  "SAFETY_CONTROLLER",
  "NETWORK_SWITCH",
  "GATEWAY",
  "SENSOR_AGGREGATOR",
  "OTHER",
] as const;

/**
 * The shape an identifier may take.
 *
 * Deliberately narrower than the write schemas' `max(191)`: a site identifier
 * is a generated cuid, so anything carrying whitespace, quotes, wildcards or
 * path separators is malformed rather than merely absent, and is refused before
 * it reaches a query.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

/** Bound on the free-text term. Long enough to paste a serial, short enough
 *  that the term itself cannot become a payload. */
export const MAX_SEARCH_LENGTH = 120;

/* ── Parsed shapes ──────────────────────────────────────────────────────── */

export interface GatewayListFilters {
  lifecycle?: string;
  siteId?: string;
  capability?: string;
  /** Matched against the gateway's name and its hardware identifier. */
  search?: string;
}

export interface DeviceListFilters {
  lifecycle?: string;
  siteId?: string;
  category?: string;
  /** Matched against the related asset's name and the engineering identifier. */
  search?: string;
}

export type FilterParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

/* ── Primitives ─────────────────────────────────────────────────────────── */

/**
 * Read a parameter, treating absent and blank identically.
 *
 * A cleared dropdown submits `?lifecycle=`; refusing that would turn a normal
 * interaction into an error. An empty value means "no filter", never "match
 * nothing".
 */
function raw(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A refusal that names the PARAMETER but never repeats the VALUE.
 *
 * Echoing the value would put attacker-controlled text into a response body and
 * into every log between here and the browser.
 */
function invalid(key: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: badRequest(
      "INVALID_QUERY_PARAMETER",
      `The value supplied for "${key}" is not accepted.`,
    ),
  };
}

type Parsed<T> = { ok: true; value: T | undefined } | { ok: false; response: NextResponse };

/** An enum parameter: present and allow-listed, or absent, or refused. */
function parseEnum(url: URL, key: string, allowed: readonly string[]): Parsed<string> {
  const value = raw(url, key);
  if (value === null) return { ok: true, value: undefined };
  // Case-sensitive on purpose: these are persisted enum members, not prose.
  return allowed.includes(value) ? { ok: true, value } : invalid(key);
}

function parseIdentifier(url: URL, key: string): Parsed<string> {
  const value = raw(url, key);
  if (value === null) return { ok: true, value: undefined };
  return IDENTIFIER_PATTERN.test(value) ? { ok: true, value } : invalid(key);
}

function parseSearch(url: URL, key: string): Parsed<string> {
  const value = raw(url, key);
  if (value === null) return { ok: true, value: undefined };
  // Refused rather than truncated: a silently shortened term would return
  // results that do not match what the operator typed.
  return value.length <= MAX_SEARCH_LENGTH ? { ok: true, value } : invalid(key);
}

/* ── Route-facing parsers ───────────────────────────────────────────────── */

/**
 * Gateway list filters.
 *
 * There is deliberately NO `category` parameter: `EdgeGatewayProfile` has no
 * such column, and accepting one would be a filter that quietly does nothing.
 */
export function parseGatewayListFilters(url: URL): FilterParseResult<GatewayListFilters> {
  const lifecycle = parseEnum(url, "lifecycle", GATEWAY_LIFECYCLE_VALUES);
  if (!lifecycle.ok) return lifecycle;
  const siteId = parseIdentifier(url, "siteId");
  if (!siteId.ok) return siteId;
  const capability = parseEnum(url, "capability", GATEWAY_CAPABILITY_VALUES);
  if (!capability.ok) return capability;
  const search = parseSearch(url, "search");
  if (!search.ok) return search;

  return {
    ok: true,
    value: {
      ...(lifecycle.value ? { lifecycle: lifecycle.value } : {}),
      ...(siteId.value ? { siteId: siteId.value } : {}),
      ...(capability.value ? { capability: capability.value } : {}),
      ...(search.value ? { search: search.value } : {}),
    },
  };
}

/**
 * Device list filters.
 *
 * There is deliberately NO `vendor` parameter. `OtDeviceProfile` stores no
 * manufacturer, model or protocol column — the corresponding DTO fields are
 * always null — so a vendor filter could only ever match nothing.
 */
export function parseDeviceListFilters(url: URL): FilterParseResult<DeviceListFilters> {
  const lifecycle = parseEnum(url, "lifecycle", DEVICE_LIFECYCLE_VALUES);
  if (!lifecycle.ok) return lifecycle;
  const siteId = parseIdentifier(url, "siteId");
  if (!siteId.ok) return siteId;
  const category = parseEnum(url, "category", DEVICE_CATEGORY_VALUES);
  if (!category.ok) return category;
  const search = parseSearch(url, "search");
  if (!search.ok) return search;

  return {
    ok: true,
    value: {
      ...(lifecycle.value ? { lifecycle: lifecycle.value } : {}),
      ...(siteId.value ? { siteId: siteId.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(search.value ? { search: search.value } : {}),
    },
  };
}
