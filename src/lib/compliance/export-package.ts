/**
 * Phase 97 Part G — deterministic export package + manifest builder.
 *
 * The content hash is computed over a STABLE serialization (recursively sorted
 * keys, sorted sources) of the subject content only — so the same synthetic input
 * always produces the same hash apart from explicitly time-bound fields
 * (generatedAt). The hash detects any tampering with the packaged content.
 */
import { createHash } from "node:crypto";
import type { CollectedSource } from "./export-sources";

export const EXPORT_SCHEMA_VERSION = "1.0";

export interface ExportPackageMeta {
  exportRequestId:   string;
  privacyRequestId:  string | null;
  subjectClass:      string;              // USER | CANDIDATE
  organizationScope: string | null;
  locale:            string;
  generatedAt:       Date;                // time-bound — excluded from the hash
  expiry:            { status: string; expiresAt: Date | null };
}

export interface ExportManifest {
  schemaVersion:     string;
  generatedAt:       string;
  exportRequestId:   string;
  privacyRequestId:  string | null;
  subjectClass:      string;
  organizationScope: string | null;
  locale:            string;
  sources: Array<{
    name: string; schemaVersion: string; recordCount: number;
    includedFields: string[]; excludedFields: string[]; redactionRules: string[];
  }>;
  contentHash:       string;
  expiry:            { status: string; expiresAt: string | null };
}

export interface ExportPackage {
  manifest:    ExportManifest;
  documents:   Record<string, Record<string, unknown>[]>;
  contentHash: string;
}

/** Recursively key-sorted JSON — deterministic regardless of insertion order. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v instanceof Date ? v.toISOString() : v;
    if (v instanceof Date) return v.toISOString();
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = norm((v as Record<string, unknown>)[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}

/** Hash the subject CONTENT only (deterministic; excludes generatedAt / ids that
 *  vary per instance are kept because the test supplies stable synthetic ones). */
export function computeExportContentHash(subjectClass: string, organizationScope: string | null, locale: string, sources: CollectedSource[]): string {
  const content = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    subjectClass,
    organizationScope,
    locale,
    sources: [...sources]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ name: s.name, schemaVersion: s.schemaVersion, records: s.records })),
  };
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}

export function buildExportPackage(sources: CollectedSource[], meta: ExportPackageMeta): ExportPackage {
  const sorted = [...sources].sort((a, b) => a.name.localeCompare(b.name));
  const contentHash = computeExportContentHash(meta.subjectClass, meta.organizationScope, meta.locale, sorted);
  const documents: Record<string, Record<string, unknown>[]> = {};
  for (const s of sorted) documents[s.name] = s.records;

  const manifest: ExportManifest = {
    schemaVersion:     EXPORT_SCHEMA_VERSION,
    generatedAt:       meta.generatedAt.toISOString(),
    exportRequestId:   meta.exportRequestId,
    privacyRequestId:  meta.privacyRequestId,
    subjectClass:      meta.subjectClass,
    organizationScope: meta.organizationScope,
    locale:            meta.locale,
    sources: sorted.map((s) => ({
      name: s.name, schemaVersion: s.schemaVersion, recordCount: s.records.length,
      includedFields: s.includedFields, excludedFields: s.excludedFields, redactionRules: s.redactionRules,
    })),
    contentHash,
    expiry: { status: meta.expiry.status, expiresAt: meta.expiry.expiresAt ? meta.expiry.expiresAt.toISOString() : null },
  };
  return { manifest, documents, contentHash };
}

/** Recompute the content hash from a package's documents to detect mutation. */
export function verifyExportPackage(pkg: ExportPackage): boolean {
  const sources: CollectedSource[] = pkg.manifest.sources.map((s) => ({
    name: s.name, schemaVersion: s.schemaVersion, includedFields: s.includedFields,
    excludedFields: s.excludedFields, redactionRules: s.redactionRules,
    records: pkg.documents[s.name] ?? [],
  }));
  const recomputed = computeExportContentHash(pkg.manifest.subjectClass, pkg.manifest.organizationScope, pkg.manifest.locale, sources);
  return recomputed === pkg.contentHash;
}
