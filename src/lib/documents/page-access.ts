import { can } from "@/lib/org/rbac";
import type { DataScopeRefusal } from "@/lib/data-access/tenant-scope";
import {
  resolveTenantDecisionFromSession,
  type TenantDecision,
} from "@/lib/tenant-selection/selection";

/**
 * F-2 — who may open the organization document pages, and what they may do.
 *
 * The pages ask the SAME question the `/api/documents*` handlers ask, from the
 * same resolver: the organization of the verified session (revocation checked,
 * stored selection applied, ACTIVE membership proven) and the caller's role IN
 * that organization. Nothing here reads a request value, and there is no
 * platform-role shortcut — a platform admin who is not an ACTIVE member of the
 * resolved organization is refused like anyone else.
 *
 * The page result is presentation only. Every read and write is re-authorized
 * by the API on its own request, so a stale page can never do more than the
 * server allows at the moment it acts.
 *
 * Session storage mode (no database) has no membership table, so the resolver
 * cannot prove a membership and every caller is refused — deliberately
 * fail-closed; see docs/industrial/f2-document-tenant-ownership-proposal.md §11.
 */

export type DocumentPageAccess =
  | {
      readonly granted: true;
      readonly organizationId: string;
      /** `manage_documents`: upload, process and delete. */
      readonly canManage: boolean;
    }
  | { readonly granted: false; readonly code: DataScopeRefusal };

export function documentPageAccessFromDecision(decision: TenantDecision): DocumentPageAccess {
  if (!decision.granted) return { granted: false, code: decision.code };
  if (!can(decision.organizationRole, "view_documents")) return { granted: false, code: "FORBIDDEN" };
  return {
    granted: true,
    organizationId: decision.organizationId,
    canManage: can(decision.organizationRole, "manage_documents"),
  };
}

export async function resolveDocumentPageAccess(jar: {
  get: (name: string) => { value: string } | undefined;
}): Promise<DocumentPageAccess> {
  let decision: TenantDecision;
  try {
    decision = await resolveTenantDecisionFromSession(jar);
  } catch {
    // An outage is not a refusal of the caller: say "try again", never "denied".
    return { granted: false, code: "ORGANIZATION_CONTEXT_UNAVAILABLE" };
  }
  return documentPageAccessFromDecision(decision);
}
