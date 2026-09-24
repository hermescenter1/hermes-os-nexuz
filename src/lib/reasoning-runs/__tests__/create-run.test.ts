import { describe, it, expect } from "vitest";
import { createReasoningRun } from "../create-run";
import { verifyRunIntegrity, REQUIRED_ARTIFACT_KINDS } from "../integrity";
import { isSha256Hex } from "../canonical-json";
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
      problemTitle: "Bearing overheating on drive motor",
      observedSymptoms: "Bearing temperature alarm active and vibration is rising on the drive.",
    },
    idempotencyKey: "idem-key-0000000001",
    engineId: INDUSTRIAL_BRAIN_ENGINE_ID,
    engineVersion: INDUSTRIAL_BRAIN_ENGINE_VERSION,
    ...overrides,
  };
}

describe("createReasoningRun — happy path", () => {
  it("creates a COMPLETED run with all required artifacts and valid digests", async () => {
    const repo = new InMemoryReasoningRunRepository();
    const res = await createReasoningRun(baseInput(), repo);

    expect(res.status).toBe("CREATED");
    expect(res.run).not.toBeNull();
    const run = res.run!;
    expect(run.status).toBe("COMPLETED");
    expect(run.engineId).toBe(INDUSTRIAL_BRAIN_ENGINE_ID);
    expect(run.engineVersion).toBe(INDUSTRIAL_BRAIN_ENGINE_VERSION);
    expect(isSha256Hex(run.inputDigest)).toBe(true);
    expect(isSha256Hex(run.outputDigest)).toBe(true);
    expect(isSha256Hex(run.manifestDigest)).toBe(true);
    expect(isSha256Hex(run.requestFingerprint)).toBe(true);
    // The deterministic engine declares no model/provider.
    expect(run.modelProvider).toBeNull();
    expect(run.caseCorpusChecksum).toBeNull();

    const stored = await repo.findRunWithArtifacts(ORG, run.id);
    const kinds = stored!.artifacts.map((a) => a.kind).sort();
    for (const required of REQUIRED_ARTIFACT_KINDS) {
      expect(kinds).toContain(required);
    }
    // A newly created run verifies clean.
    expect(verifyRunIntegrity(stored!.run, stored!.artifacts).ok).toBe(true);
  });

  it("does not store a HUMAN_DECISION artifact on create", async () => {
    const repo = new InMemoryReasoningRunRepository();
    const res = await createReasoningRun(baseInput(), repo);
    const stored = await repo.findRunWithArtifacts(ORG, res.run!.id);
    expect(stored!.artifacts.some((a) => a.kind === "HUMAN_DECISION")).toBe(false);
  });

  it("does not persist non-allowlisted client keys into the RAW_INPUT snapshot", async () => {
    const repo = new InMemoryReasoningRunRepository();
    const res = await createReasoningRun(
      baseInput({
        rawInput: {
          problemTitle: "Valve fails to open on command",
          observedSymptoms: "HMI command sent but valve position feedback stays closed.",
          // Attempt to smuggle a fake output + a secret into the ledger:
          engineVersion: "attacker-supplied",
          outputDigest: "deadbeef",
          apiKey: "sk-secret",
        } as Record<string, unknown>,
      }),
      repo,
    );
    const stored = await repo.findRunWithArtifacts(ORG, res.run!.id);
    const raw = stored!.artifacts.find((a) => a.kind === "RAW_INPUT")!.payload as Record<string, unknown>;
    expect(raw.apiKey).toBeUndefined();
    expect(raw.outputDigest).toBeUndefined();
    expect(raw.engineVersion).toBeUndefined();
    // The stored engine version is the REGISTERED one, not the client string.
    expect(stored!.run.engineVersion).toBe(INDUSTRIAL_BRAIN_ENGINE_VERSION);
  });
});

describe("createReasoningRun — idempotency", () => {
  it("a second identical request returns the SAME run (no second execution)", async () => {
    const repo = new InMemoryReasoningRunRepository();
    const first = await createReasoningRun(baseInput(), repo);
    const second = await createReasoningRun(baseInput(), repo);
    expect(second.status).toBe("IDEMPOTENT_REPLAY");
    expect(second.run!.id).toBe(first.run!.id);
    expect(repo.runs.size).toBe(1);
  });

  it("the same key with a different input is rejected as a fingerprint mismatch", async () => {
    const repo = new InMemoryReasoningRunRepository();
    await createReasoningRun(baseInput(), repo);
    const mismatch = await createReasoningRun(
      baseInput({
        rawInput: {
          problemTitle: "A completely different fault title here",
          observedSymptoms: "Different symptoms entirely, unrelated to the first request at all.",
        },
      }),
      repo,
    );
    expect(mismatch.status).toBe("KEY_FINGERPRINT_MISMATCH");
    expect(repo.runs.size).toBe(1);
  });

  it("identical semantic input in different key order yields the same digests", async () => {
    const repoA = new InMemoryReasoningRunRepository();
    const repoB = new InMemoryReasoningRunRepository();
    const a = await createReasoningRun(
      baseInput({
        idempotencyKey: "idem-key-order-aaaa1",
        rawInput: { problemTitle: "Motor trips on start", observedSymptoms: "Overcurrent trip during ramp up of the drive." },
      }),
      repoA,
    );
    const b = await createReasoningRun(
      baseInput({
        idempotencyKey: "idem-key-order-bbbb2",
        rawInput: { observedSymptoms: "Overcurrent trip during ramp up of the drive.", problemTitle: "Motor trips on start" },
      }),
      repoB,
    );
    expect(b.run!.inputDigest).toBe(a.run!.inputDigest);
    expect(b.run!.outputDigest).toBe(a.run!.outputDigest);
    expect(b.run!.manifestDigest).toBe(a.run!.manifestDigest);
  });
});

describe("createReasoningRun — engine registry fail-closed", () => {
  it("returns ENGINE_UNAVAILABLE for an unregistered engine version", async () => {
    const repo = new InMemoryReasoningRunRepository();
    const res = await createReasoningRun(baseInput({ engineVersion: "9.9.9" }), repo);
    expect(res.status).toBe("ENGINE_UNAVAILABLE");
    expect(res.run).toBeNull();
    expect(repo.runs.size).toBe(0);
  });
});
