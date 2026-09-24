/**
 * PHASE 112 — Reasoning-run repository PORT.
 *
 * The port exposes CREATE and READ only. There is deliberately NO update/upsert
 * of run or artifact CONTENT — immutability is a property of the port, backed by
 * DB triggers. `appendReplayAttempt` writes a SEPARATE append-only record and
 * never touches the original run.
 *
 * Storage is fail-closed: when no durable database is configured the concrete
 * repository throws `ReasoningRunStorageUnavailableError` rather than falling
 * back to session/global memory for tenant-private durable runs.
 */
import type {
  ReasoningReplayAttemptRecord,
  ReasoningReplayEngineAvailability,
  ReasoningReplayMode,
  ReasoningReplayOutcome,
  ReasoningRunArtifactKind,
  ReasoningRunRecord,
  ReasoningRunSourceChannel,
  ReasoningRunStatus,
  ReasoningRunWithArtifacts,
} from "./types";

export class ReasoningRunStorageUnavailableError extends Error {
  constructor() {
    super("Reasoning-run durable storage is unavailable (no fail-open fallback)");
    this.name = "ReasoningRunStorageUnavailableError";
  }
}

export interface PersistArtifact {
  kind: ReasoningRunArtifactKind;
  schemaVersion: string;
  payload: unknown;
  digest: string;
  byteSize: number;
}

export interface PersistRunFields {
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
}

export interface PersistRunInput {
  run: PersistRunFields;
  artifacts: PersistArtifact[];
}

export type PersistRunOutcome =
  | { outcome: "CREATED"; run: ReasoningRunRecord }
  | { outcome: "IDEMPOTENT_REPLAY"; run: ReasoningRunRecord }
  | { outcome: "KEY_FINGERPRINT_MISMATCH"; run: ReasoningRunRecord };

export interface AppendReplayInput {
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
}

export interface ReasoningRunRepository {
  /** Atomically persist a run + its artifacts. Idempotent on (org, key). */
  persistRun(input: PersistRunInput): Promise<PersistRunOutcome>;
  /** Read a run + artifacts, tenant-scoped. Foreign/missing → null. */
  findRunWithArtifacts(organizationId: string, runId: string): Promise<ReasoningRunWithArtifacts | null>;
  /** Append a separate, immutable replay record. Never mutates the run. */
  appendReplayAttempt(input: AppendReplayInput): Promise<ReasoningReplayAttemptRecord>;
}
