import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import {
  getLegalDocumentsForOrg,
  getGlobalLegalDocuments,
  createLegalDocument,
} from "@/lib/compliance/db";
import {
  requireComplianceOrgScope,
  requirePlatformSuperadmin,
} from "@/lib/compliance/authz";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { toAdminLegalDocumentDto } from "@/lib/compliance/legal-document-view";
import type { LegalDocumentType } from "@/lib/compliance/types";

const VALID_TYPES: LegalDocumentType[] = [
  "PRIVACY_POLICY", "TERMS_OF_SERVICE", "COOKIE_POLICY", "DPA",
  "CANDIDATE_CONSENT", "ACADEMY_TERMS", "MARKETING_CONSENT",
];

/**
 * SECURITY (compliance hotfix + Phase 97) — the admin collection.
 *   - superadmin  => platform-global templates only (strictest boundary);
 *   - org admin   => that single authoritative organization's documents only.
 * A generic `admin` role never implies global visibility. The DTO is minimised
 * (no internal person identities).
 */
export async function GET(req: NextRequest) {
  const token   = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  if (payload?.role === "superadmin") {
    const platform = await requirePlatformSuperadmin(req, "compliance.legal_documents.list");
    if (!platform.ok) return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
    const docs = await getGlobalLegalDocuments();
    return NextResponse.json({ documents: docs.map(toAdminLegalDocumentDto), total: docs.length, scope: "GLOBAL" });
  }

  const scope = await requireComplianceOrgScope(req, "view_legal_documents", "compliance.legal_documents.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const docs = await getLegalDocumentsForOrg(scope.organizationId);
  return NextResponse.json({ documents: docs.map(toAdminLegalDocumentDto), total: docs.length, scope: "ORGANIZATION" });
}

/**
 * Create a legal document as a DRAFT (Phase 97). Publication is a SEPARATE,
 * later, approval-gated lifecycle transition — creation never publishes.
 *   - superadmin  => a platform-global template (organizationId = null);
 *   - org admin   => a tenant-owned document (organizationId = authoritative org).
 * The client never supplies organizationId.
 */
export async function POST(req: NextRequest) {
  const token   = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const isSuperadmin = payload?.role === "superadmin";

  let actorId: string;
  let organizationId: string | null;
  if (isSuperadmin) {
    const platform = await requirePlatformSuperadmin(req, "compliance.legal_documents.create");
    if (!platform.ok) return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
    actorId = platform.userId;
    organizationId = null;
  } else {
    const scope = await requireComplianceOrgScope(req, "manage_legal_documents", "compliance.legal_documents.create");
    if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
    actorId = scope.userId;
    organizationId = scope.organizationId;
  }

  const body = await req.json().catch(() => null) as {
    documentType?: LegalDocumentType; version?: string; title?: string;
    content?: string; locale?: string; effectiveDate?: string;
  } | null;

  if (!body || !body.documentType || !VALID_TYPES.includes(body.documentType) || !body.version || !body.title || !body.content) {
    return NextResponse.json({ error: "documentType, version, title, content are required", code: "INVALID_INPUT" }, { status: 400 });
  }

  const doc = await createLegalDocument({
    documentType:  body.documentType,
    version:       body.version,
    title:         body.title,
    content:       body.content,
    locale:        body.locale ?? "en",
    effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
    organizationId,               // authoritative scope — never from the client
    createdBy:     actorId,
  });
  if (!doc) return NextResponse.json({ error: "Failed to create document", code: "CREATE_FAILED" }, { status: 500 });

  await recordAuditEvent({
    userId:         actorId,
    action:         COMPLIANCE_AUDIT.LEGAL_DOCUMENT_CREATED,
    entityType:     "LegalDocument",
    entityId:       doc.id,
    organizationId,
    outcome:        "SUCCESS",
    // Identifiers + closed enums only — never title/content free text.
    metadata: { documentType: doc.documentType, lifecycle: doc.lifecycle, scope: organizationId === null ? "GLOBAL" : "ORGANIZATION" },
  });

  return NextResponse.json({ document: toAdminLegalDocumentDto(doc) }, { status: 201 });
}
