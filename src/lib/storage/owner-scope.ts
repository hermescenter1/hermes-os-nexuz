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
 * LEGACY POOL: rows written before this phase have NULL owner columns. They are
 * QUARANTINED (invisible to every ordinary read) — no history is served to an
 * arbitrary tenant. Every row written from now on is attributed, and attributed
 * rows are visible ONLY within their exact active-organization context, or — for
 * personal (org-less) rows — to the creating user alone. A row created under one
 * organization is never reachable from another organization's context, even by
 * the same user (see `ownerWhere` / `ownerCanRead`).
 *
 * The owner is ALWAYS derived from the authenticated server-side session — see
 * `resolveBrainOwner`, which resolves exactly one of PERSONAL / ORG / AMBIGUOUS
 * (fail-closed) contexts. No caller may pass a userId/orgId from a request body
 * or query string.
 */

import type { BrainOwner } from "./types";

/** Hard ceiling on any owner-scoped list query — no unbounded private reads. */
export const MAX_OWNED_ROWS = 200;

/** One arm of an `ownerWhere` OR. Either an exact org match, the impossible
 *  sentinel, or the "personal row" AND-pair (org IS NULL AND userId = me). */
export type OwnerClause =
  | { organizationId: string }
  | { userId: string }
  | { AND: Array<{ organizationId: null } | { userId: string }> };

/** A Prisma `where` fragment. Deliberately structural: the storage layer talks
 *  to Prisma models through an untyped seam (see the repositories). */
export type OwnerWhere = {
  OR: OwnerClause[];
};

/**
 * Raised when a write is attempted in an AMBIGUOUS org context (>1 active
 * membership, no server-authenticated active organization). The write fails
 * closed rather than being attributed to an arbitrarily-chosen organization.
 */
export class AmbiguousOwnerContextError extends Error {
  constructor() {
    super("Ambiguous organization context: an active organization must be selected before writing.");
    this.name = "AmbiguousOwnerContextError";
  }
}

/**
 * Raised when a write is attempted with NO owner context (an unauthenticated
 * caller, or a `resolveBrainOwner()` that returned null after the auth gate
 * passed — e.g. a transient session/membership resolution failure). The write
 * fails closed rather than creating an UNATTRIBUTED (owner-less) row that would
 * silently land in the quarantined legacy pool.
 */
export class OwnerContextUnavailableError extends Error {
  constructor() {
    super("Owner context unavailable: authentication or membership resolution failed.");
    this.name = "OwnerContextUnavailableError";
  }
}

/**
 * Prisma `where` clause matching EXACTLY the rows this owner may see:
 *
 *   ORG context      => organizationId = orgId
 *                       OR (organizationId IS NULL AND userId = userId)
 *   PERSONAL context => organizationId IS NULL AND userId = userId
 *   AMBIGUOUS / null => nothing (impossible sentinel)
 *
 * Deliberately NOT `{ userId }` alone: a bare userId clause would expose a row
 * the user created while a member of a DIFFERENT organization (organizationId =
 * that other org). Cross-organization visibility is only ever via the exact
 * active-org match; personal (org-less) rows are keyed to the user alone.
 *
 * LEGACY NULL-owner rows (userId NULL AND organizationId NULL) are never matched
 * — the personal clause requires a concrete userId — so they stay QUARANTINED.
 */
export function ownerWhere(owner: BrainOwner | null): OwnerWhere {
  if (!owner || owner.ambiguous) {
    // Impossible predicate: an unauthenticated or ambiguous context sees no row.
    // (`userId` is a String? column, so it can never equal this sentinel.)
    return { OR: [{ userId: IMPOSSIBLE_OWNER }] };
  }
  // A personal row: org-less and created by THIS user; visible only to them.
  const personal: OwnerClause = {
    AND: [{ organizationId: null }, { userId: owner.userId }],
  };
  if (owner.orgId) {
    // Org context: the active organization's rows (tenant-wide) + own personal.
    return { OR: [{ organizationId: owner.orgId }, personal] };
  }
  // Personal context (no active organization): only the user's personal rows.
  return { OR: [personal] };
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
 * True when `row` is readable by `owner`. Mirrors `ownerWhere` EXACTLY for the
 * in-memory (session-storage) repositories, which have no query engine — the
 * session and database backends therefore enforce identical isolation.
 *
 *   personal row (org IS NULL) => readable only by the SAME userId.
 *   org row (org = X)          => readable only in the active-org context X.
 *   ambiguous / null owner     => nothing.
 */
export function ownerCanRead(
  row: { userId?: string | null; organizationId?: string | null },
  owner: BrainOwner | null,
): boolean {
  // Quarantined legacy rows are readable by NO ONE through ordinary paths.
  if (isLegacyQuarantined(row)) return false;
  if (!owner || owner.ambiguous) return false;
  const rowUser = row.userId ?? null;
  const rowOrg = row.organizationId ?? null;
  if (rowOrg === null) {
    // Personal row: keyed to the user alone (never an org colleague).
    return rowUser !== null && rowUser === owner.userId;
  }
  // Organization row: reachable only within its exact active organization —
  // never via a bare userId match from a different org context.
  return owner.orgId !== null && rowOrg === owner.orgId;
}

/**
 * Owner attribution for a NEW row. Returned separately from caller-supplied
 * data so a caller can never override it by spreading request input.
 *
 * FAILS CLOSED — it never returns an unattributed or arbitrarily-attributed
 * owner, so a create can never write an owner-less or misattributed row:
 *   - null owner (context unavailable) => throws OwnerContextUnavailableError.
 *   - ambiguous context (>1 active org) => throws AmbiguousOwnerContextError.
 *   - personal/org context             => the concrete (userId, orgId|null).
 */
export function ownerAttribution(owner: BrainOwner | null): {
  userId: string;
  organizationId: string | null;
} {
  if (!owner) {
    throw new OwnerContextUnavailableError();
  }
  if (owner.ambiguous) {
    throw new AmbiguousOwnerContextError();
  }
  return {
    userId: owner.userId,
    organizationId: owner.orgId,
  };
}

/** Ceiling on the public published-corpus read (see `listPublishedCases`). */
export const MAX_PUBLISHED_ROWS = 500;
