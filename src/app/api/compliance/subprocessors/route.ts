import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { listSubprocessorsForOrg, createSubprocessorForOrg } from "@/lib/compliance/transfer-db";
import { createSubprocessorSchema, toSubprocessorDto } from "@/lib/compliance/transfer-schema";

/**
 * Tenant subprocessor register (Phase 97 Part I) — org-scoped.
 *
 * SECURITY — the organizationId is ALWAYS the server-derived compliance scope; the
 * strict schema rejects any client-supplied organizationId/lifecycle/attribution
 * key. New records start in DRAFT with every review status quarantined as
 * REVIEW_REQUIRED — approval requires positively-complete reviews plus (for a
 * provider-linked record) the read-only Phase 95 provider-policy gate.
 * Audit = identifiers + closed status codes only.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.subprocessor.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listSubprocessorsForOrg(scope.organizationId);
  return NextResponse.json({ subprocessors: rows.map(toSubprocessorDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_transfer_governance", "compliance.subprocessor.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const body = await req.json().catch(() => null);
  const parsed = createSubprocessorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });

  const row = await createSubprocessorForOrg({ organizationId: scope.organizationId, actorId: scope.userId, data: parsed.data });
  if (!row) return NextResponse.json({ error: "Could not create subprocessor", code: "PERSIST_FAILED" }, { status: 503 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.SUBPROCESSOR_CREATED,
    entityType: "Subprocessor",
    entityId: row.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { lifecycle: row.lifecycle },
  });

  return NextResponse.json({ subprocessor: toSubprocessorDto(row) }, { status: 201 });
}
