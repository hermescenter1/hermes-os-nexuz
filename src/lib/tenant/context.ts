/**
 * PHASE 110-A1.0 — server-only tenant context resolution.
 *
 * The single place that answers "which organization is this caller acting in?"
 * See `contract.ts` for why the answer is a discriminated union rather than a
 * nullable id, and for which existing helpers were reviewed and why this is not
 * a duplicate of them.
 *
 * SHAPE: PURE CORE, THIN ADAPTERS
 * ------------------------------
 * `resolveTenantContext` performs no lookup of its own. It receives an
 * identity and two readers through `TenantContextPorts` and decides. This is
 * the same shape as `checkGatewayEnvelope` (src/lib/ot-edge/gateway-envelope.ts),
 * which is pure for the same reason: a security decision that depends on
 * module-level singletons can only be tested by mocking those singletons, and a
 * test that mocks the thing it asserts on proves nothing. Here every branch —
 * every outage, every malformed input, the multi-membership refusal — is
 * reachable from an ordinary function call with no module registry involved.
 *
 * A PORT IS AN UNTRUSTED SOURCE
 * -----------------------------
 * The ports are injected, so their return value is exactly as untrusted as a
 * database row: a broken adapter, a future Prisma `select` that drops a column,
 * or a test double can all hand this function a shape it did not expect. Every
 * value is therefore VALIDATED and then COPIED field by field before it can
 * reach a result. Nothing a port returned is ever re-exposed by reference, and
 * nothing is coerced — `String(undefined)` is `"undefined"`, which is a
 * perfectly good-looking organization id belonging to nobody.
 *
 * WHAT THE PROJECTION GUARANTEE IS, EXACTLY
 * -----------------------------------------
 * An earlier revision of this file claimed that foreign code NEVER runs during
 * projection. That was false and is corrected here, because the difference
 * matters to anyone reasoning about this boundary:
 *
 *   - required values are never obtained through ordinary property access;
 *   - a getter or setter on a required field is DETECTED from its descriptor
 *     and is not invoked;
 *   - but `Object.getPrototypeOf` and `Object.getOwnPropertyDescriptor` are
 *     themselves meta-operations, and on a Proxy they RUN that Proxy's
 *     `getPrototypeOf` and `getOwnPropertyDescriptor` traps. Measured counts on
 *     an accepted membership row: getPrototypeOf 1, getOwnPropertyDescriptor 3
 *     (one per required field); on an organization row, 1 and 2;
 *   - exceptions from those operations are caught and classified into the
 *     union, and the refused value never reaches a result;
 *   - arbitrary Proxy SIDE EFFECTS cannot be prevented in standard JavaScript
 *     merely by catching their exceptions. A trap that mutates global state or
 *     starts work is not stopped by this module, and nothing here claims
 *     otherwise. Detecting a Proxy at all would need `node:util`, which an
 *     edge-safe module must not import.
 *
 * So: "ordinary object" is a statement about a prototype, NOT proof that a
 * value is not a Proxy.
 *
 * WHAT THIS MODULE WILL NOT DO
 * ----------------------------
 *  - It never reads an organization id, site id or role from a request body,
 *    query string, path, header or cookie. A client-supplied organization is a
 *    CANDIDATE and reaches `resolveTenantContextForCandidate`, which proves
 *    ACTIVE membership server-side before it is honoured.
 *  - It never selects among several memberships. No `findFirst`, no ordering,
 *    no "first", no "most recent", no database order.
 *  - It never invents an organization: no personal, default, global or fallback
 *    tenant exists in this file.
 *  - It never caches. A membership can be suspended between two requests, and a
 *    cache keyed on anything less than the membership's own revision would keep
 *    serving tenant context to a caller whose access was withdrawn. If caching
 *    is ever needed it belongs behind a key that includes the session and a
 *    membership revision — not here, and not in this slice.
 *  - It does not grant anything. Role and capability authorization stay exactly
 *    where they are; this answers WHICH TENANT, never WHETHER ALLOWED.
 */

import { assertServerOnly } from "@/lib/industrial-knowledge/runtime/server-boundary";
import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getUserIdFromRequest } from "@/lib/org/context";
import { getCurrentUser } from "@/lib/auth/session";
import { logAuthzDenial, logInfraFailure } from "@/lib/logger/security-events";
import {
  ACTIVE_MEMBERSHIP_STATUS,
  MEMBER_STATUSES,
  ORGANIZATION_ROLES,
  TRUSTED_VALUE_MAX_LENGTH,
  type MemberStatusValue,
  type OrganizationRole,
  type ProvenMembership,
  type TenantContextResult,
  type TenantDiagnostic,
} from "./contract";
import type { NextRequest } from "next/server";

