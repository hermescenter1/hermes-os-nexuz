/**
 * Phase 97 Part G — deterministic export package + manifest builder + integrity.
 *
 * Two hashes protect a package:
 *   - contentHash  : SHA-256 over the STABLE serialization of the subject CONTENT
 *                    only (sorted keys, sorted sources, canonicalised records) —
 *                    detects any tampering with the packaged records.
 *   - packageHash  : SHA-256 over the whole canonical package ENVELOPE (every
 *                    evidence-bearing manifest field + the canonicalised documents
 *                    + contentHash), excluding only packageHash itself — detects
 *                    tampering with any manifest field (scope, redaction rules,
 *                    record counts, expiry, …), not just the records.
 *
 * The download path recomputes BOTH from the stored bytes and compares them, in
 * constant time, against the AUTHORITATIVE values held in PostgreSQL.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { canonicaliseRecords, EXPORT_SOURCES, type CollectedSource, type SourceScope } from "./export-sources";

export const EXPORT_SCHEMA_VERSION = "1.0";
/** The closed set of schema versions this build can parse/validate. */
export const SUPPORTED_EXPORT_SCHEMA_VERSIONS: string[] = [EXPORT_SCHEMA_VERSION];
export function isSupportedExportSchemaVersion(v: unknown): v is string {
  return typeof v === "string" && SUPPORTED_EXPORT_SCHEMA_VERSIONS.includes(v);
}

/** SHA-256 hex digest shape guard. */
export function isSha256Hex(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
}

export interface ExportPackageMeta {
  exportRequestId:   string;
  privacyRequestId:  string | null;
  subjectClass:      string;              // USER | CANDIDATE
  organizationScope: string | null;
  locale:            string;
  generatedAt:       Date;                // time-bound — excluded from contentHash
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

/** Canonical documents map — each source's records canonically ordered. */
function canonicaliseDocuments(documents: Record<string, Record<string, unknown>[]>): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const name of Object.keys(documents).sort()) out[name] = canonicaliseRecords(documents[name] ?? []);
  return out;
}

/**
 * The canonical package ENVELOPE hashed by packageHash. It includes every
 * evidence-bearing manifest field, the canonicalised documents and contentHash,
 * and EXCLUDES only packageHash itself. stableStringify sorts keys so envelope
 * field order is irrelevant; documents/sources are canonically ordered so record
 * order is irrelevant.
 */
