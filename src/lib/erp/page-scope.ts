/**
 * Server-component scope for tenant-scoped ERP pages (HRIS-0.5A).
 * Same gates as the API: platform admin capability, then the server-side active
 * organization, then the OrgPermission. A page never receives an organization
 * from the URL.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { newRequestId } from "@/lib/logger/correlation";
import type { ErpCtx } from "./db";
import { getActiveOrganizationContext } from "./active-organization";
import { ErpError, listErpMemberships, type ErpFailureCode } from "./tenant";

export type ErpPageScope =
  | { ok: true; ctx: ErpCtx }
  | { ok: false; code: ErpFailureCode; memberships: Array<{ organizationId: string; name: string }> };

export async function resolveErpPageScope(permission: OrgPermission = "view_erp"): Promise<ErpPageScope> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTHENTICATION_REQUIRED", memberships: [] };
  if (!can(user.role, "admin")) return { ok: false, code: "FORBIDDEN", memberships: [] };

  const active = await getActiveOrganizationContext();
  if (!active.ok) {
    const memberships = active.error.code === "ACTIVE_ORGANIZATION_REQUIRED" ? await listErpMemberships(user.id) : [];
    return { ok: false, code: active.error.code, memberships };
  }
  const allowed = requirePermission(active.scope.role, permission);
  if (!allowed.ok) return { ok: false, code: "FORBIDDEN", memberships: [] };
  return { ok: true, ctx: { scope: active.scope, correlationId: newRequestId() } };
}

/** Maps a thrown error from a data call to the code a page should render. */
export function pageErrorCode(err: unknown): ErpFailureCode {
  return err instanceof ErpError ? err.code : "SERVICE_UNAVAILABLE";
}
