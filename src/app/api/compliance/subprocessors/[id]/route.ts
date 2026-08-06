import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  getSubprocessorForOrg, updateGovernanceRecordForOrg,
  transitionGovernanceRecordForOrg, approveSubprocessorForOrg,
} from "@/lib/compliance/transfer-db";
import { updateSubprocessorSchema, toSubprocessorDto } from "@/lib/compliance/transfer-schema";
import {
  isGovernanceLifecycle, governanceTransitionAction, assessSubprocessorProviderPolicy,
  type GovernanceAction,
} from "@/lib/compliance/transfer-governance";
import { prismaProviderPolicyStore } from "@/lib/ai-governance/runtime/policy-store";

const ACTION_PERMISSION: Record<GovernanceAction, OrgPermission> = {
  manage:  "manage_transfer_governance",
  approve: "approve_transfer_governance",
};
const REVIEW_KEYS = ["contractReviewStatus", "privacyReviewStatus", "securityReviewStatus"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.subprocessor.get");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getSubprocessorForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ subprocessor: toSubprocessorDto(row) });
}

/**
 * Update (DRAFT/UNDER_REVIEW only — approved evidence is immutable except via the
 * explicit supersession transition) or transition a subprocessor.
 *
 * SECURITY — approval (UNDER_REVIEW→APPROVED) and activation (APPROVED→ACTIVE) are
 * OWNER-gated and evaluated on the ROW-LOCKED record: all three reviews must be
 * positively complete AND, when the record links a Phase 95 provider, the tenant's
 * stored provider policy is evaluated READ-ONLY through the real Phase 95 evaluator.
 * A Phase 95 denial always wins; a missing policy fails closed as
 * configuration-required; no provider is ever contacted.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_transfer_governance", "compliance.subprocessor.update");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { transition?: string; update?: unknown } | null;
  if (!body || (typeof body.transition !== "string" && body.update === undefined)) {
    return NextResponse.json({ error: "transition or update is required", code: "INVALID_INPUT" }, { status: 400 });
  }

  const row = await getSubprocessorForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // ── Material / review update ────────────────────────────────────────────────
  if (body.update !== undefined) {
    if (!requirePermission(scope.role, "manage_transfer_governance").ok) {
      return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
    }
    const parsed = updateSubprocessorSchema.safeParse(body.update);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });
    const reviewTouched = REVIEW_KEYS.some((k) => parsed.data[k] !== undefined);
    const result = await updateGovernanceRecordForOrg({
      register: "subprocessor", id, organizationId: scope.organizationId, actorId: scope.userId,
      data: parsed.data as Record<string, unknown>, reviewTouched, now: new Date(),
    });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      const code = result.reason === "IMMUTABLE_LIFECYCLE" ? "IMMUTABLE_LIFECYCLE" : "CONFLICT";
      return NextResponse.json({ error: "Update rejected", code }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.SUBPROCESSOR_UPDATED, entityType: "Subprocessor", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { reviewTouched, fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ subprocessor: toSubprocessorDto(result.row as never) });
  }

  // ── Lifecycle transition ────────────────────────────────────────────────────
  const to = body.transition as string;
  if (!isGovernanceLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
  const action = governanceTransitionAction(row.lifecycle, to);
  if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
  if (!requirePermission(scope.role, ACTION_PERMISSION[action]).ok) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }

  if (to === "APPROVED" || to === "ACTIVE") {
    // Read-only Phase 95 policy fetch (fail-closed null). The gate itself is
    // evaluated inside the transaction on the LOCKED row's providerRegistryId — a
    // concurrently-changed provider link denies via the evaluator's identity check.
    const policy = row.providerRegistryId
      ? await prismaProviderPolicyStore().find(scope.organizationId, row.providerRegistryId)
      : null;
    const externalAiEnabled = process.env.HERMES_EXTERNAL_AI_ENABLED === "1";
    const now = new Date();
    const result = await approveSubprocessorForOrg({
      id, organizationId: scope.organizationId, actorId: scope.userId,
      from: to === "APPROVED" ? "UNDER_REVIEW" : "APPROVED", to,
      providerGate: (locked) => assessSubprocessorProviderPolicy({
        organizationId: scope.organizationId, providerRegistryId: locked.providerRegistryId,
        policy, externalAiEnabled, now,
      }),
      now,
    });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      if (result.reason === "NOT_APPROVABLE") {
        return NextResponse.json({ error: "Approval gates not satisfied", code: "NOT_APPROVABLE", blockers: result.blockers ?? [] }, { status: 409 });
      }
      return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
    }
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.SUBPROCESSOR_APPROVED, entityType: "Subprocessor", entityId: id,
      organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { fromLifecycle: row.lifecycle, toLifecycle: to },
    });
    return NextResponse.json({ subprocessor: toSubprocessorDto(result.row) });
  }

  const { affected } = await transitionGovernanceRecordForOrg({
    register: "subprocessor", id, organizationId: scope.organizationId, actorId: scope.userId,
    from: row.lifecycle, to, now: new Date(),
  });
  if (affected !== 1) return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });

  await recordAuditEvent({
    userId: scope.userId, action: COMPLIANCE_AUDIT.SUBPROCESSOR_TRANSITIONED, entityType: "Subprocessor", entityId: id,
    organizationId: scope.organizationId, outcome: "SUCCESS",
    metadata: { fromLifecycle: row.lifecycle, toLifecycle: to, action },
  });
  const updated = await getSubprocessorForOrg(id, scope.organizationId);
  return NextResponse.json({ subprocessor: updated ? toSubprocessorDto(updated) : null });
}
