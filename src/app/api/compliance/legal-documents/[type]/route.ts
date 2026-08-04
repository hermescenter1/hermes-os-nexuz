import { NextResponse }          from "next/server";
import { getLatestLegalDocument } from "@/lib/compliance/db";
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
 * endpoint. It returns ONLY a document that is published, currently effective
 * and matches the requested type + locale, projected through a public DTO that
 * excludes all internal fields. `getLatestLegalDocument` already filters to
 * `isPublished: true`; here we additionally reject a not-yet-effective document
 * so a future-dated draft-in-waiting is never served.
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

  const doc = await getLatestLegalDocument(normalizedType, locale);
  const isEffective = !!doc && (!doc.effectiveDate || new Date(doc.effectiveDate).getTime() <= Date.now());
  if (!doc || !doc.isPublished || !isEffective) {
    return NextResponse.json({ error: "Document not found", document: null }, { status: 404 });
  }

  return NextResponse.json({ document: toPublicDto(doc) });
}
