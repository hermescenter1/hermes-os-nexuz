/**
 * PHASE 110-A2.0 — the organization a data layer is allowed to read, and the
 * one way to ask for it.
 *
 * SERVER ONLY. It reads the request's cookies and hands them to the resolver
 * Phase 110-A1.0b already ships. It performs NO verification of its own: no
 * token is parsed here, no membership is queried here, no role is compared
 * here. Everything it knows comes from `resolveTenantDecisionFromSession`,
 * which derives identity from the session cookie with the same verification and
 * the same revocation check the platform routes use.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THAT RESOLVER ALREADY EXISTS
 * The two data layers this slice repairs are called from BOTH route handlers
 * and server components, and the two have different entry points — a
 * `NextRequest` in one, `cookies()` in the other. A layer function cannot take a
 * request it may not have. `cookies()` is available in both contexts, so this is
 * the single adapter that lets one data-layer function be correct in both.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - It never accepts an organization id from a caller. There is no parameter
 *     for one. An id in a URL, a body or a header cannot reach this function,
 *     which is the whole point: the tenant is derived, never asserted.
 *   - It grants nothing. A resolved organization means "this reader has a proven
 *     ACTIVE membership in it"; every route keeps its own permission check.
 *   - A platform or holding-level role does NOT widen it. `can(user.role, ...)`
 *     is a different axis and is not consulted here; an administrator sees the
 *     organization they are acting in, not all of them.
 *
 * FAIL-CLOSED, WITH THE REASON PRESERVED
 * Every path that cannot produce a proven organization throws, and the thrown
 * value carries a STABLE code from the repository's existing refusal
 * vocabulary. Nothing here returns `[]`, `null` or a zero, because a caller
 * cannot tell those apart from a genuinely empty account — which is the exact
 * defect this slice exists to remove.
 */

/*
 * There is deliberately no `import "server-only"` here.
 *
 * That package is not a dependency of this repository, and adding one is
 * outside this slice. The boundary is enforced the way Phase 110-A1.0b enforces
 * it for the selection cookie instead: this module imports `next/headers`,
 * which a client component cannot, so a `"use client"` module that reaches it
 * fails to build rather than shipping a server module to a browser.
 */

import { cookies } from "next/headers";

import { sanitizeDatabaseError } from "@/lib/api/auth";
import type { ContextRefusal } from "@/lib/auth/context-result";
import { REFUSAL_MESSAGE, REFUSAL_STATUS } from "@/lib/auth/context-result";
import { logInfraFailure } from "@/lib/logger/security-events";
import { resolveTenantDecisionFromSession } from "@/lib/tenant-selection/selection";

/**
 * The refusals a data layer can produce.
 *
 * A SUBSET of `ContextRefusal`, not a new vocabulary. Kept as the same union
 * members so a route that already maps `ContextRefusal` to a status needs no
 * second table.
 */
export type DataScopeRefusal =
  | Extract<
      ContextRefusal,
      | "AUTHENTICATION_REQUIRED"
      | "ORGANIZATION_CONTEXT_REQUIRED"
      | "ORGANIZATION_SELECTION_REQUIRED"
      | "ORGANIZATION_CONTEXT_UNAVAILABLE"
      | "INTERNAL_ERROR"
    >;

/**
 * A data-layer refusal, thrown rather than returned.
 *
 * Thrown on purpose. These functions previously returned `[]` on every failure,
 * and 43 call sites were written against that shape; a returned union would be
 * silently ignored by every one of them and the outage would still render as an
 * empty screen. A throw cannot be ignored by accident.
 *
 * The message is the FIXED English sentence the refusal vocabulary already
 * defines. It is never assembled from a driver error, so nothing a database
 * says can reach a response or a log through this object.
 */
/**
 * The brand every refusal carries. `Symbol.for` looks the symbol up in the
 * cross-realm registry, so two copies of this module agree on it.
 */
const DATA_SCOPE_ERROR = Symbol.for("hermes.dataScopeError");

export class DataScopeError extends Error {
  readonly code: DataScopeRefusal;
  readonly status: number;
  /**
   * A short opaque id, echoed to the caller and written to the log line.
   *
   * It carries no information about the failure — it is random per occurrence —
   * and exists so an operator can join a support report to a log entry without
   * the response having to describe what went wrong. Nothing about the driver,
   * the statement or the data travels with it.
   */
  readonly correlationId?: string;

