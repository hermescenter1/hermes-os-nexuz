import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";
import { getEvidencePackForOrg } from "@/lib/compliance/evidence-pack-db";

/**
 * Authenticated canonical manifest for one evidence pack. Tenant-predicated (foreign /
 * unknown ids are uniform NOT_FOUND); a pack without a generated manifest is NOT_FOUND.
 * The response carries the exact canonical manifest (sha256(stableStringify(manifest))
 * === manifestHash), the hash and the lifecycle so a revoked pack is visibly marked.
 * Never cached; nosniff. There is NO unauthenticated download route.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_evidence", "compliance.evidence_pack.manifest");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getEvidencePackForOrg(id, scope.organizationId);
  if (!row || row.manifestJson == null || row.manifestHash == null) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(
    { manifest: row.manifestJson, manifestHash: row.manifestHash, lifecycle: row.lifecycle, readiness: row.readiness, revoked: row.lifecycle === "REVOKED" },
    { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
