/**
 * PHASE 110-A1.0 — the tenant-context contract.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Phase 110-A0 established that authentication and ROLE authorization in this
 * repository are correct, and that the tenant boundary is missing one layer
 * lower: six module data layers query Prisma with no `organizationId` predicate
 * even though every root model declares the column. Fixing those layers one by
 * one first requires a single, trustworthy answer to the question they never
 * ask — *which organization is this caller acting in?*
 *
 * Two existing helpers already answer a NEARBY question and are deliberately
 * NOT reused as the answer to this one:
 *
 *   `requireOrgActor` (src/lib/org/context.ts) is correct and stays the
 *   authority whenever the caller NAMES an organization. It cannot resolve a
 *   caller who names none, because it takes the `orgId` as an argument.
 *
 *   `resolveOrgContext` (src/lib/billing/context.ts) does resolve a caller who
 *   names none — with `findFirst` + `orderBy: { createdAt: "asc" }` and the
 *   comment "prefer earliest membership (owner)". For a user in two
 *   organizations that silently picks one. Ordering an arbitrary choice does
 *   not make it a decision; it makes it a reproducible arbitrary choice, and
 *   the caller cannot tell the difference between "your organization" and "the
 *   oldest of your organizations". This module exists because that is the one
 *   behaviour the tenant boundary may not have.
 *
 * WHAT THIS CONTRACT REFUSES TO REPRESENT
 * ---------------------------------------
 * There is no `organizationId: string | null`. A nullable id forces every
 * caller to re-derive *why* it was null, and the reasons demand different
 * behaviours:
 *
 *   UNAUTHENTICATED                sign in
 *   NO_ACTIVE_ORGANIZATION         signed in; onboarding is the fix
 *   MULTIPLE_ACTIVE_ORGANIZATIONS  signed in; a selection is the fix
 *   MEMBERSHIP_UNAVAILABLE         nothing is wrong with the caller; an outage
 *                                  or an input this resolver refuses to trust
 *
 * Collapsing the last one into the second is the specific defect this contract
 * is shaped to prevent: reporting an outage as a fact about someone's account.
 * `resolveOrgContext` already learned that lesson for billing (INTERNAL_ERROR);
 * this states it for every tenant-scoped surface.
 *
 * NEITHER STATE IS A LICENCE TO QUERY. Only `SINGLE_ACTIVE_ORGANIZATION`
 * carries an `organizationId`, and it is the only state from which a
 * tenant-scoped query may be issued. The union makes "query anyway" unwritable
 * rather than merely discouraged.
 *
 * TRANSPORT IS NOT MODELLED HERE
 * ------------------------------
 * An earlier revision exported a `TENANT_STATE_STATUS` map of HTTP codes. It
 * had no consumer in this slice and mixed a transport concern into a decision
 * contract that server components — which have no status code — must also use.
 * The HTTP mapping belongs with the routes that adopt the resolver (110-A1.0b),
 * beside the existing `REFUSAL_STATUS` in `src/lib/auth/context-result.ts`.
 */

/** Every way resolution can end. Exhaustive and mutually exclusive. */
export const TENANT_CONTEXT_STATES = Object.freeze([
  "UNAUTHENTICATED",
  "NO_ACTIVE_ORGANIZATION",
  "SINGLE_ACTIVE_ORGANIZATION",
  "MULTIPLE_ACTIVE_ORGANIZATIONS",
  "MEMBERSHIP_UNAVAILABLE",
] as const);

export type TenantContextState = (typeof TENANT_CONTEXT_STATES)[number];

/**
 * The ONLY membership status that grants tenant context.
 *
 * An allow-list, not a deny-list. `MemberStatus` is `ACTIVE | INVITED |
 * SUSPENDED` today; a status added later is refused until someone decides it
 * should not be. Phase 90 fixed exactly this defect in `requireOrgActor`, where
 * a deny-list rejecting only "SUSPENDED" granted full access to every other
 * value. INVITED is excluded deliberately — an invitation is not a membership.
 *
 * Compared with `===` against the exact string. No trimming, no case folding:
 * `" ACTIVE"` and `"active"` are not this value, and a resolver that quietly
 * repaired them would be deciding that a row it does not understand is safe.
 */
export const ACTIVE_MEMBERSHIP_STATUS = "ACTIVE" as const;

