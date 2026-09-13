/**
 * Billing request context (Phase 31 · adopted by Phase 110-A1.0b).
 *
 * WHAT CHANGED, AND WHY IT HAD TO
 * This module used to answer the organization question itself, with
 * `organizationMember.findFirst({ where: { userId, status: "ACTIVE" },
 * orderBy: { createdAt: "asc" } })` and the comment "prefer earliest membership
 * (owner)". That is an arbitrary pick presented as a decision. For a reader who
 * belongs to one organization it is right by luck; for a reader who belongs to
 * two it silently chooses one of them, forever, with no way to say otherwise
 * and no sign that a choice was ever made. Every billing figure, every invoice
 * and every OT page they saw was scoped to whichever membership row happened to
 * be created first.
 *
 * It also established identity with a bare `verifyAccessToken`, which verifies
 * the signature and nothing else. A revoked session kept working here until the
 * token expired, while the rest of the platform had already stopped honouring
 * it.
 *
 * Both are gone. The lookup lives in `src/lib/tenant/context.ts` — the reviewed
 * Phase 110-A1.0 resolver, which uses `findMany`, cannot narrow several
 * memberships to one by accident, and takes identity from
 * `getUserIdFromRequest`, which checks session revocation. The selection layer
 * in `src/lib/tenant-selection/` turns that result into a request-scoped
 * decision.
 *
 * WHAT DELIBERATELY DID NOT CHANGE
 * The exported shapes. `getOrgContext` still returns `OrgContext | null`,
 * `requireOrgContext` still returns `{ ctx }` or `{ error, status, code }`, and
 * `resolveOrgContext` still returns a tagged result. All ten callers keep
 * compiling and keep forwarding `status` exactly as they did. What they receive
 * is a tenant the caller actually selected, and two refusals they did not have
 * before.
 */

import type { NextRequest } from "next/server";

import { refuse, type RefusedRequest } from "@/lib/auth/context-result";
import {
  checkTenantPrecondition,
  resolveTenantDecision,
} from "@/lib/tenant-selection/selection";

import type { OrgContext } from "./types";

/**
 * Returns the billing context for the request, or null if it cannot be
 * established for ANY reason.
 *
 * PHASE 107 STAGE 6-A.1 — a thin compatibility wrapper. It exists because
 * callers outside this module still expect the nullable shape; it delegates to
 * `resolveOrgContext` rather than repeating the lookup, so the two can never
 * drift apart and the reason is decided in exactly one place.
 */
export async function getOrgContext(req: NextRequest): Promise<OrgContext | null> {
  const result = await resolveOrgContext(req);
  return result.ok ? result.ctx : null;
}

/**
 * PHASE 107 STAGE 6-A — why the same failure has different answers.
 *
 * `getOrgContext` returns `null` for situations a reader must act on
 * differently:
 *
 *   - there is no valid session — signing in fixes it;
 *   - there IS a valid session, but the account has no ACTIVE organization
 *     membership — signing in again changes nothing at all;
 *   - PHASE 110-A1.0b: there is a valid session and SEVERAL organizations, and
 *     nobody has said which one this request is for;
 *   - the question could not be asked at all.
 *
 * Collapsing the first two is what put "your session has ended" in front of a
 * signed-in administrator on every OT page, with a sign-in link that could not
 * help them. Collapsing the third into the second is how an arbitrary
 * membership got chosen without anyone noticing. The distinctions are drawn
 * here, once, so no caller re-derives them and no caller gets one subtly wrong.
 *
 * Nothing about WHO may see WHAT is widened. Same session verification — now
 * strictly stronger, because revocation is checked — same ACTIVE-membership
 * requirement, same tenant derived on the server only.
 */
export type OrgContextRefusal =
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_CONTEXT_REQUIRED"
  /** Several proven memberships, no selection. 409, and the remedy is a choice. */
  | "ORGANIZATION_SELECTION_REQUIRED"
  /** The membership store could not answer. 503, and a retry is meaningful. */
  | "ORGANIZATION_CONTEXT_UNAVAILABLE"
  /**
   * PHASE 110-A1.0b R3 (R3-2) — the request NAMED an organization, and it is
   * not the one in effect. 409, and the remedy is to reload and decide; a retry
   * of the identical request would only reach the same conflict.
   */
  | "ORGANIZATION_CONTEXT_CONFLICT"
  /**
   * PHASE 110-A1.0b R6 — a state-changing request that stated no organization
   * at all. 428, and the remedy is for the client to send one.
   */
  | "ORGANIZATION_PRECONDITION_REQUIRED"
  /**
   * Retained so the union stays a superset of what callers already handle.
   * Nothing in this module produces it any more — an outage is now
   * `ORGANIZATION_CONTEXT_UNAVAILABLE`, which is 503 rather than 500 — but
   * removing it would break exhaustive maps consumers already built against it,
   * for no gain.
   */
  | "INTERNAL_ERROR";

