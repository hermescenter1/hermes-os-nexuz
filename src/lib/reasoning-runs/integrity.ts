/**
 * PHASE 112 — Integrity: artifact digests, manifest binding, verification.
 *
 * The manifest digest binds every artifact digest AND every declared engine/
 * version field, so altering any artifact, the stored manifest, the input digest
 * or the output digest changes the manifest digest and is detected here.
 *
 * Digest scope (see docs/industrial/phase112-replay-and-integrity-model.md):
 *   - Each artifact digest = SHA-256 over the canonical bytes of its payload
 *     (engine-agnostic; verifiable from stored bytes alone).
 *   - run.inputDigest  = digest of the NORMALIZED_INPUT artifact.
 *   - run.outputDigest = digest of the ANALYSIS_OUTPUT artifact, which is the
 *     SEMANTIC output (non-semantic runtime metadata such as `processingMs` is
 *     excluded), so it is verifiable from stored bytes AND is exactly what an
 *     execution replay compares against. It is also bound into the manifest digest.
 */
import { canonicalSha256, stableStringify, CANONICAL_PROFILE_VERSION } from "./canonical-json";
import type {
  EngineManifest,
  ReasoningRunArtifactKind,
  ReasoningRunArtifactRecord,
  ReasoningRunRecord,
} from "./types";

/** Compute the canonical digest and byte size of an artifact payload. */
export function computeArtifactDigest(payload: unknown): { digest: string; byteSize: number } {
  const canonical = stableStringify(payload);
  return {
    digest: canonicalSha256(payload),
    byteSize: Buffer.byteLength(canonical, "utf8"),
  };
}

/** The artifact kinds that every replay-capable run must carry. */
export const REQUIRED_ARTIFACT_KINDS: ReasoningRunArtifactKind[] = [
  "RAW_INPUT",
  "NORMALIZED_INPUT",
  "EVIDENCE",
  "ENGINE_MANIFEST",
  "ANALYSIS_OUTPUT",
  "REASONING_MAP",
  "UNCERTAINTY",
  "SAFE_ACTION",
];

export interface ManifestDigestInput {
  manifest: EngineManifest;
  inputDigest: string;
  outputDigest: string;
  artifactDigests: Array<{ kind: ReasoningRunArtifactKind; digest: string }>;
}

/** Deterministically bind manifest fields + artifact digests into one digest. */
export function buildManifestDigest(input: ManifestDigestInput): string {
  const artifacts = [...input.artifactDigests]
    .map((a) => ({ kind: a.kind, digest: a.digest }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return canonicalSha256({
    profile: CANONICAL_PROFILE_VERSION,
    manifest: input.manifest,
    inputDigest: input.inputDigest,
    outputDigest: input.outputDigest,
    artifacts,
  });
}

/** Extract the engine manifest fields from a stored run row. */
export function manifestFromRun(run: ReasoningRunRecord): EngineManifest {
  return {
    engineId: run.engineId,
    engineVersion: run.engineVersion,
    rulePackVersion: run.rulePackVersion,
    caseCorpusVersion: run.caseCorpusVersion,
    caseCorpusChecksum: run.caseCorpusChecksum,
    graphRevision: run.graphRevision,
    graphChecksum: run.graphChecksum,
    documentCorpusChecksum: run.documentCorpusChecksum,
    modelProvider: run.modelProvider,
    modelVersion: run.modelVersion,
    modelConfigVersion: run.modelConfigVersion,
    schemaVersion: run.schemaVersion,
  };
}

export type IntegrityIssueCode =
  | "ARTIFACT_DIGEST_MISMATCH"
  | "ARTIFACT_BYTESIZE_MISMATCH"
  | "MISSING_ARTIFACT"
  | "INPUT_DIGEST_MISMATCH"
  | "OUTPUT_DIGEST_MISMATCH"
  | "MANIFEST_SNAPSHOT_MISMATCH"
  | "MANIFEST_DIGEST_MISMATCH";

export interface IntegrityIssue {
  code: IntegrityIssueCode;
  detail: string;
}

export interface IntegrityResult {
  ok: boolean;
  issues: IntegrityIssue[];
}

/**
 * Verify a run and its artifacts against their stored digests. Pure; makes no
 * DB or engine calls. Returns every issue found (does not stop at the first).
 */
export function verifyRunIntegrity(
  run: ReasoningRunRecord,
  artifacts: ReasoningRunArtifactRecord[],
): IntegrityResult {
  const issues: IntegrityIssue[] = [];
  const byKind = new Map<ReasoningRunArtifactKind, ReasoningRunArtifactRecord>();

  for (const artifact of artifacts) {
    // Each artifact's digest + byte size must recompute from its payload.
    let recomputed: { digest: string; byteSize: number };
    try {
      recomputed = computeArtifactDigest(artifact.payload);
    } catch {
      issues.push({ code: "ARTIFACT_DIGEST_MISMATCH", detail: `${artifact.kind}: payload not canonicalizable` });
      continue;
    }
    if (recomputed.digest !== artifact.digest) {
      issues.push({ code: "ARTIFACT_DIGEST_MISMATCH", detail: artifact.kind });
    }
    if (recomputed.byteSize !== artifact.byteSize) {
      issues.push({ code: "ARTIFACT_BYTESIZE_MISMATCH", detail: artifact.kind });
    }
    byKind.set(artifact.kind, artifact);
  }

  for (const kind of REQUIRED_ARTIFACT_KINDS) {
    if (!byKind.has(kind)) {
      issues.push({ code: "MISSING_ARTIFACT", detail: kind });
    }
  }

  // Input digest must equal the NORMALIZED_INPUT artifact digest.
  const normalized = byKind.get("NORMALIZED_INPUT");
  if (normalized && normalized.digest !== run.inputDigest) {
    issues.push({ code: "INPUT_DIGEST_MISMATCH", detail: "NORMALIZED_INPUT digest != run.inputDigest" });
  }

  // Output digest must equal the ANALYSIS_OUTPUT artifact digest (the semantic
  // output), so the recorded output is verifiable from the stored bytes.
  const analysisOutput = byKind.get("ANALYSIS_OUTPUT");
  if (analysisOutput && analysisOutput.digest !== run.outputDigest) {
    issues.push({ code: "OUTPUT_DIGEST_MISMATCH", detail: "ANALYSIS_OUTPUT digest != run.outputDigest" });
  }

  // The stored ENGINE_MANIFEST snapshot must equal the run's manifest fields.
  const manifestArtifact = byKind.get("ENGINE_MANIFEST");
  if (manifestArtifact) {
    const runManifestCanonical = stableStringify(manifestFromRun(run));
    const storedManifestCanonical = (() => {
      try {
        return stableStringify(manifestArtifact.payload);
      } catch {
        return null;
      }
    })();
    if (storedManifestCanonical === null || storedManifestCanonical !== runManifestCanonical) {
      issues.push({ code: "MANIFEST_SNAPSHOT_MISMATCH", detail: "ENGINE_MANIFEST payload != run manifest fields" });
    }
  }

  // The manifest digest must recompute from the manifest + all artifact digests.
  const recomputedManifestDigest = buildManifestDigest({
    manifest: manifestFromRun(run),
    inputDigest: run.inputDigest,
    outputDigest: run.outputDigest,
    artifactDigests: artifacts.map((a) => ({ kind: a.kind, digest: a.digest })),
  });
  if (recomputedManifestDigest !== run.manifestDigest) {
    issues.push({ code: "MANIFEST_DIGEST_MISMATCH", detail: "recomputed manifest digest != run.manifestDigest" });
  }

  return { ok: issues.length === 0, issues };
}
