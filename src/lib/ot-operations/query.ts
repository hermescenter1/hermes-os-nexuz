// PHASE 94C1 — the single translation between the URL and an OT list request.
//
// WHY ONE MODULE OWNS BOTH DIRECTIONS
// The address bar is the source of truth for filter state: a refresh, a Back
// button and a shared link must all reproduce the same result set. That only
// holds if reading the URL and writing it are inverses, which is far easier to
// guarantee — and to test — when both live in one pure function pair than when
// each component builds its own query string.
//
// TWO RULES THIS FILE ENFORCES
//   1. ONLY supported keys are ever emitted. An unsupported key is ignored by
//      the server, so sending one would let the UI imply a narrowing that never
//      happened. `search` in particular is sent verbatim — the server refuses
//      an over-long term rather than truncating it, and quietly shortening it
//      here would return rows that do not match what was typed.
//   2. An empty value is OMITTED, never sent blank. A cleared dropdown means
//      "no filter"; emitting `?lifecycle=` would put a meaningless key in every
//      shared link.
//
// Pure and dependency-free: no fetch, no React, no credential, no tenant value.

import {
  DEFAULT_PAGE_SIZE,
  DEVICE_CATEGORIES,
  DEVICE_LIFECYCLES,
  DEVICE_SORT_FIELDS,
  GATEWAY_CAPABILITIES,
  GATEWAY_LIFECYCLES,
  GATEWAY_SORT_FIELDS,
  MAX_PAGE_SIZE,
  PAGE_SIZES,
  SITE_ID_PATTERN,
  SORT_DIRECTIONS,
  type SortDirection,
} from "./contract";

export interface GatewayQueryState {
  lifecycle: string;
  siteId: string;
  capability: string;
  search: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: SortDirection;
}

export interface DeviceQueryState {
  lifecycle: string;
  siteId: string;
  category: string;
  search: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: SortDirection;
}

/** Anything that can answer `get(key)` — URLSearchParams or Next's ReadonlyURLSearchParams. */
export interface ReadableParams {
  get(key: string): string | null;
}

/* ── Reading ────────────────────────────────────────────────────────────── */

const text = (params: ReadableParams, key: string): string => (params.get(key) ?? "").trim();

/**
 * Read a value only if it is one the server accepts.
 *
 * A hand-edited URL carrying `?lifecycle=BOGUS` would otherwise put the control
 * into an impossible state and earn a 400 on every request. Dropping it here
 * degrades to "no filter", which is the honest reading of an unusable value.
 */
const oneOf = (params: ReadableParams, key: string, allowed: readonly string[]): string => {
  const value = text(params, key);
  return allowed.includes(value) ? value : "";
};

const siteOf = (params: ReadableParams): string => {
  const value = text(params, "siteId");
  return value && SITE_ID_PATTERN.test(value) ? value : "";
};

