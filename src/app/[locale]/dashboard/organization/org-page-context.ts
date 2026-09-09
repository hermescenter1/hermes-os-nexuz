/**
 * PHASE 110-A1.0b — one organization context for the administration pages.
 *
 * WHAT THIS REPLACES, AND WHY IT IS A SECURITY FIX RATHER THAN A TIDY-UP
 * `members/page.tsx`, `invitations/page.tsx` and `departments/page.tsx` each
 * carried a byte-identical private copy of this:
 *
 *     const row = await m.findFirst({
 *       where: { userId: payload.sub },
 *       orderBy: { createdAt: "asc" },
 *     }).catch(() => null);
 *
 * Four things are wrong with it, and three of them are not style:
 *
 *   1. NO STATUS FILTER. The API path has required `status: "ACTIVE"` since
 *      Phase 90. These pages did not, so a SUSPENDED member — someone an
 *      administrator has deliberately cut off — still had their membership row
 *      returned, and so did somebody whose only row was an INVITED one: an
 *      invitation that had never been accepted was treated as membership.
 *
 *      PHASE 110-A1.0b R3 (R3-5) — WHAT THAT ACTUALLY EXPOSED, corrected. An
 *      earlier version of this comment said such readers "still rendered the
 *      organization's member list, invitations and departments". That was true
 *      of ONE page, not five. `members`, `invitations`, `departments` and
 *      `settings` hand an `orgId` to CLIENT components which fetch
 *      `/api/organizations/[orgId]/...`, and those routes call
 *      `requireOrgActor` — ACTIVE plus session revocation, 403 otherwise — so a
 *      suspended reader got chrome there, not data. The OVERVIEW page is the
 *      one that called `listMembers`, `listInvitations`, `getSubscription` and
 *      `getUsageSummary` directly, server-side, with nothing in between. There
 *      the disclosure was real, and worse than that sentence claimed, because
 *      `listMembers` returns every member's name and email.
 *   2. NO REVOCATION CHECK. `verifyAccessToken` verifies a signature. A session
 *      revoked minutes ago kept working here until the token expired.
 *   3. `.catch(() => null)` turned a database outage into "no organization",
 *      and the page rendered its empty state — the exact defect
 *      `resolveOrgContext` documents at length for the API path.
 *   4. The arbitrary earliest-membership pick, invisible to a reader with more
 *      than one organization.
 *
 * All four are gone because none of this is decided here any more. The resolver
 * is the same one the API uses, so a page can no longer show what the API would
 * refuse — which is what "one answer" is supposed to mean.
 */

import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/session";
import { can, type Capability } from "@/lib/auth/roles";
import type { OrganizationRole } from "@/lib/tenant/contract";
import { resolveTenantDecisionFromSession } from "@/lib/tenant-selection/selection";

/**
 * What an administration page needs to know before it renders anything.
 *
 * The states are the resolver's, not a nullable. A page that receives `null`
 * has to guess why it got it, and every one of these pages guessed the same
 * way: it rendered "no organization", which was right in one case out of four.
 */
export type OrgPageContext =
  | {
      readonly state: "resolved";
      readonly organizationId: string;
      readonly organizationRole: OrganizationRole;
    }
  | { readonly state: "unauthenticated" }
  | { readonly state: "none" }
  | { readonly state: "selection" }
  | { readonly state: "unavailable" }
  /**
   * PHASE 110-A1.0b R2 (F5) — signed in, with an organization, and without the
   * platform capability this surface requires.
   *
   * It exists because `<RequireCapability>` is a JSX wrapper: it decides what to
   * RENDER, and everything the page computed before its `return` has already
   * run. On the overview page that included four unguarded service calls. The
   * capability is now evaluated here, before any query, using the same
   * `can(user.role, capability)` policy `RequireCapability` itself applies — no
   * second role mapping is invented.
   */
  | { readonly state: "forbidden" };

/**
 * Resolve the context for an organization administration page.
 *
 * `capability` is the platform capability the surface requires — the same value
 * the page passes to `<RequireCapability>`. It is checked FIRST, so an
 * unauthorized caller never reaches the membership lookup, let alone a domain
 * query.
 */
export async function getOrgPageContext(capability: Capability): Promise<OrgPageContext> {
  /*
   * Capability before context, and both before data.
   *
   * The order matters and it is the F5 correction: a reader who may not see
   * this surface must not cause a membership query, and must certainly not
   * reach the service calls that follow it on the overview page.
   */
  const user = await getCurrentUser();
  if (!user) return { state: "unauthenticated" };
  if (!can(user.role, capability)) return { state: "forbidden" };

  const decision = await resolveTenantDecisionFromSession(await cookies());

  if (decision.granted) {
    return {
      state: "resolved",
      organizationId: decision.organizationId,
      organizationRole: decision.organizationRole,
    };
  }

  switch (decision.code) {
    case "AUTHENTICATION_REQUIRED":
      return { state: "unauthenticated" };
    case "ORGANIZATION_CONTEXT_REQUIRED":
      return { state: "none" };
    case "ORGANIZATION_SELECTION_REQUIRED":
      return { state: "selection" };
    case "ORGANIZATION_CONTEXT_UNAVAILABLE":
      return { state: "unavailable" };
  }
}

/**
 * The message key for a state that is not `resolved`.
 *
 * A map rather than a chain of ternaries, and total over the union, so a state
 * added later fails to compile instead of falling through to whichever sentence
 * happened to be last. `org.noOrg` keeps its existing meaning — genuinely no
 * membership — rather than becoming the catch-all it used to be.
 */
export const ORG_PAGE_STATE_KEY: Readonly<
  Record<Exclude<OrgPageContext["state"], "resolved">, string>
> = Object.freeze({
  // Signed in, but this surface is not theirs. Distinct from every context
  // state: nothing about their organization is the problem.
  forbidden: "stateForbidden",
  // Reaching an authenticated page unauthenticated means the session ended
  // between the middleware gate and this render. Saying "no organization"
  // would be a claim about an account nobody has identified.
  unauthenticated: "stateUnauthenticated",
  none: "noOrg",
  selection: "stateSelectionRequired",
  unavailable: "stateUnavailable",
});