assertServerOnly("src/lib/tenant/context.ts");

/* ── Ports ───────────────────────────────────────────────────────────────── */

/**
 * A membership row as this module needs it.
 *
 * Typed for an honest adapter's convenience only. The core validates the same
 * fields at runtime regardless, because a TypeScript interface constrains the
 * code that compiles against it — not the value that arrives.
 */
export interface MembershipRow {
  organizationId: string;
  role: OrganizationRole;
  status: MemberStatusValue;
}

/** An organization row as this module needs it. */
export interface OrganizationRow {
  id: string;
  slug: string;
}

/**
 * Everything the decision depends on, injected.
 *
 * `listMemberships` returns EVERY membership row for the user — not the active
 * ones, and not one of them. Filtering happens here so the allow-list is
 * applied in the same place the decision is made and cannot be forgotten by a
 * caller, and so a suspended-only user is distinguishable from a user with no
 * rows at all in the logs.
 *
 * A port throwing means the question could not be asked. That is an outage and
 * is answered as one; it is never flattened into "you have no organization".
 */
export interface TenantContextPorts {
  /** `null` when there is no usable session. */
  identity: () => Promise<string | null>;
  /** `null` when the organization store is unreachable or disabled. */
  listMemberships: (userId: string) => Promise<readonly MembershipRow[] | null>;
  /** `null` when the organization row does not exist. */
  loadOrganization: (organizationId: string) => Promise<OrganizationRow | null>;
}

/* ── Validation ──────────────────────────────────────────────────────────── */

/*
 * TRUSTED-VALUE VALIDATION
 * ------------------------
 * R2 finding: the previous predicate checked only `typeof` and `length`, while
 * the comment beside it claimed a "usable non-empty identifier". Those are not
 * the same statement, and the gap was real — `" "`, `"\t"`, `" user-1"` and a
 * string carrying a bidi override all satisfied it and became trusted,
 * immutable output. `organizationRole` was worse: any string at all reached it,
 * and a future consumer may authorize on that field.
 *
 * Every predicate below REFUSES. None of them repairs. There is no trim, no
 * normalize, no case folding and no coercion anywhere in this file, so an
 * accepted value is returned byte-for-byte as it arrived — the static gate
 * enforces that by forbidding `String(`, `.trim()`, `.toLowerCase(` and
 * `.toUpperCase(`.
 *
 * Character classes are tested by CODE POINT in a loop rather than by a regular
 * expression, following `hasControlOrSpace` in `src/lib/auth/safe-return-path.ts`
 * and `hasUnsafeSlugChar` in `src/lib/articles/slug.ts`. That file states the
 * reason and it applies here too: a check written as escape sequences can be
 * altered by how the source is encoded or rewritten by tooling, and a silently
 * weakened character class is exactly the defect this correction is closing.
 *
 * WHY NOT REUSE AN EXISTING HELPER
 *   `isSafeRequestId` (logger/correlation.ts) is `^[A-Za-z0-9_-]{8,128}$` — a
 *   different alphabet and an 8-character floor that rejects short seed ids.
 *   `normalizeArticleSlug` (articles/slug.ts) TRIMS, percent-decodes and NFC
 *   normalizes; repairing input is precisely what this boundary must not do.
 *   `safeReturnPath` is about URL paths. None is semantically exact, so a small
 *   private pair lives here with its own tests.
 */

/** Whitespace, by code point. Listed explicitly so no escape sequence is trusted. */
function isWhitespaceCodePoint(cp: number): boolean {
  return (
    cp === 0x20 || // SPACE
    (cp >= 0x09 && cp <= 0x0d) || // TAB LF VT FF CR
    cp === 0x85 || // NEL
    cp === 0xa0 || // NBSP
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x2028 || // LINE SEPARATOR
    cp === 0x2029 || // PARAGRAPH SEPARATOR
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000 ||
    cp === 0xfeff // ZERO WIDTH NO-BREAK SPACE / BOM
  );
}

/**
 * Code points that must never appear in a trusted value.
 *
 * C0, DEL and C1 because they are not text. The bidi controls because they
 * reorder how a value RENDERS without changing what it compares as: an
 * organization slug carrying U+202E displays reversed in an operator console
 * and in an audit trail, so two different tenants can be made to look
 * identical to the person reading the evidence.
 *
 * Deliberately NOT rejected: everything else non-ASCII. `Organization.slug` is
 * an unconstrained `String` and the article-slug path already stores Persian
 * text, so banning non-ASCII would deny legitimate tenants.
 */
