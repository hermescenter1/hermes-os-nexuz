import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";
import { getEvidencePackForOrg, getEvidencePackItemsForOrg } from "@/lib/compliance/evidence-pack-db";
import { toEvidencePackDto } from "@/lib/compliance/evidence-schema";
import type { DbComplianceEvidencePackItem } from "@/lib/compliance/types";

function toItemDto(row: DbComplianceEvidencePackItem) {
  return {
    sequence:        row.sequence,
    entityType:      row.entityType,
    entityId:        row.entityId,
    evidenceCode:    row.evidenceCode,
    evidenceStatus:  row.evidenceStatus,
    evidenceHash:    row.evidenceHash,
    sourceVersion:   row.sourceVersion,
    sourceUpdatedAt: row.sourceUpdatedAt,
    safeMetadata:    row.safeMetadata,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_evidence", "compliance.evidence_pack.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getEvidencePackForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const items = await getEvidencePackItemsForOrg(id, scope.organizationId);
  return NextResponse.json({ pack: toEvidencePackDto(row), items: items.map(toItemDto) });
}
