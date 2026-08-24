/**
 * Billing request context (Phase 31).
 *
 * Resolves the authenticated user's organization from the DB.
 * The JWT contains userId/role but NOT organizationId, so we look up
 * OrganizationMember on each request. Result is not cached — billing routes
 * must re-derive context per request for correct authorization.
 */

import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { getStorageMode }  from "@/lib/storage/storage-mode";
import { refuse, type RefusedRequest } from "@/lib/auth/context-result";
import type { OrgContext, OrgRole } from "./types";

type MemberModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

/**
 * Returns the billing context for the request, or null if it cannot be
 * established for ANY reason.
 *
 * PHASE 107 STAGE 6-A.1 — this is now a thin compatibility wrapper. It exists
 * because callers outside this module still expect the nullable shape; it
 * delegates to `resolveOrgContext` rather than repeating the lookup, so the two
 * can never drift apart and the reason is decided in exactly one place.
 */
export async function getOrgContext(req: NextRequest): Promise<OrgContext | null> {
  const result = await resolveOrgContext(req);
  return result.ok ? result.ctx : null;
}

/**
 * PHASE 107 STAGE 6-A — why the same failure has two different answers.
 *
 * `getOrgContext` returns `null` for two situations a reader must act on
 * differently:
 *
 *   - there is no valid session — signing in fixes it;
 *   - there IS a valid session, but the account has no ACTIVE organization
 *     membership — signing in again changes nothing at all.
 *
 * Collapsing both into 401 is what put "your session has ended" in front of a
 * signed-in administrator on every OT page, with a sign-in link that could not
 * help them. The distinction is drawn here, once, so no caller has to re-derive
 * it and no caller can get it subtly wrong.
 *
 * Nothing about WHO may see WHAT changes: the same session verification, the
 * same ACTIVE-membership requirement, the same tenant derived from the server
 * side only. This says why access was refused, never widens it.
 */
export type OrgContextRefusal =
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_CONTEXT_REQUIRED"
  // The question could not be asked. Distinct from "you have no organization",
  // because one is an answer about the caller and the other is an outage.
  | "INTERNAL_ERROR";

export type OrgContextResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; reason: OrgContextRefusal };

/**
 * Resolve the organization context, distinguishing "not signed in" from
 * "signed in without an organization".
 *
 * The session is verified FIRST and independently of the membership lookup, so
 * the two answers cannot be confused. A caller that does not care may keep using
 * `requireOrgContext`.
 */
export async function resolveOrgContext(req: NextRequest): Promise<OrgContextResult> {
  /*
   * ONE pass, in order, each outcome decided where it is discovered.
   *
   * The previous version asked `getOrgContext` first, which collapsed every
   * cause to `null`, and then tried to reconstruct the reason by re-querying.
   * That reconstruction was wrong in a way that mattered: a membership query
   * that THREW was caught and turned into `null`, and the second pass — finding
   * a perfectly healthy client — concluded "this account has no organization"
   * and answered 409. A database fault was reported to the user as a fact about
   * their account, and the incident stayed invisible.
   *
   * There is now no second lookup and nothing to reconstruct.
   */

  // 1. Identity. Absent, malformed or unverifiable are one answer, deliberately.
  const role = await getAuthRole(req);
  if (!role) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };
  const userId = payload.sub;

  // 2. The store. A missing client is an outage in DATABASE mode; in SESSION
  //    mode there is no organization store at all, by design.
  const db = await getPrisma();
  if (!db) {
    return {
      ok: false,
      reason: getStorageMode() === "database" ? "INTERNAL_ERROR" : "ORGANIZATION_CONTEXT_REQUIRED",
    };
  }

  // 3. The membership. A THROWN query is an outage; an empty result is an answer.
  let member: Record<string, unknown> | null;
  try {
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    member = await memberModel.findFirst({
      // PHASE 90: only an ACTIVE membership grants organization context.
      // Previously any row matched, so a SUSPENDED member kept full billing
      // and org-scoped access until their row was deleted.
      where:   { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }, // prefer earliest membership (owner)
      select:  { organizationId: true, role: true },
    });
  } catch {
    // The question could not be answered. Saying "you have no organization"
    // here would be inventing a fact about the caller out of an outage.
    return { ok: false, reason: "INTERNAL_ERROR" };
  }

  if (!member) return { ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" };

  return {
    ok: true,
    ctx: {
      userId,
      orgId: String(member.organizationId),
      role:  String(member.role) as OrgRole,
    },
  };
}

/**
 * Ensure the request has a billing context, or return the refusal to send back.
 *
 * PHASE 107 STAGE 6-A — this used to answer 401 for every cause, including a
 * signed-in customer with no organization looking at their own billing page.
 * They were told their session had ended and shown a sign-in link; signing in
 * again produced the same page. It now returns the classified refusal, so the
 * nine billing routes and `billing-track.ts` answer 401, 409 or 500 according to
 * what actually happened.
 *
 * The shape is unchanged — `{ ctx }` or `{ error, status }` — so every caller
 * keeps compiling and keeps forwarding `status` as it always did. `code` is
 * additive.
 */
export async function requireOrgContext(
  req: NextRequest,
): Promise<{ ctx: OrgContext } | RefusedRequest> {
  const result = await resolveOrgContext(req);
  if (!result.ok) return refuse(result.reason);
  return { ctx: result.ctx };
}
