import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import {
  getPrivacyRequestForOrg,
  updatePrivacyRequestStatusForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import type { PrivacyRequestStatus }  from "@/lib/compliance/types";
import {
  ALL_PRIVACY_REQUEST_STATUSES,
  canTransitionPrivacyRequest,
} from "@/lib/compliance/privacy-request-lifecycle";

const VALID_STATUSES: PrivacyRequestStatus[] = ALL_PRIVACY_REQUEST_STATUSES;

/**
 * Transition a PrivacyRequest's status.
 *
 * SECURITY (compliance hotfix + Phase 97) — the actor's organization is resolved
 * server-side and the mutation is tenant-scoped in the database (both the
 * request id AND the authoritative organization id are in the write predicate).
 * A request belonging to another tenant, or a random/unknown id, yields a
 * uniform 404 with no existence oracle. The target status must be a member of the
 * closed vocabulary AND the closed state machine must allow the current→target
 * transition — an arbitrary or out-of-order status is rejected (409). Only
 * allow-listed identifiers and closed-enum status values are audited — never
 * request free text, response notes, email, IP or user agent.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireComplianceOrgScope(req, "manage_privacy_requests", "compliance.privacy_request.update");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }

  const { id } = await params;
  // `organizationId` is NEVER read from the body — the authoritative scope wins.
  const body = await req.json().catch(() => null) as { status?: string; responseNote?: string } | null;
  if (!body || !VALID_STATUSES.includes(body.status as PrivacyRequestStatus)) {
    return NextResponse.json({ error: "Invalid status", code: "INVALID_STATUS" }, { status: 400 });
  }
  const newStatus = body.status as PrivacyRequestStatus;
  // Safe boolean only — records THAT the note was set, never its value/length/hash.
  const responseNoteUpdated = typeof body.responseNote === "string";

  // Read the current row ONLY within the caller's org (for the previous-status
  // audit value and a uniform not-found response). Both this read and the write
  // below carry the tenant predicate.
  const existing = await getPrivacyRequestForOrg(id, scope.organizationId);
  if (!existing) {
    return NextResponse.json({ error: "Request not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Closed state-machine guard — reject any transition the machine does not allow
  // (including no-op self transitions and transitions out of a terminal state).
  if (!canTransitionPrivacyRequest(existing.status, newStatus)) {
    return NextResponse.json(
      { error: "Transition not allowed", code: "INVALID_TRANSITION" },
      { status: 409 },
    );
  }

  const { affected } = await updatePrivacyRequestStatusForOrg({
    id,
    organizationId: scope.organizationId,
    status:         newStatus,
    reviewedBy:     scope.userId,
    responseNote:   responseNoteUpdated ? body.responseNote : null,
  });
  if (affected !== 1) {
    return NextResponse.json({ error: "Request not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Allow-listed audit metadata only — identifiers + closed-enum status values.
  await recordAuditEvent({
    userId:         scope.userId,
    action:         COMPLIANCE_AUDIT.PRIVACY_REQUEST_STATUS_CHANGED,
    entityType:     "PrivacyRequest",
    entityId:       id,
    organizationId: scope.organizationId,
    outcome:        "SUCCESS",
    metadata:       { previousStatus: existing.status, newStatus, responseNoteUpdated },
  });

  const updated = await getPrivacyRequestForOrg(id, scope.organizationId);
  return NextResponse.json({ request: updated });
}
