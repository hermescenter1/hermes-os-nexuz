import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  listDataTransfersForOrg, createDataTransferForOrg,
  getSubprocessorForOrg, getProcessingActivityIdForOrg,
} from "@/lib/compliance/transfer-db";
import { createDataTransferSchema, toDataTransferDto } from "@/lib/compliance/transfer-schema";

/**
 * Tenant data-transfer register (Phase 97 Part I) — org-scoped.
 *
 * SECURITY — organizationId is always the server-derived compliance scope; the
 * strict schema rejects client-supplied scope/attribution keys. A linked
 * Subprocessor / ProcessingActivity must exist WITHIN the same organization (a
 * valid foreign-tenant id yields the uniform 404) and the composite tuple FKs
 * enforce the same rule at the database layer. New records start DRAFT with
 * mechanism/legal/risk quarantined (LEGAL_REVIEW_REQUIRED / REVIEW_REQUIRED) — no
 * adequacy or contractual coverage is ever inferred.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.transfer.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listDataTransfersForOrg(scope.organizationId);
  return NextResponse.json({ transfers: rows.map(toDataTransferDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_transfer_governance", "compliance.transfer.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const body = await req.json().catch(() => null);
  const parsed = createDataTransferSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  // Same-org relation validation (server-side; DB composite FKs back-stop it).
  if (parsed.data.subprocessorId) {
    const sp = await getSubprocessorForOrg(parsed.data.subprocessorId, scope.organizationId);
    if (!sp) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }
  if (parsed.data.processingActivityId) {
    const pa = await getProcessingActivityIdForOrg(parsed.data.processingActivityId, scope.organizationId);
    if (!pa) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const row = await createDataTransferForOrg({ organizationId: scope.organizationId, actorId: scope.userId, data: parsed.data });
  if (!row) return NextResponse.json({ error: "Could not create transfer", code: "PERSIST_FAILED" }, { status: 503 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.DATA_TRANSFER_CREATED,
    entityType: "DataTransfer",
    entityId: row.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { lifecycle: row.lifecycle, subprocessorId: row.subprocessorId, processingActivityId: row.processingActivityId },
  });

  return NextResponse.json({ transfer: toDataTransferDto(row) }, { status: 201 });
}
