import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { getPrisma }                  from "@/lib/db/prisma";
import {
  getUnassignedPrivacyRequest,
  assignPrivacyRequestToOrg,
} from "@/lib/compliance/db";
import { requirePlatformSuperadmin }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  readPrivacyDeadlinePolicyConfig,
  resolvePrivacyDeadlines,
} from "@/lib/compliance/privacy-request-lifecycle";

/**
 * Assign an UNASSIGNED public privacy request to an organization.
 *
 * SECURITY (Phase 97) — the platform boundary only. `requirePlatformSuperadmin`
 * gates this; no tenant administrator can assign. Here the target organizationId
 * IS a legitimate input — a platform operator is deciding which tenant owns the
 * request — but it is validated to exist, and the write predicate carries
 * `organizationId: null` so a request that is already assigned (to any tenant)
 * can never be reassigned or hijacked. Deadline clocks are populated only when an
 * owner has configured a policy; otherwise they stay null and the response
 * reports DEADLINE_POLICY_STATUS=CONFIGURATION_REQUIRED (no duration is invented).
 * The assignment is audited with identifiers and closed-enum values only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const platform = await requirePlatformSuperadmin(req, "compliance.privacy_request.assign");
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null) as { organizationId?: string } | null;
  const targetOrgId = typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
  if (!targetOrgId) {
    return NextResponse.json({ error: "organizationId is required", code: "INVALID_INPUT" }, { status: 400 });
  }

  // The request must exist AND be unassigned. A uniform 404 avoids disclosing
  // whether a matching-but-already-assigned request exists.
  const existing = await getUnassignedPrivacyRequest(id);
  if (!existing) {
    return NextResponse.json({ error: "Unassigned request not found", code: "NOT_FOUND" }, { status: 404 });
  }

  // Validate the target organization exists (avoids a dangling assignment).
  const db = await getPrisma();
  if (!db) {
    return NextResponse.json({ error: "Compliance context unavailable", code: "OWNER_CONTEXT_UNAVAILABLE" }, { status: 503 });
  }
  const orgModel = (db as Record<string, unknown>).organization as {
    findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const org = await orgModel.findUnique({ where: { id: targetOrgId }, select: { id: true } });
  if (!org) {
    return NextResponse.json({ error: "Target organization not found", code: "ORG_NOT_FOUND" }, { status: 404 });
  }

  const policy = resolvePrivacyDeadlines(readPrivacyDeadlinePolicyConfig(), new Date(existing.createdAt));

  const { affected } = await assignPrivacyRequestToOrg({
    id,
    organizationId: targetOrgId,
    assignedById:   platform.userId,
    deadlines: policy.status === "CONFIGURED" ? {
      acknowledgementDueAt:      policy.acknowledgementDueAt,
      identityVerificationDueAt: policy.identityVerificationDueAt,
      responseDueAt:             policy.responseDueAt,
      extensionDueAt:            policy.extensionDueAt,
    } : undefined,
  });
  if (affected !== 1) {
    // Lost the race (assigned concurrently) or vanished — uniform 404.
    return NextResponse.json({ error: "Unassigned request not found", code: "NOT_FOUND" }, { status: 404 });
  }

  await recordAuditEvent({
    userId:         platform.userId,
    action:         COMPLIANCE_AUDIT.PRIVACY_REQUEST_ASSIGNED,
    entityType:     "PrivacyRequest",
    entityId:       id,
    organizationId: targetOrgId,
    outcome:        "SUCCESS",
    // Identifiers + closed-enum policy status only — never request free text.
    metadata: {
      previousStatus:      existing.status,
      newStatus:           "TRIAGED",
      deadlinePolicyStatus: policy.status,
    },
  });

  return NextResponse.json({
    assigned:             true,
    organizationId:       targetOrgId,
    deadlinePolicyStatus: policy.status,
  });
}
