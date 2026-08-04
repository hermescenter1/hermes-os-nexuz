import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import {
  getLegalDocumentsForOrg,
  getGlobalLegalDocuments,
  createLegalDocument,
  publishLegalDocument,
} from "@/lib/compliance/db";
import {
  requireComplianceOrgScope,
  requirePlatformSuperadmin,
} from "@/lib/compliance/authz";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import type { LegalDocumentType, DbLegalDocument } from "@/lib/compliance/types";

/**
 * Admin collection DTO — minimised. Internal creator identity (`createdBy`) is
 * never exposed; every row returned is already tenant-scoped (own org) or a
 * platform-global template, so no foreign organization id can appear.
 */
function toAdminDto(doc: DbLegalDocument) {
  return {
    id:             doc.id,
    documentType:   doc.documentType,
    version:        doc.version,
    title:          doc.title,
    content:        doc.content,
    locale:         doc.locale,
    isPublished:    doc.isPublished,
    publishedAt:    doc.publishedAt,
    effectiveDate:  doc.effectiveDate,
    organizationId: doc.organizationId,
    createdAt:      doc.createdAt,
    updatedAt:      doc.updatedAt,
  };
}

/**
 * SECURITY (compliance hotfix) — the admin collection endpoint was previously
 * unauthenticated and returned EVERY organization's documents (including
 * unpublished drafts and internal metadata). It is now:
 *   - superadmin  => platform-global templates only (strictest boundary);
 *   - org admin   => that single authoritative organization's documents only.
 * A generic `admin` role no longer implies global visibility, and a tenant
 * administrator can never see another tenant's drafts. The unauthenticated
 * public route remains `/api/compliance/legal-documents/[type]`.
 */
export async function GET(req: NextRequest) {
  const token   = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  // Platform superadmin administers the organization-less global templates.
  if (payload?.role === "superadmin") {
    const platform = await requirePlatformSuperadmin(req, "compliance.legal_documents.list");
    if (!platform.ok) {
      return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
    }
    const docs = await getGlobalLegalDocuments();
    return NextResponse.json({ documents: docs.map(toAdminDto), total: docs.length, scope: "GLOBAL" });
  }

  const scope = await requireComplianceOrgScope(req, "update_org", "compliance.legal_documents.list");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }
  const docs = await getLegalDocumentsForOrg(scope.organizationId);
  return NextResponse.json({ documents: docs.map(toAdminDto), total: docs.length, scope: "ORGANIZATION" });
}

/**
 * Create (and optionally publish) a platform-global legal template. These are
 * organization-less master templates, so administration is restricted to the
 * strictest existing boundary: the platform superadmin.
 */
export async function POST(req: NextRequest) {
  const platform = await requirePlatformSuperadmin(req, "compliance.legal_documents.create");
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
  }

  const body = await req.json().catch(() => null) as {
    documentType?:  LegalDocumentType;
    version?:       string;
    title?:         string;
    content?:       string;
    locale?:        string;
    effectiveDate?: string;
    publish?:       boolean;
  } | null;

  if (!body || !body.documentType || !body.version || !body.title || !body.content) {
    return NextResponse.json(
      { error: "documentType, version, title, content are required", code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  const doc = await createLegalDocument({
    documentType:  body.documentType,
    version:       body.version,
    title:         body.title,
    content:       body.content,
    locale:        body.locale ?? "en",
    effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
    createdBy:     platform.userId,
  });
  if (!doc) return NextResponse.json({ error: "Failed to create document", code: "CREATE_FAILED" }, { status: 500 });

  if (body.publish) {
    await publishLegalDocument(doc.id);
    return NextResponse.json({ document: toAdminDto({ ...doc, isPublished: true }) });
  }
  return NextResponse.json({ document: toAdminDto(doc) });
}
