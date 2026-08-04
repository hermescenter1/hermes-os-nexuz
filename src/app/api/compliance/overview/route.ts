import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getComplianceStats, getLegalDocumentsForOrg, getPrivacyRequests } from "@/lib/compliance/db";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";

/**
 * Compliance overview for the caller's organization.
 *
 * SECURITY (Phase 97) — replaces the legacy `resolveAdmin` helper with the
 * authoritative `requireComplianceOrgScope`. The org is derived server-side, a
 * multi-org actor fails closed (409) rather than being shown an arbitrary
 * tenant's figures, and `view_compliance` is enforced. Documents are read through
 * the strict tenant-scoped `getLegalDocumentsForOrg`.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.overview");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }

  const [stats, documents, pendingRequests] = await Promise.all([
    getComplianceStats(scope.organizationId),
    getLegalDocumentsForOrg(scope.organizationId),
    getPrivacyRequests({ organizationId: scope.organizationId, status: "PENDING", take: 5 }),
  ]);

  return NextResponse.json({ stats, documents, pendingRequests });
}
