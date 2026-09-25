/**
 * PHASE 112 — Reasoning-run domain types (server-only).
 *
 * These types describe the immutable reasoning-run ledger at the service/port
 * boundary. They mirror the Prisma enums as string-literal unions so the domain
 * services do not have to import generated enum objects everywhere.
 */

/** Phase 112 schema version stamped on every run + artifact. */
export const REASONING_RUN_SCHEMA_VERSION = "1.0.0";

export type ReasoningRunSourceChannel =
  | "INTERACTIVE"
  | "TELEMETRY"
  | "ALARM"
  | "EVIDENCE_UPDATE"
  | "REPLAY";

export type ReasoningRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type ReasoningRunArtifactKind =
  | "RAW_INPUT"
  | "NORMALIZED_INPUT"
  | "EVIDENCE"
  | "ENGINE_MANIFEST"
  | "ANALYSIS_OUTPUT"
  | "REASONING_MAP"
  | "UNCERTAINTY"
  | "SAFE_ACTION"
  | "HUMAN_DECISION";

export type ReasoningReplayMode = "ARCHIVAL" | "EXECUTION";

export type ReasoningReplayEngineAvailability =
  | "AVAILABLE"
  | "ENGINE_VERSION_UNAVAILABLE"
  | "NOT_APPLICABLE";

export type ReasoningReplayOutcome =
  | "MATCH"
  | "MISMATCH"
  | "ARCHIVAL_VERIFIED"
  | "ENGINE_VERSION_UNAVAILABLE"
  | "INTEGRITY_FAILURE";

/**
 * Frozen engine identity + all version/checksum fields declared for a run.
 * NULL means not-applicable (the deterministic Industrial Brain consults no
 * case corpus, graph, document corpus, model or provider). Missing versions are
 * NEVER defaulted to "latest"/"current"/"unknown".
 */
export interface EngineManifest {
  engineId: string;
  engineVersion: string;
  rulePackVersion: string;
  caseCorpusVersion: string | null;
  caseCorpusChecksum: string | null;
  graphRevision: number | null;
  graphChecksum: string | null;
  documentCorpusChecksum: string | null;
  modelProvider: string | null;
  modelVersion: string | null;
  modelConfigVersion: string | null;
  schemaVersion: string;
}

/** What a registered engine produces from a single execution. */
export interface EngineOutput {
  /**
   * The canonical SEMANTIC output — the value whose digest is compared on an
   * execution replay. It MUST exclude non-semantic runtime metadata such as
   * `processingMs`.
   */
  semanticOutput: unknown;
  /** The full output snapshot for archival (may retain runtime metadata). */
  rawOutput: unknown;
  /** Evidence the engine saw, as a redacted/allowlisted snapshot. */
  evidence: unknown;
  /** Reasoning map snapshot. */
  reasoningMap: unknown;
  /** Uncertainty snapshot. */
  uncertainty: unknown;
  /** Safe Action / recommendation snapshot. */
  safeAction: unknown;
}

/**
 * A registered, replay-capable reasoning engine. `normalize` and `execute` are
 * separated so an execution replay can run the EXACT stored normalized input
 * without re-normalizing raw text.
 */
export interface ReasoningEngine {
  readonly engineId: string;
  readonly engineVersion: string;
  /** Freeze the manifest (versions/checksums) for this engine build. */
  manifest(): EngineManifest;
  /** Deterministically normalize validated raw input into the frozen input. */
  normalize(rawInput: unknown): unknown;
  /** Deterministically execute over a normalized input. No side effects. */
  execute(normalizedInput: unknown): EngineOutput;
}

/** Input to create a persistent run — the server supplies tenant context. */
export interface CreateRunInput {
  organizationId: string;
  siteId: string | null;
  assetId: string | null;
  initiatedByUserId: string | null;
  sourceChannel: ReasoningRunSourceChannel;
  /** The validated Industrial Brain raw input (already Zod-parsed by the route). */
  rawInput: unknown;
  /** Bounded idempotency key (validated format). */
  idempotencyKey: string;
  engineId: string;
  engineVersion: string;
}

export type CreateRunStatus =
  | "CREATED"
  | "IDEMPOTENT_REPLAY"
  | "KEY_FINGERPRINT_MISMATCH"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_ERROR";

/** Stored run row as the domain sees it (projection excludes nothing internal). */
export interface ReasoningRunRecord {
  id: string;
  organizationId: string;
  siteId: string | null;
  assetId: string | null;
  initiatedByUserId: string | null;
  sourceChannel: ReasoningRunSourceChannel;
  status: ReasoningRunStatus;
  engineId: string;
  engineVersion: string;
  rulePackVersion: string;
  caseCorpusVersion: string | null;
  caseCorpusChecksum: string | null;
  graphRevision: number | null;
  graphChecksum: string | null;
  documentCorpusChecksum: string | null;
  modelProvider: string | null;
  modelVersion: string | null;
  modelConfigVersion: string | null;
  schemaVersion: string;
  idempotencyKey: string;
  requestFingerprint: string;
  parentRunId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  inputDigest: string;
  outputDigest: string;
  manifestDigest: string;
  errorClass: string | null;
  createdAt: Date;
}

export interface ReasoningRunArtifactRecord {
  id: string;
  organizationId: string;
  runId: string;
  kind: ReasoningRunArtifactKind;
  schemaVersion: string;
  payload: unknown;
  digest: string;
  byteSize: number;
  createdAt: Date;
}

export interface ReasoningReplayAttemptRecord {
  id: string;
  organizationId: string;
  runId: string;
  requestedByUserId: string | null;
  mode: ReasoningReplayMode;
  requestedEngineVersion: string | null;
  engineAvailability: ReasoningReplayEngineAvailability;
  outcome: ReasoningReplayOutcome;
  originalOutputDigest: string;
  replayedOutputDigest: string | null;
  mismatchSummary: string | null;
  correlationId: string | null;
  createdAt: Date;
}

/** A run plus its artifacts, as returned by a read. */
export interface ReasoningRunWithArtifacts {
  run: ReasoningRunRecord;
  artifacts: ReasoningRunArtifactRecord[];
}
