/**
 * Stable wire contract for GET /api/multi-site/summary.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The route used to answer with TWO incompatible 200 shapes: a full
 * `EnterpriseIndustrialSummary`, or — when the caller could reach no sites —
 * `{ data: null, reason: "No accessible sites.", siteCount: 0 }`. The dashboard
 * typed the response as the former and dereferenced `data.riskSummary`
 * unconditionally, so the second shape was a deterministic client crash
 * (`Cannot read properties of undefined (reading 'avgOrgRiskScore')`) for any
 * fully-authorized user whose organization had no ACTIVE industrial site.
 *
 * There is now ONE shape. The success payload is byte-compatible with what it
 * always was — every existing field keeps its name, type and meaning — plus one
 * explicit boolean, `noAccessibleSites`, that lets a client distinguish "no
 * data to show" from "data that happens to be zero" without inspecting the
 * metrics and guessing.
 *
 * NO FABRICATED INDUSTRIAL DATA. The empty payload reports counts of an empty
 * set as `0` and every unknown measurement as `null` — the same convention the
 * summary builder already uses for "insufficient data". It never invents a
 * risk score, an availability figure, a benchmark id or a timestamp, and it
 * makes no staleness claim about a benchmark that does not exist.
 *
 * Client-safe: this module holds types and pure functions only. It has no
 * server-only imports, so the dashboard client component can import both the
 * type and the runtime validator.
 */

import type { EnterpriseIndustrialSummary } from "./types";

/**
 * The one shape GET /api/multi-site/summary returns with status 200.
 *
 * `noAccessibleSites` is true only when site-level access resolution yielded an
 * EMPTY set for this caller — the organization has no ACTIVE industrial site,
 * or an explicitly-scoped member has no site assignments. It is NOT a
 * permission failure (that is a 403 from the RBAC layer) and NOT an
 * authentication failure (401): the caller is entitled to the surface, there is
 * simply nothing within their scope to summarize.
 */
export interface EnterpriseSummaryResponse extends EnterpriseIndustrialSummary {
  noAccessibleSites: boolean;
}

/**
 * The payload for a caller who can reach zero sites.
 *
 * Every field is an honest statement about an empty scope:
 *   - counts of an empty set are `0` (zero sites ranked, zero compared);
 *   - every measurement is `null` — "not computable", which the UI already
 *     renders as `insufficientData`;
 *   - no benchmark exists, so there is no id, no timestamp, and no staleness
 *     claim in either direction;
 *   - `organizationId` is the caller's real tenant, which is not a measurement.
 */
export function emptyEnterpriseSummary(organizationId: string): EnterpriseSummaryResponse {
  return {
    organizationId,
    siteCount:         0,
    latestBenchmarkId: null,
    latestBenchmarkAt: null,
    benchmarkStale:    false,
    stalenessWarning:  null,
    riskSummary: { sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null },
    kpiSummary:  { sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null },
    patternCount:          0,
    knowledgeGraphStale:   false,
    knowledgeGraphBuiltAt: null,
    noAccessibleSites:     true,
  };
}

/* ── Runtime validation ──────────────────────────────────────────────────── */
//
// The client validates the parsed body before rendering. This is the guard that
// makes a malformed 200 — a proxy error page, a truncated body, a future API
// change, a response from a captive portal — a controlled "invalid response"
// state instead of a render-time TypeError. Optional chaining at each use site
// would only have hidden the same broken contract one property at a time.

function isNullableNumber(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Structural validator for the summary payload.
 *
 * Deliberately checks the two nested objects the dashboard dereferences
 * (`riskSummary`, `kpiSummary`) field by field: their ABSENCE is precisely the
 * production crash, so "present and correctly shaped" is the property worth
 * asserting. Unknown extra fields are tolerated — a server may add fields
 * without breaking an older client.
 */
export function isEnterpriseSummaryResponse(value: unknown): value is EnterpriseSummaryResponse {
  if (!isRecord(value)) return false;

  if (typeof value.organizationId !== "string") return false;
  if (!isCount(value.siteCount))                return false;
  if (!isNullableString(value.latestBenchmarkId)) return false;
  if (!isNullableString(value.latestBenchmarkAt)) return false;
  if (typeof value.benchmarkStale !== "boolean")  return false;
  if (!isNullableString(value.stalenessWarning))  return false;
  if (!isCount(value.patternCount))               return false;
  if (typeof value.knowledgeGraphStale !== "boolean") return false;
  if (!isNullableString(value.knowledgeGraphBuiltAt)) return false;

  const risk = value.riskSummary;
  if (!isRecord(risk)) return false;
  if (!isCount(risk.sitesRanked))                 return false;
  if (!isNullableString(risk.highestRiskSiteId))  return false;
  if (!isNullableNumber(risk.avgOrgRiskScore))    return false;

  const kpi = value.kpiSummary;
  if (!isRecord(kpi)) return false;
  if (!isCount(kpi.sitesCompared))                return false;
  if (!isNullableNumber(kpi.avgOrgAvailability))  return false;
  if (!isNullableNumber(kpi.avgOrgHealthScore))   return false;

  // Required, not optional: the route sets it on EVERY 200, and client and
  // route handler ship in the same build, so its absence means the body did
  // not come from this endpoint.
  if (typeof value.noAccessibleSites !== "boolean") return false;

  return true;
}
