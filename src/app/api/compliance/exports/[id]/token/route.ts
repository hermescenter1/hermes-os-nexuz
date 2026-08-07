import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { issueDownloadTokenForReadyJob } from "@/lib/compliance/export-db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { generateExportToken }        from "@/lib/compliance/export-token";

/**
 * Issue a single-use download capability for a READY export — TRANSACTIONALLY.
 *
 * SECURITY — org-scoped (manage_exports). Issuance re-reads and revalidates the
 * authoritative job inside a transaction: it must be READY, unrevoked, unexpired,
 * with a policy-configured expiry AND structurally complete (parent/org/subject
 * bound, valid content+package hashes, supported schema, completedAt). A
 * structurally incomplete READY row yields NO token, and because revocation locks
 * the same job row first, a token can never be created after a committed
 * revocation. The plaintext token is returned exactly once and NEVER persisted or
 * logged — only its SHA-256 hash is stored. Audit records identifiers only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "manage_exports", "compliance.export.token_issue");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const { plaintext, hash } = generateExportToken();
  const result = await issueDownloadTokenForReadyJob({ id, organizationId: scope.organizationId, tokenHash: hash, now: new Date() });

  if (!result.ok) {
    switch (result.reason) {
      case "NOT_FOUND":     return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
      case "NOT_READY":     return NextResponse.json({ error: "Export is not ready", code: "NOT_READY" }, { status: 409 });
      case "REVOKED":       return NextResponse.json({ error: "Export revoked", code: "REVOKED" }, { status: 409 });
      case "EXPIRY_POLICY": return NextResponse.json({ error: "Export expiry policy is not configured", code: "EXPORT_EXPIRY_POLICY", detail: "CONFIGURATION_REQUIRED" }, { status: 409 });
      case "EXPIRED":       return NextResponse.json({ error: "Export expired", code: "EXPIRED" }, { status: 409 });
      case "INCOMPLETE":    return NextResponse.json({ error: "Export is not a complete, downloadable package", code: "EXPORT_INCOMPLETE" }, { status: 409 });
      default:              return NextResponse.json({ error: "Could not issue token", code: "PERSIST_FAILED" }, { status: 503 });
    }
  }

  await recordAuditEvent({
    userId: scope.userId,
    action: COMPLIANCE_AUDIT.EXPORT_TOKEN_ISSUED,
    entityType: "ExportDownloadToken",
    entityId: result.token.id,
    organizationId: scope.organizationId,
    outcome: "SUCCESS",
    // Identifiers + expiry only — never the token plaintext/hash.
    metadata: { exportRequestId: id, expiresAt: result.token.expiresAt },
  });

  // Plaintext returned ONCE — the caller must retain it now.
  return NextResponse.json({ token: plaintext, expiresAt: result.token.expiresAt }, { status: 201 });
}
