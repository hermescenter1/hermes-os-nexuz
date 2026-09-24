import { describe, it, expect } from "vitest";
import { createReasoningRun } from "../create-run";
import { replayReasoningRun } from "../replay-run";
import { buildManifestDigest, computeArtifactDigest, manifestFromRun } from "../integrity";
import {
  INDUSTRIAL_BRAIN_ENGINE_ID,
  INDUSTRIAL_BRAIN_ENGINE_VERSION,
} from "../engine-industrial-brain";
import { InMemoryReasoningRunRepository } from "./fake-repository";
import type { CreateRunInput } from "../types";

const ORG = "org_a";

function baseInput(overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    organizationId: ORG,
    siteId: null,
    assetId: null,
    initiatedByUserId: "user_1",
    sourceChannel: "INTERACTIVE",
    rawInput: {
      problemTitle: "Conveyor drive stops intermittently",
      observedSymptoms: "Drive faults intermittently with an overtemperature warning on the VFD.",
    },
    idempotencyKey: "idem-replay-000000001",
    engineId: INDUSTRIAL_BRAIN_ENGINE_ID,
    engineVersion: INDUSTRIAL_BRAIN_ENGINE_VERSION,
    ...overrides,
  };
}

async function seed(): Promise<{ repo: InMemoryReasoningRunRepository; runId: string }> {
  const repo = new InMemoryReasoningRunRepository();
  const res = await createReasoningRun(baseInput(), repo);
  return { repo, runId: res.run!.id };
}

/** Recompute the manifest digest to keep a (deliberately tampered) run internally consistent. */
function recomputeManifest(repo: InMemoryReasoningRunRepository, runId: string): void {
  const run = repo.runs.get(runId)!;
  const artifacts = repo.artifactsByRun.get(runId)!;
  run.manifestDigest = buildManifestDigest({
    manifest: manifestFromRun(run),
    inputDigest: run.inputDigest,
    outputDigest: run.outputDigest,
    artifactDigests: artifacts.map((a) => ({ kind: a.kind, digest: a.digest })),
  });
}

describe("replay — ARCHIVAL", () => {
  it("verifies hashes and returns the immutable snapshots without re-executing", async () => {
    const { repo, runId } = await seed();
    const before = JSON.stringify([repo.runs.get(runId), repo.artifactsByRun.get(runId)]);
    const persistCallsBefore = repo.calls.persistRun;

    const res = await replayReasoningRun(
      { organizationId: ORG, runId, requestedByUserId: "u", mode: "ARCHIVAL", correlationId: "c1" },
      repo,
    );

    expect(res.kind).toBe("DONE");
    if (res.kind !== "DONE") return;
    expect(res.outcome).toBe("ARCHIVAL_VERIFIED");
    expect(res.artifacts).not.toBeNull();
    // Original run + artifacts are byte-identical, and nothing was persisted anew.
    expect(JSON.stringify([repo.runs.get(runId), repo.artifactsByRun.get(runId)])).toBe(before);
    expect(repo.calls.persistRun).toBe(persistCallsBefore);
    expect(repo.replays).toHaveLength(1);
    expect(repo.replays[0].outcome).toBe("ARCHIVAL_VERIFIED");
  });
});

