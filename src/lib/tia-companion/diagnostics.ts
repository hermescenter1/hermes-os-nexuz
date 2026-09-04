/**
 * PHASE 109-C2.0 — the normalized diagnostic contract.
 *
 * A diagnostic produced anywhere in the TIA companion is a CODE plus the data
 * needed to render it, never a sentence. The same rule Phase 109-C1 established
 * for `AES-C1-NNN` applies unchanged: findings have to render in English,
 * German and Persian, so the engine that detects a problem is the wrong place
 * to decide how it reads.
 *
 * The `AES-C2-NNN` codes below are a CONTRACT. A code never changes meaning and
 * a retired code is never reused, because a code is what an engineer quotes in
 * a review, what an audit row stores, and what a downstream gate keys on.
 *
 * Two properties are enforced by tests rather than by convention:
 *   - a diagnostic carries `code`, `severity`, `messageKey` and `params`, and
 *     carries NO field holding display text;
 *   - every code maps to exactly one member of the `EngineeringImportFailure`
 *     enum that Phase 94B already shipped, so the companion cannot invent a
 *     second, parallel failure vocabulary for the same database column.
 */

/* ── severity ─────────────────────────────────────────────────────────────── */

export type TiaDiagnosticSeverity = "error" | "warning" | "info";

export const TIA_DIAGNOSTIC_SEVERITIES: readonly TiaDiagnosticSeverity[] = [
  "error",
  "warning",
  "info",
] as const;

/* ── the code catalogue ───────────────────────────────────────────────────── */

/**
 * Stable finding codes for the TIA companion.
 *
 * Numbering starts at 001 in its own `AES-C2-` space: it is a separate contract
 * from `AES-C1-NNN`, and overlapping the two would make a quoted code ambiguous.
 */
export const TIA_DIAGNOSTIC_CODES = {
  /** The package kind is one the companion does not and will not parse. */
  UNSUPPORTED_PACKAGE_KIND: "AES-C2-001",
  /** `schemaVersion` is absent or is not a supported version. */
  SCHEMA_VERSION_UNSUPPORTED: "AES-C2-002",
  /** Two entries normalise to the same canonical path. */
  DUPLICATE_CANONICAL_PATH: "AES-C2-003",
  /** An entry path is absolute. */
  ABSOLUTE_PATH_REJECTED: "AES-C2-004",
  /** An entry path is drive-qualified (`C:/…`). */
  DRIVE_QUALIFIED_PATH_REJECTED: "AES-C2-005",
  /** An entry path contains a `.` or `..` segment. */
  PATH_TRAVERSAL_REJECTED: "AES-C2-006",
  /** An entry path contains a NUL byte. */
  NUL_BYTE_IN_PATH: "AES-C2-007",
  /** An entry path is longer than the declared bound. */
  PATH_LENGTH_EXCEEDED: "AES-C2-008",
  /** An entry path nests deeper than the declared bound. */
  PATH_DEPTH_EXCEEDED: "AES-C2-009",
  /** A recomputed digest does not equal the declared one. */
  CONTENT_HASH_MISMATCH: "AES-C2-010",
  /** The input is an archive container the companion deliberately does not open. */
  OPAQUE_ARCHIVE_NOT_PARSED: "AES-C2-011",
  /** A compile result does not bind to a known snapshot digest. */
  COMPILE_RESULT_UNBOUND: "AES-C2-012",
  /** An adapter declares a controller, write or execution capability. */
  FORBIDDEN_CONTROLLER_CAPABILITY: "AES-C2-013",
  /** A provenance origin outside the companion's admission policy. */
  FORBIDDEN_ORIGIN: "AES-C2-014",
  //
  // AES-C2-015 IS RETIRED AND PERMANENTLY RESERVED.
  //
  // It was `ARCHIVE_LIMIT_EXCEEDED`, issued when a declared compression ratio or
  // total-uncompressed bound was crossed. Both bounds were withdrawn under C2.0
  // CORRECTION 3: a code named for an archive limit implies the companion
  // processes archives, and it does not. The number is not reused — a retired
  // code never is — so the catalogue has a deliberate gap here and a test
  // asserts the gap stays.
  //
  /** The manifest failed structural validation. */
  MALFORMED_MANIFEST: "AES-C2-016",
  /** A compile result carries an evidence value other than `DECLARED`. */
  COMPILE_EVIDENCE_NOT_DECLARED: "AES-C2-017",
  /** A snapshot arrived without a provenance record, or with an invalid one. */
  PROVENANCE_MISSING: "AES-C2-018",
  /**
   * An entry path is not in Unicode Normalization Form C.
   *
   * Distinct from every other path code because the path is otherwise perfectly
   * well formed — it is refused for what it IS, not for where it points.
   */
  PATH_NOT_NFC: "AES-C2-019",
  /**
   * A compile result is structurally invalid.
   *
   * Deliberately NOT `COMPILE_RESULT_UNBOUND`. A malformed document and a
   * well-formed document pointing at the wrong project state are different
   * failures with different responses — the first is a producer bug, the second
   * is a replay — and one code for both would tell a reviewer neither.
   */
  COMPILE_RESULT_MALFORMED: "AES-C2-020",
  /** A bounded text field carries control or bidi-formatting characters. */
  UNSAFE_TEXT_CONTROL_CHARACTERS: "AES-C2-021",
  /**
   * A stored snapshot envelope has the wrong shape.
   *
   * Its own code rather than `MALFORMED_MANIFEST`, because the snapshot envelope
   * and the manifest inside it are different documents with different owners: a
   * finding that says "the manifest is malformed" when the manifest is fine and
   * an unknown key was smuggled onto the envelope sends a reviewer to the wrong
   * place.
   */
  SNAPSHOT_SHAPE_INVALID: "AES-C2-022",
} as const;

