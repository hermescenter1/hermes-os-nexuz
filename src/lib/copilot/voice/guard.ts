/**
 * PHASE 103 — the one security chain every voice route runs.
 *
 * All three voice endpoints are equally sensitive: one mints an external
 * credential for a browser, one runs the deterministic engine, one spends money
 * at a provider. They therefore share ONE guard rather than three hand-copied
 * sequences that can drift. `requireVoiceCopilotActor` is that guard, and it is
 * FAIL-CLOSED at every step: the only way out with an actor is to pass all
 * seven checks in order.
 *
 * THE ORDER IS THE CONTRACT
 *   1. requirePlatformAuth   — establishes identity and a SERVER-DERIVED orgId
 *   2. JWT ONLY              — an API key is refused outright (see below)
 *   3. trusted origin / CSRF — for the cookie-borne session that step 2 requires
 *   4. organisation membership — proves ACTIVE membership, yields the role
 *   5. RBAC                  — the existing `view_copilot` permission
 *   6. entitlement           — the existing `copilot` commercial gate, after RBAC
 *   7. rate limit            — a typed, declared bucket, keyed by the identity
 *
 * Cheap and identity-establishing checks come first so an unauthenticated probe
 * never reaches a database round-trip; the commercial gate comes after RBAC so a
 * user who is not allowed to use the Copilot is told that, not told to buy
 * something; the rate limit is keyed by the authenticated identity, which cannot
 * be rotated per request the way a network address can.
 *
 * WHY API KEYS ARE REFUSED
 * `requirePlatformAuth` accepts both a browser JWT session and a platform API
 * key. For voice, a key must NOT work. The transcription leg exists to hand a
 * short-lived credential to a live microphone in a browser; a server-to-server
 * integration has no microphone, and accepting a key here would turn the
 * endpoint into a headless way to mint external credentials and spend a tenant's
 * provider budget outside any human review. Refusing keys also means the
 * same-origin check in step 3 always applies — the API-key exemption in
 * `requireTrustedOrigin` can never be reached from these routes.
 *
 * WHY THIS HELPER IS A RECOGNISED TENANT GUARD
 * The Phase 99 route classifier reads authorization evidence out of a handler's
 * own body. This helper is registered in that classifier's `GUARD_TOKENS` with
 * scope `tenant`, because it genuinely resolves the acting organisation on the
 * server and enforces a membership + permission predicate against it — the same
 * contract `requireOrgActor` and `requirePermission` carry, which it composes
 * rather than re-implements. `scripts/__tests__/phase103-voice-guard-recognition.test.ts`
 * locks both halves of that bargain.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requirePlatformAuth } from "@/lib/api/auth";
import type { PlatformActorContext } from "@/lib/api/types";
import { checkRateLimit, retryAfter, type RateLimitAction } from "@/lib/auth/rate-limiter";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { requireOrgActor } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { requireTrustedOrigin } from "@/lib/security/request-guards";

import type { VoiceErrorCode } from "./contract";

/** The permission a voice caller must already hold to use the Copilot at all. */
const VOICE_PERMISSION = "view_copilot" as const;

/** The commercial entitlement the Copilot sits behind. */
const VOICE_ENTITLEMENT = "copilot" as const;

/**
 * Voice is an INTERFACE to a read-only engine, not a metered resource.
 *
 * `0` asks the resolver for an availability decision rather than a consumption
 * one, which is the correct question for a boolean feature key and keeps this
 * phase from silently changing anyone's usage accounting.
 */
const VOICE_ENTITLEMENT_UNITS = 0;

/** Everything a voice handler needs, all of it server-derived. */
export interface VoiceActor {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrgRole;
}

export type VoiceGuardResult =
  | { ok: true; actor: VoiceActor }
  | { ok: false; response: NextResponse };

export interface VoiceGuardOptions {
  readonly req: NextRequest;
  /**
   * The rate-limit bucket for this route.
   *
   * Typed `RateLimitAction`, so a bucket absent from the canonical registry is a
   * COMPILE error at the call site. The call sites pass string literals, which
   * is what the registry audit reads off disk; this parameter is the single
   * declared dynamic indirection, pinned by
   * `src/lib/auth/__tests__/phase102-rate-limit-registry.test.ts`.
   */
  readonly bucket: RateLimitAction;
}

function refuse(error: string, code: VoiceErrorCode, status: number, headers?: HeadersInit) {
  // `no-store` on every refusal: an authorization decision must never be cached
  // by a proxy and replayed to a different actor.
  return NextResponse.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } },
  );
}

/**
 * Run the full chain. Returns the actor, or the exact response to send back.
 *
 * No branch here returns a resource id, a role list, an organisation name, a
 * plan or a provider detail, so a refusal at any step is indistinguishable from
 * a refusal at any other except by the deliberately coarse code.
 */
export async function requireVoiceCopilotActor(options: VoiceGuardOptions): Promise<VoiceGuardResult> {
  const req = options.req;

  // ── 1. Authentication ──────────────────────────────────────────────────────
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) {
    return { ok: false, response: refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status) };
  }
  const ctx: PlatformActorContext = auth.ctx;

  // ── 2. Browser session ONLY ────────────────────────────────────────────────
  // Checked before anything else uses the context, so no API-key caller ever
  // reaches membership resolution, the entitlement gate or the limiter.
  if (ctx.authMethod !== "jwt" || !ctx.userId) {
    return {
      ok: false,
      response: refuse("Browser session required", "SESSION_AUTH_REQUIRED", 401),
    };
  }

  // ── 3. Trusted origin ──────────────────────────────────────────────────────
  // The auth method is pinned to "jwt" above, so this can never take the
  // API-key exemption path: a missing or foreign Origin is always refused.
  if (!requireTrustedOrigin(req, ctx.authMethod).ok) {
    return { ok: false, response: refuse("Forbidden", "FORBIDDEN", 403) };
  }

  // ── 4. Organisation membership ─────────────────────────────────────────────
  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) {
    return {
      ok: false,
      response: refuse("Organization membership required", "ORGANIZATION_SCOPE_REQUIRED", member.status),
    };
  }

  // ── 5. RBAC ────────────────────────────────────────────────────────────────
  const permission = requirePermission(member.ctx.role, VOICE_PERMISSION);
  if (!permission.ok) {
    return {
      ok: false,
      response: refuse("Insufficient organization permissions", "INSUFFICIENT_PERMISSION", permission.status),
    };
  }

  const organizationId = member.ctx.orgId;
  const userId = member.ctx.userId;

  // ── 6. Entitlement, AFTER RBAC ─────────────────────────────────────────────
  // The billing surface owns its own status codes and body shape, so its denial
  // response is returned verbatim rather than being reshaped here.
  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: VOICE_ENTITLEMENT,
    requestedUnits: VOICE_ENTITLEMENT_UNITS,
    userId,
  });
  if (!entitlement.ok) return { ok: false, response: entitlement.response };

  // ── 7. Rate limit ──────────────────────────────────────────────────────────
  // Keyed by the authenticated identity within its tenant. `resolveClientIp` is
  // the right key for anonymous surfaces; this one is never anonymous.
  const limitKey = `${organizationId}:${userId}`;
  if (!(await checkRateLimit(options.bucket, limitKey))) {
    return {
      ok: false,
      response: refuse("Too many requests", "RATE_LIMITED", 429, {
        "Retry-After": String(retryAfter(options.bucket, limitKey)),
      }),
    };
  }

  return { ok: true, actor: { organizationId, userId, role: member.ctx.role } };
}
