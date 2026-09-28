import type { ReactNode } from "react";
import { TENANT_RENDERED_ORGANIZATION_ATTRIBUTE } from "@/lib/tenant-selection/contract";

/**
 * F-2 — stamps the rendered organization onto the document pages.
 *
 * These pages render inside `PageShell`, not `AppShell`, so nothing above them
 * carries the `data-hermes-organization` stamp that `withTenantPrecondition`
 * reads. Without it every document write (upload, delete, process, search)
 * asserts no tenant and the server refuses it with 428.
 *
 * The id is the one `resolveDocumentPageAccess` proved for THIS render — the
 * same server-side derivation as `AppShell`, never a client value. The stamp
 * grants nothing: the routes re-resolve the tenant and re-prove membership on
 * every request, and refuse with 409 if this render and the session disagree.
 */
export function DocumentTenantStamp({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const tenantStamp = { [TENANT_RENDERED_ORGANIZATION_ATTRIBUTE]: organizationId };
  return <div {...tenantStamp}>{children}</div>;
}