  /**
   * A branded marker, so recognition never depends on class identity.
   *
   * PHASE 110-A2.1 — `instanceof` compares the CONSTRUCTOR, and two copies of
   * this module have two constructors. That is not hypothetical: the route
   * refusal test loads a handler through a fresh module registry, the refusal it
   * threw was not recognised, and `refusalResponse` rethrew a perfectly ordinary
   * refusal as an unmapped error. A bundler that gives a server component and a
   * route handler separate instances would do the same thing in production, and
   * the symptom would be a 500 in place of a 409.
   *
   * A symbol from the global registry is the same value in every instance.
   */
  readonly [DATA_SCOPE_ERROR] = true as const;

  constructor(code: DataScopeRefusal, correlationId?: string) {
    super(REFUSAL_MESSAGE[code]);
    this.name = "DataScopeError";
    this.code = code;
    this.status = REFUSAL_STATUS[code];
    this.correlationId = correlationId;
  }
}

/**
 * Recognise a refusal by its marker, and read it with the hostile-value reader.
 *
 * `safeRead` is used rather than a direct property access because this guard
 * runs inside catch blocks, where the value may be a Proxy whose traps throw.
 */
export const isDataScopeError = (e: unknown): e is DataScopeError =>
  safeRead(e, DATA_SCOPE_ERROR) === true;

/**
 * Read a property off a value that may be actively hostile.
 *
 * Anything can arrive in a `catch`: a string, a `Proxy` whose traps throw, an
 * object whose getter detonates on access. Reading `err.code` directly is a
 * property access, and a property access on such a value raises a SECOND
 * exception — inside the handler that exists to keep the first one from
 * escaping. The refusal path then becomes an unhandled error and the caller
 * gets a crash instead of the honest answer.
 *
 * This is not defensive decoration. `isPrismaCode` below runs on exactly that
 * path, and the A2.0 error-boundary suite drives a throwing getter and a
 * throwing Proxy through it.
 */
