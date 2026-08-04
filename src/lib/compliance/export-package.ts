/**
 * Phase 97 Part G — deterministic export package + manifest builder.
 *
 * The content hash is computed over a STABLE serialization (recursively sorted
 * keys, sorted sources) of the subject content only — so the same synthetic input
 * always produces the same hash apart from explicitly time-bound fields
 * (generatedAt). The hash detects any tampering with the packaged content.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { canonicaliseRecords, type CollectedSource } from "./export-sources";

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
    name: string; schemaVersion: string; scope: string; recordCount: number;
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
    // Defensive determinism (Finding 7): sort sources by name AND canonically sort
    // each source's records, so DB return order can never change the hash.
    sources: [...sources]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ name: s.name, schemaVersion: s.schemaVersion, records: canonicaliseRecords(s.records) })),
  };
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}

export function buildExportPackage(sources: CollectedSource[], meta: ExportPackageMeta): ExportPackage {
  const sorted = [...sources].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ ...s, records: canonicaliseRecords(s.records) }));
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
      name: s.name, schemaVersion: s.schemaVersion, scope: s.scope, recordCount: s.records.length,
      includedFields: s.includedFields, excludedFields: s.excludedFields, redactionRules: s.redactionRules,
    })),
    contentHash,
    expiry: { status: meta.expiry.status, expiresAt: meta.expiry.expiresAt ? meta.expiry.expiresAt.toISOString() : null },
  };
  return { manifest, documents, contentHash };
}

/** Constant-time comparison of two equal-length hex hashes (best effort). */
export function hashesEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try { return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); } catch { return false; }
}

/** Recompute the content hash from a package's documents to detect mutation. */
export function verifyExportPackage(pkg: ExportPackage): boolean {
  const sources = manifestToSources(pkg);
  const recomputed = computeExportContentHash(pkg.manifest.subjectClass, pkg.manifest.organizationScope, pkg.manifest.locale, sources);
  return hashesEqual(recomputed, pkg.contentHash);
}

function manifestToSources(pkg: ExportPackage): CollectedSource[] {
  return pkg.manifest.sources.map((s) => ({
    name: s.name, schemaVersion: s.schemaVersion, scope: (s.scope as CollectedSource["scope"]) ?? "CURRENT_ORGANIZATION",
    includedFields: s.includedFields, excludedFields: s.excludedFields, redactionRules: s.redactionRules,
    records: pkg.documents[s.name] ?? [],
  }));
}

// ── Finding 2 — runtime package integrity validation ──────────────────────────

export interface ExpectedPackageBinding {
  exportRequestId:   string;
  privacyRequestId:  string | null;
  organizationScope: string | null;
  subjectClass:      string;
  schemaVersion:     string | null;
  jobContentHash:    string | null; // AUTHORITATIVE (from PostgreSQL)
}
export type PackageValidation =
  | { ok: true; pkg: ExportPackage }
  | { ok: false; code: "PACKAGE_NOT_FOUND" | "PACKAGE_INVALID" | "PACKAGE_BINDING_MISMATCH" | "PACKAGE_HASH_MISMATCH" };

const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;

function isPlainObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }

/**
 * Strictly parse and validate a stored package against the authoritative export
 * job. Rejects malformed/oversized/unparseable packages, binding mismatches, and
 * any hash that disagrees with the recomputed hash, package.contentHash,
 * manifest.contentHash or the authoritative job.contentHash.
 */
export function parseAndValidateExportPackage(bytes: Buffer | null, expected: ExpectedPackageBinding): PackageValidation {
  if (!bytes || bytes.length === 0) return { ok: false, code: "PACKAGE_NOT_FOUND" };
  if (bytes.length > MAX_PACKAGE_BYTES) return { ok: false, code: "PACKAGE_INVALID" };

  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { return { ok: false, code: "PACKAGE_INVALID" }; }
  if (!isPlainObject(raw) || !isPlainObject(raw.manifest) || !isPlainObject(raw.documents) || typeof raw.contentHash !== "string") {
    return { ok: false, code: "PACKAGE_INVALID" };
  }
  const m = raw.manifest as Record<string, unknown>;
  if (!Array.isArray(m.sources) || typeof m.contentHash !== "string" || typeof m.subjectClass !== "string") {
    return { ok: false, code: "PACKAGE_INVALID" };
  }
  const pkg = raw as unknown as ExportPackage;

  // Binding must match the authoritative job exactly.
  if (m.exportRequestId !== expected.exportRequestId
    || (m.privacyRequestId ?? null) !== expected.privacyRequestId
    || (m.organizationScope ?? null) !== expected.organizationScope
    || m.subjectClass !== expected.subjectClass
    || (m.schemaVersion ?? null) !== expected.schemaVersion) {
    return { ok: false, code: "PACKAGE_BINDING_MISMATCH" };
  }

  // Recompute and compare against every hash, including the authoritative one.
  const recomputed = computeExportContentHash(pkg.manifest.subjectClass, pkg.manifest.organizationScope, pkg.manifest.locale, manifestToSources(pkg));
  if (!hashesEqual(recomputed, pkg.contentHash) || !hashesEqual(recomputed, String(m.contentHash))) {
    return { ok: false, code: "PACKAGE_HASH_MISMATCH" };
  }
  if (expected.jobContentHash && !hashesEqual(recomputed, expected.jobContentHash)) {
    return { ok: false, code: "PACKAGE_HASH_MISMATCH" };
  }
  return { ok: true, pkg };
}
