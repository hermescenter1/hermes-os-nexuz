/**
 * Executive Management Center — the authorization scope.
 *
 * ONE GATE CHAIN, THREE INDEPENDENT AXES.
 *
 * The chain is the one HRIS-0.5 already established for tenant data and is not
 * widened here:
 *
 *   signed access token -> live session -> server-side ACTIVE organization
 *   -> ACTIVE OrganizationMember re-read now -> platform `admin` capability
 *
 * No organization, site, role or period is ever read from the client. The
 * organization comes from `getActiveOrganizationContext()`, which resolves a
 * server-side selection keyed by the session id; `ActiveOrganizationSelection`
 * is a pointer, never a grant, and membership is re-read on every call.
 *
 * On top of that chain this module resolves THREE axes separately, because the
 * brief requires that financial, workforce and industrial authority be checked
 * independently rather than collapsed into one "is a manager" boolean:
 *
 *   · operations — `view_erp`                 : projects, tasks, work orders, approvals
 *   · financial  — `view_erp_compensation`    : budget, actual cost, any money figure
 *   · industrial — `view_industrial` + sites  : plant connectivity, alerts, assets
 *   · customers  — `view_customers`           : the tenant's own customers and
 *                                               their overdue follow-ups
 *
 * A reader who holds one and not another gets OPERATIONAL sections for what they
 * hold and FORBIDDEN sections — with a stated reason — for what they do not. A
 * refused axis never renders as an empty or zero panel.
 *
 * SITE SCOPE is resolved through the canonical `getAllowedSiteIds()`: OWNER and
 * ADMIN resolve implicitly from `IndustrialSite`, every other role from explicit
 * `UserSite` rows. An empty list means "no accessible site" and every industrial
 * query fails closed before it reaches the database.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { can as platformCan } from "@/lib/auth/roles";
import { can as orgCan } from "@/lib/org/rbac";
import { newRequestId } from "@/lib/logger/correlation";
import { getAllowedSiteIds } from "@/lib/site/context";
import { getActiveOrganizationContext } from "@/lib/erp/active-organization";
import { ErpError, listErpMemberships, type ErpFailureCode } from "@/lib/erp/tenant";
import { loadExecutiveSettings } from "./settings";
// The shapes live in the pure contract layer so the aggregation can use them
// without importing this resolver and, through it, `next/headers`.
import type { ExecutiveAuthority, ExecutiveScope } from "./contract";

export type { ExecutiveAuthority, ExecutiveScope } from "./contract";

export type ExecutiveScopeResult =
  | { readonly ok: true; readonly scope: ExecutiveScope }
  | {
      readonly ok: false;
      readonly code: ExecutiveFailureCode;
      /** Offered only for ACTIVE_ORGANIZATION_REQUIRED, so the reader can choose. */
      readonly memberships: ReadonlyArray<{ organizationId: string; name: string }>;
    };

/**
 * Failure codes. Reused from the ERP vocabulary so the two surfaces answer with
 * one stable set, plus `NO_ACCESSIBLE_AXIS` for a member who holds none of the
 * three permissions — which is a refusal of the whole page, not of one panel.
 */
export type ExecutiveFailureCode = ErpFailureCode | "NO_ACCESSIBLE_AXIS";

/**
 * Resolve the caller's executive scope.
 *
 * Returns a refusal rather than throwing, and never discloses whether an
 * organization exists: a caller who is not an ACTIVE member of the selected
 * organization gets `NOT_FOUND`, the same answer as an unknown id.
 */
export async function resolveExecutiveScope(): Promise<ExecutiveScopeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "AUTHENTICATION_REQUIRED", memberships: [] };

  // The platform capability that already fronts every ERP tenant surface. Not
  // widened here: an executive view of tenant data is the same sensitivity class.
  if (!platformCan(user.role, "admin")) return { ok: false, code: "FORBIDDEN", memberships: [] };

  const active = await getActiveOrganizationContext();
  if (!active.ok) {
    const memberships =
      active.error.code === "ACTIVE_ORGANIZATION_REQUIRED" ? await listErpMemberships(user.id) : [];
    return { ok: false, code: active.error.code, memberships };
  }

  const { scope } = active;
  const authority: ExecutiveAuthority = {
    operations: orgCan(scope.role, "view_erp"),
    financial: orgCan(scope.role, "view_erp_compensation"),
    industrial: orgCan(scope.role, "view_industrial"),
    customers: orgCan(scope.role, "view_customers"),
  };

  // Holding none of them is a refusal of the page. Rendering an empty
  // dashboard here would tell the reader their organization has no activity.
  if (!authority.operations && !authority.financial && !authority.industrial && !authority.customers) {
    return { ok: false, code: "NO_ACCESSIBLE_AXIS", memberships: [] };
  }

  // Site resolution is skipped entirely when the industrial axis is refused, so
  // a reader without `view_industrial` causes no site query at all.
  const allowedSiteIds = authority.industrial
    ? await getAllowedSiteIds(scope.userId, scope.organizationId)
    : [];

  // The ORGANIZATION's zone and cutoff when it has set them, otherwise the
  // environment default. Read from the server-resolved organization, never
  // from the request: a client-chosen zone would move the day boundary and so
  // change which records every figure covers.
  const settings = await loadExecutiveSettings(scope.organizationId);

  return {
    ok: true,
    scope: {
      userId: scope.userId,
      organizationId: scope.organizationId,
      memberId: scope.memberId,
      role: scope.role,
      authority,
      allowedSiteIds,
      timeZone: settings.values.timeZone,
      dayCutoffMinutes: settings.values.dayCutoffMinutes,
      correlationId: newRequestId(),
      zoneSource: settings.source,
      zoneConfiguredValid:
        settings.source === "ORGANIZATION" || (settings.environmentValid && !settings.storedRowRejected),
    },
  };
}

/** HTTP status for a refusal. Mirrors the ERP mapping so clients need one table. */
export function statusForFailure(code: ExecutiveFailureCode): number {
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
    case "SESSION_REQUIRED":
      return 401;
    case "FORBIDDEN":
    case "NO_ACCESSIBLE_AXIS":
    case "ORIGIN_NOT_ALLOWED":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "ACTIVE_ORGANIZATION_REQUIRED":
      return 428;
    case "INVALID_REQUEST":
      return 400;
    default:
      return 503;
  }
}

export { ErpError };
