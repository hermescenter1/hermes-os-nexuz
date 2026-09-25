/**
 * PHASE 112 — Replay a reasoning run.
 *
 * ARCHIVAL  = verify every artifact + manifest digest, then return the immutable
 *             snapshots. No engine execution, no external side effects.
 * EXECUTION = verify integrity FIRST; resolve the EXACT historical engine from
 *             the internal registry (refuse if unavailable); re-execute using the
 *             frozen normalized input ONLY; compare the canonical semantic-output
 *             digest to the original.
 *
 * A replay NEVER mutates the original run: it appends a separate, immutable
 * ReasoningReplayAttempt. It triggers no OT action, work order, notification,
 * automation or external side effect — the engine's `execute` is a pure function
 * and no recommendation is ever acted upon.
 */
import { canonicalSha256, sanitizeForCanonical } from "./canonical-json";
import { resolveEngine } from "./engine-registry";
import { verifyRunIntegrity } from "./integrity";
import { reasoningRunRepository } from "./prisma-repository";
import type { ReasoningRunRepository } from "./repository";
import type {
  ReasoningReplayMode,
  ReasoningReplayOutcome,
  ReasoningRunArtifactRecord,
} from "./types";

export interface ReplayRequest {
  organizationId: string;
  runId: string;
  requestedByUserId: string | null;
  mode: ReasoningReplayMode;
  correlationId: string | null;
}

export type ReplayResult =
  | { kind: "NOT_FOUND" }
  | {
      kind: "DONE";
      mode: ReasoningReplayMode;
      outcome: ReasoningReplayOutcome;
      originalOutputDigest: string;
      replayedOutputDigest: string | null;
      integrityIssues: string[];
      /** Snapshots returned only for a verified ARCHIVAL replay. */
      artifacts: ReasoningRunArtifactRecord[] | null;
    };

/** A short, non-sensitive mismatch note. Digests are non-secret; plant data is never echoed. */
function digestMismatchSummary(expected: string, actual: string): string {
  return `semantic output digest mismatch: expected ${expected.slice(0, 12)}… got ${actual.slice(0, 12)}…`;
}

export async function replayReasoningRun(
  req: ReplayRequest,
  repo: ReasoningRunRepository = reasoningRunRepository,
): Promise<ReplayResult> {
  const found = await repo.findRunWithArtifacts(req.organizationId, req.runId);
  if (!found) return { kind: "NOT_FOUND" };

  const { run, artifacts } = found;
  const integrity = verifyRunIntegrity(run, artifacts);

  // Integrity is checked BEFORE any engine execution, for BOTH modes.
  if (!integrity.ok) {
    const issues = integrity.issues.map((i) => i.code);
    await repo.appendReplayAttempt({
      organizationId: req.organizationId,
      runId: run.id,
      requestedByUserId: req.requestedByUserId,
      mode: req.mode,
      requestedEngineVersion: req.mode === "EXECUTION" ? run.engineVersion : null,
      engineAvailability: "NOT_APPLICABLE",
      outcome: "INTEGRITY_FAILURE",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      mismatchSummary: `integrity failure: ${issues.join(",")}`.slice(0, 2000),
      correlationId: req.correlationId,
    });
    return {
      kind: "DONE",
      mode: req.mode,
      outcome: "INTEGRITY_FAILURE",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      integrityIssues: issues,
      artifacts: null,
    };
  }

  if (req.mode === "ARCHIVAL") {
    await repo.appendReplayAttempt({
      organizationId: req.organizationId,
      runId: run.id,
      requestedByUserId: req.requestedByUserId,
      mode: "ARCHIVAL",
      requestedEngineVersion: null,
      engineAvailability: "NOT_APPLICABLE",
      outcome: "ARCHIVAL_VERIFIED",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      mismatchSummary: null,
      correlationId: req.correlationId,
    });
    return {
      kind: "DONE",
      mode: "ARCHIVAL",
      outcome: "ARCHIVAL_VERIFIED",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      integrityIssues: [],
      artifacts,
    };
  }

  // EXECUTION replay — resolve the EXACT historical engine or refuse.
  const engine = resolveEngine(run.engineId, run.engineVersion);
  if (!engine) {
    await repo.appendReplayAttempt({
      organizationId: req.organizationId,
      runId: run.id,
      requestedByUserId: req.requestedByUserId,
      mode: "EXECUTION",
      requestedEngineVersion: run.engineVersion,
      engineAvailability: "ENGINE_VERSION_UNAVAILABLE",
      outcome: "ENGINE_VERSION_UNAVAILABLE",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      mismatchSummary: null,
      correlationId: req.correlationId,
    });
    return {
      kind: "DONE",
      mode: "EXECUTION",
      outcome: "ENGINE_VERSION_UNAVAILABLE",
      originalOutputDigest: run.outputDigest,
      replayedOutputDigest: null,
      integrityIssues: [],
      artifacts: null,
    };
  }

  // Re-execute using the FROZEN normalized input only (never re-normalized).
  const normalized = artifacts.find((a) => a.kind === "NORMALIZED_INPUT")!.payload;
  const out = engine.execute(normalized);
  const replayedOutputDigest = canonicalSha256(sanitizeForCanonical(out.semanticOutput));
  const matched = replayedOutputDigest === run.outputDigest;
  const outcome: ReasoningReplayOutcome = matched ? "MATCH" : "MISMATCH";

  await repo.appendReplayAttempt({
    organizationId: req.organizationId,
    runId: run.id,
    requestedByUserId: req.requestedByUserId,
    mode: "EXECUTION",
    requestedEngineVersion: run.engineVersion,
    engineAvailability: "AVAILABLE",
    outcome,
    originalOutputDigest: run.outputDigest,
    replayedOutputDigest,
    mismatchSummary: matched ? null : digestMismatchSummary(run.outputDigest, replayedOutputDigest),
    correlationId: req.correlationId,
  });

  return {
    kind: "DONE",
    mode: "EXECUTION",
    outcome,
    originalOutputDigest: run.outputDigest,
    replayedOutputDigest,
    integrityIssues: [],
    artifacts: null,
  };
}