function hasForbiddenCodePoint(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) as number;
    if (cp <= 0x1f) return true; // C0 controls, including NUL
    if (cp === 0x7f) return true; // DEL
    if (cp >= 0x80 && cp <= 0x9f) return true; // C1 controls
    if (cp === 0x061c) return true; // ARABIC LETTER MARK
    if (cp === 0x200e || cp === 0x200f) return true; // LRM, RLM
    if (cp >= 0x202a && cp <= 0x202e) return true; // LRE LRO RLE RLO PDF
    if (cp >= 0x2066 && cp <= 0x2069) return true; // LRI RLI FSI PDI
  }
  return false;
}

/** True when the first or last code point is whitespace. Never trimmed. */
function isPadded(value: string): boolean {
  const chars = [...value];
  const first = chars[0]?.codePointAt(0);
  const last = chars[chars.length - 1]?.codePointAt(0);
  return (
    (first !== undefined && isWhitespaceCodePoint(first)) ||
    (last !== undefined && isWhitespaceCodePoint(last))
  );
}

/**
 * A usable identifier: `User.id`, `Organization.id`, or a candidate selector.
 *
 * These are cuids in production (`@default(cuid())`) and short literals in
 * seeds and tests. No legitimate value of either kind contains whitespace, so
 * whitespace ANYWHERE is refused — not only at the edges. That is stricter than
 * the slug rule below, and deliberately so: an id is compared for equality and
 * used as a query key, never displayed as prose.
 */
function isUsableId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length === 0 || v.length > TRUSTED_VALUE_MAX_LENGTH) return false;
  if (hasForbiddenCodePoint(v)) return false;
  for (const ch of v) {
    if (isWhitespaceCodePoint(ch.codePointAt(0) as number)) return false;
  }
  return true;
}

/**
 * A usable `Organization.slug`.
 *
 * MEASURED DECISION, and the reason this is not the stricter grammar:
 * `slugify()` in both `src/lib/org/organizations.ts` and
 * `src/app/api/billing/organizations/route.ts` produces `[a-z0-9-]` capped at
 * 48 plus a base-36 suffix — but `organizations.ts:91` is
 * `input.slug ? input.slug.trim() : slugify(name)`, so a CALLER-SUPPLIED slug
 * is stored without ever passing through `slugify`. A stored slug can
 * therefore be arbitrary text, and enforcing `[a-z0-9-]` when READING would
 * lock a legitimately-created tenant out of the product.
 *
 * So the rule is the hostile-character floor, not the creation grammar:
 * non-empty, bounded, no control or bidi code point, and not padded. Internal
 * whitespace IS allowed, because "Acme Corp" is a slug that creation path can
 * legitimately have written. A parity test proves every `slugify()` output is
 * accepted by this predicate.
 */
function isUsableSlug(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length === 0 || v.length > TRUSTED_VALUE_MAX_LENGTH) return false;
  if (hasForbiddenCodePoint(v)) return false;
  if (isPadded(v)) return false;
  // A value made only of whitespace is padded at both ends, so `isPadded`
  // already refused it; this states the property the tests assert.
  return true;
}

/** Exact membership in the schema's `OrgRole`. No coercion, no case folding. */
function isOrganizationRole(v: unknown): v is OrganizationRole {
  return typeof v === "string" && (ORGANIZATION_ROLES as readonly string[]).includes(v);
}

/** Exact membership in the schema's `MemberStatus`. */
function isKnownMemberStatus(v: unknown): v is MemberStatusValue {
  return typeof v === "string" && (MEMBER_STATUSES as readonly string[]).includes(v);
}

