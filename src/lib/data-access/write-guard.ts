/**
 * PHASE 110-A2.3 — the one place a CMMS write is authorized.
 *
 * WHAT WAS WRONG, MEASURED RATHER THAN ASSUMED
 * The five CMMS write endpoints checked a caller's PLATFORM role and nothing
 * else. A direct call of the real handler returned 201 with the write reached
 * for every one of these:
 *
 *   - a POST carrying no `x-hermes-organization` header at all;
 *   - a POST asserting a DIFFERENT organization than the one the server would
 *     resolve — the stale-tab case;
 *   - a caller whose platform role is `engineer` regardless of what their role
 *     in the organization is.
 *
 * The tenant-intent precondition existed and was enforced on the platform and
 * billing paths; it had exactly two callers and no CMMS route reached either.
 * The organization role existed too: the resolver produced it and
 * `requireTenantScope` dropped it.
 *
 * WHAT THIS DOES, IN ORDER, AND WHY THE ORDER MATTERS
 *   1. RESOLVE the tenant, from the session and the selection cookie only.
 *   2. CHECK THE PRECONDITION against the organization just resolved.
 *   3. CHECK THE ORGANIZATION PERMISSION for that caller's proven role.
 *
 * The precondition is checked AFTER the tenant is resolved because it compares
 * against a resolved value; it is checked BEFORE the body is parsed and before
 * any write because a request that will be refused must not do work first.
 *
 * THE HEADER NEVER SELECTS ANYTHING. It is compared, and a mismatch refuses the
 * request. There is no code path here in which the header's value becomes the
 * organization: `checkTenantPrecondition` takes the resolved id as an argument
 * and returns one of three words. A header naming an organization the caller
 * does not belong to is refused by the same comparison as a header naming the
 * wrong one of their own.
 *
 * THE RESULT IS USED, NOT DISCARDED. The verified scope is returned and the
 * caller hands it to the write. The data layer no longer resolves a tenant of
 * its own for these five operations, so there is no second resolution that
 * could answer differently from the one that was checked.
 *
 * CREDENTIAL PATHS ARE NOT WIDENED HERE. This runs on the session path, which is
 * the only path these five routes accept today. API keys and bearer tokens reach
 * the platform helper instead and are unchanged by this slice.
 */

import type { NextRequest } from "next/server";

import { can as canInOrganization, type OrgPermission } from "@/lib/org/rbac";
import { checkTenantPrecondition } from "@/lib/tenant-selection/selection";

import { DataScopeError, requireTenantScope, type TenantScope } from "./tenant-scope";

/**
 * A scope that has passed all three checks, FOR ONE NAMED PERMISSION.
 *
 * A distinct type from `TenantScope` on purpose. `TenantScope` means "this
 * organization was resolved"; this means "resolved, asserted by the caller's own
 * page, and permitted for this operation".
 *
 * PHASE 110-A2.3-R1 — TWO HONEST LIMITS, STATED RATHER THAN IMPLIED.
 *
 * 1. This is a STRUCTURAL TypeScript interface, not a runtime credential. Any
 *    caller can construct an object of this shape; TypeScript cannot stop it,
 *    and no brand or private constructor is used here. The guarantee that a
 *    CMMS write runs only in a verified scope therefore rests on the REVIEWED
 *    CALLERS, and there are exactly five, all under `src/app/api/cmms/`:
 *    `tasks/route.ts`, `plans/route.ts`, `failures/route.ts`,
 *    `downtime/route.ts` and `tasks/[id]/route.ts`. Each obtains its scope from
 *    `requireWriteScope` and passes it straight to the write. The direct-call
 *    tests in `__tests__/` construct their own — that is what the type permits,
 *    and it is why they are tests and not product code.
 *
 * 2. The permission is CARRIED IN THE TYPE. `verifiedFor` is the literal
 *    permission the scope was checked against, so a scope verified for a read
 *    permission has a different type from one verified for `manage_industrial`
 *    and cannot be handed to a function that demands the latter. The five CMMS
 *    write functions take `CmmsWriteScope`, below, and nothing else.
 */
export interface VerifiedWriteScope<P extends OrgPermission = OrgPermission> extends TenantScope {
  readonly verifiedFor: P;
}

/** The only scope the five CMMS write functions accept. */
export type CmmsWriteScope = VerifiedWriteScope<"manage_industrial">;

/**
 * The precondition a state-changing request must satisfy, and the permission it
 * must hold, in one call.
 *
 * Throws `DataScopeError`, which the routes already map through
 * `refusalResponse`, so no route invents a status or a message:
 *
 *   header absent    ORGANIZATION_PRECONDITION_REQUIRED   428
 *   header mismatch  ORGANIZATION_CONTEXT_CONFLICT        409
 *   role insufficient FORBIDDEN                           403
 *
 * plus whatever `requireTenantScope` already throws when there is no tenant to
 * resolve — 401, 409 and 503, unchanged.
 *
 * `req` is read for its headers and its method and for nothing else. Neither
 * value can widen anything: the method only decides whether a precondition is
 * required at all, and `checkTenantPrecondition` fails closed on a method it
 * does not recognise as a read.
 */
export async function requireWriteScope<P extends OrgPermission>(
  req: Pick<NextRequest, "headers" | "method">,
  permission: P,
): Promise<VerifiedWriteScope<P>> {
  const scope = await requireTenantScope();

  const precondition = checkTenantPrecondition(req, scope.organizationId);
  if (precondition === "missing") {
    throw new DataScopeError("ORGANIZATION_PRECONDITION_REQUIRED");
  }
  if (precondition === "conflict") {
    throw new DataScopeError("ORGANIZATION_CONTEXT_CONFLICT");
  }

  /*
   * THE ORGANIZATION AXIS, WHICH IS NOT THE PLATFORM AXIS.
   *
   * `can` here is `@/lib/org/rbac`, over `OrganizationRole`. The routes also
   * call a function named `can` from `@/lib/auth/roles`, over the platform
   * `Role`. Two different questions with the same name is how the gap happened,
   * so this import is aliased and the two checks sit in different files.
   *
   * The role comes from the resolver's proven membership. Nothing in the request
   * body, the query string or a header can influence it — there is no parameter
   * here that could carry one.
   *
   * Both checks are required. The platform check stays where it is in each
   * route; this one is additional, never a replacement, so neither axis can be
   * satisfied by being strong on the other.
   */
  if (!canInOrganization(scope.organizationRole, permission)) {
    throw new DataScopeError("FORBIDDEN");
  }

  return { ...scope, verifiedFor: permission };
}
