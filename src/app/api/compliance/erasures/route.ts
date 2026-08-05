import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { getPrivacyRequestForOrg }    from "@/lib/compliance/db";
import {
  listErasureJobsForOrg,
  createErasureJobForParent,
  getActiveErasureJobForParent,
} from "@/lib/compliance/erasure-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { assessParentErasureEligibility } from "@/lib/compliance/erasure-lifecycle";
import { toErasureJobDto }             from "@/lib/compliance/erasure-view";

/**
 * Governed subject-data erasure jobs (Phase 97 Part H) — org-scoped.
 *
 * SECURITY — a child erasure job may only be created from an APPROVED parent
 * PrivacyRequest in the SAME organization; the subject and org come from the
 * server-validated parent, never the client. Identity verification must be complete,
 * the request type deletion-compatible and the subject a USER (a Candidate parent is
 * rejected before any child is created). Creation is idempotent (one active job per
 * parent). Audit = identifiers + closed enums only.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_erasures", "compliance.erasure.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const rows = await listErasureJobsForOrg(scope.organizationId);
  return NextResponse.json({ erasures: rows.map(toErasureJobDto) });
}

export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "manage_erasures", "compliance.erasure.create");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const body = await req.json().catch(() => null) as { privacyRequestId?: string } | null;
  const privacyRequestId = typeof body?.privacyRequestId === "string" ? body.privacyRequestId.trim() : "";
  if (!privacyRequestId) return NextResponse.json({ error: "privacyRequestId is required", code: "INVALID_INPUT" }, { status: 400 });

  // The parent is read WITHIN the caller's org — a foreign parent yields 404, and its
  // subject/org can never be broadened by client input.
  const parent = await getPrivacyRequestForOrg(privacyRequestId, scope.organizationId);
  if (!parent) return NextResponse.json({ error: "Parent request not found", code: "NOT_FOUND" }, { status: 404 });

  // Idempotent-first: an already-active child job is returned as-is regardless of the
  // parent's current state, so a retry never fails or duplicates.
  const active = await getActiveErasureJobForParent(privacyRequestId, scope.organizationId);
  if (active) return NextResponse.json({ erasure: toErasureJobDto(active), idempotent: true });

  // Otherwise a NEW job requires an exactly-APPROVED, identity-verified, USER-subject,
  // deletion-typed parent (PARTIALLY_APPROVED / FULFILMENT_IN_PROGRESS / Candidate fail closed).
  const eligibility = assessParentErasureEligibility(parent);
  if (!eligibility.ok) {
    return NextResponse.json({ error: "Parent request not eligible for erasure", code: eligibility.code }, { status: 409 });
  }

  const created = await createErasureJobForParent({
    parent: { id: parent.id, organizationId: scope.organizationId, userId: parent.userId, email: parent.email, locale: parent.locale },
    actorId: scope.userId,
  });
  if (!created.ok) {
    if (created.reason === "DUPLICATE") {
      const existing = await getActiveErasureJobForParent(privacyRequestId, scope.organizationId);
      if (existing) return NextResponse.json({ erasure: toErasureJobDto(existing), idempotent: true });
    }
    return NextResponse.json({ error: "Could not create erasure job", code: "PERSIST_FAILED" }, { status: 503 });
  }

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.ERASURE_JOB_CREATED,
    entityType: "DataDeletionRequest",
    entityId: created.job.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    metadata: { privacyRequestId, lifecycle: created.job.lifecycle, subjectClass: created.job.subjectClass },
  });

  return NextResponse.json({ erasure: toErasureJobDto(created.job) }, { status: 201 });
}
