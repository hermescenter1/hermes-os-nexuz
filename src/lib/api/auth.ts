/**
 * API Platform authentication middleware (Phase 33).
 *
 * Supports two auth methods:
 *   1. API key  — "Authorization: Bearer hk_..." or "X-API-Key: hk_..."
 *   2. JWT session — "Authorization: Bearer <jwt>" (cookie or header)
 *
 * For API-key auth: orgId comes from the key record; scopes come from the key.
 * For JWT auth:    orgId is the organization the reader SELECTED, resolved by
 *                  the Phase 110-A1.0 tenant resolver (same as billing context);
 *                  scopes treated as ["admin"] (full access — org-level RBAC
 *                  gates permissions separately).
 *
 *                  PHASE 110-A1.0b R5 — this line used to read "the user's
 *                  first org membership", which was accurate and was the defect:
 *                  an arbitrary pick presented as a decision. Several
 *                  memberships with no selection are now refused rather than
 *                  guessed at.
 *
 *                  PHASE 110-A1.0b R6 — a state-changing request on this path
 *                  must also STATE the organization it was made for; one that
 *                  states nothing is refused with 428.
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
import {
  checkTenantPrecondition,
  resolveTenantDecision,
} from "@/lib/tenant-selection/selection";
import type { TenantRefusalCode } from "@/lib/tenant-selection/contract";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import { resolveRequestId }    from "@/lib/logger/correlation";
import { logAuthFailure, logAuthzDenial } from "@/lib/logger/security-events";
import { verifyApiKey, touchLastUsed } from "./keys";
import { API_KEY_PREFIX }      from "./types";
import type { PlatformActorContext } from "./types";

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
  /*
   * PHASE 110-A1.0b R5 — the caller belongs to SEVERAL organizations and has
   * chosen none. Until R5 this platform path answered it by silently taking
   * the earliest membership; it is now a refusal, because "which of your
   * organizations is this request for?" is a question only the caller can
   * answer.
   */
  | "organization_selection_required"
  /*
   * PHASE 110-A1.0b R5 — the tenant question could not be ASKED. Distinct from
   * `organization_resolution_failed`, which keeps its 500 and its existing
   * meaning for every caller already built against it.
   */
  | "organization_context_unavailable"
  /*
   * PHASE 110-A1.0b R5 — a guard, not an expected outcome. The tenant decision
   * came back describing a DIFFERENT user than the one this request
   * authenticated. Two identities in one request is the failure mode this
   * repair was most at risk of introducing, so it is refused explicitly rather
   * than trusted to be impossible.
   */
  | "organization_identity_mismatch"
  /*
   * PHASE 110-A1.0b R5 — the request named an organization and it is not the
   * one in effect, because another tab switched. 409, and the remedy is to
   * reload; retrying the identical request only reaches the identical conflict.
   */
  | "organization_context_conflict"
  /*
   * PHASE 110-A1.0b R6 — a state-changing request on the session path that
   * stated no organization at all. Kept apart from the conflict above so an
   * operator can tell an un-migrated client from a genuinely stale one.
   */
  | "organization_precondition_required"
  /*
   * PHASE 110-A1.0b R6.1 — the credential authenticated, and then stopped.
   *
   * Identity is established TWICE in `resolveJwtContext`, and the two checks are
   * not simultaneous: a session revoked, expired or signed out between them
   * makes the first succeed and the resolver's own port answer UNAUTHENTICATED.
   * That is an AUTHENTICATION outcome — 401, sign in — and R6 translated it into
   * `organization_selection_required`, so a caller whose session had just died
   * was answered 409 and told to choose a tenant they cannot choose.
   *
   * Kept apart from `inactive_or_revoked_session` so the log stream still says
   * WHICH check refused, while the response stays the uniform 401.
   */
  | "identity_no_longer_authenticated"
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
  // PHASE 110-A1.0b R5 — the identity was established in all three; what failed
  // is the tenant decision, so they are denials rather than auth failures.
  "organization_selection_required",
  "organization_context_unavailable",
  "organization_identity_mismatch",
  "organization_context_conflict",
  "organization_precondition_required",
  // R6.1 — `payload.sub` is known here; what ended is the session, exactly as
  // for `inactive_or_revoked_session` above.
  "identity_no_longer_authenticated",
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
/*
 * PHASE 110-A1.0b R5 — this export has NO production caller in this repository
 * any more.
 *
 * Its only one was `resolveFirstOrgId`, removed above; the tenant resolver that
 * replaced it sanitizes through the core's own `recordInfraFailure`. Stated
 * plainly rather than dressed up as an extension point.
 *
 * It is KEPT, and the reason is contractual rather than aspirational: it is a
 * public export of this module with its own test suite in
 * `__tests__/platform-auth-classification.test.ts` asserting that a driver
 * message, a host, a table name or a statement fragment can never reach a log
 * line. Deleting a tested security control as collateral of a tenant repair
 * would be scope this round was not given. It is reported in the R5 report as a
 * follow-up for whoever owns the logging contract — not left silent.
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

/*
 * PHASE 110-A1.0b R5 — `resolveFirstOrgId`, `OrgResolution` and
 * `OrgResolutionFailure` were REMOVED.
 *
 * The function was
 *
 *     findFirst({ where: { userId, status: "ACTIVE" },
 *                 orderBy: { createdAt: "asc" } })
 *
 * — the arbitrary earliest membership. It answered "which of your
 * organizations is this request for?" by picking one and saying nothing, on 69
 * routes and 45 mutating handlers, and it never read the reader's selection.
 * Phase 110-A1.0 removed exactly this pattern from the billing path; R5 removes
 * the last copy.
 *
 * Verified before deletion: no caller anywhere in `src/` outside this module,
 * and the only one inside it was `resolveJwtContext`, which now asks
 * `resolveTenantDecision`. The `MemberModel` type it needed went with it.
 *
 * `r4-adoption-gap.test.ts` keeps a `findFirst` in its Prisma double ON
 * PURPOSE: if this lookup ever returns, that double answers with the earliest
 * membership again and the assertions fail loudly instead of quietly agreeing.
 */

