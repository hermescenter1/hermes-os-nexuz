import { NextResponse }          from "next/server";
import { getLatestPublicLegalDocument } from "@/lib/compliance/db";
import type { LegalDocumentType, DbLegalDocument } from "@/lib/compliance/types";

const VALID_TYPES: LegalDocumentType[] = [
  "PRIVACY_POLICY", "TERMS_OF_SERVICE", "COOKIE_POLICY", "DPA",
  "CANDIDATE_CONSENT", "ACADEMY_TERMS", "MARKETING_CONSENT",
];

/**
 * Public DTO — the only fields safe for anonymous publication. Internal creator
 * identity, organization ownership, draft state and internal metadata are all
 * excluded.
 */
function toPublicDto(doc: DbLegalDocument) {
  return {
    documentType:  doc.documentType,
    version:       doc.version,
    title:         doc.title,
    content:       doc.content,
    locale:        doc.locale,
    effectiveDate: doc.effectiveDate,
    publishedAt:   doc.publishedAt,
  };
}

/**
 * SECURITY (compliance hotfix) — the sole unauthenticated public legal-document
 * endpoint. `getLatestPublicLegalDocument` enforces EVERY constraint in the
 * database: platform-global scope (`organizationId: null`, so a tenant-owned
 * document is never exposed), `isPublished: true`, and currently-effective
 * (`effectiveDate` null OR <= now, so a future version cannot shadow an older
 * effective one). The result is projected through a public DTO that excludes
 * all internal fields. No organization id is ever taken from the request.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const url      = new URL(req.url);
  const locale   = url.searchParams.get("locale") ?? "en";

  const normalizedType = type.toUpperCase() as LegalDocumentType;
  if (!VALID_TYPES.includes(normalizedType)) {
    return NextResponse.json({ error: "Document not found", document: null }, { status: 404 });
  }

  const doc = await getLatestPublicLegalDocument(normalizedType, locale);
  if (!doc) {
    return NextResponse.json({ error: "Document not found", document: null }, { status: 404 });
  }

  return NextResponse.json({ document: toPublicDto(doc) });
}
