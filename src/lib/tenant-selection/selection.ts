/**
 * PHASE 110-A1.0b — the adapter that turns a resolved tenant context into a
 * request-scoped decision, and an explicit selection into an answer.
 *
 * SERVER ONLY. See the note in `cookie.ts` about how that is enforced.
 *
 * WHERE THE LINE IS
 * `src/lib/tenant/context.ts` is the merged, reviewed core. It decides which
 * organizations the caller has proven ACTIVE membership in, and this module
 * does not re-decide any of it: it never queries memberships, never inspects a
 * row, never builds a `ProvenMembership` and never reaches past the result it
 * was handed. What it adds is the two things HTTP needs and the core, by
 * design, does not have — a stored preference and a status code.
 *
 * THE ONE PLACE THE CORE IS NOT ENOUGH, AND WHY IT IS NOT CHANGED
 * `resolveTenantContextForCandidate` returns every non-MULTIPLE state
 * unchanged. That is correct for the implicit path: a caller with exactly one
 * organization gets it, and a candidate naming another cannot override it.
 *
 * It is NOT enough for an EXPLICIT selection. A reader who is a member of A
 * alone and asks to select B would receive `SINGLE_ACTIVE_ORGANIZATION(A)` —
 * an answer that says "success" while carrying a different organization than
 * the one requested. Rendering that as 200 would mean the reader believes they
 * are in B while every subsequent query runs in A.
 *
 * So `selectTenantContext` compares the proven result against what was asked
 * for and refuses a mismatch. The core is untouched; the contract that an
 * explicit request either does the thing or says it did not lives here, at the
 * transport boundary where the concept of "asking" exists at all.
 */

import type { NextRequest } from "next/server";

import {
  resolveTenantContextFromRequest,
  resolveTenantContextFromServerSession,
} from "@/lib/tenant/context";
import type { TenantContextResult } from "@/lib/tenant/contract";

import {
  readStoredSelection,
  readStoredSelectionFromJar,
  type StoredSelection,
} from "./cookie";
import { TENANT_PRECONDITION_HEADER } from "./contract";
import type {
  TenantOption,
  TenantRefusalCode,
} from "./contract";

/* ── Outcome ─────────────────────────────────────────────────────────────── */

/**
 * What a tenant-scoped surface gets back.
 *
 * `organizationId` exists on the granted shape alone, exactly as in the core
 * contract, so "resolve then query anyway" stays unwritable one layer up too.
 */
export type TenantDecision =
  | {
      readonly granted: true;
      readonly userId: string;
      readonly organizationId: string;
      readonly organizationSlug: string;
      readonly organizationRole: TenantOption["organizationRole"];
      /** True when the caller has more than one proven membership. */
      readonly selectable: boolean;
      /**
       * The caller's other proven memberships, present only when `selectable`.
       *
       * R1 omitted this and the switcher had nothing to render: a reader who
       * had already chosen received a 200 with `selectable: true` and no list,
       * which the control read as "ready, nothing to choose". The first
       * selection worked and every subsequent one was impossible.
       */
      readonly options?: readonly TenantOption[];
    }
  | {
      readonly granted: false;
      readonly code: TenantRefusalCode;
      /**
       * Present only where a choice is the remedy: several proven memberships,
       * or a stored intent that no longer grants. Never on UNAUTHENTICATED,
       * NO_ACTIVE_ORGANIZATION or an outage, because in those states there is
       * nothing proven to list.
       */
      readonly options?: readonly TenantOption[];
    };

/* ── Mapping ─────────────────────────────────────────────────────────────── */

/**
 * The exhaustive map from the core's five states to this transport.
 *
 * Written as a `switch` over the discriminant with no `default`, so adding a
 * sixth state to the core union is a COMPILE error here rather than a silent
 * fall-through to whichever branch happened to be last. Phase 107 documented
 * exactly this failure at length in the OT route kit, where an "everything
 * else" branch folded a database outage into 401 the moment a third reason was
 * added.
 */