/** Resolved platform context, or the classified reason it could not be built. */
type PlatformResolution =
  | { ok: true;  ctx: PlatformActorContext }
  | { ok: false; reason: PlatformAuthFailureReason; userId?: string };

/**
 * PHASE 110-A1.0b R6 — resolve the tenant for a caller who authenticated by
 * BEARER TOKEN rather than by cookie.
 *
 * WHY THIS EXISTS. This module's own header states the contract: "JWT session —
 * 'Authorization: Bearer <jwt>' (cookie or header)". R5 routed that path through
 * `resolveTenantDecision`, whose identity port is cookie-only, so a bearer
 * caller resolved as UNAUTHENTICATED and R5 refused them with "select an
 * organization" — translating a perfectly valid identity into an absence of
 * choice. That was a contract break I introduced. No in-repository client uses
 * the path, and that proves nothing about external consumers.
 *
 * WHY IT LIVES HERE AND NOT IN THE SELECTION LAYER. A first attempt put it
 * there and the client-boundary test refused it, correctly: that layer is
 * asserted to take identity from the resolver and never to read a token or a
 * cookie itself. Credentials are this module's job. The selection layer stayed
 * clean and this function moved to where the bearer token was already being
 * extracted and verified.
 *
 * NO CLIENT-SUPPLIED IDENTITY. No user id is passed anywhere. What is passed is
 * the CREDENTIAL, and the resolver's own identity port derives the id from it
 * with the same `verifyAccessToken` and the same `isPayloadSessionActive`
 * revocation check the cookie path uses. A caller cannot state who they are.
 *
 * The selection cookie is passed through untouched. A bearer client normally has
 * none, which is the right outcome rather than a gap: with no stored selection a
 * single membership resolves and several are refused.
 */
