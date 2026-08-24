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
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import { getPrisma }           from "@/lib/db/prisma";
import type { OrgActorContext, OrgRole, MemberStatus } from "./types";
import { logAuthFailure, logAuthzDenial } from "@/lib/logger/security-events";

type MemberModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

/**
 * The acting user id, or `null` for an anonymous caller.
 *
 * PHASE 102 / RELEASE BLOCKER 5 — this verified the JWT and stopped there. A
 * signature is a statement about a token, not about a session: an access token
 * from a session the user had signed out of, an administrator had revoked, or a
 * password reset had invalidated still verified, and still yielded that user's
 * id. Every caller then attributed a write to them.
 *
 * That mattered most on the anonymous media view beacon, which uses this
 * function for OPTIONAL attribution: a revoked session's token was enough to
 * write a `MediaViewEvent` naming a real person, so a leaked-and-revoked token
 * kept producing records of what that person supposedly watched — records the
 * subject cannot see happening and the revocation was supposed to stop.
 *
 * `isPayloadSessionActive` is the repository's canonical revocation check — the
 * same one `requireOrgActor` has always used, backed by the `RefreshToken` row
 * whose id is the `sid` claim. It fails CLOSED: an unreachable database, a
 * missing row, a revoked or expired session, or a stale token generation all
 * answer "not active".
 *
 * FAILING CLOSED HERE MEANS ANONYMOUS, NOT REFUSED. Returning `null` for a
 * caller whose session cannot be confirmed is the privacy-safe direction: the
 * event is still recorded, still counted, and simply attributed to nobody. No
 * analytics are lost and no person is named on evidence that no longer holds.
 */
export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  if (!(await isPayloadSessionActive(payload))) return null;
  return payload.sub;
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

/**
 * PHASE 107 STAGE 6-A.2 — the machine code that belongs with an org-actor refusal.
 *
 * `requireOrgActor` refuses for TWO different reasons and returns only a status
 * to say which: **401** when there is no usable session (absent, unverifiable,
 * or revoked), and **403** when the caller is authenticated but not a member.
 *
 * Five call sites forwarded that status correctly and then hard-coded
 * `ORGANIZATION_SCOPE_REQUIRED` beside it. So a reader whose session had been
 * revoked received `401 ORGANIZATION_SCOPE_REQUIRED` — the status said "sign in
 * again", the code said "you lack organization scope", and the UI branches on
 * the code. It is the same contradiction Stage 6-A was opened to remove, in a
 * guard that stage never looked at.
 *
 * Deriving the code here rather than at each call site means the mapping cannot
 * drift between them, and a new status added to `requireOrgActor` has exactly
 * one place to be handled.
 */
export function orgActorRefusalCode(status: number): "AUTHENTICATION_REQUIRED" | "ORGANIZATION_SCOPE_REQUIRED" | "FORBIDDEN" {
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "ORGANIZATION_SCOPE_REQUIRED";
  return "FORBIDDEN";
}

/** Enforces authentication + membership in the specific org. Returns 401/403 on failure. */
export async function requireOrgActor(
  req:   NextRequest,
  orgId: string,
): Promise<{ ctx: OrgActorContext } | { error: string; status: number }> {
  const token   = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  if (!payload?.sub) {
    logAuthFailure({ operation: "org.actor", reason: "no_session", orgId });
    return { error: "Authentication required", status: 401 };
  }
  const userId = payload.sub;

  // PHASE 91 — enforce session revocation. A sid-bound access token whose
  // server-side session record has been revoked (logout, admin revoke, password
  // reset, suspension) is rejected on THIS request, not merely when it expires.
  // Legacy tokens without a sid pass through unchanged.
  if (!(await isPayloadSessionActive(payload))) {
    logAuthzDenial({ operation: "org.actor", reason: "session_revoked", userId, orgId });
    return { error: "Session is no longer active", status: 401 };
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