export type OrgContextResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; reason: OrgContextRefusal };

/**
 * Resolve the organization context for this request.
 *
 * One pass. Identity, memberships and the selection are decided by the tenant
 * resolver and its selection adapter; this function's whole job is to express
 * that decision in the shape billing's callers already speak.
 *
 * There is no second lookup here and nothing to reconstruct — the defect that
 * made a thrown membership query come back as "this account has no
 * organization" is structurally absent, because this module no longer performs
 * a query at all.
 */
export async function resolveOrgContext(req: NextRequest): Promise<OrgContextResult> {
  const decision = await resolveTenantDecision(req);

  if (!decision.granted) {
    return { ok: false, reason: decision.code };
  }

  /*
   * PHASE 110-A1.0b R3 (R3-2) — THE TENANT-INTENT PRECONDITION.
   *
   * The tenant has already been resolved and proven above; this adds nothing to
   * that and takes nothing away. It asks a different question: is the
   * organization now in effect the one the CALLER was written for?
   *
   * The cookie is shared by every tab. A second tab still displaying A submits
   * `DELETE /api/billing/subscription` — no body, no organization — after the
   * first tab switched to B, and B's subscription is cancelled while the reader
   * was looking at A's. Every authorization check passes, because the reader is
   * genuinely authorized in B. What is wrong is the INTENT.
   *
   * Order matters and is not interchangeable: the comparison happens AFTER the
   * server has resolved and proven the tenant, and it compares against that
   * proven value. The header therefore cannot select, widen or influence
   * anything — it can only cause a refusal. A header naming an organization the
   * caller is not a member of does not reach a membership; it simply mismatches
   * the resolved one and is refused, exactly like any other mismatch.
   *
   * ABSENT MEANS "I ASSERT NOTHING", NOT "ANY TENANT WILL DO". Existing clients,
   * OT integrations and server-to-server callers send nothing and are unchanged.
   * That is the deliberate compatibility boundary and equally the limit of the
   * protection: a caller that does not send it is not protected by it. Which
   * clients do send it is enumerated in the R3 report, not assumed.
   */
  const precondition = checkTenantPrecondition(req, decision.organizationId);
  if (precondition === "conflict") {
    return { ok: false, reason: "ORGANIZATION_CONTEXT_CONFLICT" };
  }
  if (precondition === "missing") {
    /*
     * PHASE 110-A1.0b R6 — a WRITE that asserts nothing is refused.
     *
     * R3 and R5 let this through as a compatibility boundary and each asserted
     * the gap: a header-less request still cancelled organization B's
     * subscription. That is no longer an acceptable property of a browser
     * write. Reads are untouched, and the organization-selection endpoint does
     * not pass through here, so choosing an organization can never require
     * having already chosen one.
     */
    return { ok: false, reason: "ORGANIZATION_PRECONDITION_REQUIRED" };
  }

  return {
    ok: true,
    ctx: {
      userId: decision.userId,
      orgId: decision.organizationId,
      /*
       * No cast. `OrgRole` is now the tenant contract's `OrganizationRole`, so
       * this is the same closed set of fifteen the resolver validated the row
       * against. The old `String(member.role) as OrgRole` asserted a fact the
       * compiler had no reason to believe and the data did not guarantee: a row
       * carrying `HR_MANAGER` — a real value in this schema — was typed as one
       * of seven roles that did not include it.
       */
      role: decision.organizationRole,
    },
  };
}

/**
 * Ensure the request has a billing context, or return the refusal to send back.
 *
 * The shape is unchanged — `{ ctx }` or `{ error, status, code }` — so every
 * caller keeps compiling and keeps forwarding `status` as it always did. What
 * changed is that `status` can now be 503 for an outage, and that a
 * multi-organization caller receives a selection refusal instead of an
 * arbitrary tenant.
 */
export async function requireOrgContext(
  req: NextRequest,
): Promise<{ ctx: OrgContext } | RefusedRequest> {
  const result = await resolveOrgContext(req);
  if (!result.ok) return refuse(result.reason);
  return { ctx: result.ctx };
}