async function resolveTenantForCredential(req: NextRequest) {
  if (req.cookies.get(ACCESS_TOKEN_COOKIE)?.value) return resolveTenantDecision(req);

  const bearer = extractBearerToken(req);
  // An API key is a different credential with its own tenant; it never gets here.
  if (!bearer || bearer.startsWith(API_KEY_PREFIX)) return resolveTenantDecision(req);

  const bearerAsSession = {
    ...req,
    headers: req.headers,
    method: req.method,
    cookies: {
      get: (name: string) =>
        name === ACCESS_TOKEN_COOKIE ? { value: bearer } : req.cookies.get(name),
    },
  } as unknown as NextRequest;

  return resolveTenantDecision(bearerAsSession);
}

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

  /*
   * PHASE 110-A1.0b R5 — THE TENANT FOLLOWS THE READER'S OWN SELECTION.
   *
   * What was here until R5:
   *
   *     findFirst({ where: { userId, status: "ACTIVE" },
   *                 orderBy: { createdAt: "asc" } })
   *
   * — the earliest membership, on 69 routes, 45 of them mutating, and it never
   * read the selection at all. A reader who belongs to two organizations could
   * choose B in the switcher and have `POST /api/industrial/assets` create the
   * asset in A. That is the arbitrary pick Phase 110-A1.0 exists to remove; it
   * had been removed from the billing path and left everywhere else.
   *
   * IDENTITY IS DERIVED TWICE AND COMPARED — it is not mixed, and R6 states that
   * more precisely than R5 did.
   *
   * `payload.sub` above is the identity THIS request authenticated. The resolver
   * independently derives its own from the same credential, with the same
   * signature verification and the same `isPayloadSessionActive` revocation
   * check this function already applied. The two are then required to name the
   * SAME person before any tenant is accepted, and a decision about somebody
   * else is refused rather than adopted.
   *
   * R5's wording here was "identity is NOT re-derived", which was wrong on its
   * face: it is re-derived, deliberately, and the comparison is the guarantee.
   * No user id is ever passed between the two — only the credential is — so a
   * caller can never state who they are.
   *
   * WHY THE COOKIE PATH IS NOT A WEAKENING: `getUserIdFromRequest` reads the
   * same `ACCESS_TOKEN_COOKIE`, verifies the same token and runs the same
   * revocation check. It is strictly the same identity, established twice and
   * compared, rather than a second, weaker one.
   *
   * BEARER-JWT CALLERS — CORRECTED IN R6, and this paragraph with it.
   *
   * R5 left the bearer path resolving through a cookie-only identity port, so a
   * bearer caller authenticated here and then came back UNAUTHENTICATED from the
   * resolver: a valid identity translated into an absence of choice. R6 fixed
   * that where it belonged, in `resolveTenantForCredential`, which hands the
   * resolver the CREDENTIAL this request authenticated — never a user id — so
   * the same token establishes the same person on both sides.
   *
   * A machine caller that needs a FIXED tenant should still use an API key,
   * whose organization comes from the key row and which no cookie can move.
   *
   * WHAT AN UNAUTHENTICATED DECISION MEANS NOW (R6.1). With the bearer route
   * repaired, the only way the resolver can fail to identify a caller who just
   * authenticated is that the credential stopped being valid between the two
   * checks — revoked, expired or signed out. That is an authentication outcome
   * and is answered as one: 401, via `identity_no_longer_authenticated`. It is
   * NOT "choose an organization", which is reserved for a valid identity whose
   * memberships leave the question open.
   */
  const decision = await resolveTenantForCredential(req);

  if (!decision.granted) {
    return { ok: false, reason: REASON_FOR_REFUSED_TENANT[decision.code], userId: payload.sub };
  }

  if (decision.userId !== payload.sub) {
    // Never expected. Refused explicitly rather than assumed impossible.
    return { ok: false, reason: "organization_identity_mismatch", userId: payload.sub };
  }

  /*
   * PHASE 110-A1.0b R5 — THE TENANT-INTENT PRECONDITION, now that the tenant is
   * the one the reader chose.
   *
   * The order of these two repairs is not interchangeable, and doing them the
   * other way round would have been actively harmful. While this path still
   * resolved the EARLIEST membership, a page rendered for B would have asserted
   * B, the server would have resolved A, and every request from a
   * correctly-behaving client would have failed — turning a silent wrong-tenant
   * write into a total outage. The resolver had to be right first; only then
   * does asking "is this still the organization you were shown?" mean anything.
   *
   * SESSION PATH ONLY, and that is decided by the AUTHENTICATION PATH rather
   * than by anything the caller can choose. An API key resolves earlier in
   * `resolvePlatformContext`, carries its own organization from the key row and
   * never reaches this line, so no cookie and no header can move a machine
   * credential's tenant. Nothing here reads a User-Agent or any other
   * self-declared value.
   *
   * One implementation, shared with the billing path — see
   * `checkTenantPrecondition`. (R6 renamed it when "missing" became a third
   * outcome; this reference still said `tenantPreconditionConflicts`, which has
   * not existed since.)
   */
  const precondition = checkTenantPrecondition(req, decision.organizationId);
  if (precondition === "conflict") {
    return { ok: false, reason: "organization_context_conflict", userId: payload.sub };
  }
  if (precondition === "missing") {
    // PHASE 110-A1.0b R6 — a state-changing request that asserted nothing.
    return { ok: false, reason: "organization_precondition_required", userId: payload.sub };
  }

  return {
    ok: true,
    ctx: {
      userId:     payload.sub,
      orgId:      decision.organizationId,
      authMethod: "jwt",
      scopes:     ["admin"], // JWT session = full access; org-level RBAC enforces role perms
    },
  };
}