function safeRead(value: unknown, key: string | symbol): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return (value as Record<string | symbol, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Is this error the driver's "the predicate matched no row"?
 *
 * P2025. Read from `code`, never from the message: a message is authored by the
 * driver, may carry a table name or a value, and could change between versions.
 *
 * SCOPE OF THE CLAIM. This says the error object carries that code. It does NOT
 * say the code came from the statement the caller cares about — a P2025 raised
 * by some nested write inside the same transaction carries the same code, and
 * nothing in the error distinguishes them. Callers use it around ONE statement
 * whose only record-not-found outcome is the predicate they wrote, and the
 * comment at each call site says so.
 */
export function isPrismaCode(err: unknown, code: string): boolean {
  return safeRead(err, "code") === code;
}

/** The proven organization for this request. Never widened, never asserted. */
export interface TenantScope {
  readonly organizationId: string;
  readonly userId: string;
}

/**
 * Resolve the organization this request may read, or throw.
 *
 * The four refusals are kept apart because their remedies are opposite: sign
 * in, ask for membership, choose between the memberships you already have, or
 * retry because a dependency is down. Collapsing them is how "the database is
 * unreachable" becomes "you have no organization".
 */
export async function requireTenantScope(): Promise<TenantScope> {
  const jar = await cookies();
  const decision = await resolveTenantDecisionFromSession(jar);

  if (decision.granted) {
    return { organizationId: decision.organizationId, userId: decision.userId };
  }

  throw new DataScopeError(decision.code);
}

/**
 * The Prisma client, or a refusal — never a mock and never `null`.
 *
 * `getPrisma()` is the repository's ONE accessor: Prisma 7 with the
 * `@prisma/adapter-pg` driver adapter, constructed once and cached on
 * `globalThis`. It is used here rather than re-implemented, because the two
 * layers this slice repairs each built their own with a bare
 * `new PrismaClient()` — which under `driverAdapters` throws before it ever
 * connects, so both fell to their mock arrays in every environment including
 * production. That is the defect; a third constructor would be another one.
 *
 * A missing client is an OUTAGE, reported as one. It is not a reason to answer
 * from fabricated data, and it is not a reason to answer with an empty list.
 */
export async function requireDatabase(
  operation: string,
): Promise<Record<string, unknown>> {
  const { getPrisma } = await import("@/lib/db/prisma");
  const db = await getPrisma();
  if (!db) {
    // A named condition, not a driver error: there is nothing to sanitise here.
    const correlationId = newCorrelationId();
    logInfraFailure("database", `${operation}#${correlationId}`, new Error("PRISMA_CLIENT_UNAVAILABLE"));
    // No client at all IS an availability failure: 503, and a retry is meaningful.
    throw new DataScopeError("ORGANIZATION_CONTEXT_UNAVAILABLE", correlationId);
  }
  return db as Record<string, unknown>;
}

/**
 * Run a query, or turn its failure into an outage refusal.
 *
 * THE ERROR IS SANITISED BEFORE IT IS LOGGED, and the shared helper was read
 * before it was reused rather than trusted by its name.
 *
 * `logInfraFailure` records `error.message.slice(0, 300)` VERBATIM. Its own
 * comment argues that a driver message "does not carry the query payload",
 * which is an assumption about the driver rather than a guarantee — and this
 * repository's own logs contain the counter-example: a Prisma `P1001` message
 * carries the database host and port. Passing a raw driver error to it would
 * put infrastructure detail in the stream.
 *
 * So the error goes through `sanitizeDatabaseError` first. That builds its
 * message BY CONSTRUCTION from an allowlisted class name and a short code and
 * never reads `error.message` at all, so nothing the driver authored survives.
 * It is an existing, separately tested control — Phase 110-A1.0b recorded that
 * it had no production caller and flagged it for the logging owner. This is
 * that caller.
 *
 * What this must never do — and what the 112 catch blocks in these two layers
 * did — is substitute a value. There is no `[]` here.
 */
export async function runScoped<T>(operation: string, query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (err) {
    /*
     * A DELIBERATE REFUSAL IS NOT AN OUTAGE, and this wrapper used to turn one
     * into the other.
     *
     * The relation-ownership check throws from INSIDE the transaction callback,
     * which is inside this try. Relabelling it "the organization could not be
     * determined" told a caller whose foreign key pointed at another tenant
     * that the database was unavailable — a 503 for a 400, and an operator
     * chasing an outage that never happened. Measured on a live rehearsal:
     * "CREATE a task pointing at BETA's asset" answered 503.
     *
     * Anything this module or its callers threw on purpose passes through
     * untouched. Only an error nobody chose becomes an outage.
     */
    if (err instanceof DataScopeError) throw err;
    if (isDeliberateRefusal(err)) throw err;

    /*
     * SANITISING THE OUTPUT IS NOT THE SAME AS CALLING EVERY FAILURE AN OUTAGE,
     * and this function used to do the second while claiming the first.
     *
     * Every unexpected error became ORGANIZATION_CONTEXT_UNAVAILABLE — 503,
     * "please retry". A `TypeError` from a bug in this very file was reported
     * that way during the A2.0 rehearsal: six write paths answered 503 and the
     * honest answer was "the server is broken, retrying will not help". A 503
     * also invites the caller to retry a request that cannot ever succeed.
     *
     * Two classes, decided from the driver's own CODE rather than its prose:
     *
     *   the database is genuinely unreachable   -> 503, a retry is meaningful
     *   anything else                           -> 500, a retry is not
     *
     * The code is read defensively — this is the failure path — and only a
     * short allowlisted set counts as availability.
     */
    const correlationId = newCorrelationId();
    const availability = isAvailabilityFailure(err);
    logInfraFailure(
      "database",
      `${operation}#${correlationId}${availability ? "" : " internal"}`,
      sanitizeDatabaseError(err),
    );
    throw new DataScopeError(
      availability ? "ORGANIZATION_CONTEXT_UNAVAILABLE" : "INTERNAL_ERROR",
      correlationId,
    );
  }
}

/**
 * Prisma codes that mean "the database could not be reached or answered in
 * time". Everything else — including every `TypeError` from our own code — is
 * an internal fault, not an availability one.
 *
 *   P1001 can't reach the database server      P1002 server reached, timed out
 *   P1008 operation timed out                  P1017 server closed the connection
 *
 * `PrismaClientInitializationError` is included by class because a client that
 * cannot be built has, in effect, no database behind it.
 */
function isAvailabilityFailure(err: unknown): boolean {
  const code = safeRead(err, "code");
  if (typeof code === "string" && ["P1001", "P1002", "P1008", "P1017"].includes(code)) return true;
  let ctor: unknown;
  try {
    ctor = err instanceof Error ? err.constructor?.name : undefined;
  } catch {
    ctor = undefined;
  }
  return ctor === "PrismaClientInitializationError";
}

/** Random, meaningless, and short enough to read down a phone line. */
function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Errors this slice raises on purpose, recognised without importing the modules
 * that define them — `relation-ownership.ts` imports THIS file, so importing it
 * back would be a cycle. The marker is a property those classes declare, read
 * defensively because this runs on the failure path.
 */
function isDeliberateRefusal(err: unknown): boolean {
  const code = safeRead(err, "code");
  return code === "UNSUPPORTED_FIELD" || code === "INVALID_RELATION";
}
