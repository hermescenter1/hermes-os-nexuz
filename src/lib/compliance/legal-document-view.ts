/**
 * Phase 97 — legal-document admin projection. Minimised: exposes the governed
 * lifecycle and effective-date metadata but never the internal person
 * identities (createdBy/approvedBy/publishedBy) — consistent with the hotfix's
 * exclusion of createdBy — nor the document is never leaked cross-scope because
 * every row reaching this DTO is already scope-filtered in the query.
 */
import type { DbLegalDocument } from "./types";

export function toAdminLegalDocumentDto(doc: DbLegalDocument) {
  return {
    id:             doc.id,
    documentType:   doc.documentType,
    version:        doc.version,
    title:          doc.title,
    content:        doc.content,
    locale:         doc.locale,
    lifecycle:      doc.lifecycle,
    isPublished:    doc.isPublished,
    effectiveDate:  doc.effectiveDate,
    publishedAt:    doc.publishedAt,
    approvedAt:     doc.approvedAt,
    withdrawnAt:    doc.withdrawnAt,
    supersededById: doc.supersededById,
    organizationId: doc.organizationId,
    createdAt:      doc.createdAt,
    updatedAt:      doc.updatedAt,
  };
}