export type TiaDiagnosticCode =
  (typeof TIA_DIAGNOSTIC_CODES)[keyof typeof TIA_DIAGNOSTIC_CODES];

export const ALL_TIA_DIAGNOSTIC_CODES: readonly TiaDiagnosticCode[] =
  Object.freeze(Object.values(TIA_DIAGNOSTIC_CODES));

export function isTiaDiagnosticCode(value: unknown): value is TiaDiagnosticCode {
  return (
    typeof value === "string" &&
    (ALL_TIA_DIAGNOSTIC_CODES as readonly string[]).includes(value)
  );
}

/* ── the diagnostic value ─────────────────────────────────────────────────── */

/**
 * One normalized finding.
 *
 * `params` holds IDENTIFIERS interpolated into the translated message — a path,
 * a digest, a bound. It never holds prose: prose in a parameter is display text
 * wearing a different name, and it would be English-only in every locale.
 */
export interface TiaDiagnostic {
  readonly code: TiaDiagnosticCode;
  readonly severity: TiaDiagnosticSeverity;
  /** Key suffix inside the `tiaCompanion.diagnostics` namespace. */
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string>>;
  /** Canonical entry path the finding is about, or null when project-wide. */
  readonly entryPath: string | null;
  /** Snapshot digest the finding is about, or null when there is no snapshot yet. */
  readonly snapshotContentSha256: string | null;
}

/** Default severity per code. Every code has one, so severity is never guessed. */
const SEVERITY_BY_CODE: Readonly<Record<TiaDiagnosticCode, TiaDiagnosticSeverity>> =
  Object.freeze({
    "AES-C2-001": "error",
    "AES-C2-002": "error",
    "AES-C2-003": "error",
    "AES-C2-004": "error",
    "AES-C2-005": "error",
    "AES-C2-006": "error",
    "AES-C2-007": "error",
    "AES-C2-008": "error",
    "AES-C2-009": "error",
    "AES-C2-010": "error",
    "AES-C2-011": "error",
    "AES-C2-012": "error",
    "AES-C2-013": "error",
    "AES-C2-014": "error",
    "AES-C2-016": "error",
    "AES-C2-017": "error",
    "AES-C2-018": "error",
    "AES-C2-019": "error",
    "AES-C2-020": "error",
    "AES-C2-021": "error",
    "AES-C2-022": "error",
  });

/**
 * The message key for a code.
 *
 * Derived from the code rather than stored beside it, so a new code cannot ship
 * with a key that silently duplicates another code's.
 */
const MESSAGE_KEY_BY_CODE: Readonly<Record<TiaDiagnosticCode, string>> = Object.freeze({
  "AES-C2-001": "unsupportedPackageKind",
  "AES-C2-002": "schemaVersionUnsupported",
  "AES-C2-003": "duplicateCanonicalPath",
  "AES-C2-004": "absolutePathRejected",
  "AES-C2-005": "driveQualifiedPathRejected",
  "AES-C2-006": "pathTraversalRejected",
  "AES-C2-007": "nulByteInPath",
  "AES-C2-008": "pathLengthExceeded",
  "AES-C2-009": "pathDepthExceeded",
  "AES-C2-010": "contentHashMismatch",
  "AES-C2-011": "opaqueArchiveNotParsed",
  "AES-C2-012": "compileResultUnbound",
  "AES-C2-013": "forbiddenControllerCapability",
  "AES-C2-014": "forbiddenOrigin",
  "AES-C2-016": "malformedManifest",
  "AES-C2-017": "compileEvidenceNotDeclared",
  "AES-C2-018": "provenanceMissing",
  "AES-C2-019": "pathNotNfc",
  "AES-C2-020": "compileResultMalformed",
  "AES-C2-021": "unsafeTextControlCharacters",
  "AES-C2-022": "snapshotShapeInvalid",
});

