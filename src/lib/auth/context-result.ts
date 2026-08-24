/**
 * PHASE 107 STAGE 6-A — one vocabulary for "why the request was refused".
 *
 * THE PROBLEM THIS SOLVES
 * Three helpers independently reduced several distinct outcomes to a single
 * 401. `withOtRoute`, `requireOrgContext` and `requirePlatformAuth` all told a
 * signed-in administrator that their session had ended, and offered them a
 * sign-in link, when the truth was that their account had no organization —
 * something signing in again cannot change. The platform helper went further and
 * reported a database outage as an authentication failure too.
 *
 * The refusals below are kept apart because a reader ACTS on them differently:
 *
 *   AUTHENTICATION_REQUIRED         sign in
 *   ORGANIZATION_CONTEXT_REQUIRED   you are signed in; an organization must be
 *                                   selected, or access requested
 *   SITE_CONTEXT_REQUIRED           choose a site
 *   FORBIDDEN                       ask an administrator; nothing you do helps
 *   INTERNAL_ERROR                  nothing is wrong with you; try later
 *
 * WHAT THIS DELIBERATELY PRESERVES
 * Every PRE-AUTHENTICATION failure stays a uniform 401 with one message. A
 * caller who has not proved who they are still learns nothing: not whether the
 * account exists, not whether its session was revoked, not whether the database
 * is degraded. That anti-enumeration property was the reason the old code
 * flattened everything, and it is kept exactly.
 *
 * The richer answers are reachable ONLY after the session has been verified, so
 * they describe the caller's own account to the caller themselves. That is not
 * an information leak; it is the answer to the question they asked.
 */

/** Why a request could not be served, in a form the UI can branch on. */
export type ContextRefusal =
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_CONTEXT_REQUIRED"
  | "SITE_CONTEXT_REQUIRED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR";

/**
 * HTTP status per refusal.
 *
 * 409 for the two context refusals: the caller is known and the request is
 * well-formed; what is missing is a selection only they can supply. Not 401 —
 * there is nothing to re-authenticate. Not 403 — nothing has been refused.
 */
export const REFUSAL_STATUS: Record<ContextRefusal, number> = {
  AUTHENTICATION_REQUIRED: 401,
  ORGANIZATION_CONTEXT_REQUIRED: 409,
  SITE_CONTEXT_REQUIRED: 409,
  FORBIDDEN: 403,
  // A resolution failure is the platform's fault, not the caller's. Reporting it
  // as 401 sent an operator to a login form during a database outage.
  INTERNAL_ERROR: 500,
};

/**
 * The sentence returned with each refusal.
 *
 * Fixed English, identical for every caller in the same position, and never
 * derived from an internal message — a service-layer hint must not reach a user
 * and must not vary with what the server knows.
 */
export const REFUSAL_MESSAGE: Record<ContextRefusal, string> = {
  AUTHENTICATION_REQUIRED: "Authentication required",
  ORGANIZATION_CONTEXT_REQUIRED: "An organization must be selected for this request.",
  SITE_CONTEXT_REQUIRED: "A site must be selected for this request.",
  FORBIDDEN: "You do not have permission to perform this operation.",
  INTERNAL_ERROR: "The request could not be completed.",
};

export interface RefusedRequest {
  error: string;
  status: number;
  code: ContextRefusal;
}

/** Build the refusal payload, so no call site invents its own status or wording. */
export function refuse(code: ContextRefusal): RefusedRequest {
  return { error: REFUSAL_MESSAGE[code], status: REFUSAL_STATUS[code], code };
}

/**
 * True when a refusal happened BEFORE the caller proved who they are.
 *
 * Everything in this group must be answered identically, or the response
 * becomes an oracle for which accounts exist.
 */
export function isPreAuthentication(code: ContextRefusal): boolean {
  return code === "AUTHENTICATION_REQUIRED";
}
