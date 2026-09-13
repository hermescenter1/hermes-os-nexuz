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
  /*
   * PHASE 110-A1.0b — the caller belongs to SEVERAL organizations and has not
   * said which one this request is for.
   *
   * Kept apart from ORGANIZATION_CONTEXT_REQUIRED because the two ask opposite
   * things of the reader. "You are a member of nothing" is answered by asking
   * an administrator for access; "you are a member of three things" is answered
   * by picking one. Telling somebody with three organizations that they have
   * none is exactly how the old resolver's arbitrary earliest-membership pick
   * stayed invisible: it never had to say anything at all.
   */
  | "ORGANIZATION_SELECTION_REQUIRED"
  /*
   * PHASE 110-A1.0b — the organization question could not be ASKED.
   *
   * Distinct from INTERNAL_ERROR, which keeps its 500 and every existing
   * caller's meaning. This one is 503: a dependency is not answering, the
   * caller did nothing wrong, and a retry is meaningful. Reporting it as
   * "you have no organization" would invent a fact about the account out of an
   * outage — the mistake documented at length in `resolveOrgContext`.
   */
  | "ORGANIZATION_CONTEXT_UNAVAILABLE"
  /*
   * PHASE 110-A1.0b R3 (R3-2) — the caller named an organization, and it is not
   * the one in effect.
   *
   * Not FORBIDDEN: nothing was denied, and the caller may well be authorized in
   * both. Not a context refusal either: a context exists. This says the request
   * was written for a DIFFERENT tenant than the one that would be used, which
   * happens when a second tab is still displaying the organization the reader
   * has since switched away from. The caller's move is to reload and decide,
   * never to retry the same request.
   */
  | "ORGANIZATION_CONTEXT_CONFLICT"
  /*
   * PHASE 110-A1.0b R6 — a state-changing request on the session path that
   * asserted no organization at all.
   *
   * Distinct from CONFLICT, which means the caller told us something and it was
   * wrong. This means they told us nothing, and for a write that is no longer
   * acceptable: a stale tab sending nothing is exactly as dangerous as one
   * sending the wrong thing. The two are kept apart so an operator can tell an
   * un-migrated client from a genuinely stale one.
   */
  | "ORGANIZATION_PRECONDITION_REQUIRED"
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
  // Also 409, and for the same reason: the caller is known, the request is
  // well-formed, and the missing piece is a choice only they can make.
  ORGANIZATION_SELECTION_REQUIRED: 409,
  // 503, not 500. The distinction is not cosmetic: 500 reads as "the
  // application is broken", 503 as "a dependency is not answering, try again",
  // and only the second is true when the membership store is unreachable.
  // INTERNAL_ERROR keeps its 500 below — this is additive, not a remapping.
  ORGANIZATION_CONTEXT_UNAVAILABLE: 503,
  // 409. The request conflicts with the state on the server, which is exactly
  // what 409 means. Deliberately NOT 403: the caller is very likely authorized
  // in both organizations, and calling this a permission failure would send
  // them to ask for access they already have.
  ORGANIZATION_CONTEXT_CONFLICT: 409,
  /*
   * 428 Precondition Required, which is what this literally is: RFC 6585 defines
   * it for an origin server that requires the request to be conditional. Not
   * 400 — the request is well formed. Not 409 — nothing conflicts yet, because
   * the caller stated nothing to conflict with.
   */
  ORGANIZATION_PRECONDITION_REQUIRED: 428,
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
  ORGANIZATION_SELECTION_REQUIRED:
    "This account belongs to more than one organization. Select the organization for this request.",
  ORGANIZATION_CONTEXT_UNAVAILABLE:
    "The organization for this request could not be determined. Please retry.",
  ORGANIZATION_CONTEXT_CONFLICT:
    "This request was made for a different organization than the one currently selected. Reload and try again.",
  ORGANIZATION_PRECONDITION_REQUIRED:
    "This request must state the organization it was made for. Reload the page and try again.",
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
