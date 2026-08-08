import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  listRetentionPoliciesForOrg,
  createRetentionPolicyForOrg,
  getRetentionPolicyForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  createRetentionPolicySchema,
  toRetentionCreateData,
  toRetentionPolicyDto,
} from "@/lib/compliance/retention-schema";

/**
 * Retention policy registry (Phase 97 Part E) — org-scoped, planning only.
 *
 * SECURITY — org derived server-side; reads/writes tenant-scoped in the DB. New
 * policies are dry-run and disabled by default and default to fail-closed
 * classifications (no invented duration). Audit = closed-enum classifications
 * only. Destructive execution is NOT implemented in this slice.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.retention_policy.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listRetentionPoliciesForOrg(scope.organizationId);
  return NextResponse.json({ policies: rows.map(toRetentionPolicyDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_retention", "compliance.retention_policy.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const parsed = createRetentionPolicySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid retention policy", code: "INVALID_INPUT" }, { status: 400 });
  }

  const created = await createRetentionPolicyForOrg({
    organizationId: scope.organizationId,
    createdBy:      scope.userId,
    data:           toRetentionCreateData(parsed.data),
  });
  if (!created) return NextResponse.json({ error: "Could not create policy", code: "PERSIST_FAILED" }, { status: 503 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.RETENTION_POLICY_CREATED,
    entityType: "RetentionPolicy",
    entityId: created.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { action: created.action, approvalState: created.approvalState, enabled: created.enabled, dryRunOnly: created.dryRunOnly },
  });

  const row = await getRetentionPolicyForOrg(created.id, scope.organizationId);
  return NextResponse.json({ policy: row ? toRetentionPolicyDto(row) : null }, { status: 201 });
}
