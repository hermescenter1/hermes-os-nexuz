// PHASE 94C1 — the browser's only door to the OT list API.
//
// WHY A WRAPPER AND NOT `fetch` IN EACH COMPONENT
// Three things must be true of every OT request, and each is easy to forget one
// component at a time: the cookie must ride along, the response envelope must
// be unwrapped, and a failure must become a STABLE CODE rather than whatever
// English sentence the server happened to send. Centralising them means a
// component cannot accidentally render a raw server message or treat a 403 as
// an empty list.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//   - It performs NO authorization. Every gate lives behind `withOtRoute`; this
//     wrapper only reports what the server decided.
//   - It sends no organization, site, user or role. The tenant is derived from
//     the session on the server; a query parameter with such a name is ignored
//     there and is never emitted here.
//   - It never surfaces `json.message`. Those strings are fixed English; the UI
//     maps `code` to its own localized wording.
//   - It reads no token and touches no storage.

import type { DeviceRow, GatewayRow, ListPage } from "./contract";

/**
 * The stable failure vocabulary the UI branches on.
 *
 * `UNAVAILABLE` covers 503 (the data layer is down) and is distinct from
 * `FAILED`, because one is worth retrying and the other is not.
 */
export type OtFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_QUERY"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "FAILED";

export class OtRequestError extends Error {
  readonly code: OtFailureCode;
  readonly status: number;

  constructor(code: OtFailureCode, status: number) {
    // The message is for a developer reading a stack trace, never for a user —
    // the UI renders a localized string chosen by `code`.
    super(`OT request failed (${code})`);
    this.name = "OtRequestError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Map a response to the failure vocabulary.
 *
 * The CODE decides, not the status: `withOtRoute` can answer 401 carrying
 * `FORBIDDEN`, so branching on the status alone would tell an authorised user
 * their session had expired.
 */
function classify(status: number, code: unknown): OtFailureCode {
  switch (code) {
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "FORBIDDEN":
    case "CAPABILITY_NOT_ALLOWED":
      return "FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "INVALID_QUERY_PARAMETER":
      return "INVALID_QUERY";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "TRANSIENT_FAILURE":
      return "UNAVAILABLE";
    default:
      break;
  }
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 400) return "INVALID_QUERY";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UNAVAILABLE";
  return "FAILED";
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      // Authentication rides on the session cookie. Stated explicitly so a
      // future default change cannot silently make every OT call anonymous.
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      // The API already answers `no-store`; asking for it here keeps a
      // back/forward navigation from showing a stale authorized page.
      cache: "no-store",
      signal,
    });
  } catch (error) {
    // An abort is the caller superseding its own request, not a failure.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new OtRequestError("FAILED", 0);
  }

  // Parsed defensively: an error page or a proxy response is not JSON, and
  // `await response.json()` would otherwise throw something unclassifiable.
  const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: unknown; code?: unknown } | null;

  if (!response.ok || body?.ok !== true) {
    throw new OtRequestError(classify(response.status, body?.code), response.status);
  }
  return body.data as T;
}

/** `query` is produced by `ot-operations/query.ts` and carries only supported keys. */
export function fetchGateways(query: string, signal?: AbortSignal): Promise<ListPage<GatewayRow>> {
  return request<ListPage<GatewayRow>>(`/api/ot/gateways${query ? `?${query}` : ""}`, signal);
}

export function fetchDevices(query: string, signal?: AbortSignal): Promise<ListPage<DeviceRow>> {
  return request<ListPage<DeviceRow>>(`/api/ot/devices${query ? `?${query}` : ""}`, signal);
}

export function fetchGateway(id: string, signal?: AbortSignal): Promise<GatewayRow> {
  return request<GatewayRow>(`/api/ot/gateways/${encodeURIComponent(id)}`, signal);
}

export function fetchDevice(id: string, signal?: AbortSignal): Promise<DeviceRow> {
  return request<DeviceRow>(`/api/ot/devices/${encodeURIComponent(id)}`, signal);
}

/* ── Site labels ────────────────────────────────────────────────────────── */

export interface SiteOption {
  id: string;
  name: string;
}

/**
 * The industrial site registry, used to label site identifiers and to populate
 * the site filter.
 *
 * A DIFFERENT envelope from the OT API (`{ sites: [...] }`, no `ok` wrapper),
 * so it cannot share the unwrapper above. It is also separately authorized
 * (`view_industrial`), which is why a failure here degrades to "no site names"
 * rather than failing the whole page: an operator who can list gateways but not
 * sites should still see their gateways.
 */
export async function fetchSites(signal?: AbortSignal): Promise<SiteOption[]> {
  let response: Response;
  try {
    response = await fetch("/api/industrial/sites", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return [];
  }
  if (!response.ok) return [];

  const body = (await response.json().catch(() => null)) as { sites?: unknown } | null;
  if (!body || !Array.isArray(body.sites)) return [];

  return body.sites
    .map((raw) => raw as { id?: unknown; name?: unknown })
    .filter((site): site is { id: string; name: string } =>
      typeof site.id === "string" && site.id.length > 0 && typeof site.name === "string",
    )
    .map((site) => ({ id: site.id, name: site.name }));
}
