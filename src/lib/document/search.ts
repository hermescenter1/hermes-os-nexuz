// Phase 69 — EDMS search (deterministic in-memory for mock mode)

import type { EdmsDocument, EdmsDocumentStatus, EdmsDocumentType, EdmsSearchResult } from "./types";
import { MOCK_DOCUMENTS, MOCK_TAGS } from "./mock-data";

export interface EdmsSearchParams {
  q?:         string;
  status?:    EdmsDocumentStatus;
  type?:      EdmsDocumentType;
  folderId?:  string;
  categoryId?: string;
  ownerId?:   string;
  erpProjectId?: string;
  vendorId?:  string;
  tag?:       string;
  language?:  string;
  page?:      number;
  pageSize?:  number;
}

export function searchDocumentsMock(params: EdmsSearchParams): EdmsSearchResult {
  const {
    q, status, type, folderId, categoryId, ownerId,
    erpProjectId, vendorId, tag, language,
    page = 1, pageSize = 20,
  } = params;

  let docs = MOCK_DOCUMENTS.filter(d => !d.deletedAt);

  if (q) {
    const lower = q.toLowerCase();
    const taggedIds = tag ? new Set<string>() : undefined;
    const tagged = MOCK_TAGS.filter(t => t.tagName.toLowerCase().includes(lower)).map(t => t.documentId);

    docs = docs.filter(d =>
      d.title.toLowerCase().includes(lower)
      || d.description?.toLowerCase().includes(lower)
      || d.keywords.some(k => k.toLowerCase().includes(lower))
      || tagged.includes(d.id)
      || (taggedIds && taggedIds.has(d.id))
    );
  }

  if (status)      docs = docs.filter(d => d.status === status);
  if (type)        docs = docs.filter(d => d.documentType === type);
  if (folderId)    docs = docs.filter(d => d.folderId === folderId);
  if (categoryId)  docs = docs.filter(d => d.categoryId === categoryId);
  if (ownerId)     docs = docs.filter(d => d.ownerId === ownerId);
  if (erpProjectId) docs = docs.filter(d => d.erpProjectId === erpProjectId);
  if (vendorId)    docs = docs.filter(d => d.vendorId === vendorId);
  if (language)    docs = docs.filter(d => d.language === language);

  if (tag) {
    const taggedDocIds = new Set(MOCK_TAGS.filter(t => t.tagName === tag).map(t => t.documentId));
    docs = docs.filter(d => taggedDocIds.has(d.id));
  }

  const total = docs.length;
  const start = (page - 1) * pageSize;
  const documents = docs.slice(start, start + pageSize);

  return { documents, total, page, pageSize };
}