/*
 * READING A FIELD WITHOUT INVOKING ITS ACCESSOR
 * ----------------------------------------------------
 * R3 finding: the previous guard was named `isPlainRecord` but proved only
 * `typeof v === "object" && v !== null && !Array.isArray(v)`, and the fields
 * were then read by destructuring. Destructuring INVOKES getters and Proxy
 * traps, so a hostile row did not have to pass validation to have an effect —
 * it only had to be looked at. Measured against the pre-R3 source:
 *
 *   membership row, throwing getter on organizationId/role/status  -> THREW
 *   organization row, throwing getter on id/slug                   -> THREW
 *   membership row, Proxy `get` trap                               -> THREW
 *
 * A throw is not a member of `TenantContextResult`. Those six cases escaped the
 * closed union entirely, and the rejection carried the getter's own message —
 * which in the probe contained a connection string, exactly the leak Phase 89
 * established must never reach a caller.
 *
 * The same measurement found four shapes SILENTLY ACCEPTED that should not be:
 *
 *   fields inherited from a prototype, with no own properties      -> ACCEPTED
 *   a class instance                                               -> ACCEPTED
 *   a Proxy whose ownKeys / getOwnPropertyDescriptor / getPrototypeOf
 *     traps throw (but whose `get` returns valid values)           -> ACCEPTED
 *
 * So the correction is not only "do not throw". It is: an accepted row must be
 * an ORDINARY OBJECT whose required fields are OWN DATA properties. Accessors
 * are not read, they are refused — a value this module can only obtain by
 * invoking an accessor is a value it does not trust.
 *
 * FOUR DIFFERENT THINGS, KEPT APART. Conflating them is how the overstated
 * claim in R3 happened:
 *
 *   field accessor        a `get`/`set` on a required field. DETECTED from its
 *                         descriptor and NEVER invoked.
 *   Proxy meta-trap       `getPrototypeOf` and `getOwnPropertyDescriptor` ARE
 *                         invoked, and on a Proxy they run its code. Measured:
 *                         1 and 3 per accepted membership row.
 *   iteration             walking the row container can run an array Proxy's
 *                         traps; guarded, and a throw is classified.
 *   promise assimilation  `await` reads `.then` on whatever a port resolves
 *                         with, BEFORE this module sees it. That is why a
 *                         get-trapping organization value is attributed to the
 *                         loader rather than to projection.
 *
 * This module is not a JavaScript sandbox. It does not stop a trap that loops
 * forever, and it does not undo side effects a trap has already had.
 */

/**
 * The prototype test, guarded.
 *
 * `Object.getPrototypeOf` invokes a Proxy's `getPrototypeOf` trap, which can
 * throw; a throw here means the object would not answer a question every
 * ordinary object answers, which is itself disqualifying.
 *
 * `Object.prototype` and `null` are accepted. A class instance, a `Date`, a
 * `Map` and a `Set` are not: Prisma's `select` projections are ordinary object
 * literals (the repository's own adapters read them as plain records — see
 * `src/lib/ot-edge/persistence/prisma-adapters.ts`), so requiring an ordinary
 * object costs nothing real and refuses every exotic shape by construction.
 */
function isOrdinaryObject(v: unknown): v is object {
  if (typeof v !== "object" || v === null) return false;
  try {
    // R4: `Array.isArray` is a META-OPERATION, not a type test. On a REVOKED
    // Proxy it throws — measured on Node v24.18.0:
    //   Array.isArray(revoked) -> TypeError: Cannot perform 'IsArray' on a
    //                             proxy that has been revoked
    // and `typeof revoked` is "object" and it is not null, so a revoked value
    // reaches this line. It was previously evaluated OUTSIDE the try, which
    // made this predicate's total-ness depend on whichever caller happened to
    // wrap it. It no longer does: everything that can throw is inside.
    if (Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  } catch {
    return false;
  }
}

/**
 * Is this the membership CONTAINER we were promised — an array?
 *
 * Separate from `isOrdinaryObject` because the container and its rows fail for
 * different reasons and carry the same diagnostic for different causes, and
 * because `Array.isArray` needs the same guard here: a revoked Proxy standing
 * in for the container throws rather than answering.
 */
function isArraySafe(v: unknown): v is readonly unknown[] {
  try {
    return Array.isArray(v);
  } catch {
    return false;
  }
}

/** The outcome of trying to read one field without invoking an accessor. */
type FieldRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

const FIELD_UNREADABLE: FieldRead = { ok: false };

/**
 * Read one OWN DATA property, or refuse.
 *
 * `Object.getOwnPropertyDescriptor` does not invoke a getter — it returns the
 * descriptor describing one — so an accessor is DETECTED rather than executed.
 * The lookup itself can still throw through a Proxy's
 * `getOwnPropertyDescriptor` trap, which is caught here.
 *
 * Refused, each for its own reason:
 *   - no descriptor        the field is absent, or inherited from a prototype
 *                          rather than owned by the row
 *   - `get` or `set`       an accessor; reading it would invoke that accessor
 *   - a thrown lookup      the object will not describe itself
 */
function readOwnDataProperty(target: object, key: string): FieldRead {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, key);
  } catch {
    return FIELD_UNREADABLE;
  }
  if (descriptor === undefined) return FIELD_UNREADABLE;
  if (typeof descriptor.get === "function" || typeof descriptor.set === "function") {
    return FIELD_UNREADABLE;
  }
  if (!("value" in descriptor)) return FIELD_UNREADABLE;
  return { ok: true, value: descriptor.value };
}