export function canonicalPackageEnvelope(pkg: ExportPackage): Record<string, unknown> {
  const m = pkg.manifest;
  return {
    schemaVersion:     m.schemaVersion,
    generatedAt:       m.generatedAt,
    exportRequestId:   m.exportRequestId,
    privacyRequestId:  m.privacyRequestId,
    subjectClass:      m.subjectClass,
    organizationScope: m.organizationScope,
    locale:            m.locale,
    sources: [...m.sources]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        name: s.name, schemaVersion: s.schemaVersion, scope: s.scope, recordCount: s.recordCount,
        includedFields: [...s.includedFields].sort(), excludedFields: [...s.excludedFields].sort(), redactionRules: [...s.redactionRules].sort(),
      })),
    expiry:    { status: m.expiry.status, expiresAt: m.expiry.expiresAt },
    documents: canonicaliseDocuments(pkg.documents),
    contentHash: m.contentHash,
  };
}
export function computeExportPackageHash(pkg: ExportPackage): string {
  return createHash("sha256").update(stableStringify(canonicalPackageEnvelope(pkg))).digest("hex");
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

// ── Finding 3 — full-envelope package integrity validation ────────────────────

export interface ExpectedPackageBinding {
  exportRequestId:   string;
  privacyRequestId:  string | null;  // AUTHORITATIVE — required non-null for a governed READY job
  organizationScope: string | null;  // AUTHORITATIVE — required non-null
  subjectUserId:     string | null;  // AUTHORITATIVE subject — required non-null
  subjectClass:      string;
  schemaVersion:     string | null;  // AUTHORITATIVE — required non-null + supported
  jobContentHash:    string | null;  // AUTHORITATIVE (from PostgreSQL) — required non-null
  jobPackageHash:    string | null;  // AUTHORITATIVE (from PostgreSQL) — required non-null
  expiresAt:         Date | string | null; // AUTHORITATIVE — required non-null; equals manifest expiry
}
export type PackageValidation =
  | { ok: true; pkg: ExportPackage }
  | { ok: false; code: "PACKAGE_NOT_FOUND" | "PACKAGE_INVALID" | "PACKAGE_BINDING_MISMATCH" | "PACKAGE_HASH_MISMATCH" };

const MAX_PACKAGE_BYTES = 25 * 1024 * 1024;
const INVALID = { ok: false as const, code: "PACKAGE_INVALID" as const };

function isPlainObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function isStringArray(v: unknown): v is string[] { return Array.isArray(v) && v.every((x) => typeof x === "string"); }
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort(), bs = [...b].sort();
  return as.every((x, i) => x === bs[i]);
}
function isValidTimestamp(v: unknown): boolean {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}
function toIso(v: Date | string | null): string | null {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
const SOURCE_CONTRACTS = new Map(EXPORT_SOURCES.map((s) => [s.name, s]));

/**
 * Strictly parse and validate a stored package against the authoritative export
 * job. EVERY nested value is structurally validated before it is cast or iterated,
 * and the whole body is wrapped so malformed input can only ever return
 * PACKAGE_INVALID — it can never throw. On success the package is proven to match:
 *   - the authoritative binding (request, parent, org, subject class, schema);
 *   - the closed source registry (names unique+known, scope/schemaVersion/field
 *     contract, no unknown/duplicate/oversized source, recordCount = actual count);
 *   - the authoritative expiry (manifest expiry equals job.expiresAt);
 *   - the authoritative contentHash AND packageHash (constant-time comparison).
 */
export function parseAndValidateExportPackage(bytes: Buffer | null, expected: ExpectedPackageBinding): PackageValidation {
  try {
    if (!bytes || bytes.length === 0) return { ok: false, code: "PACKAGE_NOT_FOUND" };
    if (bytes.length > MAX_PACKAGE_BYTES) return INVALID;

    // The authoritative job itself must be structurally complete — a READY row
    // missing any authoritative value is not a downloadable capability.
    const expIso = toIso(expected.expiresAt);
    if (!expected.privacyRequestId || !expected.organizationScope || !expected.subjectUserId
      || !isSupportedExportSchemaVersion(expected.schemaVersion)
      || !isSha256Hex(expected.jobContentHash) || !isSha256Hex(expected.jobPackageHash) || !expIso) {
      return INVALID;
    }

    let raw: unknown;
    try { raw = JSON.parse(bytes.toString("utf8")); } catch { return INVALID; }
    if (!isPlainObject(raw) || !isPlainObject(raw.manifest) || !isPlainObject(raw.documents) || typeof raw.contentHash !== "string") return INVALID;

    const m = raw.manifest as Record<string, unknown>;
    const documents = raw.documents as Record<string, unknown>;

    // Top-level manifest scalars.
    if (!isSupportedExportSchemaVersion(m.schemaVersion)) return INVALID;
    if (typeof m.exportRequestId !== "string" || typeof m.subjectClass !== "string" || typeof m.locale !== "string") return INVALID;
    if (!("privacyRequestId" in m) || (m.privacyRequestId !== null && typeof m.privacyRequestId !== "string")) return INVALID;
    if (!("organizationScope" in m) || (m.organizationScope !== null && typeof m.organizationScope !== "string")) return INVALID;
    if (typeof m.contentHash !== "string" || !isSha256Hex(m.contentHash)) return INVALID;
    if (!isValidTimestamp(m.generatedAt)) return INVALID;

    // Expiry object + valid, non-null, authoritative-matching timestamp.
    if (!isPlainObject(m.expiry) || typeof m.expiry.status !== "string") return INVALID;
    const expiresAt = m.expiry.expiresAt;
    if (expiresAt !== null && !isValidTimestamp(expiresAt)) return INVALID;

    // Sources array — plain objects, known+unique names, registry contract match.
    if (!Array.isArray(m.sources)) return INVALID;
    const seenSourceNames = new Set<string>();
    for (const s of m.sources) {
      if (!isPlainObject(s)) return INVALID;
      const name = s.name;
      if (typeof name !== "string") return INVALID;
      const contract = SOURCE_CONTRACTS.get(name);
      if (!contract) return INVALID;                 // unknown source
      if (seenSourceNames.has(name)) return INVALID; // duplicate source
      seenSourceNames.add(name);
      if (s.schemaVersion !== contract.schemaVersion) return INVALID;
      if (s.scope !== (contract.scope as SourceScope)) return INVALID;
      if (!isStringArray(s.includedFields) || !sameStringSet(s.includedFields, contract.includedFields)) return INVALID;
      if (!isStringArray(s.excludedFields) || !sameStringSet(s.excludedFields, contract.excludedFields)) return INVALID;
      if (!isStringArray(s.redactionRules) || !sameStringSet(s.redactionRules, contract.redactionRules)) return INVALID;
      if (typeof s.recordCount !== "number" || !Number.isInteger(s.recordCount) || s.recordCount < 0) return INVALID;
    }

    // Documents — every key a known+declared source, every value an array of plain
    // objects, and recordCount equal to the actual count.
    for (const key of Object.keys(documents)) {
      if (!SOURCE_CONTRACTS.has(key)) return INVALID; // unknown document source
      if (!seenSourceNames.has(key)) return INVALID;  // present in documents but not declared
      const arr = documents[key];
      if (!Array.isArray(arr) || !arr.every((r) => isPlainObject(r))) return INVALID;
    }
    for (const s of m.sources as Array<Record<string, unknown>>) {
      const arr = Array.isArray(documents[s.name as string]) ? (documents[s.name as string] as unknown[]) : [];
      if (arr.length !== (s.recordCount as number)) return INVALID; // record-count mismatch
    }

    const pkg = raw as unknown as ExportPackage;

    // Binding must match the authoritative job exactly (Finding 3).
    if (m.exportRequestId !== expected.exportRequestId
      || (m.privacyRequestId ?? null) !== expected.privacyRequestId
      || (m.organizationScope ?? null) !== expected.organizationScope
      || m.subjectClass !== expected.subjectClass
      || m.schemaVersion !== expected.schemaVersion) {
      return { ok: false, code: "PACKAGE_BINDING_MISMATCH" };
    }
    // Manifest expiry must equal the authoritative job expiresAt.
    if (toIso(expiresAt as string | null) !== expIso) return { ok: false, code: "PACKAGE_BINDING_MISMATCH" };

    // Recompute BOTH hashes and compare against package/manifest AND the
    // authoritative PostgreSQL values, all in constant time.
    const recomputedContent = computeExportContentHash(pkg.manifest.subjectClass, pkg.manifest.organizationScope, pkg.manifest.locale, manifestToSources(pkg));
    if (!hashesEqual(recomputedContent, pkg.contentHash) || !hashesEqual(recomputedContent, String(m.contentHash))) return { ok: false, code: "PACKAGE_HASH_MISMATCH" };
    if (!hashesEqual(recomputedContent, expected.jobContentHash)) return { ok: false, code: "PACKAGE_HASH_MISMATCH" };

    const recomputedPackage = computeExportPackageHash(pkg);
    if (!hashesEqual(recomputedPackage, expected.jobPackageHash)) return { ok: false, code: "PACKAGE_HASH_MISMATCH" };

    return { ok: true, pkg };
  } catch {
    // Defence in depth: no malformed nested input may ever escape as an exception.
    return INVALID;
  }
}
