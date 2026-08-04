import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { getExportJobForOrg, createDownloadToken } from "@/lib/compliance/export-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { generateExportToken }        from "@/lib/compliance/export-token";

/**
 * Issue a single-use download capability for a READY export.
 *
 * SECURITY — org-scoped (manage_exports). Only a READY, non-revoked, unexpired job
 * with a policy-configured expiry yields a token; without an expiry policy no
 * capability is issued (EXPORT_EXPIRY_POLICY=CONFIGURATION_REQUIRED). The plaintext
 * token is returned exactly once and NEVER persisted or logged — only its hash is
 * stored. Audit records the issuance with identifiers only, never the token.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_exports", "compliance.export.token_issue");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const job = await getExportJobForOrg(id, scope.organizationId);
  if (!job) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  if (job.lifecycle !== "READY") return NextResponse.json({ error: "Export is not ready", code: "NOT_READY" }, { status: 409 });
  if (job.revokedAt) return NextResponse.json({ error: "Export revoked", code: "REVOKED" }, { status: 409 });
  if (!job.expiresAt) {
    // No configured retention/expiry → no download capability is issued.
    return NextResponse.json({ error: "Export expiry policy is not configured", code: "EXPORT_EXPIRY_POLICY", detail: "CONFIGURATION_REQUIRED" }, { status: 409 });
  }
  if (new Date(job.expiresAt as unknown as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Export expired", code: "EXPIRED" }, { status: 409 });
  }

  const { plaintext, hash } = generateExportToken();
  const token = await createDownloadToken({
    exportRequestId: id,
    tokenHash:       hash,
    subjectUserId:   job.userId,
    organizationId:  job.organizationId,
    expiresAt:       new Date(job.expiresAt as unknown as string),
  });
  if (!token) return NextResponse.json({ error: "Could not issue token", code: "PERSIST_FAILED" }, { status: 503 });

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.EXPORT_TOKEN_ISSUED,
    entityType: "ExportDownloadToken",
    entityId: token.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    // Identifiers + expiry only — never the token plaintext/hash.
    metadata: { exportRequestId: id, expiresAt: token.expiresAt },
  });

  // Plaintext returned ONCE — the caller must retain it now.
  return NextResponse.json({ token: plaintext, expiresAt: token.expiresAt }, { status: 201 });
}
