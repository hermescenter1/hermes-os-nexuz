// Phase 69 — EDMS metadata helpers

import type { EdmsMetadata } from "./types";

export type MetadataMap = Record<string, string>;

export function metadataToMap(entries: EdmsMetadata[]): MetadataMap {
  return Object.fromEntries(entries.map(e => [e.key, e.value]));
}

export function mapToMetadata(documentId: string, map: MetadataMap): Omit<EdmsMetadata, "id" | "createdAt" | "updatedAt">[] {
  return Object.entries(map).map(([key, value]) => ({ documentId, key, value }));
}

export const STANDARD_METADATA_KEYS = [
  "project", "vendor", "site", "department", "equipment",
  "discipline", "system", "area", "language", "standard",
  "revision_basis", "drawn_by", "checked_by", "approved_by",
] as const;

export function getMetadataDisplayLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