/**
 * Validate and COPY one membership row.
 *
 * Returns `null` for anything not understood. The copy is explicit and narrow:
 * exactly three fields, all proven strings. A generic clone of an unknown shape
 * would carry whatever else the port attached — including getters that run
 * later, and objects the caller still holds a reference to.
 */
function projectMembership(v: unknown): MembershipRow | null {
  if (!isOrdinaryObject(v)) return null;

  const idField = readOwnDataProperty(v, "organizationId");
  const roleField = readOwnDataProperty(v, "role");
  const statusField = readOwnDataProperty(v, "status");
  if (!idField.ok || !roleField.ok || !statusField.ok) return null;

  const organizationId = idField.value;
  const role = roleField.value;
  const status = statusField.value;

  if (!isUsableId(organizationId)) return null;
  // `role` reaches trusted output and a consumer may authorize on it, so it is
  // checked against the schema's closed enum rather than accepted as a string.
  if (!isOrganizationRole(role)) return null;
  // An UNRECOGNISED status is a row this resolver does not understand — not a
  // member whose access is merely inactive. Refusing it here is what stops a
  // status added to the schema later from becoming access by default.
  if (!isKnownMemberStatus(status)) return null;

  // Each field was read exactly once, from a descriptor, and is a proven
  // primitive by this point — so this object shares nothing with the input.
  return { organizationId, role, status };
}

/** Validate and copy an organization row. Same trust rules as a membership. */
function projectOrganization(v: unknown): OrganizationRow | null {
  if (!isOrdinaryObject(v)) return null;

  const idField = readOwnDataProperty(v, "id");
  const slugField = readOwnDataProperty(v, "slug");
  if (!idField.ok || !slugField.ok) return null;

  const id = idField.value;
  const slug = slugField.value;

  if (!isUsableId(id)) return null;
  if (!isUsableSlug(slug)) return null;

  return { id, slug };
}

/* ── Recording boundary ──────────────────────────────────────────────────── */

/*
 * WHY OBSERVABILITY GETS ITS OWN BOUNDARY
 * ---------------------------------------
 * R5 finding (F1): every `catch` here handed the RAW thrown value straight to
 * `logInfraFailure`, which reads `error.constructor.name` and
 * `error.message.slice(0, 300)`. Neither read is safe on an untrusted value,
 * and the call itself was not guarded. Measured against the R4 source with the
 * REAL logger — 18 of 18 combinations (3 hostile values x 3 ports x 2 public
 * entry points) left the closed union as a REJECTED PROMISE:
 *
 *   Error whose `message` getter throws  -> the getter's own text escaped
 *   Error whose `message` is null        -> TypeError from `.slice`
 *   revoked Proxy as the rejection       -> TypeError from `instanceof`
 *
 * The resolver had spent four rounds refusing to read untrusted fields, and
 * then read the most untrusted value of all — the thrown one — on the way to
 * the log. Reporting a failure must not be able to cause one.
 *
 * The rule now: NOTHING derived from a caught value is inspected, coerced,
 * serialized or forwarded. Only the operation, the closed diagnostic token and
 * identifiers this module has already validated are recorded, and every
 * recording call is itself non-throwing — a broken log sink must not change a
 * tenant decision or reject the response.
 *
 * This does NOT remove observability: the normal path still emits the same
 * structured events, and the diagnostic already names what failed and where.
 * What is lost is the driver's message text, which was never load-bearing —
 * `logInfraFailure` documents it as "authored by us or the driver", and an
 * attacker-authored one is exactly the case this closes.
 */

/**
 * Record an infrastructure failure WITHOUT touching the value that caused it.
 *
 * The logger's contract wants an `Error`, so it is given a fresh local one
 * whose message is the closed diagnostic token. `errorClass` becomes "Error"
 * and `errorMessage` the token — structured, bounded, and impossible for a
 * caller to influence.
 */
function recordInfraFailure(operation: string, diagnostic: TenantDiagnostic): void {
  try {
    logInfraFailure("database", operation, new Error(diagnostic));
  } catch {
    // A failing sink is not a tenant decision. Deliberately silent: any
    // reporting here would be another call into the same failing subsystem.
  }
}

/** Record an authorization denial. Every field is already validated by us. */
function recordDenial(ctx: {
  operation: string;
  reason: string;
  userId?: string;
  orgId?: string;
  resourceId?: string;
  resourceType?: string;
}): void {
  try {
    logAuthzDenial(ctx);
  } catch {
    // As above — observability must never decide, and never throw.
  }
}

