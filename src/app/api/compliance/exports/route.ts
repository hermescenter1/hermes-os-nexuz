import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { getPrivacyRequestForOrg }    from "@/lib/compliance/db";
import {
  listExportJobsForOrg,
  createExportJobForParent,
  getActiveExportJobForParent,
} from "@/lib/compliance/export-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { assessParentExportEligibility } from "@/lib/compliance/export-lifecycle";
import { toExportJobDto }              from "@/lib/compliance/export-view";

/**
 * Governed subject-data export jobs (Phase 97 Part G) — org-scoped.
 *
 * SECURITY — a child export job may only be created from an APPROVED parent
 * PrivacyRequest in the SAME organization; the subject and org come from the
 * server-validated parent, never the client. Identity verification must be
 * complete and the request type export-compatible. Creation is idempotent (one
 * active job per parent). Audit = identifiers + closed enums only.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_exports", "compliance.export.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listExportJobsForOrg(scope.organizationId);
  return NextResponse.json({ exports: rows.map(toExportJobDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_exports", "compliance.export.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const body = await req.json().catch(() => null) as { privacyRequestId?: string } | null;
  const privacyRequestId = typeof body?.privacyRequestId === "string" ? body.privacyRequestId.trim() : "";
  if (!privacyRequestId) return NextResponse.json({ error: "privacyRequestId is required", code: "INVALID_INPUT" }, { status: 400 });

  // The parent is read WITHIN the caller's org — a foreign parent yields 404, and
  // its subject/org can never be broadened by client input.
  const parent = await getPrivacyRequestForOrg(privacyRequestId, scope.organizationId);
  if (!parent) return NextResponse.json({ error: "Parent request not found", code: "NOT_FOUND" }, { status: 404 });

  // Idempotent-first (Finding 4): an already-active child job is returned as-is,
  // regardless of the parent's current state — so a retry never fails or duplicates.
  const active = await getActiveExportJobForParent(privacyRequestId, scope.organizationId);
  if (active) return NextResponse.json({ export: toExportJobDto(active), idempotent: true });

  // Otherwise a NEW job requires an exactly-APPROVED, identity-verified, USER-subject
  // parent (PARTIALLY_APPROVED / FULFILMENT_IN_PROGRESS / Candidate are fail-closed).
  const eligibility = assessParentExportEligibility(parent);
  if (!eligibility.ok) {
    return NextResponse.json({ error: "Parent request not eligible for export", code: eligibility.code }, { status: 409 });
  }

  const created = await createExportJobForParent({
    parent: {
      id: parent.id, organizationId: scope.organizationId, userId: parent.userId,
      candidateId: parent.candidateId, email: parent.email, locale: parent.locale,
    },
    actorId: scope.userId,
  });
  if (!created.ok) {
    if (created.reason === "DUPLICATE") {
      const existing = await getActiveExportJobForParent(privacyRequestId, scope.organizationId);
      if (existing) return NextResponse.json({ export: toExportJobDto(existing), idempotent: true });
    }
    return NextResponse.json({ error: "Could not create export job", code: "PERSIST_FAILED" }, { status: 503 });
  }

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.EXPORT_JOB_CREATED,
    entityType: "DataExportRequest",
    entityId: created.job.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { privacyRequestId, lifecycle: created.job.lifecycle, subjectClass: created.job.subjectClass },
  });

  return NextResponse.json({ export: toExportJobDto(created.job) }, { status: 201 });
}
