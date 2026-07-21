/**
 * Organization request context (Phase 32).
 *
 * Unlike billing/context.ts (which returns the user's first org),
 * this resolves the user's membership in a SPECIFIC organization
 * identified by an orgId from the route parameter.
 * Always verify the user is actually a member of the requested org.
 */

import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import type { OrgActorContext, OrgRole, MemberStatus } from "./types";
import { logAuthFailure, logAuthzDenial } from "@/lib/logger/security-events";

type MemberModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  return payload?.sub ?? null;
}

/**
 * Resolve the acting user's membership in a specific org.
 * Returns null if unauthenticated, not a member, or DB unavailable.
 */
export async function getOrgActorContext(
  req:   NextRequest,
  orgId: string,
): Promise<OrgActorContext | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const db = await getPrisma();
  if (!db) return null;

  try {
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const member = await memberModel.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!member) return null;

    return {
      userId,
      orgId:    String(member.organizationId),
      memberId: String(member.id),
      role:     String(member.role)   as OrgRole,
      status:   String(member.status) as MemberStatus,
    };
  } catch {
    return null;
  }
}

/** Enforces authentication + membership in the specific org. Returns 401/403 on failure. */
export async function requireOrgActor(
  req:   NextRequest,
  orgId: string,
): Promise<{ ctx: OrgActorContext } | { error: string; status: number }> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    logAuthFailure({ operation: "org.actor", reason: "no_session", orgId });
    return { error: "Authentication required", status: 401 };
  }

  const ctx = await getOrgActorContext(req, orgId);
  if (!ctx) {
    // PHASE 90: visible in the log stream without disclosing whether the org
    // exists — only that THIS caller is not a member of the org they named.
    logAuthzDenial({ operation: "org.actor", reason: "not_a_member", userId, orgId });
    return { error: "Not a member of this organization", status: 403 };
  }

  // PHASE 90: fail closed on an ALLOW-list. This was a deny-list that rejected
  // only "SUSPENDED", so any other value — a future status, or one written by a
  // path that does not validate its input — silently granted full access.
  // INVITED is deliberately excluded: an invitation is not yet a membership.
  if (ctx.status !== "ACTIVE") {
    logAuthzDenial({
      operation: "org.actor",
      reason: `membership_${String(ctx.status).toLowerCase()}`,
      userId, orgId, role: ctx.role,
    });
    return {
      error: ctx.status === "SUSPENDED" ? "Your membership is suspended" : "Your membership is not active",
      status: 403,
    };
  }

  return { ctx };
}
