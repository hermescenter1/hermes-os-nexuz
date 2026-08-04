import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getLegalHoldForOrg,
  updateLegalHoldForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  updateLegalHoldSchema,
  toLegalHoldDto,
} from "@/lib/compliance/retention-schema";

// Closed hold status machine. RELEASED is terminal; a hold is never re-activated.
const HOLD_TRANSITIONS: Record<string, string[]> = {
  PROPOSED: ["ACTIVE", "RELEASED"],
  ACTIVE:   ["RELEASED"],
  RELEASED: [],
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.legal_hold.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getLegalHoldForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ hold: toLegalHoldDto(row) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_legal_hold", "compliance.legal_hold.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = updateLegalHoldSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid update", code: "INVALID_INPUT" }, { status: 400 });
  }

  const existing = await getLegalHoldForOrg(id, scope.organizationId);
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const input = parsed.data;
  const data: Record<string, unknown> = {};

  // Non-status field edits (only while not terminal).
  for (const k of ["name", "reasonClass", "subjectId", "resourceType", "resourceId", "processingActivityId", "incidentId"] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  for (const k of ["rangeStart", "rangeEnd", "startDate", "reviewDate"] as const) {
    if (input[k] !== undefined) data[k] = input[k] ? new Date(input[k] as string) : null;
  }

  // Status transition (closed machine) with server-set approval attribution.
  if (input.status !== undefined && input.status !== existing.status) {
    const allowed = HOLD_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(input.status)) {
      return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    }
    data.status = input.status;
    if (input.status === "ACTIVE") {
      data.approvedBy = scope.userId;
      data.approvedAt = new Date();
      if (!existing.startDate) data.startDate = new Date();
    } else if (input.status === "RELEASED") {
      data.releaseApprovedBy = scope.userId;
      data.releasedAt = new Date();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No effective change", code: "INVALID_INPUT" }, { status: 400 });
  }

  const { affected } = await updateLegalHoldForOrg({ id, organizationId: scope.organizationId, updatedBy: scope.userId, data });
  if (affected !== 1) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const row = await getLegalHoldForOrg(id, scope.organizationId);
  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.LEGAL_HOLD_UPDATED,
    entityType: "LegalHold",
    entityId: id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: {
      previousStatus: existing.status,
      newStatus: row?.status ?? existing.status,
      fieldsUpdated: Object.keys(data).sort(),
    },
  });

  return NextResponse.json({ hold: row ? toLegalHoldDto(row) : null });
}
