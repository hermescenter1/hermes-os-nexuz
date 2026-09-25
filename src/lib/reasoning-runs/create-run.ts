/**
 * PHASE 112 — Create a persistent reasoning run.
 *
 * Pipeline (all server-side; tenant context already resolved by the caller):
 *   1. resolve the exact registered engine (fail closed if unavailable);
 *   2. freeze the manifest BEFORE execution;
 *   3. normalize + canonicalize input;
 *   4. execute the deterministic engine ONCE (no side effects);
 *   5. derive bounded, allowlisted artifacts from TRUSTED server output;
 *   6. compute artifact + manifest digests;
 *   7. persist run + artifacts ATOMICALLY, idempotent on (org, key);
 *   8. reusing a key with a different fingerprint is rejected.
 *
 * The client never supplies an output snapshot — only raw input. The RAW_INPUT
 * artifact is rebuilt by allowlist, so extra client keys cannot enter the ledger.
 */
import { canonicalSha256, sanitizeForCanonical } from "./canonical-json";
import { resolveEngine } from "./engine-registry";
import { buildManifestDigest, computeArtifactDigest } from "./integrity";
import { boundedRawInputSnapshot } from "./redaction";
import { reasoningRunRepository } from "./prisma-repository";
import type { PersistArtifact, ReasoningRunRepository } from "./repository";
import {
  REASONING_RUN_SCHEMA_VERSION,
  type CreateRunInput,
  type CreateRunStatus,
  type ReasoningRunArtifactKind,
  type ReasoningRunRecord,
} from "./types";

export interface CreateRunResult {
  status: CreateRunStatus;
  run: ReasoningRunRecord | null;
  /** Set when status is ENGINE_ERROR — the error CLASS only, never a stack. */
  errorClass?: string;
}

/** Build the fingerprint that binds normalized input + declared manifest. */
function fingerprint(normalizedInput: unknown, manifest: unknown): string {
  return canonicalSha256({ normalizedInput, manifest });
}

export async function createReasoningRun(
  input: CreateRunInput,
  repo: ReasoningRunRepository = reasoningRunRepository,
): Promise<CreateRunResult> {
  const engine = resolveEngine(input.engineId, input.engineVersion);
  if (!engine) {
    return { status: "ENGINE_UNAVAILABLE", run: null };
  }

  const manifest = engine.manifest();

  // Normalize + execute the deterministic engine exactly once.
  let normalizedInput: unknown;
  let semanticOutput: unknown;
  let evidence: unknown;
  let reasoningMap: unknown;
  let uncertainty: unknown;
  let safeAction: unknown;
  try {
    normalizedInput = sanitizeForCanonical(engine.normalize(input.rawInput));
    const out = engine.execute(normalizedInput);
    // The stored analysis snapshot is the SEMANTIC output (non-semantic runtime
    // metadata such as `processingMs` is excluded), so the ledger is fully
    // deterministic: identical semantic input always yields identical digests.
    semanticOutput = sanitizeForCanonical(out.semanticOutput);
    evidence = sanitizeForCanonical(out.evidence);
    reasoningMap = sanitizeForCanonical(out.reasoningMap);
    uncertainty = sanitizeForCanonical(out.uncertainty);
    safeAction = sanitizeForCanonical(out.safeAction);
  } catch (e) {
    return { status: "ENGINE_ERROR", run: null, errorClass: (e as Error)?.name ?? "Error" };
  }

  const rawInputSnapshot = boundedRawInputSnapshot(input.rawInput);

  // Derive artifacts (server-trusted). HUMAN_DECISION is never created here.
  const artifactPayloads: Array<{ kind: ReasoningRunArtifactKind; payload: unknown }> = [
    { kind: "RAW_INPUT", payload: rawInputSnapshot },
    { kind: "NORMALIZED_INPUT", payload: normalizedInput },
    { kind: "EVIDENCE", payload: evidence },
    { kind: "ENGINE_MANIFEST", payload: manifest },
    { kind: "ANALYSIS_OUTPUT", payload: semanticOutput },
    { kind: "REASONING_MAP", payload: reasoningMap },
    { kind: "UNCERTAINTY", payload: uncertainty },
    { kind: "SAFE_ACTION", payload: safeAction },
  ];

  const artifacts: PersistArtifact[] = artifactPayloads.map(({ kind, payload }) => {
    const { digest, byteSize } = computeArtifactDigest(payload);
    return { kind, schemaVersion: REASONING_RUN_SCHEMA_VERSION, payload, digest, byteSize };
  });

  const normalizedArtifact = artifacts.find((a) => a.kind === "NORMALIZED_INPUT")!;
  const inputDigest = normalizedArtifact.digest;
  const outputDigest = canonicalSha256(semanticOutput);
  const manifestDigest = buildManifestDigest({
    manifest,
    inputDigest,
    outputDigest,
    artifactDigests: artifacts.map((a) => ({ kind: a.kind, digest: a.digest })),
  });

  const now = new Date();
  const persisted = await repo.persistRun({
    run: {
      organizationId: input.organizationId,
      siteId: input.siteId,
      assetId: input.assetId,
      initiatedByUserId: input.initiatedByUserId,
      sourceChannel: input.sourceChannel,
      status: "COMPLETED",
      engineId: manifest.engineId,
      engineVersion: manifest.engineVersion,
      rulePackVersion: manifest.rulePackVersion,
      caseCorpusVersion: manifest.caseCorpusVersion,
      caseCorpusChecksum: manifest.caseCorpusChecksum,
      graphRevision: manifest.graphRevision,
      graphChecksum: manifest.graphChecksum,
      documentCorpusChecksum: manifest.documentCorpusChecksum,
      modelProvider: manifest.modelProvider,
      modelVersion: manifest.modelVersion,
      modelConfigVersion: manifest.modelConfigVersion,
      schemaVersion: REASONING_RUN_SCHEMA_VERSION,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(normalizedInput, manifest),
      parentRunId: null,
      startedAt: now,
      completedAt: now,
      inputDigest,
      outputDigest,
      manifestDigest,
      errorClass: null,
    },
    artifacts,
  });

  if (persisted.outcome === "KEY_FINGERPRINT_MISMATCH") {
    return { status: "KEY_FINGERPRINT_MISMATCH", run: persisted.run };
  }
  return {
    status: persisted.outcome === "IDEMPOTENT_REPLAY" ? "IDEMPOTENT_REPLAY" : "CREATED",
    run: persisted.run,
  };
}