/**
 * Every `OrgRole` the schema declares, as a closed allow-list.
 *
 * `OrganizationMember.role` becomes `organizationRole` on a trusted, immutable
 * result, and a future consumer may authorize on it. An arbitrary string must
 * therefore never reach it: a row carrying `role: "SUPERUSER"` is a row this
 * resolver does not understand, not a member with an interesting title.
 *
 * Pinned as literals rather than imported from the generated Prisma client on
 * purpose. `@prisma/client` is a RUNTIME module — importing it here to read an
 * enum would put the client in this module's import graph for a type-level
 * fact, and `src/lib/db/prisma.ts` exists precisely so that nothing imports it
 * statically. The cost of pinning is that the list can drift from the schema,
 * so `tenant-context-static.test.ts` parses `prisma/schema.prisma` and fails if
 * the two disagree in either direction.
 */
export const ORGANIZATION_ROLES = Object.freeze([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ENGINEER",
  "VIEWER",
  "BILLING_ADMIN",
  "MEMBER",
  "HR_MANAGER",
  "RECRUITER",
  "HIRING_MANAGER",
  "INTERVIEWER",
  "ACADEMY_ADMIN",
  "CUSTOMER_SUCCESS_MANAGER",
  "STUDENT",
  "COMPLIANCE_MANAGER",
] as const);

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/**
 * Every `MemberStatus` the schema declares.
 *
 * The distinction this list draws is deliberate and is NOT a deny-list:
 *
 *   ACTIVE                     grants tenant context
 *   a KNOWN non-ACTIVE value   a valid row that grants nothing
 *                              (NO_ACTIVE_ORGANIZATION)
 *   anything else              a row this resolver does not understand
 *                              (MEMBERSHIP_RESULT_MALFORMED)
 *
 * So a status added to the schema tomorrow cannot become access by default —
 * it is refused as unrecognised until someone adds it here, and the schema
 * exhaustiveness gate fails until they do. `"active"` and `" ACTIVE"` are not
 * members of this list and are refused for the same reason.
 */
export const MEMBER_STATUSES = Object.freeze(["ACTIVE", "INVITED", "SUSPENDED"] as const);

export type MemberStatusValue = (typeof MEMBER_STATUSES)[number];

/**
 * Upper bound on a trusted identifier or slug.
 *
 * MEASURED, and honestly an application convention rather than a schema
 * constraint: `User.id`, `Organization.id` and `Organization.slug` are declared
 * `String` with no `@db.VarChar`, so PostgreSQL imposes no length here. A cuid
 * is 25 characters and `slugify()` caps at 48 before a base-36 timestamp
 * suffix. 191 is this repository's `@db.VarChar` convention elsewhere and is
 * used as a sanity ceiling — it is not a claim that the column is bounded.
 */
export const TRUSTED_VALUE_MAX_LENGTH = 191;

/**
 * Fields `Organization` does NOT have today, and which therefore cannot be
 * checked.
 *
 * `Organization` in `prisma/schema.prisma` has no `status`, `deletedAt` or
 * `isActive` column, so "this organization is disabled" is not representable.
 * The resolver enforces the strongest check available without a migration —
 * the organization row must exist and load — and does not pretend to more.
 *
 * This constant exists so that a future migration adding any of these fields
 * makes a test fail rather than passing silently: a soft-disable column that
 * nothing reads would be worse than no column at all, because operators would
 * believe disabling an organization revokes access when it would not.
 * `tenant-context-static.test.ts` reads the schema and asserts none of these
 * exist; when one is added, that gate fails and forces a deliberate decision
 * here.
 */
export const UNREPRESENTABLE_ORGANIZATION_LIFECYCLE_FIELDS = Object.freeze([
  "status",
  "deletedAt",
  "isActive",
] as const);

/**
 * One proven membership. Produced only by the resolver, never by a caller, and
 * never from anything the client sent. Every field is a string copied
 * explicitly after validation — no object from a port is ever re-exposed.
 */
export interface ProvenMembership {
  readonly organizationId: string;
  /** The organization's own row, proven to exist at resolution time. */
  readonly organizationSlug: string;
  /**
   * The caller's role in this organization. Not the platform `Role`.
   *
   * Typed as a member of `ORGANIZATION_ROLES`, not `string`, so a consumer that
   * later authorizes on it is compared against a closed set at compile time.
   */
  readonly organizationRole: OrganizationRole;
}

/**
 * A resolved tenant context.
 *
 * `organizationId` exists on this shape ALONE. There is no path through the
 * union that yields an id without a proven ACTIVE membership behind it.
 */
