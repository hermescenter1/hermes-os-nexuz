/**
 * API Platform authentication middleware (Phase 33).
 *
 * Supports two auth methods:
 *   1. API key  — "Authorization: Bearer hk_..." or "X-API-Key: hk_..."
 *   2. JWT session — "Authorization: Bearer <jwt>" (cookie or header)
 *
 * For API-key auth: orgId comes from the key record; scopes come from the key.
 * For JWT auth:    orgId resolved from the user's first org membership (same as
 *                  billing context); scopes treated as ["admin"] (full access —
 *                  org-level RBAC gates permissions separately).
 *
 * Metering (writing UsageRecord) happens ONLY for API-key-authenticated calls.
 * JWT session calls to platform routes are not metered.
 *
 * OBSERVABILITY (multi-site 401 investigation)
 * --------------------------------------------
 * Every rejection here used to be an unlogged `return null` that
 * `requirePlatformAuth` collapsed into one indistinguishable
 * `401 Authentication required`. Six materially different conditions — no
 * credential at all, a token failing signature/claims validation, a revoked
 * session, a database fault while resolving the tenant, a user with no ACTIVE
 * organization membership, and an unusable API key — produced byte-identical
 * responses with nothing in the log stream. An operator could not tell an
 * expired login from a database outage from an account that was never attached
 * to an organization.
 *
 * This module now classifies each condition and emits ONE structured security
 * event per rejection through the repository's existing helpers
 * (`logAuthFailure` / `logAuthzDenial` / `logInfraFailure`), exactly as
 * `requireOrgActor` has always done.
 *
 * PHASE 107 STAGE 6-A — the reviewed change that note anticipated.
 *
 * The classification above was correct and the response still discarded it. All
 * six conditions answered 401, so a signed-in administrator with no organization
 * was told to sign in again — advice that cannot work — and a DATABASE OUTAGE
 * was reported as an authentication failure, sending an operator to a login form
 * during an incident. `requirePlatformAuth` now maps the reason it already knew:
 *
 *   missing_credentials / invalid_access_token / invalid_api_key /
 *   inactive_or_revoked_session   → 401, uniform and indistinguishable
 *   no_active_organization_membership → 409 ORGANIZATION_CONTEXT_REQUIRED
 *   organization_resolution_failed    → 500 INTERNAL_ERROR
 *
 * The anti-enumeration property is intact: everything reachable BEFORE the
 * session is verified still answers one identical 401. The two richer answers
 * require a verified session and describe the caller's own account to them.
 *
 * DELIBERATELY UNCHANGED:
 *   - the fail-CLOSED posture — every condition that cannot be positively
 *     confirmed still denies;
 *   - session revocation enforcement (`isPayloadSessionActive`);
 *   - API-key resolution, precedence and behaviour.
 *
 * DISCLOSURE RULE — no access token, cookie value, bearer token, API key, key
 * prefix or secret is ever passed to the logger. Only the opaque `userId`
 * (already permitted by `SecurityEventContext`), the machine-readable reason,
 * and — for infrastructure faults — a SANITIZED descriptor built solely from
 * the error's class name and, when present, a strictly-shaped driver code.
 *
 * The raw error is deliberately NOT handed to `logInfraFailure`: that helper
 * records `error.message.slice(0, 300)`, and a driver message is free text that
 * can carry a host and port ("connect ECONNREFUSED 10.0.0.5:5432"), a table or
 * column name, or fragments of a statement. The logger's scrubber masks URL
 * userinfo, `key=value` secrets and JWTs, but a bare `host:port` or a table name
 * is none of those, so it would pass through. See `sanitizeDatabaseError`.
 */

import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { refuse, type ContextRefusal, type RefusedRequest } from "@/lib/auth/context-result";
import { getStorageMode }      from "@/lib/storage/storage-mode";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import { resolveRequestId }    from "@/lib/logger/correlation";
import { logAuthFailure, logAuthzDenial, logInfraFailure } from "@/lib/logger/security-events";
import { verifyApiKey, touchLastUsed } from "./keys";
import { API_KEY_PREFIX }      from "./types";
import type { PlatformActorContext } from "./types";

type MemberModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

