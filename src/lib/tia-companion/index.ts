/**
 * PHASE 109-C2.0 — TIA companion, public surface.
 *
 * Consumers import from here rather than reaching into individual modules, so
 * the internal layout can change without an edit anywhere else — the same rule
 * Phase 109-C1 follows.
 *
 * The offline FIXTURES are deliberately NOT re-exported here. They live under
 * `testing/` and are reachable only by an explicit import from that path, so no
 * production module can pull synthetic engineering data into a real code path by
 * importing the barrel.
 */

export {
  canonicalSha256,
  compareCodepoints,
  digestsEqual,
  isSha256Hex,
  sha256Hex,
  stableStringify,
  TiaCanonicalError,
} from "./canonical";

export {
  admitPackageKind,
  ADMITTED_PACKAGE_KINDS,
  ARCHIVE_INGEST_DECISION,
  classifyDeclaredContainer,
  classifyEntryPath,
  compareEntryPaths,
  forbiddenCapabilityViolations,
  FORBIDDEN_CAPABILITY_KEYS,
  isSafeBoundedText,
  isTiaPackageKind,
  KNOWN_OPAQUE_CONTAINER_EXTENSIONS,
  negotiateAdapter,
  TIA_ENTRY_KINDS,
  TIA_PACKAGE_KINDS,
  TIA_PACKAGE_LIMITS,
  TIA_SAFETY_CONTRACT,
  TiaContractError,
  unsafeTextReason,
  type EntryPathVerdict,
  type TiaAdapter,
  type TiaAdapterCapabilities,
  type TiaEntryKind,
  type TiaPackageKind,
} from "./contract";

export {
  ALL_TIA_DIAGNOSTIC_CODES,
  countBySeverity,
  diagnostic,
  ENGINEERING_IMPORT_FAILURES,
  importFailureFor,
  isTiaDiagnosticCode,
  messageKeyOf,
  severityOf,
  TIA_DIAGNOSTIC_CODES,
  TIA_DIAGNOSTIC_SEVERITIES,
  type EngineeringImportFailureName,
  type TiaDiagnostic,
  type TiaDiagnosticCode,
  type TiaDiagnosticSeverity,
} from "./diagnostics";

export {
  admitsImportedOrigin,
  assertC2PermittedOrigin,
  C2_PERMITTED_ORIGINS,
  C2_REFUSED_KNOWN_ORIGINS,
  C2_REFUSED_LIVE_ORIGINS,
  isC2PermittedOrigin,
} from "./origin-policy";

export {
  admitValidatedManifest,
  boundedNameProblem,
  canonicaliseManifest,
  EXACT_ENTRY_KEYS,
  EXACT_MANIFEST_KEYS,
  EXACT_PROJECT_KEYS,
  canonicalManifestValue,
  ENTRY_KIND_TUPLE,
  MANIFEST_ENTRY_KINDS,
  isValidatedManifest,
  keySetProblems,
  manifestContentSha256,
  manifestInvariantViolations,
  MAX_RAW_PATH_INPUT_LENGTH,
  PACKAGE_KIND_TUPLE,
  SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
  TiaManifestEntrySchema,
  TiaPackageManifestSchema,
  TiaProjectHeaderSchema,
  validateManifest,
  validateStoredManifest,
  type ManifestValidation,
  type StoredManifestValidation,
  type TiaManifestEntry,
  type TiaManifestSchemaVersion,
  type TiaPackageManifest,
  type ValidatedTiaPackageManifest,
} from "./package-manifest";

export {
  assertProvenance,
  createSnapshot,
  EXACT_PROVENANCE_KEYS,
  EXACT_SNAPSHOT_KEYS,
  MAX_DISCLOSURE_LENGTH,
  provenanceProblem,
  snapshotIdentityValue,
  verifySnapshot,
  type ProvenanceProblem,
  type SnapshotVerification,
  type TiaProvenance,
  type TiaSnapshot,
} from "./snapshot";

export {
  bindCompileResult,
  COMPILE_EVIDENCE,
  COMPILE_SEVERITY_TOKENS,
  compileCountBySeverity,
  DeclaredCompileEntrySchema,
  DeclaredCompileResultSchema,
  severityOfToken,
  type CompileBinding,
  type CompileEvidence,
  type CompileSeverityToken,
  type DeclaredCompileEntry,
  type DeclaredCompileResult,
  type NormalizedCompileFinding,
} from "./compile-result";

export {
  ALL_TIA_ADAPTERS,
  OFFLINE_ADAPTER_CAPABILITIES,
  OFFLINE_FIXTURE_ADAPTER,
} from "./offline-adapter";
