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
 *   - rows owned by their organization (when they belong to one),
 *   - the legacy NULL-owner pool.
 *
 * Passing `null` (an unauthenticated context) is a programming error — callers
 * must gate on authentication first — so it yields a predicate that matches
 * only the legacy pool rather than everything.
 */
export function ownerWhere(owner: BrainOwner | null): OwnerWhere {
  const clauses: Array<Record<string, string | null>> = [
    // Legacy pre-Phase-90 rows: no owner recorded.
    { userId: null, organizationId: null },
  ];
  if (owner) {
    clauses.push({ userId: owner.userId });
    if (owner.orgId) clauses.push({ organizationId: owner.orgId });
  }
  return { OR: clauses };
}

/**
 * True when `row` is readable by `owner`. Mirrors `ownerWhere` for the
 * in-memory (session-storage) repositories, which have no query engine.
 */
export function ownerCanRead(
  row: { userId?: string | null; organizationId?: string | null },
  owner: BrainOwner | null,
): boolean {
  const rowUser = row.userId ?? null;
  const rowOrg = row.organizationId ?? null;
  if (rowUser === null && rowOrg === null) return true; // legacy pool
  if (!owner) return false;
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
