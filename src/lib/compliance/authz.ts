/**
 * Compliance administration authorization (compliance security hotfix).
 *
 * The compliance routes previously trusted only the JWT `role` claim, which let
 * any admin-role token act across every tenant. These guards replace that with
 * the established Hermes authorization model:
 *
 *   - identity + session-revocation are verified on the ACCESS_TOKEN axis (the
 *     axis the compliance routes already use);
 *   - the acting organization is DERIVED server-side from the caller's ACTIVE
 *     memberships using the Phase 90 count-based rule (`resolveOrgScope`) — never
 *     from a request body, query string, header or route parameter;
 *   - the caller must additionally hold the required org permission in that org.
 *
 * A caller with more than one active organization and no decidable selection
 * fails closed (409) rather than defaulting to an arbitrary tenant.
 */

import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import { getPrisma } from "@/lib/db/prisma";
import { resolveOrgScope } from "@/lib/storage/brain-owner";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { logAuthFailure, logAuthzDenial } from "@/lib/logger/security-events";

export type ComplianceScope =
  | { ok: true; userId: string; organizationId: string; role: OrgRole }
  | { ok: false; status: number; code: string; error: string };

export type PlatformScope =
  | { ok: true; userId: string; role: string }
  | { ok: false; status: number; code: string; error: string };

type MemberModel = { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };

/**
 * Authoritative organization scope for compliance administration. Returns the
 * single active org the caller may act within, plus their org role, or a
 * fail-closed error response descriptor.
 */
export async function requireComplianceOrgScope(
  req: NextRequest,
  perm: OrgPermission,
  operation = "compliance.admin",
): Promise<ComplianceScope> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  if (!payload?.sub) {
    logAuthFailure({ operation, reason: "no_session" });
    return { ok: false, status: 401, code: "AUTHENTICATION_REQUIRED", error: "Authentication required" };
  }
  if (!(await isPayloadSessionActive(payload))) {
    logAuthzDenial({ operation, reason: "session_revoked", userId: payload.sub });
    return { ok: false, status: 401, code: "SESSION_INACTIVE", error: "Session is no longer active" };
  }

  const db = await getPrisma();
  if (!db) {
    return { ok: false, status: 503, code: "OWNER_CONTEXT_UNAVAILABLE", error: "Compliance context is temporarily unavailable" };
  }

  let members: { organizationId: string; role: OrgRole }[];
  try {
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const rows = await memberModel.findMany({
      where: { userId: payload.sub, status: "ACTIVE" },
      select: { organizationId: true, role: true },
    });
    members = rows.map((r) => ({ organizationId: String(r.organizationId), role: String(r.role) as OrgRole }));
  } catch {
    return { ok: false, status: 503, code: "OWNER_CONTEXT_UNAVAILABLE", error: "Compliance context is temporarily unavailable" };
  }

  const scope = resolveOrgScope({ activeOrgIds: members.map((m) => m.organizationId), activeOrgHint: null });
  if (scope.ambiguous) {
    logAuthzDenial({ operation, reason: "active_org_ambiguous", userId: payload.sub });
    return { ok: false, status: 409, code: "ACTIVE_ORGANIZATION_REQUIRED", error: "An active organization must be selected" };
  }
  if (!scope.orgId) {
    logAuthzDenial({ operation, reason: "no_active_org", userId: payload.sub });
    return { ok: false, status: 403, code: "ORGANIZATION_SCOPE_REQUIRED", error: "An active organization membership is required" };
  }

  const role = members.find((m) => m.organizationId === scope.orgId)?.role;
  if (!role) {
    return { ok: false, status: 403, code: "ORGANIZATION_SCOPE_REQUIRED", error: "An active organization membership is required" };
  }
  if (!requirePermission(role, perm).ok) {
    logAuthzDenial({ operation, reason: "insufficient_permission", userId: payload.sub, orgId: scope.orgId, role });
    return { ok: false, status: 403, code: "INSUFFICIENT_PERMISSION", error: "Insufficient organization permissions" };
  }

  return { ok: true, userId: payload.sub, organizationId: scope.orgId, role };
}

/**
 * Platform-superadmin gate for GLOBAL (organization-less) legal templates — the
 * strictest existing boundary. An ordinary org admin never passes this.
 */
export async function requirePlatformSuperadmin(
  req: NextRequest,
  operation = "compliance.platform",
): Promise<PlatformScope> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  if (!payload?.sub) {
    logAuthFailure({ operation, reason: "no_session" });
    return { ok: false, status: 401, code: "AUTHENTICATION_REQUIRED", error: "Authentication required" };
  }
  if (!(await isPayloadSessionActive(payload))) {
    logAuthzDenial({ operation, reason: "session_revoked", userId: payload.sub });
    return { ok: false, status: 401, code: "SESSION_INACTIVE", error: "Session is no longer active" };
  }
  if (payload.role !== "superadmin") {
    logAuthzDenial({ operation, reason: "not_platform_admin", userId: payload.sub, role: payload.role });
    return { ok: false, status: 403, code: "PLATFORM_ADMIN_REQUIRED", error: "Platform administrator access required" };
  }
  return { ok: true, userId: payload.sub, role: payload.role };
}
