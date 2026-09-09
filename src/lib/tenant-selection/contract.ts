/**
 * PHASE 110-A1.0b — the tenant SELECTION contract, shared by server and browser.
 *
 * WHY THIS FILE IS SEPARATE FROM THE RESOLVER
 * `src/lib/tenant/context.ts` decides WHICH organizations a caller has proven
 * ACTIVE membership in. It is server-only: it reaches Prisma and the session
 * store. A selector rendered in the browser needs none of that — it needs the
 * option list, the refusal vocabulary and the request shape, and nothing else.
 *
 * So this module holds exactly the part both sides must agree on, and imports
 * nothing that a client bundle must not contain. The static boundary gate in
 * `__tests__/tenant-selection-static.test.ts` fails if that ever stops being
 * true, which is the only thing keeping a `"use client"` component from pulling
 * the resolver — and with it Prisma and the session store — into a browser
 * chunk.
 *
 * WHAT THIS IS NOT
 * Nothing here authorizes anything. A selection is a NARROWING of a set the
 * server has already proven; it is never evidence that the narrowing is
 * allowed. Every route keeps its own permission check after the context is
 * resolved, exactly as before.
 */

import type { OrganizationRole } from "@/lib/tenant/contract";

/**
 * The cookie that carries a reader's explicit choice between organizations.
 *
 * Host-only (no `Domain`), `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure`
 * outside development — the same attribute set `src/lib/auth/token-session.ts`
 * already uses for the session cookies, so there is one cookie policy on this
 * origin rather than two.
 *
 * It is NOT a credential. It names an organization, and every request re-proves
 * ACTIVE membership in that organization from the database before the name is
 * honoured, so forging or copying it selects nothing. No token, no role and no
 * permission is stored in it — only an identity binding and an organization id,
 * both of which are re-checked.
 *
 * `SameSite=Lax` rather than `Strict`: a reader following a normal inbound link
 * to a dashboard page must arrive with their organization already selected, and
 * `Strict` would drop the cookie on exactly that navigation. The write path is
 * a same-origin `PUT` behind an Origin check, so `Lax` costs nothing there.
 */
export const TENANT_SELECTION_COOKIE = "hermes_org" as const;

/** The encoded envelope version. A value that does not carry it is discarded. */
export const TENANT_SELECTION_COOKIE_VERSION = 1 as const;

/**
 * PHASE 110-A1.0b R3 (R3-2) — the organization a request BELIEVES it is in.
 *
 * THE PROBLEM THIS EXISTS FOR
 * Every adopting route resolves its tenant from the cookie, and the cookie is
 * shared by every tab in the browser. Open the billing dashboard twice, switch
 * organization in the first tab, and the second keeps DISPLAYING A while the
 * cookie now says B. `BillingDashboard.handleCancel` sends
 * `DELETE /api/billing/subscription` with no body and no organization: the
 * server resolves B and cancels B's subscription, while the page the reader was
 * looking at — and acted on — was A's.
 *
 * Fresh authorization for B is not an answer to that. The reader IS authorized
 * in B; what is missing is that they never intended B. Intent is a question only
 * the page that rendered the context can answer.
 *
 * WHAT THIS HEADER IS, AND WHAT IT IS NOT
 * It is a PRECONDITION — "do this only if the organization in effect is still
 * the one I was showing" — and never authorization. The server resolves the
 * tenant exactly as before and then compares. A value naming an organization
 * the caller does not belong to is refused by the same membership check as
 * always; a value naming the wrong one of their own is refused as a CONFLICT
 * instead of being performed in the other tenant. Nothing here widens anything.
 *
 * Absent, it asserts nothing and the request behaves exactly as before. That is
 * deliberate — an OT integration or an existing client that never sends it must
 * not start failing — and it is also the LIMIT of the protection: a caller that
 * does not send the header is not protected by it. That gap is reported rather
 * than hidden.
 */
export const TENANT_PRECONDITION_HEADER = "x-hermes-organization" as const;

/**
 * The attribute the server-rendered shell carries its organization in.
 *
 * The browser wrapper reads the precondition from the DOM rather than from
 * client state, because the value must be the one that was RENDERED — the
 * tenant the reader is actually looking at. Client state can be updated by
 * anything; markup written by the server render cannot drift from the screen.
 */
export const TENANT_RENDERED_ORGANIZATION_ATTRIBUTE = "data-hermes-organization" as const;

/**
 * One organization a reader may choose.
 *
 * This is the caller's own membership described back to the caller, which is
 * the disclosure `src/lib/auth/context-result.ts` already reasons about: it is
 * reachable only after the session is verified, and it lists nothing the caller
 * is not already a proven ACTIVE member of.
 */
export interface TenantOption {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationRole: OrganizationRole;
}