export function severityOf(code: TiaDiagnosticCode): TiaDiagnosticSeverity {
  return SEVERITY_BY_CODE[code];
}

export function messageKeyOf(code: TiaDiagnosticCode): string {
  return MESSAGE_KEY_BY_CODE[code];
}

/** Build a diagnostic. The only constructor, so no finding can skip a field. */
export function diagnostic(
  code: TiaDiagnosticCode,
  params: Readonly<Record<string, string>> = {},
  location: {
    readonly entryPath?: string | null;
    readonly snapshotContentSha256?: string | null;
  } = {},
): TiaDiagnostic {
  return Object.freeze({
    code,
    severity: severityOf(code),
    messageKey: messageKeyOf(code),
    params: Object.freeze({ ...params }),
    entryPath: location.entryPath ?? null,
    snapshotContentSha256: location.snapshotContentSha256 ?? null,
  });
}

/* ── alignment with the Phase 94B failure vocabulary ──────────────────────── */

/**
 * The members of the `EngineeringImportFailure` enum in `prisma/schema.prisma`.
 *
 * Declared here as a closed union rather than imported from `@prisma/client`
 * for two reasons: C2.0 must not require a generated Prisma client to type-check,
 * and it must not touch the database at all. A contract test reads the schema
 * FILE and asserts this list equals the enum, so the copy cannot drift silently.
 */
export const ENGINEERING_IMPORT_FAILURES = [
  "NONE",
  "UNSUPPORTED_FORMAT",
  "SCHEMA_INVALID",
  "TOO_LARGE",
  "TOO_MANY_RECORDS",
  "DUPLICATE_IMPORT",
  "CHECKSUM_MISMATCH",
  "TENANT_MISMATCH",
  "PARSE_ERROR",
  "INTERNAL_ERROR",
] as const;

export type EngineeringImportFailureName = (typeof ENGINEERING_IMPORT_FAILURES)[number];

/**
 * Every code maps to an existing failure member.
 *
 * The companion reuses Phase 94B's vocabulary instead of adding enum members,
 * which is also why C2.0 needs no migration: an unparsed proprietary container
 * and an unknown package kind are both `UNSUPPORTED_FORMAT`, exactly as the
 * enum already intended.
 */
const IMPORT_FAILURE_BY_CODE: Readonly<
  Record<TiaDiagnosticCode, EngineeringImportFailureName>
> = Object.freeze({
  "AES-C2-001": "UNSUPPORTED_FORMAT",
  "AES-C2-002": "SCHEMA_INVALID",
  "AES-C2-003": "SCHEMA_INVALID",
  "AES-C2-004": "PARSE_ERROR",
  "AES-C2-005": "PARSE_ERROR",
  "AES-C2-006": "PARSE_ERROR",
  "AES-C2-007": "PARSE_ERROR",
  "AES-C2-008": "PARSE_ERROR",
  "AES-C2-009": "PARSE_ERROR",
  "AES-C2-010": "CHECKSUM_MISMATCH",
  "AES-C2-011": "UNSUPPORTED_FORMAT",
  "AES-C2-012": "SCHEMA_INVALID",
  "AES-C2-013": "SCHEMA_INVALID",
  "AES-C2-014": "SCHEMA_INVALID",
  "AES-C2-016": "SCHEMA_INVALID",
  "AES-C2-017": "SCHEMA_INVALID",
  "AES-C2-018": "SCHEMA_INVALID",
  "AES-C2-019": "PARSE_ERROR",
  "AES-C2-020": "SCHEMA_INVALID",
  "AES-C2-021": "SCHEMA_INVALID",
  "AES-C2-022": "SCHEMA_INVALID",
});

export function importFailureFor(code: TiaDiagnosticCode): EngineeringImportFailureName {
  return IMPORT_FAILURE_BY_CODE[code];
}

/** Counts by severity, for a caller that needs a summary without re-scanning. */
export function countBySeverity(
  findings: readonly TiaDiagnostic[],
): { error: number; warning: number; info: number } {
  const out = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) out[finding.severity] += 1;
  return out;
}
