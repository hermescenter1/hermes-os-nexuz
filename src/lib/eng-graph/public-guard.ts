/**
 * PHASE 99 (finding P99-INT-011) — abuse bound for the anonymous derived-graph
 * endpoints.
 *
 * Ten public endpoints (`/api/eng-graph/*` and `/api/operations/*`) serve views
 * derived from the engineering knowledge graph. They are `force-dynamic`, the
 * builder is not memoized, and none of them carried a rate limit — so each
 * anonymous request drove a fresh database read plus a full graph rebuild. That
 * is compute amplification, not a disclosure: the builder already returns
 * published records only, and Phase 99 additionally pushed that predicate into
 * the query so drafts never leave the database.
 *
 * The budget is deliberately generous. Every one of these endpoints is fetched
 * ONCE on component mount by its client, with no polling anywhere in the UI, so
 * a legitimate visitor cannot approach the limit without reloading the page
 * roughly once a second. Nothing about a normal response changes.
 */

import type { NextRequest } from "next/server";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { resolveClientIp, securityError } from "@/lib/security/request-guards";

/** Shared bucket: these views are variations on one underlying computation. */
export const DERIVED_GRAPH_ACTION = "derived-graph";

/**
 * Returns a 429 response when the caller has exhausted the budget, or `null`
 * when the request may proceed. Fails SAFE: the limiter degrades to an
 * in-process window when Redis is unavailable, never to no limit at all.
 */
export async function guardDerivedGraphRequest(req: NextRequest): Promise<Response | null> {
  const ip = resolveClientIp(req);
  if (await checkRateLimit(DERIVED_GRAPH_ACTION, ip)) return null;
  return securityError({ error: "Too many requests. Please try again later." }, 429, {
    "Retry-After": String(retryAfter(DERIVED_GRAPH_ACTION, ip)),
  });
}