/**
 * Why a tenant-scoped request could not be served.
 *
 * These are the four states of the resolver expressed for transport. They are
 * kept apart because a reader ACTS on them differently, and because collapsing
 * any two of them is precisely the defect this phase exists to remove:
 *
 *   AUTHENTICATION_REQUIRED          sign in
 *   ORGANIZATION_CONTEXT_REQUIRED    you belong to no organization; signing in
 *                                    again cannot help
 *   ORGANIZATION_SELECTION_REQUIRED  you belong to several; choose one
 *   ORGANIZATION_CONTEXT_UNAVAILABLE the question could not be asked
 *
 * The last two are new in this phase. The first two already existed and keep
 * their exact meaning and status, so every existing caller and test of
 * `ORGANIZATION_CONTEXT_REQUIRED` continues to mean what it meant.
 */
export type TenantRefusalCode =
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_CONTEXT_REQUIRED"
  | "ORGANIZATION_SELECTION_REQUIRED"
  | "ORGANIZATION_CONTEXT_UNAVAILABLE";

/**
 * Why an explicit selection request was rejected.
 *
 * Deliberately coarse. `ORGANIZATION_SELECTION_INVALID` covers a candidate that
 * is absent, malformed, foreign, suspended or simply not one of the caller's
 * proven memberships — one answer for all of them, so a caller cannot use the
 * difference between "no such organization" and "not yours" as an oracle for
 * which organizations exist.
 */
export type TenantSelectionRejection =
  | "ORGANIZATION_SELECTION_INVALID"
  | "VALIDATION_FAILED";

/**
 * What `GET /api/tenant/context` answers with when a context exists.
 *
 * `options` is present only in the multi-organization case and always describes
 * proven memberships. It is absent, not empty, when there is nothing to choose
 * between — an empty array would read as "you have no organizations", which is
 * a different state with a different answer.
 */
export interface TenantContextPayload {
  readonly state: "SINGLE_ACTIVE_ORGANIZATION";
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationRole: OrganizationRole;
  /**
   * True when the caller has more than one proven membership and this one was
   * chosen explicitly. A reader with exactly one organization is not "choosing"
   * anything, and the UI must not offer to switch away from a set of one.
   */
  readonly selectable: boolean;
  /**
   * The reader's other proven memberships.
   *
   * PHASE 110-A1.0b R2 (F1) — present on a GRANTED response too, not only on a
   * refusal. R1 sent `selectable: true` with no list, and the switcher read a
   * 200 without options as "ready, nothing to choose": the first selection
   * worked and no later one was possible. Absent when there is nothing to
   * choose between, so a control is never rendered for a set of one.
   */
  readonly options?: readonly TenantOption[];
}

/** The refusal body shared by every adopting surface. */
export interface TenantRefusalPayload {
  readonly state: "REFUSED";
  readonly code: TenantRefusalCode;
  /** Present ONLY for ORGANIZATION_SELECTION_REQUIRED. Never for the others. */
  readonly options?: readonly TenantOption[];
}

export type TenantContextResponse = TenantContextPayload | TenantRefusalPayload;

/** The request body of `PUT /api/tenant/context`. */
export interface TenantSelectionRequest {
  readonly organizationId: string;
}

/**
 * Every state name this transport can carry, frozen at runtime.
 *
 * `as const` is a compile-time fact only; a consumer holding this array can
 * still push into it unless it is frozen for real. Phase 110-A1.0 learned that
 * the expensive way — see `ORGANIZATION_ROLES` in the tenant contract.
 */
export const TENANT_REFUSAL_CODES = Object.freeze([
  "AUTHENTICATION_REQUIRED",
  "ORGANIZATION_CONTEXT_REQUIRED",
  "ORGANIZATION_SELECTION_REQUIRED",
  "ORGANIZATION_CONTEXT_UNAVAILABLE",
] as const);

/** HTTP status per refusal, for the routes that adopt this contract. */
export const TENANT_REFUSAL_STATUS: Readonly<Record<TenantRefusalCode, number>> =
  Object.freeze({
    AUTHENTICATION_REQUIRED: 401,
    // 409, not 401: the caller is known and the request is well formed. What is
    // missing is a fact about their account, or a choice only they can make.
    ORGANIZATION_CONTEXT_REQUIRED: 409,
    ORGANIZATION_SELECTION_REQUIRED: 409,
    // 503, not 500: this is a dependency that is not answering, and a client
    // may retry it. Reporting it as 500 invites "something is broken in the
    // application"; reporting it as 409 would invent a fact about the account.
    ORGANIZATION_CONTEXT_UNAVAILABLE: 503,
  });

/** Narrowing helper, so no consumer re-derives the check from a string. */
export function isTenantRefusal(
  r: TenantContextResponse,
): r is TenantRefusalPayload {
  return r.state === "REFUSED";
}
