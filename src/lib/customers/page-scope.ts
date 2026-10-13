/**
 * Who may open the customer pages, and with what — resolved on the server for
 * every request (Executive Management Center slice G2).
 *
 * The same trust chain as the customer API: signed session -> the session's
 * server-side active organization -> an ACTIVE membership re-read now ->
 * `view_customers` for its role. Nothing here reads an organization from the
 * URL or the request. A member with several organizations and no selection
 * gets the organization chooser, never a guess.
 *
 * Deliberately NOT the executive scope: that one also demands the platform
 * admin capability and an executive axis, and customers are a tenant surface a
 * sales manager must be able to open. The API enforces the same rules
 * independently; hiding a control in the page is a convenience, not the gate.
 */

import { currentSessionIdentity, resolveActiveOrganization } from "@/lib/erp/active-organization";
import { listErpMemberships, type ErpFailureCode } from "@/lib/erp/tenant";
import { can } from "@/lib/org/rbac";
import type { OrganizationRole } from "@/lib/tenant/contract";

export interface CustomerPageScope {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: string;
  readonly canManage: boolean;
  /** Project data on a customer is ERP data: reading needs view_erp, linking manage_erp. */
  readonly canViewProjects: boolean;
  readonly canLinkProjects: boolean;
}

export type CustomerPageScopeResult =
  | { readonly ok: true; readonly scope: CustomerPageScope }
  | {
      readonly ok: false;
      readonly code: ErpFailureCode;
      readonly memberships: ReadonlyArray<{ organizationId: string; name: string }>;
    };

export async function resolveCustomerPageScope(): Promise<CustomerPageScopeResult> {
  const identity = await currentSessionIdentity();
  if (!identity) return { ok: false, code: "AUTHENTICATION_REQUIRED", memberships: [] };

  const active = await resolveActiveOrganization(identity);
  if (!active.ok) {
    const memberships =
      active.error.code === "ACTIVE_ORGANIZATION_REQUIRED" ? await listErpMemberships(identity.userId) : [];
    return { ok: false, code: active.error.code, memberships };
  }

  const role = active.scope.role as OrganizationRole;
  if (!can(role, "view_customers")) return { ok: false, code: "FORBIDDEN", memberships: [] };

  return {
    ok: true,
    scope: {
      organizationId: active.scope.organizationId,
      userId: active.scope.userId,
      role: String(active.scope.role),
      canManage: can(role, "manage_customers"),
      canViewProjects: can(role, "view_erp"),
      canLinkProjects: can(role, "manage_customers") && can(role, "manage_erp"),
    },
  };
}
