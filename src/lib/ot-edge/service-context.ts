// PHASE 94B3 — the trusted authorization scope every OT service runs inside.
//
// WHY A TYPE AND NOT A CONVENTION
// Every cross-tenant leak in this codebase's history has the same shape: an
// identifier arrives in a request body and reaches a query. A service that
// takes `organizationId: string` cannot tell a trusted value from an
// attacker-supplied one. `OtServiceContext` can only be produced by
// `buildOtServiceContext`, which HTTP routes call with values derived from the
// authenticated actor (Phase 94B4) — so a context assembled from request JSON
// is a type error, not a code-review question.
//
// Domain services therefore never call requireOrgActor themselves: they receive
// an already-authorized scope and are responsible only for applying it.

import type { OrgPermission } from "@/lib/org/rbac";
import { can } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";

/** Brand preventing a context from being constructed by object literal. */
declare const TRUSTED: unique symbol;

export interface OtServiceContext {
  readonly [TRUSTED]: true;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: OrgRole;
  /**
   * Sites this actor may read. `null` means "every site in the organization" —
   * used for org-wide roles. An EMPTY ARRAY means no site access at all and
   * must yield empty results, never an unfiltered query.
   */
  readonly allowedSiteIds: readonly string[] | null;
  /** Correlates every audit and log line produced by one request. */
  readonly requestId: string | null;
}

/**
 * The ONLY way to produce a context. Callers pass values they obtained from
 * the authenticated session and organization membership.
 */
export function buildOtServiceContext(input: {
  userId: string;
  organizationId: string;
  role: OrgRole;
  allowedSiteIds: readonly string[] | null;
  requestId?: string | null;
}): OtServiceContext {
  if (!input.userId || !input.organizationId) {
    // A blank tenant would otherwise become a query matching nothing — or,
    // worse, a query some future refactor treats as "unscoped".
    throw new Error("ot service context requires an authenticated actor");
  }
  return {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    allowedSiteIds: input.allowedSiteIds === null ? null : [...input.allowedSiteIds],
    requestId: input.requestId ?? null,
  } as OtServiceContext;
}

export type ServiceFailure =
  | { ok: false; code: "FORBIDDEN" }
  /** Also used for foreign-tenant resources: existence is never disclosed. */
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "CONFLICT"; detail?: string }
  | { ok: false; code: "VALIDATION"; detail?: string }
  | { ok: false; code: "UNSUPPORTED_FORMAT" }
  | { ok: false; code: "INTERNAL" };

export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

/** Permission gate for a service operation. */
export function authorize(ctx: OtServiceContext, permission: OrgPermission): ServiceFailure | null {
  return can(ctx.role, permission) ? null : { ok: false, code: "FORBIDDEN" };
}

/**
 * The site predicate for a scoped query.
 *
 * Returns `undefined` when the actor may see every site (omit the filter), or
 * an `in` clause otherwise. An actor with an empty allow-list gets `in: []`,
 * which matches nothing — the safe direction. It must never return an
 * unfiltered predicate for an actor that has no site access.
 */
export function siteFilter(ctx: OtServiceContext): { in: string[] } | undefined {
  return ctx.allowedSiteIds === null ? undefined : { in: [...ctx.allowedSiteIds] };
}

/**
 * The mandatory tenant predicate.
 *
 * Every repository query composes from this, so "did we remember the
 * organization filter?" has exactly one answer for the whole layer.
 */
export function tenantWhere(ctx: OtServiceContext): { organizationId: string } {
  return { organizationId: ctx.organizationId };
}

/** Pagination bounds — a caller can never request an unbounded page. */
export const PAGE_LIMITS = { default: 50, max: 200 } as const;

export function boundedPage(input?: { take?: number; skip?: number }): {
  take: number;
  skip: number;
} {
  const rawTake = Number(input?.take ?? PAGE_LIMITS.default);
  const rawSkip = Number(input?.skip ?? 0);
  const take = Number.isFinite(rawTake)
    ? Math.min(Math.max(Math.trunc(rawTake), 1), PAGE_LIMITS.max)
    : PAGE_LIMITS.default;
  const skip = Number.isFinite(rawSkip) ? Math.max(Math.trunc(rawSkip), 0) : 0;
  return { take, skip };
}
