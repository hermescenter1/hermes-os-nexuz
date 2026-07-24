// PHASE 94B3.2 — repository error vocabulary and the ONE place tenant scope is
// expressed.
//
// TWO INVARIANTS LIVE HERE
//
// 1. NOTHING FROM THE DRIVER ESCAPES. A Prisma error carries the constraint
//    name, the table, the column list and sometimes the SQL. Returned to a
//    caller, that is a schema disclosure; logged, it is a breadcrumb trail for
//    an attacker. `mapPrismaError` collapses every driver failure into a small
//    closed union and drops the payload entirely.
//
// 2. SCOPE IS COMPOSED, NEVER REMEMBERED. Every adapter builds its `where` from
//    `orgScope`/`siteScope` here, so "did this query filter by organization?"
//    has one answer for the whole layer instead of one answer per method.

import type { OtServiceContext } from "../service-context";

/** The closed set of failures an adapter may report. */
export type RepositoryErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "TRANSIENT_FAILURE"
  | "INTERNAL_FAILURE";

export interface RepositoryError {
  ok: false;
  code: RepositoryErrorCode;
  /** A short, caller-safe hint. NEVER driver text, SQL or identifiers. */
  hint?: string;
}

export type RepoResult<T> = { ok: true; value: T } | RepositoryError;

export const fail = (code: RepositoryErrorCode, hint?: string): RepositoryError => ({
  ok: false,
  code,
  ...(hint ? { hint } : {}),
});

export const succeed = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** Prisma/Postgres codes we translate deliberately. */
const UNIQUE = new Set(["P2002", "23505"]);
const FK = new Set(["P2003", "23503"]);
const MISSING = new Set(["P2025", "P2001"]);
const TRANSIENT = new Set(["P2034", "40001", "40P01", "P1001", "P1002", "P1008", "P1017"]);

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const c = (err as { code?: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

/**
 * Translate any thrown database error into the safe union.
 *
 * The original error is deliberately NOT attached, not stringified and not
 * re-thrown: a caller that receives this object cannot reconstruct the
 * constraint name, and a log line built from it cannot leak one either.
 */
export function mapPrismaError(err: unknown): RepositoryError {
  const code = codeOf(err);
  if (code && UNIQUE.has(code)) return fail("CONFLICT", "already exists");
  if (code && FK.has(code)) return fail("VALIDATION_FAILED", "related record is not valid");
  if (code && MISSING.has(code)) return fail("NOT_FOUND");
  if (code && TRANSIENT.has(code)) return fail("TRANSIENT_FAILURE", "please retry");
  return fail("INTERNAL_FAILURE");
}

/** Run a database call and convert any throw into a safe repository error. */
export async function guarded<T>(run: () => Promise<T>): Promise<RepoResult<T>> {
  try {
    return succeed(await run());
  } catch (err) {
    return mapPrismaError(err);
  }
}

/* ── Scope composition ──────────────────────────────────────────────────── */

/** The mandatory tenant predicate. Every adapter query starts from this. */
export function orgScope(ctx: OtServiceContext): { organizationId: string } {
  return { organizationId: ctx.organizationId };
}

/**
 * The site predicate.
 *
 * `null` allowedSiteIds means org-wide (omit the filter) and can only originate
 * from a trusted `OtServiceContext`. An EMPTY array means "no site access" and
 * MUST produce `{ in: [] }` — a predicate matching nothing. Returning
 * `undefined` there would silently widen an actor with zero sites to the whole
 * organization, which is the single most dangerous bug this layer can have.
 */
export function siteScope(ctx: OtServiceContext): { in: string[] } | undefined {
  return ctx.allowedSiteIds === null ? undefined : { in: [...ctx.allowedSiteIds] };
}

/** True when the actor can see no site at all. */
export function hasNoSiteAccess(ctx: OtServiceContext): boolean {
  return ctx.allowedSiteIds !== null && ctx.allowedSiteIds.length === 0;
}

/** May this actor act on `siteId`? A null site is org-level and always allowed. */
export function siteAllowed(ctx: OtServiceContext, siteId: string | null | undefined): boolean {
  if (siteId === null || siteId === undefined) return ctx.allowedSiteIds === null;
  if (ctx.allowedSiteIds === null) return true;
  return ctx.allowedSiteIds.includes(siteId);
}

/**
 * Compose `{ organizationId, siteId? }` for a table that carries `siteId`.
 * Rows with a NULL site stay visible to org-wide actors only.
 */
export function orgSiteScope(ctx: OtServiceContext): Record<string, unknown> {
  const site = siteScope(ctx);
  return site === undefined ? orgScope(ctx) : { ...orgScope(ctx), siteId: site };
}

/* ── Sorting ────────────────────────────────────────────────────────────── */

/**
 * Sort fields are an ALLOW-LIST per entity.
 *
 * An arbitrary `orderBy` field is both an error surface and an oracle: sorting
 * by a column a caller cannot read still lets them infer its values.
 */
export const SORT_FIELDS = {
  gateway: ["createdAt", "updatedAt", "lifecycle"],
  device: ["createdAt", "updatedAt", "category"],
  import: ["startedAt", "completedAt", "status"],
  project: ["createdAt", "updatedAt", "name", "revision"],
  tag: ["name", "createdAt"],
  alarm: ["code", "severity", "createdAt"],
  networkNode: ["nodeName", "createdAt"],
  finding: ["createdAt", "severity", "status"],
} as const;

export type SortEntity = keyof typeof SORT_FIELDS;

/** Resolve a caller-supplied sort to a safe `orderBy`, falling back silently. */
export function safeOrderBy(
  entity: SortEntity,
  field: string | undefined,
  direction: string | undefined,
): Record<string, "asc" | "desc"> {
  const allowed = SORT_FIELDS[entity] as readonly string[];
  const chosen = field && allowed.includes(field) ? field : allowed[0];
  const dir: "asc" | "desc" = direction === "asc" ? "asc" : "desc";
  return { [chosen]: dir };
}