/** Logical operation name carried by every security event from this module. */
const AUTH_OPERATION = "platform.auth";

/**
 * Why a platform-auth attempt was rejected. Stable, machine-readable strings —
 * these appear in the log stream and in `security-monitor` aggregates, so they
 * are part of the operational contract and must not be renamed casually.
 *
 * `no_active_organization_membership` and `organization_resolution_failed` are
 * deliberately SEPARATE: the first is a real answer from the database (this
 * user has no ACTIVE `OrganizationMember` row), the second means the question
 * could not be asked or answered (no client, or the query threw). Collapsing an
 * infrastructure fault into "you have no organization" is what made the
 * production 401 undiagnosable.
 */
export type PlatformAuthFailureReason =
  | "missing_credentials"
  | "invalid_access_token"
  | "inactive_or_revoked_session"
  | "organization_resolution_failed"
  | "no_active_organization_membership"
  | "invalid_api_key";

/**
 * Reasons describing an authorization outcome for a caller whose identity WAS
 * established, rather than a failure to authenticate at all. These are logged
 * as denials; everything else is logged as an authentication failure. Mirrors
 * `requireOrgActor`, which logs `no_session` as a failure and
 * `session_revoked` / `not_a_member` as denials.
 */
const DENIAL_REASONS: ReadonlySet<PlatformAuthFailureReason> = new Set<PlatformAuthFailureReason>([
  "inactive_or_revoked_session",
  "no_active_organization_membership",
]);

/**
 * Shapes that a sanitized descriptor may contain. Both are structural, not
 * denylist-based: a value is emitted only if it is ENTIRELY a plain identifier
 * (class name) or a short alphanumeric code. Anything else — free text, a host,
 * a quoted table name, a statement fragment — cannot match and is dropped.
 */
const SAFE_CLASS_RE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const SAFE_CODE_RE  = /^[A-Za-z0-9_]{1,16}$/;

/**
 * An error carrying ONLY non-sensitive structural facts about a database
 * failure. Its `message` is assembled here from allowlisted-shape values, so
 * nothing authored by the driver survives into the log stream.
 */
class SanitizedDatabaseError extends Error {
  constructor(descriptor: string) {
    super(descriptor);
    this.name = "SanitizedDatabaseError";
  }
}

/**
 * Reduce an arbitrary thrown value to what an operator actually needs — the
 * error class and, for Prisma, its stable code (`P1001` unreachable, `P2021`
 * missing table, …) — and nothing else.
 *
 * The result is built by CONSTRUCTION, not by filtering: the only strings that
 * can appear are a constructor name matching `SAFE_CLASS_RE` and a code
 * matching `SAFE_CODE_RE`. `error.message` is never read.
 */
export function sanitizeDatabaseError(err: unknown): SanitizedDatabaseError {
  const rawClass =
    err instanceof Error ? err.constructor?.name : typeof err;
  const cls =
    typeof rawClass === "string" && SAFE_CLASS_RE.test(rawClass) ? rawClass : "UnknownError";

  const rawCode = (err as { code?: unknown } | null | undefined)?.code;
  const code = typeof rawCode === "string" && SAFE_CODE_RE.test(rawCode) ? rawCode : null;

  return new SanitizedDatabaseError(code ? `${cls}(${code})` : cls);
}

/**
 * Emit exactly one structured security event for a rejection.
 * `userId` is included only when it was established from a VERIFIED token.
 */
function logPlatformAuthFailure(
  req:     NextRequest,
  reason:  PlatformAuthFailureReason,
  userId?: string,
): void {
  const ctx = {
    reqId:     resolveRequestId(req),
    operation: AUTH_OPERATION,
    reason,
    ...(userId ? { userId } : {}),
  };
  if (DENIAL_REASONS.has(reason)) logAuthzDenial(ctx);
  else                            logAuthFailure(ctx);
}

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function extractApiKeyHeader(req: NextRequest): string | null {
  return req.headers.get("X-API-Key")?.trim() ?? null;
}

/**
 * Outcome of resolving the caller's tenant. A discriminated result rather than
 * `string | null`, so "the database says this user has no ACTIVE membership"
 * and "the database could not be reached, or the query threw" stay distinct all
 * the way to the log line.
 */