export interface TenantContext {
  readonly state: "SINGLE_ACTIVE_ORGANIZATION";
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationRole: OrganizationRole;
}

/**
 * Why resolution produced no context.
 *
 * `candidates` on MULTIPLE_ACTIVE_ORGANIZATIONS lists the organizations the
 * caller has PROVEN ACTIVE membership in, so a future selector can render a
 * choice without a second, differently-scoped query. It is an enumeration of
 * the caller's own memberships to the caller themselves — the same
 * post-authentication disclosure `context-result.ts` already reasons about —
 * and it is never a permission to act in any of them.
 */
export type TenantContextRefusal =
  | { readonly state: "UNAUTHENTICATED" }
  | { readonly state: "NO_ACTIVE_ORGANIZATION"; readonly userId: string }
  | {
      readonly state: "MULTIPLE_ACTIVE_ORGANIZATIONS";
      readonly userId: string;
      readonly candidates: readonly ProvenMembership[];
    }
  | {
      readonly state: "MEMBERSHIP_UNAVAILABLE";
      /**
       * Present only when identity was established BEFORE the failure. Absent
       * when the failure prevented even that, so a reader cannot mistake
       * "we know who you are and the store is down" for "the store is down and
       * we are guessing who you are".
       */
      readonly userId?: string;
      /** Machine reason for operators. Never a driver message or a DSN. */
      readonly diagnostic: TenantDiagnostic;
    };

export type TenantContextResult = TenantContext | TenantContextRefusal;

/**
 * Operator-facing reasons for MEMBERSHIP_UNAVAILABLE.
 *
 * Deliberately coarse and closed. Nothing here is rendered to an end user and
 * nothing here carries a driver string, a connection target or a query — the
 * `logInfraFailure` path already records the error class safely, and Phase 89
 * established that raw database text must never reach a response body.
 *
 * The distinctions are kept because they demand different operator responses:
 * an identity outage points at the session store, a malformed adapter result
 * points at code, and a duplicate membership points at data.
 */
export const TENANT_DIAGNOSTICS = Object.freeze([
  /** The identity port threw. The session store could not answer. */
  "IDENTITY_UNAVAILABLE",
  /** The identity port returned something that is not a usable user id. */
  "IDENTITY_RESULT_MALFORMED",
  /** `getPrisma()` returned null while the app is in database mode. */
  "DATABASE_UNAVAILABLE",
  /** Database mode is off, so there is no organization store to ask. */
  "ORGANIZATION_STORE_DISABLED",
  /** The membership query threw. An outage, never an answer about the caller. */
  "MEMBERSHIP_QUERY_FAILED",
  /**
   * The membership port returned a shape this resolver will not trust: not an
   * array, or a row missing a field, or a field of the wrong type. Refused
   * rather than coerced — `String(undefined)` is `"undefined"`, which is a
   * perfectly good-looking organization id and belongs to nobody.
   */
  "MEMBERSHIP_RESULT_MALFORMED",
  /**
   * Two ACTIVE membership rows named the same organization.
   *
   * `OrganizationMember` carries `@@unique([organizationId, userId])`, so this
   * cannot happen through the schema. Reaching it means the adapter is broken
   * or the rows did not come from that table. Counting them would decide
   * "multiple organizations" from one organization, or narrow two rows to one
   * context — both are wrong, so neither is guessed.
   */
  "DUPLICATE_MEMBERSHIP_ROWS",
  /** The organization lookup for a proven membership threw. */
  "ORGANIZATION_QUERY_FAILED",
  /** The organization port returned a row missing `id` or `slug`. */
  "ORGANIZATION_RESULT_MALFORMED",
  /**
   * A membership row references an organization that could not be loaded, or
   * loaded one whose id does not match the row.
   *
   * `OrganizationMember.organizationId` is a foreign key with `onDelete:
   * Cascade`, so the first case should be unreachable. It is still refused
   * rather than ignored: silently dropping the row would turn a broken
   * invariant into a quieter, wronger answer — "you have no organization" —
   * about someone who demonstrably has a membership row.
   */
  "ORGANIZATION_NOT_RESOLVABLE",
] as const);

export type TenantDiagnostic = (typeof TENANT_DIAGNOSTICS)[number];

/** Narrowing helper. The only sanctioned way to reach an `organizationId`. */
export function hasTenantContext(r: TenantContextResult): r is TenantContext {
  return r.state === "SINGLE_ACTIVE_ORGANIZATION";
}
