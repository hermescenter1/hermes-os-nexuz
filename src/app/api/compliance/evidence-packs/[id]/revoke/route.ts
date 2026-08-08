import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { revokeEvidencePackForOrg } from "@/lib/compliance/evidence-pack-db";
import { toEvidencePackDto } from "@/lib/compliance/evidence-schema";

/**
 * Governed revocation of a READY evidence pack (OWNER-only). The manifest + items are
 * PRESERVED (a revoked pack stays readable as historical evidence, visibly REVOKED);
 * revokedBy/revokedAt are server-derived. Foreign / unknown ids are uniform NOT_FOUND.
 * AuditLog is written after commit. There is no hard-delete.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "revoke_compliance_evidence", "compliance.evidence_pack.revoke");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const res = await revokeEvidencePackForOrg({ id, organizationId: scope.organizationId, actorId: scope.userId });
  if (!res.ok) {
    if (res.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    if (res.reason === "NOT_REVOCABLE") return NextResponse.json({ error: "Only a READY evidence pack may be revoked", code: "NOT_REVOCABLE" }, { status: 409 });
    return NextResponse.json({ error: "Evidence pack conflict", code: "CONFLICT" }, { status: 409 });
  }
  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.EVIDENCE_PACK_REVOKED, entityType: "ComplianceEvidencePack",
    entityId: id, organizationId: scope.organizationId, outcome: "SUCCESS",
    metadata: { lifecycle: res.row.lifecycle, manifestHash: res.row.manifestHash, itemCount: res.row.itemCount },
  });
  return NextResponse.json({ pack: toEvidencePackDto(res.row) });
}