type OrgResolutionFailure = Extract<
  PlatformAuthFailureReason,
  "organization_resolution_failed" | "no_active_organization_membership"
>;

type OrgResolution =
  | { ok: true;  orgId: string }
  | { ok: false; reason: OrgResolutionFailure };

/**
 * Resolve the user's first ACTIVE org membership — same pattern as billing
 * context. Unresolvable for ANY reason still denies (fail closed); the reason
 * is now reported to the caller so it can be logged.
 */
async function resolveFirstOrgId(userId: string, reqId: string): Promise<OrgResolution> {
  const db = await getPrisma();
  // No client: session mode, or a database-mode client that failed to
  // initialise (already recorded by getPrisma's own logInfraFailure). Either
  // way the tenant question could not be ANSWERED — that is not an answer of
  // "this user has no organization".
  if (!db) return { ok: false, reason: "organization_resolution_failed" };
  try {
    const m = (db as Record<string, unknown>).organizationMember as MemberModel;
    const row = await m.findFirst({
      where:   { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    if (!row) return { ok: false, reason: "no_active_organization_membership" };
    return { ok: true, orgId: String(row.organizationId) };
  } catch (err) {
    // An infrastructure fault previously vanished into `catch { return null; }`
    // and surfaced as "Authentication required". It is now recorded — but as a
    // SANITIZED descriptor, never the driver's own message. `logInfraFailure`
    // would otherwise emit `error.message.slice(0, 300)` verbatim.
    logInfraFailure("database", `${AUTH_OPERATION}.resolve_organization`, sanitizeDatabaseError(err), reqId);
    return { ok: false, reason: "organization_resolution_failed" };
  }
}

/** Resolved platform context, or the classified reason it could not be built. */
type PlatformResolution =
  | { ok: true;  ctx: PlatformActorContext }
  | { ok: false; reason: PlatformAuthFailureReason; userId?: string };

async function resolveJwtContext(req: NextRequest): Promise<PlatformResolution> {
  // Try cookie first, then Authorization header
  let raw = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  if (!raw) {
    const bearer = extractBearerToken(req);
    if (bearer && !bearer.startsWith(API_KEY_PREFIX)) raw = bearer;
  }
  if (!raw) return { ok: false, reason: "missing_credentials" };

  const payload = await verifyAccessToken(raw);
  if (!payload?.sub) return { ok: false, reason: "invalid_access_token" };

  // PHASE 91 — a revoked session's access token is rejected here, so it cannot
  // reach the platform API (key management, metered endpoints) after revocation.
  if (!(await isPayloadSessionActive(payload))) {
    return { ok: false, reason: "inactive_or_revoked_session", userId: payload.sub };
  }

  const org = await resolveFirstOrgId(payload.sub, resolveRequestId(req));
  if (!org.ok) return { ok: false, reason: org.reason, userId: payload.sub };

  return {
    ok: true,
    ctx: {
      userId:     payload.sub,
      orgId:      org.orgId,
      authMethod: "jwt",
      scopes:     ["admin"], // JWT session = full access; org-level RBAC enforces role perms
    },
  };
}

async function resolveApiKeyContext(
  rawKey: string,
): Promise<PlatformActorContext | null> {
  const row = await verifyApiKey(rawKey);
  if (!row) return null;

  // Throttled lastUsedAt update (fire-and-forget)
  touchLastUsed(String(row.id), row.lastUsedAt ? new Date(row.lastUsedAt as string) : null);

  return {
    userId:     null, // API keys are not linked to a specific user account
    orgId:      String(row.organizationId),
    authMethod: "apikey",
    scopes:     Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    keyId:      String(row.id),
  };
}

/**
 * Resolve platform auth context, reporting WHY when it cannot be built.
 * Prefer API key over JWT when both are present (unchanged).
 */
async function resolvePlatformContext(req: NextRequest): Promise<PlatformResolution> {
  // Check for API key in X-API-Key header or Bearer token starting with "hk_"
  const apiKeyHeader = extractApiKeyHeader(req);
  if (apiKeyHeader?.startsWith(API_KEY_PREFIX)) {
    const ctx = await resolveApiKeyContext(apiKeyHeader);
    // Behaviour unchanged: an unusable key denies. It is merely no longer silent.
    return ctx ? { ok: true, ctx } : { ok: false, reason: "invalid_api_key" };
  }
  const bearer = extractBearerToken(req);
  if (bearer?.startsWith(API_KEY_PREFIX)) {
    const ctx = await resolveApiKeyContext(bearer);
    return ctx ? { ok: true, ctx } : { ok: false, reason: "invalid_api_key" };
  }

  // Fall back to JWT
  return resolveJwtContext(req);
}

/**
 * Resolve platform auth context. Returns null if unauthenticated.
 * Prefer API key over JWT when both are present.
 *
 * Signature and semantics preserved for existing callers; the classified reason
 * is logged as a side effect rather than returned, so no call site changes.
 */
export async function getPlatformContext(
  req: NextRequest,
): Promise<PlatformActorContext | null> {
  const result = await resolvePlatformContext(req);
  if (result.ok) return result.ctx;
  logPlatformAuthFailure(req, result.reason, result.userId);
  return null;
}

/**
 * Enforce authentication, returning 401 if not authenticated.
 *
 * The status and message stay uniform across every rejection reason: an
 * unauthenticated caller learns only that authentication is required — never
 * whether the account exists, whether its session was revoked, or whether the
 * platform's database is degraded. The DIAGNOSIS lives in the server-side log
 * stream (see `logPlatformAuthFailure`), not in the response.
 */
export async function requirePlatformAuth(
  req: NextRequest,
): Promise<{ ctx: PlatformActorContext } | RefusedRequest> {
  const result = await resolvePlatformContext(req);
  if (result.ok) return { ctx: result.ctx };

  logPlatformAuthFailure(req, result.reason, result.userId);
  return refuse(refusalFor(result.reason));
}

/**
 * `organization_resolution_failed` covers two situations that are not the same.
 *
 * In DATABASE mode a missing client is an outage: 500, and an operator should be
 * looking at infrastructure. In SESSION mode there is no organization store at
 * all, by design — nothing is broken, the caller simply has no organization, so
 * it is the same 409 that `resolveOrgContext` returns for exactly this case.
 *
 * Without this the two unified helpers disagreed: billing answered 409 on a
 * session-mode deployment while the platform answered 500, claiming an outage
 * that was not happening.
 */
function refusalFor(reason: PlatformAuthFailureReason): ContextRefusal {
  if (reason === "organization_resolution_failed" && getStorageMode() !== "database") {
    return "ORGANIZATION_CONTEXT_REQUIRED";
  }
  return REASON_TO_REFUSAL[reason];
}

/**
 * PHASE 107 STAGE 6-A — the classified reason already existed; only the status
 * threw it away.
 *
 * `resolvePlatformContext` has always distinguished a missing credential from a
 * revoked session from an account with no organization from a database that
 * could not be reached. All five collapsed into 401, so:
 *
 *   - a signed-in administrator with no organization was told to sign in again,
 *     which cannot help them; and
 *   - a DATABASE OUTAGE was reported as an authentication failure, sending an
 *     operator to a login form during an incident.
 *
 * The anti-enumeration property that motivated the flattening is kept intact:
 * every reason reachable BEFORE the session is verified still answers 401 with
 * one identical message, so an unauthenticated prober learns nothing. The two
 * richer answers require a verified session, and describe the caller's own
 * account to the caller.
 */
const REASON_TO_REFUSAL: Record<PlatformAuthFailureReason, ContextRefusal> = {
  // Pre-authentication: uniform, and deliberately indistinguishable.
  missing_credentials: "AUTHENTICATION_REQUIRED",
  invalid_access_token: "AUTHENTICATION_REQUIRED",
  invalid_api_key: "AUTHENTICATION_REQUIRED",
  inactive_or_revoked_session: "AUTHENTICATION_REQUIRED",
  // Post-authentication: the session is good, the context is not.
  no_active_organization_membership: "ORGANIZATION_CONTEXT_REQUIRED",
  // Not the caller's problem at all.
  organization_resolution_failed: "INTERNAL_ERROR",
};