/**
 * PHASE 110-A1.0b R5 — the tenant refusal, in this module's vocabulary.
 *
 * Total over `TenantRefusalCode`, so a code added to the selection contract
 * later fails to compile here instead of falling through to whichever reason
 * happened to be last.
 */
const REASON_FOR_REFUSED_TENANT: Record<TenantRefusalCode, PlatformAuthFailureReason> = {
  /*
   * PHASE 110-A1.0b R6.1 — an AUTHENTICATION outcome, answered as one.
   *
   * R5 wrote `organization_selection_required` here because a bearer-only
   * caller then reached a cookie-only identity port and came back
   * UNAUTHENTICATED. R6 removed that route at its source
   * (`resolveTenantForCredential`) and left this line, and its comment,
   * describing a path that no longer exists.
   *
   * What actually reaches it now is a credential that authenticated at the
   * first check and no longer does at the second — a session revoked, expired
   * or signed out in between. The remedy is to sign in, and 409 "select an
   * organization" neither says that nor offers anything the caller can act on.
   * It also DIVERGED: `resolveOrgContext` forwards the same resolver code
   * untouched, so the identical condition answered 401 on the billing routes
   * and 409 on the 69 platform routes.
   *
   * "There is no organization selected" is now reserved for what it describes:
   * a VALID identity whose memberships leave the question open.
   */
  AUTHENTICATION_REQUIRED: "identity_no_longer_authenticated",
  ORGANIZATION_CONTEXT_REQUIRED: "no_active_organization_membership",
  ORGANIZATION_SELECTION_REQUIRED: "organization_selection_required",
  ORGANIZATION_CONTEXT_UNAVAILABLE: "organization_context_unavailable",
};

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
  /*
   * PHASE 110-A1.0b R5 — the session-mode carve-out is PRESERVED, and extended
   * to the reason that now carries the same situation.
   *
   * Before R5 an absent organization store surfaced here as
   * `organization_resolution_failed`. The selection-aware resolver classifies
   * the same condition as MEMBERSHIP_UNAVAILABLE, which arrives as
   * `organization_context_unavailable`. Without the second name below, a
   * session-mode deployment would have flipped from 409 to 503 on 69 routes as
   * a side effect of this repair — a behaviour change nobody asked for, in a
   * mode where nothing is actually broken and retrying cannot help.
   *
   * The billing path answers 503 here. That divergence is older than this
   * change, is NOT closed by it, and stays reported rather than silently
   * unified in whichever direction this edit happened to touch.
   */
  const storeAbsentInSessionMode =
    reason === "organization_resolution_failed" || reason === "organization_context_unavailable";
  if (storeAbsentInSessionMode && getStorageMode() !== "database") {
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
  /*
   * PHASE 110-A1.0b R6.1 — 401, and deliberately indistinguishable from the
   * line above in the RESPONSE. The caller learns "authentication required";
   * which of the two checks refused is an operator-facing fact and stays in the
   * log stream, where the anti-enumeration property is not at stake.
   */
  identity_no_longer_authenticated: "AUTHENTICATION_REQUIRED",
  // Post-authentication: the session is good, the context is not.
  no_active_organization_membership: "ORGANIZATION_CONTEXT_REQUIRED",
  // Not the caller's problem at all.
  organization_resolution_failed: "INTERNAL_ERROR",
  /*
   * PHASE 110-A1.0b R5 — 409, the same status and the same code the billing
   * path already returns for this state, so the two helpers no longer answer
   * one question two ways.
   */
  organization_selection_required: "ORGANIZATION_SELECTION_REQUIRED",
  // 503: a dependency is not answering. Reporting it as "you have no
  // organization" would invent a fact about the account out of an outage.
  organization_context_unavailable: "ORGANIZATION_CONTEXT_UNAVAILABLE",
  /*
   * 403. Not 401 — the caller authenticated perfectly well; what is refused is
   * a tenant decision that describes somebody else. There is nothing to
   * re-authenticate and nothing for the caller to select.
   */
  organization_identity_mismatch: "FORBIDDEN",
  // 409, and the same code the billing path already returns for this state.
  organization_context_conflict: "ORGANIZATION_CONTEXT_CONFLICT",
  organization_precondition_required: "ORGANIZATION_PRECONDITION_REQUIRED",
};