/** A page number is at least 1; anything unreadable falls back to the first. */
const pageOf = (params: ReadableParams): number => {
  const raw = Number(text(params, "page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
};

/**
 * A page size the UI actually offers, clamped to the server's ceiling.
 *
 * A URL asking for a size outside the offered set is honoured when it is within
 * the server's bounds — a deep link from a report should not be rewritten — but
 * it can never exceed `MAX_PAGE_SIZE`, which the server would clamp anyway.
 */
const pageSizeOf = (params: ReadableParams): number => {
  const raw = Number(text(params, "pageSize"));
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  const truncated = Math.trunc(raw);
  if (truncated < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(truncated, MAX_PAGE_SIZE);
};

const sortDirOf = (params: ReadableParams): SortDirection => {
  const value = text(params, "sortDir");
  return (SORT_DIRECTIONS as readonly string[]).includes(value) ? (value as SortDirection) : "desc";
};

export function readGatewayQuery(params: ReadableParams): GatewayQueryState {
  return {
    lifecycle: oneOf(params, "lifecycle", GATEWAY_LIFECYCLES),
    siteId: siteOf(params),
    capability: oneOf(params, "capability", GATEWAY_CAPABILITIES),
    search: text(params, "search"),
    page: pageOf(params),
    pageSize: pageSizeOf(params),
    sortBy: oneOf(params, "sortBy", GATEWAY_SORT_FIELDS) || GATEWAY_SORT_FIELDS[0],
    sortDir: sortDirOf(params),
  };
}

export function readDeviceQuery(params: ReadableParams): DeviceQueryState {
  return {
    lifecycle: oneOf(params, "lifecycle", DEVICE_LIFECYCLES),
    siteId: siteOf(params),
    category: oneOf(params, "category", DEVICE_CATEGORIES),
    search: text(params, "search"),
    page: pageOf(params),
    pageSize: pageSizeOf(params),
    sortBy: oneOf(params, "sortBy", DEVICE_SORT_FIELDS) || DEVICE_SORT_FIELDS[0],
    sortDir: sortDirOf(params),
  };
}

/* ── Writing ────────────────────────────────────────────────────────────── */

/**
 * Serialise state back to a query string.
 *
 * Ordering is fixed rather than insertion-dependent, so two equivalent states
 * produce byte-identical URLs — which is what makes a link stable and a request
 * cacheable by the browser's own bfcache.
 *
 * Page 1 and the default page size are omitted: the commonest URL stays clean,
 * and the reader above restores exactly these values from their absence.
 */
function serialise(pairs: Array<[string, string]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of pairs) {
    if (value !== "") params.set(key, value);
  }
  return params.toString();
}

const pagingPairs = (
  state: { page: number; pageSize: number; sortBy: string; sortDir: SortDirection },
  defaultSort: string,
): Array<[string, string]> => [
  ["page", state.page > 1 ? String(state.page) : ""],
  ["pageSize", state.pageSize === DEFAULT_PAGE_SIZE ? "" : String(state.pageSize)],
  ["sortBy", state.sortBy === defaultSort ? "" : state.sortBy],
  ["sortDir", state.sortDir === "desc" ? "" : state.sortDir],
];

export function writeGatewayQuery(state: GatewayQueryState): string {
  return serialise([
    ["lifecycle", state.lifecycle],
    ["siteId", state.siteId],
    ["capability", state.capability],
    ["search", state.search.trim()],
    ...pagingPairs(state, GATEWAY_SORT_FIELDS[0]),
  ]);
}

export function writeDeviceQuery(state: DeviceQueryState): string {
  return serialise([
    ["lifecycle", state.lifecycle],
    ["siteId", state.siteId],
    ["category", state.category],
    ["search", state.search.trim()],
    ...pagingPairs(state, DEVICE_SORT_FIELDS[0]),
  ]);
}

/* ── The request the API actually receives ──────────────────────────────── */

/**
 * Build the API query string.
 *
 * Distinct from the URL serialiser on purpose: the address bar omits defaults
 * for readability, whereas the request states `page` and `pageSize` explicitly
 * so the response is never at the mercy of a server default changing.
 */
export function gatewayRequestQuery(state: GatewayQueryState): string {
  return serialise([
    ["lifecycle", state.lifecycle],
    ["siteId", state.siteId],
    ["capability", state.capability],
    ["search", state.search.trim()],
    ["page", String(state.page)],
    ["pageSize", String(state.pageSize)],
    ["sortBy", state.sortBy],
    ["sortDir", state.sortDir],
  ]);
}

export function deviceRequestQuery(state: DeviceQueryState): string {
  return serialise([
    ["lifecycle", state.lifecycle],
    ["siteId", state.siteId],
    ["category", state.category],
    ["search", state.search.trim()],
    ["page", String(state.page)],
    ["pageSize", String(state.pageSize)],
    ["sortBy", state.sortBy],
    ["sortDir", state.sortDir],
  ]);
}

/* ── State transitions ──────────────────────────────────────────────────── */

/**
 * Apply a filter change.
 *
 * Page ALWAYS returns to 1. Keeping the page across a filter change is the
 * classic way to show an empty list for a filter that has results: page 7 of a
 * narrowed set usually does not exist.
 */
export function withFilters<T extends { page: number }>(state: T, changes: Partial<T>): T {
  return { ...state, ...changes, page: 1 };
}

/** Changing the page size also returns to page 1 — the offsets have moved. */
export function withPageSize<T extends { page: number; pageSize: number }>(state: T, pageSize: number): T {
  const allowed = (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
  return { ...state, pageSize: allowed, page: 1 };
}

/**
 * True when any narrowing filter is active. Paging and sorting do not count —
 * they change the view of a result set, not which records belong to it.
 *
 * The third filter differs by entity (`capability` for gateways, `category`
 * for devices), so both are accepted as optional rather than reaching for an
 * index signature that would silently accept any key at all.
 */
export function hasActiveFilters(state: {
  lifecycle: string;
  siteId: string;
  search: string;
  capability?: string;
  category?: string;
}): boolean {
  return Boolean(state.lifecycle || state.siteId || state.search.trim() || state.capability || state.category);
}

/** The page count implied by a server total. At least 1, so the UI never shows "page 1 of 0". */
export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