/* ── Core decision ───────────────────────────────────────────────────────── */

/** Every refusal is built here, so no branch can forget to freeze its result. */
function unavailable(diagnostic: TenantDiagnostic, userId?: string): TenantContextResult {
  return Object.freeze(
    userId === undefined
      ? { state: "MEMBERSHIP_UNAVAILABLE" as const, diagnostic }
      : { state: "MEMBERSHIP_UNAVAILABLE" as const, userId, diagnostic },
  );
}

/**
 * Resolve the caller's tenant context.
 *
 * Ordered so that each outcome is decided where it is discovered, and so no
 * later step can reinterpret an earlier one. `resolveOrgContext` documents the
 * bug that motivates this ordering: asking a collapsing helper first and then
 * re-deriving the reason turned a thrown query into "this account has no
 * organization" and answered 409 during a database fault.
 */
export async function resolveTenantContext(
  ports: TenantContextPorts,
): Promise<TenantContextResult> {
  // 1. Identity. Absent, malformed, unverifiable and revoked are ONE answer.
  //    Keeping them apart here would let an unauthenticated caller distinguish
  //    "no such session" from "session revoked", which is the enumeration
  //    property `context-result.ts` deliberately preserves.
  //
  //    A THROWN identity port is a different thing entirely and keeps its own
  //    diagnostic: the session store failing is an outage, and telling a
  //    signed-in operator to sign in again during one is the mistake this
  //    module exists to stop making.
  let rawUserId: unknown;
  try {
    rawUserId = await ports.identity();
  } catch {
    recordInfraFailure("tenant.identity", "IDENTITY_UNAVAILABLE");
    return unavailable("IDENTITY_UNAVAILABLE");
  }
  if (rawUserId === null || rawUserId === undefined) {
    return Object.freeze({ state: "UNAUTHENTICATED" as const });
  }
  if (!isUsableId(rawUserId)) {
    // Not "unauthenticated": something DID come back, and it is not a user id.
    // Answering anonymous here would hide a broken identity path.
    recordDenial({ operation: "tenant.context", reason: "identity_result_malformed" });
    return unavailable("IDENTITY_RESULT_MALFORMED");
  }
  const userId: string = rawUserId;

  // 2. The store. A missing client is an outage in database mode; in session
  //    mode there is no organization store at all, by design — and that is
  //    still not "you have no organization", because the question was never
  //    asked of anything.
  let rawRows: unknown;
  try {
    rawRows = await ports.listMemberships(userId);
  } catch {
    recordInfraFailure("tenant.memberships", "MEMBERSHIP_QUERY_FAILED");
    return unavailable("MEMBERSHIP_QUERY_FAILED", userId);
  }
  if (rawRows === null || rawRows === undefined) {
    return unavailable(
      getStorageMode() === "database" ? "DATABASE_UNAVAILABLE" : "ORGANIZATION_STORE_DISABLED",
      userId,
    );
  }
  // R4: guarded, because `Array.isArray` throws on a revoked Proxy rather than
  // answering false.
  //
  // ATTRIBUTION, STATED ACCURATELY: an already-revoked container does NOT reach
  // this line through the public path — `await` throws first while reading
  // `.then`, and even before R5 the surrounding catch classified it. The R4
  // report called that a definite escape; it was not, and the claim is
  // withdrawn. This guard is defence in depth, so the predicate is total on its
  // own rather than by grace of its caller. The REACHABLE revocation is a proxy
  // that revokes itself mid-read, which lands in `readOwnDataProperty`.
  if (!isArraySafe(rawRows)) {
    recordDenial({ operation: "tenant.context", reason: "membership_result_not_array", userId });
    return unavailable("MEMBERSHIP_RESULT_MALFORMED", userId);
  }

  // 3. Validate every row before any of them is counted. A malformed row is
  //    refused for the whole request rather than skipped: skipping one would
  //    change the COUNT, and the count is the decision.
  //
  //    The WALK itself is guarded, not just each row. `Array.isArray` is true
  //    for a Proxy wrapping an array, and iterating one runs its traps — so the
  //    container is as untrusted as the rows inside it, and a container that
  //    cannot be walked is refused with the same diagnostic rather than
  //    escaping as a rejected promise.
  const rows: MembershipRow[] = [];
  let malformedRow = false;
  try {
    for (const raw of rawRows) {
      const row = projectMembership(raw);
      if (!row) {
        malformedRow = true;
        break;
      }
      rows.push(row);
    }
  } catch {
    // A throwing iterator/length trap. Deliberately NOT logged through
    // logInfraFailure: this is not an outage of ours, it is a value we refuse.
    malformedRow = true;
  }
  if (malformedRow) {
    recordDenial({ operation: "tenant.context", reason: "membership_row_malformed", userId });
    return unavailable("MEMBERSHIP_RESULT_MALFORMED", userId);
  }

  // 4. The allow-list. Only ACTIVE. A membership row that exists in any other
  //    state is not a weaker membership, it is not a membership.
  const active = rows.filter((r) => r.status === ACTIVE_MEMBERSHIP_STATUS);

  if (active.length === 0) {
    if (rows.length > 0) {
      // Worth distinguishing in the log stream: a user with only SUSPENDED or
      // INVITED rows is refused for a different operational reason than a user
      // with none, and onboarding is the wrong answer for the first.
      recordDenial({ operation: "tenant.context", reason: "no_active_membership", userId });
    }
    return Object.freeze({ state: "NO_ACTIVE_ORGANIZATION" as const, userId });
  }

  // 5. Two ACTIVE rows naming one organization cannot be counted either way.
  //    `@@unique([organizationId, userId])` makes this unreachable through the
  //    schema, so reaching it means the rows did not come from that table.
  //    Counting them would read one organization as "multiple", or narrow two
  //    rows to one context; neither is guessed.
  const distinct = new Set(active.map((r) => r.organizationId));
  if (distinct.size !== active.length) {
    recordDenial({ operation: "tenant.context", reason: "duplicate_membership_rows", userId });
    return unavailable("DUPLICATE_MEMBERSHIP_ROWS", userId);
  }

  // 6. Every ACTIVE membership must resolve to a real organization BEFORE the
  //    count is used to decide. Proving them first means a caller with one
  //    ACTIVE membership and one dangling row is never silently narrowed to a
  //    single context by the dangling row's disappearance.
  const proven: ProvenMembership[] = [];
  for (const row of active) {
    let rawOrg: unknown;
    try {
      rawOrg = await ports.loadOrganization(row.organizationId);
    } catch {
      recordInfraFailure("tenant.organization", "ORGANIZATION_QUERY_FAILED");
      return unavailable("ORGANIZATION_QUERY_FAILED", userId);
    }
    if (rawOrg === null || rawOrg === undefined) {
      recordDenial({
        operation: "tenant.context",
        reason: "organization_not_resolvable",
        userId,
        orgId: row.organizationId,
      });
      return unavailable("ORGANIZATION_NOT_RESOLVABLE", userId);
    }
    const org = projectOrganization(rawOrg);
    if (!org) {
      recordDenial({ operation: "tenant.context", reason: "organization_row_malformed", userId });
      return unavailable("ORGANIZATION_RESULT_MALFORMED", userId);
    }
    if (org.id !== row.organizationId) {
      // The loader answered about a different organization than it was asked
      // about. Trusting it would attach the caller to a tenant that no
      // membership row of theirs names.
      recordDenial({
        operation: "tenant.context",
        reason: "organization_id_mismatch",
        userId,
        orgId: row.organizationId,
      });
      return unavailable("ORGANIZATION_NOT_RESOLVABLE", userId);
    }
    proven.push(
      Object.freeze({
        organizationId: org.id,
        organizationSlug: org.slug,
        organizationRole: row.role,
      }),
    );
  }

  // 7. The count decides. There is no branch that picks one of several.
  if (proven.length > 1) {
    recordDenial({ operation: "tenant.context", reason: "multiple_active_memberships", userId });
    return Object.freeze({
      state: "MULTIPLE_ACTIVE_ORGANIZATIONS" as const,
      userId,
      candidates: Object.freeze(sortCandidates(proven)),
    });
  }

  const only = proven[0];
  return Object.freeze({
    state: "SINGLE_ACTIVE_ORGANIZATION" as const,
    userId,
    organizationId: only.organizationId,
    organizationSlug: only.organizationSlug,
    organizationRole: only.organizationRole,
  });
}

