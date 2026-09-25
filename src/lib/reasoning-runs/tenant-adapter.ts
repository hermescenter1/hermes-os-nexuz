/**
 * PHASE 112 — Tenant / site / asset authorization ADAPTER.
 *
 * This is the ONE seam between the reasoning-run feature and the existing (and
 * actively-evolving Phase 110) authorization helpers. Phase 112 consumes the
 * merged-on-baseline helpers `requirePlatformAuth` / `requireOrgActor` /
 * `requirePermission` / `requireSiteActor` / `requireSitePermission` through this
 * module only, so any divergence in a live Phase 110 branch stays behind a single
 * documented integration point. Phase 112 does NOT copy or modify a competing
 * Phase 110 implementation.
 *
 * Everything here is server-resolved: organizationId comes from the platform
 * auth context, never the client body; a site/asset is authorized against the
 * caller's real grants; a foreign or missing site/asset is 404 (never 403), so
 * existence is not disclosed across tenants.
 */
import type { NextRequest } from "next/server";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { requireSiteActor } from "@/lib/site/context";
import { requireSitePermission } from "@/lib/site/rbac";
import { getAsset } from "@/lib/industrial/assets";

export interface ReasoningRunActor {
  orgId: string;
  userId: string | null;
  role: Parameters<typeof requirePermission>[0];
}

export type ActorResolution =
  | { ok: true; actor: ReasoningRunActor }
  | { ok: false; error: string; status: number };

/**
 * Resolve an authenticated, org-scoped actor and require an org permission.
 * organizationId is taken from the server-resolved platform context.
 */
export async function resolveReasoningRunActor(
  req: NextRequest,
  permission: OrgPermission,
): Promise<ActorResolution> {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return { ok: false, error: auth.error, status: auth.status };
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return { ok: false, error: member.error, status: member.status };

  const perm = requirePermission(member.ctx.role, permission);
  if (!perm.ok) return { ok: false, error: perm.error, status: perm.status };

  return { ok: true, actor: { orgId: ctx.orgId, userId: member.ctx.userId, role: member.ctx.role } };
}

export interface ScopeRequest {
  siteId?: string | null;
  assetId?: string | null;
}

export type ScopeResolution =
  | { ok: true; siteId: string | null; assetId: string | null }
  | { ok: false; error: string; status: number };

/**
 * Resolve + authorize the optional site/asset scope of a run. An asset is
 * resolved server-side to its owning site and both are authorized; a mismatch
 * between a supplied siteId and the asset's real site is treated as not-found.
 */
export async function authorizeRunScope(
  req: NextRequest,
  actor: ReasoningRunActor,
  scope: ScopeRequest,
): Promise<ScopeResolution> {
  const assetId = scope.assetId ?? null;
  let siteId = scope.siteId ?? null;

  if (assetId) {
    const asset = await getAsset(assetId, actor.orgId);
    // Foreign/missing asset → 404 (no cross-tenant existence disclosure).
    if (!asset) return { ok: false, error: "Not found", status: 404 };
    if (siteId && siteId !== asset.siteId) {
      return { ok: false, error: "Not found", status: 404 };
    }
    siteId = asset.siteId;
  }

  if (siteId) {
    const siteAuth = await requireSiteActor(req, actor.orgId, siteId);
    if ("error" in siteAuth) return { ok: false, error: "Not found", status: 404 };
    const sitePerm = requireSitePermission(siteAuth.ctx.role, "view_assets");
    if (!sitePerm.ok) return { ok: false, error: sitePerm.error, status: sitePerm.status };
  }

  return { ok: true, siteId, assetId };
}
