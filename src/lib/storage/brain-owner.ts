/**
 * PHASE 90 — trusted resolution of the Industrial Brain resource owner.
 *
 * The owner is derived ONLY from the authenticated session cookie and the
 * caller's own membership rows. Nothing here reads a request body, query string
 * or header that a client controls, so a caller cannot claim another tenant's
 * identity by supplying `userId` / `organizationId` / `orgId` in a payload.
 *
 * PHASE 90B (org-context hardening) — the organization scope is resolved by
 * COUNTING the caller's ACTIVE memberships, never by picking an arbitrary one:
 *   - 0 active memberships              => PERSONAL scope (own org-less rows).
 *   - exactly 1 active membership       => that ORGANIZATION's scope.
 *   - >1 active + validated active-org  => the validated ORGANIZATION's scope.
 *   - >1 active + no valid active-org   => AMBIGUOUS => FAIL CLOSED (sees nothing;
 *                                          writes refused). No org is guessed.
 * A SUSPENDED (or any non-ACTIVE) membership never contributes, so suspending a
 * member immediately removes their access to that organization's Brain data.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner } from "./types";

type MemberModel = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
};

/** The org-membership facts needed to resolve a Brain owner context. */
export interface OrgMembershipContext {
  /** Organizations where the user currently holds an ACTIVE membership. */
  activeOrgIds: string[];
  /**
   * A server-authenticated active organization from the session, or null.
   * Today the session carries no active-organization selection, so this is
   * always null; it is the seam through which a future active-org selection
   * (validated against `activeOrgIds`) flows in. NEVER a client-supplied value.
   */
  activeOrgHint: string | null;
}

/**
 * Pure resolution of the org scope from membership facts (no I/O — unit-tested
 * directly). An active-org hint is honoured ONLY when the user actually holds an
 * ACTIVE membership in it (server-authoritative validation); otherwise a caller
 * with more than one active membership fails closed rather than defaulting to
 * an arbitrary organization.
 */
export function resolveOrgScope(ctx: OrgMembershipContext): { orgId: string | null; ambiguous: boolean } {
  const active = Array.from(new Set(ctx.activeOrgIds));
  if (active.length === 0) return { orgId: null, ambiguous: false }; // personal
  if (active.length === 1) return { orgId: active[0], ambiguous: false }; // single org
  if (ctx.activeOrgHint && active.includes(ctx.activeOrgHint)) {
    return { orgId: ctx.activeOrgHint, ambiguous: false }; // validated active org
  }
  return { orgId: null, ambiguous: true }; // >1 active, undecidable => fail closed
}

/**
 * The authenticated caller's Brain owner, or null when unauthenticated.
 * Never throws: any failure fails closed to null so callers degrade gracefully.
 * Callers must still run their own authorization gate — this resolves identity
 * and scope, it does not authorize.
 */
export async function resolveBrainOwner(): Promise<BrainOwner | null> {
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = await getCurrentUser();
  } catch {
    return null;
  }
  if (!user) return null;

  const membership = await readOrgMembership(user.id);
  const scope = resolveOrgScope(membership);
  return { userId: user.id, orgId: scope.orgId, ambiguous: scope.ambiguous };
}

/**
 * Reads the user's ACTIVE org memberships. Never throws: on a missing database
 * (session-storage mode) or a transient failure it returns NO memberships, which
 * resolves to PERSONAL scope — strictly the narrowest, so a degraded read can
 * never widen access to another tenant's data.
 */
async function readOrgMembership(userId: string): Promise<OrgMembershipContext> {
  try {
    const db = await getPrisma();
    if (!db) return { activeOrgIds: [], activeOrgHint: null };
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const members = await memberModel.findMany({
      where: { userId, status: "ACTIVE" },
      select: { organizationId: true },
    });
    const activeOrgIds = members.map((m) => String(m.organizationId));
    // The session carries no active-organization selection today (see the type
    // doc); when one is added, read + return it here — resolveOrgScope validates
    // it against activeOrgIds, so it can never widen access.
    return { activeOrgIds, activeOrgHint: null };
  } catch {
    return { activeOrgIds: [], activeOrgHint: null };
  }
}