/**
 * Honour a client-supplied organization, or refuse.
 *
 * The candidate is a SELECTOR, never an authority. It can only ever narrow the
 * set of organizations the caller has already been proven to hold an ACTIVE
 * membership in, so a forged or substituted id cannot widen access: it either
 * matches one of the caller's own proven memberships or it selects nothing.
 *
 * Every other state is returned unchanged. In particular a caller with exactly
 * one active organization is answered from the resolver as usual — a candidate
 * naming a DIFFERENT organization does not override it, because overriding
 * would be the client choosing the tenant.
 */
export async function resolveTenantContextForCandidate(
  ports: TenantContextPorts,
  candidateOrganizationId: unknown,
): Promise<TenantContextResult> {
  const base = await resolveTenantContext(ports);
  if (base.state !== "MULTIPLE_ACTIVE_ORGANIZATIONS") return base;

  // Exact string, no coercion. A number, an array, or an object with a
  // `toString` that yields a real id must not become a selection: the client
  // would be choosing the tenant through a type-system loophole.
  if (!isUsableId(candidateOrganizationId)) return base;

  const match = base.candidates.find((c) => c.organizationId === candidateOrganizationId);
  if (!match) {
    recordDenial({
      operation: "tenant.context.select",
      reason: "candidate_not_a_proven_membership",
      userId: base.userId,
      resourceId: candidateOrganizationId,
      resourceType: "organization",
    });
    return base;
  }

  return Object.freeze({
    state: "SINGLE_ACTIVE_ORGANIZATION" as const,
    userId: base.userId,
    organizationId: match.organizationId,
    organizationSlug: match.organizationSlug,
    organizationRole: match.organizationRole,
  });
}