function optionsOf(result: TenantContextResult): readonly TenantOption[] {
  /*
   * The caller's own memberships, described back to the caller. Copied field by
   * field rather than passed through, so nothing frozen by the core is
   * re-exposed and nothing else on those objects can travel.
   */
  if (result.state === "MULTIPLE_ACTIVE_ORGANIZATIONS") {
    return result.candidates.map((c) => ({
      organizationId: c.organizationId,
      organizationSlug: c.organizationSlug,
      organizationRole: c.organizationRole,
    }));
  }
  if (result.state === "SINGLE_ACTIVE_ORGANIZATION") {
    return [
      {
        organizationId: result.organizationId,
        organizationSlug: result.organizationSlug,
        organizationRole: result.organizationRole,
      },
    ];
  }
  return [];
}

function decisionFor(result: TenantContextResult): TenantDecision {
  switch (result.state) {
    case "SINGLE_ACTIVE_ORGANIZATION":
      return {
        granted: true,
        userId: result.userId,
        organizationId: result.organizationId,
        organizationSlug: result.organizationSlug,
        organizationRole: result.organizationRole,
        // One membership is not a choice, so no list is offered: a switcher
        // rendered here would be a control that cannot do anything.
        selectable: false,
      };

    case "UNAUTHENTICATED":
      return { granted: false, code: "AUTHENTICATION_REQUIRED" };

    case "NO_ACTIVE_ORGANIZATION":
      return { granted: false, code: "ORGANIZATION_CONTEXT_REQUIRED" };

    case "MULTIPLE_ACTIVE_ORGANIZATIONS":
      return {
        granted: false,
        code: "ORGANIZATION_SELECTION_REQUIRED",
        options: optionsOf(result),
      };

    case "MEMBERSHIP_UNAVAILABLE":
      /*
       * The diagnostic is deliberately dropped here and never reaches the
       * response. It is an operator-facing reason (the core already logged it
       * through `logInfraFailure`) and Phase 89 established that internal
       * detail must not travel in a body. What the caller learns is that the
       * question could not be asked, which is all they can act on.
       */
      return { granted: false, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" };
  }
}

/**
 * Apply a stored intent to a proven result. THE HEART OF THE R2 CORRECTION.
 *
 * Three situations, and R1 collapsed two of them:
 *
 *   no intent          - resolve implicitly, exactly as before;
 *   intent that grants - grant it, and carry the alternatives so the reader can
 *                        change their mind (F1);
 *   intent that does NOT grant - REFUSE, and keep refusing (F2).
 *
 * The third is the one that mattered. A reader who chose B and then lost B was
 * handed A, silently, with `granted: true`. They never left B; every read and
 * write in that request would have run in a tenant they did not pick. Refusing
 * access to B was never enough - the work must not quietly happen elsewhere.
 *
 * The refusal carries the proven memberships so the reader has a way out, and
 * it is REPEATABLE: nothing clears the cookie, so the same dead intent produces
 * the same refusal on every request until an explicit `PUT` replaces it. R1
 * cleared it instead, and the very next request - now looking like somebody who
 * had never chosen - was granted the surviving organization automatically.
 */
function applyStoredSelection(
  base: TenantContextResult,
  stored: StoredSelection,
): TenantDecision {
  if (stored.kind === "none") return decisionFor(base);

  // A stored intent cannot manufacture a tenant. These three answers are about
  // the account or the platform, and a hint has nothing to add to any of them.
  if (
    base.state === "UNAUTHENTICATED" ||
    base.state === "NO_ACTIVE_ORGANIZATION" ||
    base.state === "MEMBERSHIP_UNAVAILABLE"
  ) {
    return decisionFor(base);
  }

  const proven = optionsOf(base);
  const match = proven.find((o) => o.organizationId === stored.organizationId);

  if (!match) {
    return {
      granted: false,
      code: "ORGANIZATION_SELECTION_REQUIRED",
      options: proven,
    };
  }

  return {
    granted: true,
    userId: base.userId,
    organizationId: match.organizationId,
    organizationSlug: match.organizationSlug,
    organizationRole: match.organizationRole,
    selectable: proven.length > 1,
    ...(proven.length > 1 ? { options: proven } : {}),
  };
}

/* ── Implicit resolution ─────────────────────────────────────────────────── */

/**
 * Resolve the acting organization for a route handler.
 *
 * The stored selection is applied as a CANDIDATE, which is the only role the
 * core will let it play: it can narrow the multi-organization case to one of
 * the caller's own proven memberships and can do nothing else. A stale, forged
 * or foreign value narrows to nothing and the caller is asked to choose.
 */
export async function resolveTenantDecision(req: NextRequest): Promise<TenantDecision> {
  const base = await resolveTenantContextFromRequest(req);
  return applyStoredSelection(base, storedFor(base, (userId) => readStoredSelection(req, userId)));
}

/**
 * Read the stored intent, but only once identity is established.
 *
 * The cookie is never consulted for a caller nobody has identified: reading it
 * first would mean interpreting a value supplied by an anonymous request. The
 * resolver is what establishes the identity the hint is checked against.
 */
function storedFor(
  base: TenantContextResult,
  read: (userId: string) => StoredSelection,
): StoredSelection {
  const userId = "userId" in base ? base.userId : undefined;
  return userId ? read(userId) : { kind: "none" };
}

/**
 * Resolve the acting organization for a caller who has ALREADY been resolved.
 *
 * PHASE 110-A1.0b R2 (F4) — this exists so `PUT` can authenticate before it
 * reads the request body and then reuse that same proven result, instead of
 * resolving a second time. Two resolutions in one request are two chances to
 * disagree, and the first of them would have happened before the caller was
 * known to exist.
 */
export function decideFromResolved(
  base: TenantContextResult,
  stored: StoredSelection,
): TenantDecision {
  return applyStoredSelection(base, stored);
}

/**
 * Narrow a proven MULTIPLE result to one candidate, or refuse.
 *
 * Deliberately local and pure: it reads only the candidate list the core has
 * already proven and compares ids byte for byte. There is no query here, and
 * no path by which a candidate that is not in that list becomes a context.
 */
function narrowByCandidate(
  base: Extract<TenantContextResult, { state: "MULTIPLE_ACTIVE_ORGANIZATIONS" }>,
  candidateId: string,
): {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  organizationRole: TenantOption["organizationRole"];
} | null {
  const match = base.candidates.find((c) => c.organizationId === candidateId);
  if (!match) return null;
  return {
    userId: base.userId,
    organizationId: match.organizationId,
    organizationSlug: match.organizationSlug,
    organizationRole: match.organizationRole,
  };
}

/* ── Explicit selection ──────────────────────────────────────────────────── */

export type TenantSelectionOutcome =
  | {
      readonly accepted: true;
      readonly userId: string;
      readonly organizationId: string;
      readonly organizationSlug: string;
      readonly organizationRole: TenantOption["organizationRole"];
      readonly selectable: boolean;
    }
  | { readonly accepted: false; readonly code: TenantRefusalCode | "ORGANIZATION_SELECTION_INVALID" };

/**
 * Honour an explicit selection, or refuse it.
 *
 * THE RULE THAT MAKES THIS DIFFERENT FROM THE IMPLICIT PATH: the organization
 * that comes back must be the organization that was asked for. A reader who
 * asks for B and is a member of A alone is refused — they are not quietly given
 * A with a 200, because "your selection succeeded" and "you are now in a
 * different organization than the one you named" cannot both be true.
 *
 * The refusal is one code for every cause. Foreign, suspended, deleted,
 * malformed and simply-not-yours all answer `ORGANIZATION_SELECTION_INVALID`,
 * so the response cannot be used to discover which organizations exist.
 */
export function selectFromResolved(
  base: TenantContextResult,
  candidate: unknown,
): TenantSelectionOutcome {
  switch (base.state) {
    case "UNAUTHENTICATED":
      return { accepted: false, code: "AUTHENTICATION_REQUIRED" };
    case "MEMBERSHIP_UNAVAILABLE":
      return { accepted: false, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" };
    case "NO_ACTIVE_ORGANIZATION":
      return { accepted: false, code: "ORGANIZATION_CONTEXT_REQUIRED" };
    case "SINGLE_ACTIVE_ORGANIZATION":
      /*
       * One membership. The selection is accepted ONLY if it names that exact
       * organization — a no-op the client may legitimately send when it
       * re-affirms its current tenant — and refused otherwise.
       *
       * Comparing with `===` against a value typed `unknown` is intentional: a
       * number, an array or an object with a helpful `toString` must not match.
       * The core's `isUsableId` is not reachable from here, and re-implementing
       * validation would be a second opinion about what a usable id is; an
       * exact identity comparison needs no opinion at all.
       */
      return candidate === base.organizationId
        ? {
            accepted: true,
            userId: base.userId,
            organizationId: base.organizationId,
            organizationSlug: base.organizationSlug,
            organizationRole: base.organizationRole,
            selectable: false,
          }
        : { accepted: false, code: "ORGANIZATION_SELECTION_INVALID" };
    case "MULTIPLE_ACTIVE_ORGANIZATIONS": {
      if (typeof candidate !== "string") {
        return { accepted: false, code: "ORGANIZATION_SELECTION_INVALID" };
      }
      const match = narrowByCandidate(base, candidate);
      if (!match) return { accepted: false, code: "ORGANIZATION_SELECTION_INVALID" };
      return {
        accepted: true,
        userId: match.userId,
        organizationId: match.organizationId,
        organizationSlug: match.organizationSlug,
        organizationRole: match.organizationRole,
        selectable: true,
      };
    }
  }
}

/* ── Server components ───────────────────────────────────────────────────── */

/**
 * The same decision for a server component, which has no `NextRequest`.
 *
 * The cookie jar is passed in rather than read here so this module never
 * imports `next/headers`, which would make it unusable from a route handler.
 * The decision reached is identical: same resolver, same candidate rule, same
 * exhaustive mapping.
 */
export async function resolveTenantDecisionFromSession(jar: {
  get: (name: string) => { value: string } | undefined;
}): Promise<TenantDecision> {
  const base = await resolveTenantContextFromServerSession();
  return applyStoredSelection(
    base,
    storedFor(base, (userId) => readStoredSelectionFromJar(jar, userId)),
  );
}

/**
 * The same selection, resolving the caller first.
 *
 * `PUT` does NOT use it: it resolves once itself, refuses an unauthenticated
 * caller before touching the body, and then calls `selectFromResolved` with
 * that same result.
 *
 * PHASE 110-A1.0b R3 — retained DELIBERATELY, unlike the two exports this round
 * deleted. It is the only entry point that answers "may this caller select this
 * organization?" without an already-resolved result in hand, it is exercised
 * directly by `tenant-selection.test.ts`, and it is one of the guard tokens the
 * Phase 99 route classifier recognises. Its absence of a product caller today
 * is a fact about how few surfaces have adopted selection, not evidence that
 * the entry point is wrong.
 */
export async function selectTenantContext(
  req: NextRequest,
  candidate: unknown,
): Promise<TenantSelectionOutcome> {
  return selectFromResolved(await resolveTenantContextFromRequest(req), candidate);
}

/** The resolved result a route needs before it may read a request body. */
export async function resolveTenantBase(req: NextRequest): Promise<TenantContextResult> {
  return resolveTenantContextFromRequest(req);
}

/**
 * PHASE 110-A1.0b R5 — the tenant-intent precondition, in ONE implementation.
 *
 * R3 put this comparison inline in `resolveOrgContext`, which was correct while
 * exactly one helper resolved a selection. R5 gave the platform path the same
 * resolver, so the comparison now has two callers and must have one definition:
 * two copies of a security check are two chances to fix only one of them.
 *
 * THE RULE. The header states which organization the CALLER'S PAGE was rendered
 * for. It is compared against an organization the server has ALREADY resolved
 * and proven, so it can only ever cause a refusal — it cannot select, cannot
 * widen, and naming an organization the caller does not belong to mismatches
 * exactly like naming the wrong one of their own.
 *
 * ABSENT MEANS "I ASSERT NOTHING". Existing clients, server-to-server callers
 * and OT integrations send no header and are unaffected. That is the deliberate
 * compatibility boundary and equally the limit of the protection: a caller that
 * does not send it is not protected by it.
 *
 * WHO IS EXEMPT IS DECIDED BY THE AUTHENTICATION PATH, NOT BY A HEADER. This
 * function is called on the session path only. An API key carries its own
 * organization on the key row, has no browser page to be stale about, and is
 * never subjected to it — see `resolveApiKeyContext`. Nothing here reads the
 * User-Agent or any other value a caller can choose for themselves.
 */
export function tenantPreconditionConflicts(
  req: Pick<NextRequest, "headers">,
  resolvedOrganizationId: string,
): boolean {
  const asserted = req.headers.get(TENANT_PRECONDITION_HEADER);
  return asserted !== null && asserted !== resolvedOrganizationId;
}

/**
 * What the tenant precondition says about this request.
 *
 *   ok       either the header matches, or none was needed
 *   conflict a header was sent and names a different organization
 *   missing  a state-changing request on the SESSION path sent none at all
 */
export type TenantPreconditionOutcome = "ok" | "conflict" | "missing";

/**
 * PHASE 110-A1.0b R6 — THE PRECONDITION IS NO LONGER OPTIONAL FOR A WRITE.
 *
 * R3 introduced it and R5 extended it to every implicit-context route, but in
 * both rounds an ABSENT header meant "I assert nothing" and the mutation went
 * through. Both rounds asserted that gap rather than describing it: each suite
 * contains a case proving a header-less request still cancelled organization
 * B's subscription. As a compatibility boundary that was defensible. As a
 * property of a BROWSER WRITE it is not — a stale tab that sends nothing is
 * exactly as dangerous as one that sends the wrong thing.
 *
 * SCOPED BY METHOD, because a read is not a write. A GET renders a page; if it
 * renders the wrong tenant the reader sees something they should not have seen,
 * which the membership check already prevents. A write CHANGES a tenant, and
 * that is the thing no one may do by accident.
 *
 * SCOPED BY CREDENTIAL PATH, decided by how the caller authenticated and never
 * by anything they can choose. An API key resolves before this is reached: it
 * carries its own organization, has no rendered page, and so can assert nothing
 * and must not be required to.
 *
 * NOT SELF-REFERENTIAL. The organization-selection endpoint does not pass
 * through here at all — `GET /api/tenant/context` and the `PUT` that MAKES a
 * selection use the resolver directly — so the act of choosing an organization
 * can never require having already chosen one.
 */
export function checkTenantPrecondition(
  req: Pick<NextRequest, "headers" | "method">,
  resolvedOrganizationId: string,
): TenantPreconditionOutcome {
  const asserted = req.headers.get(TENANT_PRECONDITION_HEADER);

  if (asserted === null) {
    /*
     * FAIL CLOSED on an unknown method.
     *
     * A first R6 draft defaulted an absent `req.method` to "GET", and the R3 and
     * R5 suites went on passing their "no header still writes" cases — not
     * because the requirement was wrong but because their request doubles carry
     * no method, so every request looked like a read. A default that turns a
     * missing field into "no precondition needed" is a bypass waiting for the
     * one caller that does not set it.
     *
     * A real `NextRequest` always has a method, so requiring one costs nothing
     * and closes the hole. Only a method KNOWN to be safe is exempt.
     */
    const method = req.method;
    const isKnownRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
    return isKnownRead ? "ok" : "missing";
  }
  return asserted === resolvedOrganizationId ? "ok" : "conflict";
}

/*
 * PHASE 110-A1.0b R3 (R3-5) — `storedSelectionFor` was REMOVED.
 *
 * It had exactly one caller: `PUT`, which invoked it as
 * `void storedSelectionFor(base, req)` and discarded the result. It decided
 * nothing — the post-selection state is computed by `decideFromResolved` from
 * the selection just accepted — so it read a cookie for no reason. An export
 * whose only use is a discarded call is not an extension point.
 */