describe("replay — EXECUTION", () => {
  it("MATCH when the same registered engine reproduces the original output", async () => {
    const { repo, runId } = await seed();
    const res = await replayReasoningRun(
      { organizationId: ORG, runId, requestedByUserId: "u", mode: "EXECUTION", correlationId: "c2" },
      repo,
    );
    expect(res.kind).toBe("DONE");
    if (res.kind !== "DONE") return;
    expect(res.outcome).toBe("MATCH");
    expect(res.replayedOutputDigest).toBe(res.originalOutputDigest);
    expect(repo.replays.at(-1)!.engineAvailability).toBe("AVAILABLE");
  });

  it("MISMATCH when the frozen input no longer reproduces the recorded output", async () => {
    const { repo, runId } = await seed();
    // Replace the frozen NORMALIZED_INPUT with a semantically different input and
    // re-derive its digest + the manifest so INTEGRITY passes; the stored
    // ANALYSIS_OUTPUT (and run.outputDigest) still describe the ORIGINAL input,
    // so a fresh execution of the tampered input diverges → MISMATCH.
    const run = repo.runs.get(runId)!;
    const artifacts = repo.artifactsByRun.get(runId)!;
    const normalized = artifacts.find((a) => a.kind === "NORMALIZED_INPUT")!;
    normalized.payload = {
      problemTitle: "Totally different fault about a leaking hydraulic line",
      observedSymptoms: "Hydraulic pressure dropping and visible oil leak at the cylinder gland seal.",
    };
    const rec = computeArtifactDigest(normalized.payload);
    normalized.digest = rec.digest;
    normalized.byteSize = rec.byteSize;
    run.inputDigest = rec.digest;
    recomputeManifest(repo, runId);

    const res = await replayReasoningRun(
      { organizationId: ORG, runId, requestedByUserId: "u", mode: "EXECUTION", correlationId: "c3" },
      repo,
    );
    expect(res.kind).toBe("DONE");
    if (res.kind !== "DONE") return;
    expect(res.outcome).toBe("MISMATCH");
    expect(res.replayedOutputDigest).not.toBe(res.originalOutputDigest);
    expect(repo.replays.at(-1)!.mismatchSummary).toContain("mismatch");
  });

  it("ENGINE_VERSION_UNAVAILABLE when the historical engine version is not registered", async () => {
    const { repo, runId } = await seed();
    const run = repo.runs.get(runId)!;
    const artifacts = repo.artifactsByRun.get(runId)!;
    // Retag the run AND the ENGINE_MANIFEST snapshot to an unregistered version,
    // keeping every digest internally consistent so integrity passes first.
    run.engineVersion = "9.9.9";
    const manifestArtifact = artifacts.find((a) => a.kind === "ENGINE_MANIFEST")!;
    manifestArtifact.payload = manifestFromRun(run);
    const recomputed = computeArtifactDigest(manifestArtifact.payload);
    manifestArtifact.digest = recomputed.digest;
    manifestArtifact.byteSize = recomputed.byteSize;
    recomputeManifest(repo, runId);

    const res = await replayReasoningRun(
      { organizationId: ORG, runId, requestedByUserId: "u", mode: "EXECUTION", correlationId: "c4" },
      repo,
    );
    expect(res.kind).toBe("DONE");
    if (res.kind !== "DONE") return;
    expect(res.outcome).toBe("ENGINE_VERSION_UNAVAILABLE");
    expect(res.replayedOutputDigest).toBeNull();
    expect(repo.replays.at(-1)!.engineAvailability).toBe("ENGINE_VERSION_UNAVAILABLE");
  });

  it("INTEGRITY_FAILURE (before any execution) when a stored artifact is altered", async () => {
    const { repo, runId } = await seed();
    // Corrupt an artifact payload WITHOUT fixing its digest.
    const artifacts = repo.artifactsByRun.get(runId)!;
    const analysis = artifacts.find((a) => a.kind === "ANALYSIS_OUTPUT")!;
    analysis.payload = { tampered: true };

    const res = await replayReasoningRun(
      { organizationId: ORG, runId, requestedByUserId: "u", mode: "EXECUTION", correlationId: "c5" },
      repo,
    );
    expect(res.kind).toBe("DONE");
    if (res.kind !== "DONE") return;
    expect(res.outcome).toBe("INTEGRITY_FAILURE");
    expect(res.replayedOutputDigest).toBeNull();
    expect(res.integrityIssues.length).toBeGreaterThan(0);
  });
});

describe("replay — never mutates the original + tenant isolation", () => {
  it("does not call persistRun and leaves the run byte-identical across replays", async () => {
    const { repo, runId } = await seed();
    const persistBefore = repo.calls.persistRun;
    const before = JSON.stringify([repo.runs.get(runId), repo.artifactsByRun.get(runId)]);
    await replayReasoningRun({ organizationId: ORG, runId, requestedByUserId: "u", mode: "ARCHIVAL", correlationId: null }, repo);
    await replayReasoningRun({ organizationId: ORG, runId, requestedByUserId: "u", mode: "EXECUTION", correlationId: null }, repo);
    expect(repo.calls.persistRun).toBe(persistBefore);
    expect(JSON.stringify([repo.runs.get(runId), repo.artifactsByRun.get(runId)])).toBe(before);
  });

  it("a different organization cannot replay the run (NOT_FOUND)", async () => {
    const { repo, runId } = await seed();
    const res = await replayReasoningRun(
      { organizationId: "org_b", runId, requestedByUserId: "u", mode: "ARCHIVAL", correlationId: null },
      repo,
    );
    expect(res.kind).toBe("NOT_FOUND");
    expect(repo.replays).toHaveLength(0);
  });
});
