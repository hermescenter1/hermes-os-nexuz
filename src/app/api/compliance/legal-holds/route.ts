import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  listLegalHoldsForOrg,
  createLegalHoldForOrg,
  getLegalHoldForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  createLegalHoldSchema,
  toLegalHoldCreateData,
  toLegalHoldDto,
} from "@/lib/compliance/retention-schema";

/**
 * Legal hold registry (Phase 97 Part F) — org-scoped.
 *
 * SECURITY — org derived server-side; reads/writes tenant-scoped in the DB. A new
 * hold is created PROPOSED (never ACTIVE) — activation is a separate, audited
 * action. Free-text legal reasoning is not copied into general logs; only a
 * closed reason CLASS and identifiers are audited.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.legal_hold.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listLegalHoldsForOrg(scope.organizationId);
  return NextResponse.json({ holds: rows.map(toLegalHoldDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_legal_hold", "compliance.legal_hold.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const parsed = createLegalHoldSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid legal hold", code: "INVALID_INPUT" }, { status: 400 });

  const created = await createLegalHoldForOrg({
    organizationId: scope.organizationId,
    createdBy:      scope.userId,
    data:           toLegalHoldCreateData(parsed.data),
  });
  if (!created) return NextResponse.json({ error: "Could not create hold", code: "PERSIST_FAILED" }, { status: 503 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.LEGAL_HOLD_CREATED,
    entityType: "LegalHold",
    entityId: created.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { scopeType: created.scopeType, reasonClass: created.reasonClass, status: created.status },
  });

  const row = await getLegalHoldForOrg(created.id, scope.organizationId);
  return NextResponse.json({ hold: row ? toLegalHoldDto(row) : null }, { status: 201 });
}