/* ── Adapters ────────────────────────────────────────────────────────────── */

/**
 * The production ports.
 *
 * `listMemberships` uses `findMany`. That is load-bearing, not stylistic:
 * `findFirst` cannot distinguish one membership from several, so a resolver
 * built on it can only ever return the arbitrary choice this module exists to
 * remove. The static gate in `__tests__/tenant-context-static.test.ts` fails if
 * `findFirst` reappears in this file.
 *
 * Rows are handed on WITHOUT coercion. An earlier revision wrapped each field
 * in `String(...)`, which would have turned a dropped column into the literal
 * `"undefined"` and passed it to the core as a usable id. The core's validator
 * is the single place that decides what a row must look like.
 */
function prismaPorts(identity: () => Promise<string | null>): TenantContextPorts {
  return {
    identity,
    listMemberships: async (userId) => {
      const db = await getPrisma();
      if (!db) return null;
      const model = (db as Record<string, unknown>).organizationMember as {
        findMany: (a: unknown) => Promise<unknown>;
      };
      const rows = await model.findMany({
        where: { userId },
        select: { organizationId: true, role: true, status: true },
      });
      return rows as readonly MembershipRow[] | null;
    },
    loadOrganization: async (organizationId) => {
      const db = await getPrisma();
      if (!db) return null;
      const model = (db as Record<string, unknown>).organization as {
        findUnique: (a: unknown) => Promise<unknown>;
      };
      const row = await model.findUnique({
        where: { id: organizationId },
        select: { id: true, slug: true },
      });
      return row as OrganizationRow | null;
    },
  };
}

/**
 * Route-handler entry point.
 *
 * Identity comes from `getUserIdFromRequest`, which verifies the access token's
 * signature AND checks `isPayloadSessionActive`, so a revoked session yields no
 * tenant context on THIS request rather than when the token eventually expires.
 * That revocation check is the reason this is used in preference to a bare
 * `verifyAccessToken`, which `resolveOrgContext` still relies on.
 */
export async function resolveTenantContextFromRequest(
  req: NextRequest,
): Promise<TenantContextResult> {
  return resolveTenantContext(prismaPorts(() => getUserIdFromRequest(req)));
}

/**
 * Server-component entry point.
 *
 * `getCurrentUser` reads the session cookie and enforces the same revocation
 * check. Server components have no `NextRequest`, which is why the two entry
 * points exist; the decision they reach is identical because both funnel into
 * `resolveTenantContext`.
 */
export async function resolveTenantContextFromServerSession(): Promise<TenantContextResult> {
  return resolveTenantContext(
    prismaPorts(async () => (await getCurrentUser())?.id ?? null),
  );
}

/* ── Internals ───────────────────────────────────────────────────────────── */

/**
 * A STABLE presentation order for the candidate list.
 *
 * Sorting here is not selection — nothing downstream may take `candidates[0]`
 * as "the" organization, and the union gives it no way to. The order exists so
 * that a future selector renders the same list twice in a row regardless of the
 * order PostgreSQL happened to return rows in, which is also what makes the
 * insertion-order test meaningful.
 */
function sortCandidates(list: ProvenMembership[]): ProvenMembership[] {
  return [...list].sort((a, b) => a.organizationId.localeCompare(b.organizationId));
}
