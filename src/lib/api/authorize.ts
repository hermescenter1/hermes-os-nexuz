/**
 * PHASE 87L.6H.1A — runtime fail-closed authorization for the API-platform
 * routes.
 *
 * THE DEFECT THIS REPLACES. The key management handlers authorized like this:
 *
 *     if (ctx.authMethod === "apikey") { ...scope check... }
 *     if (ctx.authMethod === "jwt" && ctx.userId) { ...org permission... }
 *     // ...handler body runs...
 *
 * Both branches are POSITIVE conditions, so an actor context whose
 * `authMethod` is neither literal — a malformed object, a value from an older
 * or newer producer, anything deserialized from outside — fell through BOTH
 * checks and reached key creation, rotation and revocation with no
 * authorization at all. The TypeScript union `"jwt" | "apikey"` does not exist
 * at runtime and cannot prevent that.
 *
 * This helper replaces the positive branching with an exhaustive `switch` whose
 * `default` DENIES. Unknown, empty, null, undefined or malformed actor input
 * can only ever produce a denial.
 *
 * Status-code conventions are preserved exactly as the handlers had them:
 *   401 — the actor could not be established (no/unknown auth method, JWT
 *         without a user identity). "We do not know who you are."
 *   403 — the actor is known but lacks the scope or organization permission.
 */

import type { NextRequest } from "next/server";
import { requireOrgActor } from "@/lib/org/context";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { requireScope } from "@/lib/api/scopes";

/** Minimal actor shape this helper inspects — deliberately widened. */
export interface PlatformActorLike {
  orgId?: unknown;
  userId?: unknown;
  authMethod?: unknown;
  scopes?: unknown;
}

export type AuthzResult = { ok: true } | { ok: false; error: string; status: number };

const deny = (error: string, status: number): AuthzResult => ({ ok: false, error, status });

/**
 * How a route admits actors.
 *
 * - `sessionOnly`  — only an interactive session may pass. An API key is
 *   rejected by the organization-membership check (an API key has no user
 *   account), which is exactly what the key-listing route did before.
 * - `apiKeyScope`  — when set, an API-key actor may pass by holding this
 *   scope. When absent, API keys cannot use the route at all.
 */
export interface PlatformAuthzPolicy {
  /** Organization permission an interactive (session) actor must hold. */
  permission: OrgPermission;
  /** Scope an API-key actor must hold; omit to forbid API-key access. */
  apiKeyScope?: string;
}

/**
 * Authorize a platform actor, failing closed on anything unrecognized.
 *
 * The caller has already established authentication (`requirePlatformAuth`);
 * this decides whether that actor may perform the route's operation.
 */
export async function authorizePlatformActor(
  req: NextRequest,
  ctx: PlatformActorLike | null | undefined,
  policy: PlatformAuthzPolicy,
): Promise<AuthzResult> {
  // A missing or non-object context is never a valid actor.
  if (!ctx || typeof ctx !== "object") {
    return deny("Authentication required", 401);
  }

  const orgId = typeof ctx.orgId === "string" && ctx.orgId.length > 0 ? ctx.orgId : null;
  if (!orgId) return deny("Authentication required", 401);

  // Read the discriminant defensively: it is `unknown` here on purpose, so a
  // number, object, empty string or absent field cannot match a case below.
  const method = ctx.authMethod;

  switch (method) {
    case "apikey": {
      // API keys are not organization members, so they authorize by scope.
      // A route that does not opt in (no apiKeyScope) forbids them outright.
      if (!policy.apiKeyScope) {
        return deny("This endpoint requires an interactive session", 403);
      }
      const scopes = Array.isArray(ctx.scopes) ? (ctx.scopes as string[]) : [];
      const sc = requireScope(scopes, policy.apiKeyScope);
      if (!sc.ok) return deny(sc.error, sc.status);
      return { ok: true };
    }

    case "jwt": {
      // A JWT actor without a user identity is malformed — deny rather than
      // silently skipping the organization permission check.
      const userId = typeof ctx.userId === "string" && ctx.userId.length > 0 ? ctx.userId : null;
      if (!userId) return deny("Authentication required", 401);

      const member = await requireOrgActor(req, orgId);
      if ("error" in member) return deny(member.error, member.status);

      const perm = requirePermission(member.ctx.role, policy.permission);
      if (!perm.ok) return deny(perm.error, perm.status);
      return { ok: true };
    }

    default:
      // EXHAUSTIVE DENY. Unknown / empty / null / undefined / non-string
      // authMethod, or a value introduced by a future producer that has not
      // been reviewed here. Never fall through to the handler body.
      return deny("Authentication required", 401);
  }
}
