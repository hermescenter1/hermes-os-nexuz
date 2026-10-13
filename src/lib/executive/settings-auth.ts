/**
 * Executive Management Center — the guard for changing an organization's
 * reporting settings.
 *
 * Changing the zone or the day cutoff changes which records every figure and
 * every future nightly report covers, so it is an organization-administration
 * act, not a reading one. The checks run in this order and the first failure
 * wins:
 *
 *   1. trusted Origin — the request is cookie-authenticated, so a cross-site
 *      form must not be able to cause it (CSRF);
 *   2. a JSON body — a form post or a text body is refused before it is read;
 *   3. the executive scope — session, server-side active organization, ACTIVE
 *      membership, re-read on this request;
 *   4. `update_org` on that organization — OWNER or ADMIN.
 *
 * The organization written to is ALWAYS the server-resolved one from step 3.
 * Nothing in the body or the URL can name another.
 */

import type { NextRequest } from "next/server";
import { can as orgCan } from "@/lib/org/rbac";
import { ORGANIZATION_ROLES, type OrganizationRole } from "@/lib/tenant/contract";
import { isJsonContentType, requireTrustedOrigin } from "@/lib/security/request-guards";
import { resolveExecutiveScope, statusForFailure } from "./scope";
import type { ExecutiveScope } from "./contract";

export type SettingsWriteAuth =
  | { readonly ok: true; readonly scope: ExecutiveScope }
  | { readonly ok: false; readonly status: number; readonly error: string };

/**
 * Whether a stored organization role may change the settings. A role string
 * that is not one of the known roles is refused, never coerced - an unknown
 * role must fail closed. Shared with the settings page so the form and the API
 * can never disagree about who may edit.
 */
export function canUpdateExecutiveSettings(role: string): boolean {
  const known = (ORGANIZATION_ROLES as readonly string[]).includes(role);
  return known && orgCan(role as OrganizationRole, "update_org");
}

export async function authorizeExecutiveSettingsWrite(req: NextRequest): Promise<SettingsWriteAuth> {
  if (!requireTrustedOrigin(req, "jwt").ok) {
    return { ok: false, status: 403, error: "ORIGIN_NOT_ALLOWED" };
  }
  if (!isJsonContentType(req)) {
    return { ok: false, status: 415, error: "UNSUPPORTED_MEDIA_TYPE" };
  }
  const resolved = await resolveExecutiveScope();
  if (!resolved.ok) {
    return { ok: false, status: statusForFailure(resolved.code), error: resolved.code };
  }
  if (!canUpdateExecutiveSettings(resolved.scope.role)) {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }
  return { ok: true, scope: resolved.scope };
}
