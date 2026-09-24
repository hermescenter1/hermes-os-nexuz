import type { Document } from "../types";

/**
 * F-1 test fixtures — session-mode `Document` rows with an explicit tenant.
 *
 * Chunk search is tenant-scoped through the parent `Document` row
 * (`Document.tenantId`), so every suite that expects matches must first seed
 * the owning document here. Not a test file (no `.test.ts` suffix).
 */

export const ORG_A = "org-a";
export const ORG_B = "org-b";
export const SCOPE_A = { orgId: ORG_A } as const;
export const SCOPE_B = { orgId: ORG_B } as const;

function buffer(): Document[] {
  const g = globalThis as unknown as { __hermesDocumentDrafts?: Document[] };
  g.__hermesDocumentDrafts ??= [];
  return g.__hermesDocumentDrafts;
}

/** Empties the session document store (call in `beforeEach`). */
export function resetSessionDocuments(): void {
  (globalThis as unknown as { __hermesDocumentDrafts?: Document[] }).__hermesDocumentDrafts = [];
}

/**
 * Registers a session document owned by `tenantId` (`null` = a legacy
 * NULL-tenant row). Idempotent per id: re-seeding the same id is a no-op.
 */
export function seedSessionDocument(id: string, tenantId: string | null = ORG_A): void {
  const buf = buffer();
  if (buf.some((d) => d.id === id)) return;
  const ts = new Date().toISOString();
  buf.push({
    id,
    title: id,
    sourceType: "manual",
    originalFilename: `${id}.txt`,
    mimeType: "text/plain",
    sizeBytes: 1,
    storageProvider: "local",
    storageKey: `documents/${id}/original.txt`,
    metadata: { tags: [] },
    status: "embedded",
    chunkCount: 0,
    ...(tenantId === null ? {} : { tenantId }),
    createdAt: ts,
    updatedAt: ts,
  });
}
