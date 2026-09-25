/**
 * PHASE 112 — API response projections.
 *
 * Runs and artifacts hold no secrets (the RAW_INPUT snapshot is allowlisted and
 * the analysis is deterministic tenant data), but the client projection is still
 * explicit: it omits the internal `requestFingerprint` and shapes a stable view.
 */
import type {
  ReasoningRunArtifactRecord,
  ReasoningRunRecord,
  ReasoningRunWithArtifacts,
} from "./types";

export interface RunProjection {
  id: string;
  organizationId: string;
  siteId: string | null;
  assetId: string | null;
  initiatedByUserId: string | null;
  sourceChannel: string;
  status: string;
  engine: {
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
  };
  schemaVersion: string;
  idempotencyKey: string;
  parentRunId: string | null;
  digests: { input: string; output: string; manifest: string };
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export function projectRun(run: ReasoningRunRecord): RunProjection {
  return {
    id: run.id,
    organizationId: run.organizationId,
    siteId: run.siteId,
    assetId: run.assetId,
    initiatedByUserId: run.initiatedByUserId,
    sourceChannel: run.sourceChannel,
    status: run.status,
    engine: {
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
    },
    schemaVersion: run.schemaVersion,
    idempotencyKey: run.idempotencyKey,
    parentRunId: run.parentRunId,
    digests: { input: run.inputDigest, output: run.outputDigest, manifest: run.manifestDigest },
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
  };
}

export interface ArtifactProjection {
  kind: string;
  schemaVersion: string;
  digest: string;
  byteSize: number;
  payload: unknown;
}

export function projectArtifact(a: ReasoningRunArtifactRecord): ArtifactProjection {
  return { kind: a.kind, schemaVersion: a.schemaVersion, digest: a.digest, byteSize: a.byteSize, payload: a.payload };
}

export function projectRunView(view: ReasoningRunWithArtifacts): {
  run: RunProjection;
  artifacts: ArtifactProjection[];
} {
  return { run: projectRun(view.run), artifacts: view.artifacts.map(projectArtifact) };
}
