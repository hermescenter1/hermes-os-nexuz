/**
 * PHASE 90 — tenant ownership scoping for Industrial Brain resources.
 *
 * The Brain's durable history (AnalysisRecord) and its saved cases
 * (EngineeringCase) predate the multi-tenant model: rows carried no owner, so
 * `/api/brain` could only be protected by the coarse `requireAuthoring` gate —
 * every authoring user saw every other user's analyses. Phase 90 adds nullable
 * `userId` / `organizationId` columns and this module turns them into a query
 * predicate, so ownership is enforced IN THE DATABASE QUERY rather than by
 * post-fetch filtering.
 *
 * LEGACY POOL: rows written before this phase have NULL owners. They stay
 * visible to authenticated authoring users (the exact audience that could
 * already read them), so the migration is non-destructive and no history
 * disappears. Every row written from now on is attributed, and attributed rows
 * are only ever visible to their owner or the owner's organization.
 *
 * The owner is ALWAYS derived from the authenticated server-side session —
 * see `resolveBrainOwner`. No caller may pass a userId/orgId from a request
 * body or query string.
 */

import type { BrainOwner } from "./types";

/** Hard ceiling on any owner-scoped list query — no unbounded private reads. */
export const MAX_OWNED_ROWS = 200;

/** A Prisma `where` fragment. Deliberately structural: the storage layer talks
 *  to Prisma models through an untyped seam (see the repositories). */
export type OwnerWhere = {
  OR: Array<Record<string, string | null>>;
};

/**
 * Prisma `where` clause matching exactly the rows this owner may see:
 *   - rows they created themselves,
 *   - rows owned by their organization (when they belong to one).
 *
 * LEGACY ROWS ARE NOT INCLUDED. A NULL-owner row cannot be attributed to any
 * tenant, so serving it to "every authoring user" would be exactly the
 * cross-tenant exposure this module exists to prevent. Such rows are
 * QUARANTINED: invisible to every ordinary read, write, delete and export.
 * Recovering them is an explicit, permission-gated, audited administrative
 * action (see `legacyQuarantineWhere`), never an ordinary API read.
 *
 * Passing `null` (an unauthenticated context) is a programming error — callers
 * must gate on authentication first — so it yields a predicate that matches
 * NOTHING rather than something.
 */
export function ownerWhere(owner: BrainOwner | null): OwnerWhere {
  if (!owner) {
    // Impossible predicate: an unauthenticated context sees no private row.
    // (`userId` is a String? column, so it can never equal this sentinel.)
    return { OR: [{ userId: IMPOSSIBLE_OWNER }] };
  }
  const clauses: Array<Record<string, string | null>> = [{ userId: owner.userId }];
  if (owner.orgId) clauses.push({ organizationId: owner.orgId });
  return { OR: clauses };
}

/**
 * Sentinel that no real row can carry, used to build a predicate matching
 * nothing. Safer than returning `{}` (which would match EVERYTHING) if a caller
 * ever forgets to gate on authentication first.
 */
const IMPOSSIBLE_OWNER = "__hermes_no_owner_sentinel__";

/**
 * ADMINISTRATIVE ONLY — the quarantined legacy pool.
 *
 * Rows that predate Phase 90 and carry no owner. This predicate is deliberately
 * NOT used by any ordinary repository read; it exists so a separately reviewed,
 * permission-gated and audited recovery tool can enumerate what needs
 * attribution. Ordinary callers must never reach it.
 */
export function legacyQuarantineWhere(): { userId: null; organizationId: null } {
  return { userId: null, organizationId: null };
}

/** True when a row is quarantined legacy data (no owner recorded). */
export function isLegacyQuarantined(row: {
  userId?: string | null;
  organizationId?: string | null;
}): boolean {
  return (row.userId ?? null) === null && (row.organizationId ?? null) === null;
}

/**
 * True when `row` is readable by `owner`. Mirrors `ownerWhere` for the
 * in-memory (session-storage) repositories, which have no query engine.
 */
export function ownerCanRead(
  row: { userId?: string | null; organizationId?: string | null },
  owner: BrainOwner | null,
): boolean {
  // Quarantined legacy rows are readable by NO ONE through ordinary paths.
  if (isLegacyQuarantined(row)) return false;
  if (!owner) return false;
  const rowUser = row.userId ?? null;
  const rowOrg = row.organizationId ?? null;
  if (rowUser !== null && rowUser === owner.userId) return true;
  return rowOrg !== null && owner.orgId !== null && rowOrg === owner.orgId;
}

/**
 * Owner attribution for a NEW row. Returned separately from caller-supplied
 * data so a caller can never override it by spreading request input.
 */
export function ownerAttribution(owner: BrainOwner | null): {
  userId: string | null;
  organizationId: string | null;
} {
  return {
    userId: owner?.userId ?? null,
    organizationId: owner?.orgId ?? null,
  };
}

/** Ceiling on the public published-corpus read (see `listPublishedCases`). */
export const MAX_PUBLISHED_ROWS = 500;
