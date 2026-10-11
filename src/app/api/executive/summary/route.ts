/**
 * GET /api/executive/summary — the Executive Management Center feed.
 *
 * Gate chain (all server-side, nothing read from the client):
 *   signed access token -> live session -> server-side ACTIVE organization
 *   -> ACTIVE OrganizationMember re-read now -> platform `admin` capability
 *   -> the three permission axes (`view_erp`, `view_erp_compensation`,
 *      `view_industrial`) resolved INDEPENDENTLY, plus the site allow-list.
 *
 * `resolveExecutiveScope()` is that chain. It is registered as a tenant-scope
 * guard in `scripts/security/phase99/route-inventory.mjs`, and
 * `scripts/__tests__/executive-guard-recognition.test.ts` locks the other half:
 * that the function really performs the checks the registration vouches for.
 *
 * The response is `no-store`. There is no cache layer here yet, and a cached
 * executive figure has to be keyed by organization, role, site set AND range
 * before it is safe — a narrower key would serve one reader's sites to another.
 * Until that key exists, not caching is the correct answer rather than the slow
 * one, and every figure already carries its own `computedAt` / `dataAsOf`.
 */

import type { NextRequest } from "next/server";
import { securityError } from "@/lib/security/request-guards";
import { resolveExecutiveScope, statusForFailure } from "@/lib/executive/scope";
import { buildExecutiveSummary } from "@/lib/executive/summary";
import { isExecutiveRange } from "@/lib/executive/period";
import { sectionIsConsistent, type ExecutiveSection } from "@/lib/executive/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const resolved = await resolveExecutiveScope();
  if (!resolved.ok) {
    // `memberships` is offered ONLY when the reader must choose an organization,
    // and it lists organizations they are already an ACTIVE member of — it is
    // never an enumeration of the platform's tenants.
    const body: Record<string, unknown> = { error: resolved.code };
    if (resolved.code === "ACTIVE_ORGANIZATION_REQUIRED") body.memberships = resolved.memberships;
    return securityError(body, statusForFailure(resolved.code));
  }

  // An absent range means "today". A PRESENT but unrecognised range is refused
  // rather than silently defaulted: a reader who asked for a quarter and was
  // shown a day would have no way to tell.
  const raw = new URL(req.url).searchParams.get("range");
  if (raw !== null && !isExecutiveRange(raw)) {
    return securityError({ error: "INVALID_REQUEST" }, 400);
  }
  const range = raw ?? "today";

  try {
    const summary = await buildExecutiveSummary({
      scope: resolved.scope,
      range,
      nowMs: Date.now(),
    });

    // Boundary assertion. `sectionIsConsistent` is the invariant the whole
    // surface rests on — only OPERATIONAL carries data, every refusal states a
    // reason. A section that violates it is downgraded here rather than shipped,
    // because the failure mode it guards against is a plausible empty panel.
    const sections = Object.values(summary.sections) as ExecutiveSection<unknown>[];
    const inconsistent = [...sections, summary.actions as ExecutiveSection<unknown>].some(
      s => !sectionIsConsistent(s),
    );
    if (inconsistent) return securityError({ error: "SERVICE_UNAVAILABLE" }, 503);

    return securityError(summary as unknown as Record<string, unknown>, 200);
  } catch {
    // Never the driver message, never a stack, never an internal identifier.
    return securityError({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
