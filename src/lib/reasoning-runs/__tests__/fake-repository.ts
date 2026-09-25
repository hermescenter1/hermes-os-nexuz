/**
 * In-memory reasoning-run repository for unit tests.
 *
 * Mirrors the production port's contract: INSERT-under-unique-key is the lock
 * (an existing key is never overwritten), reads are tenant-scoped, and replay
 * attempts are appended without ever touching the original run. It exposes call
 * counters + internal state so tests can assert immutability and zero side
 * effects.
 */
import type {
  AppendReplayInput,
  PersistRunInput,
  PersistRunOutcome,
  ReasoningRunRepository,
} from "../repository";
import type {
  ReasoningReplayAttemptRecord,
  ReasoningRunArtifactRecord,
  ReasoningRunRecord,
  ReasoningRunWithArtifacts,
} from "../types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class InMemoryReasoningRunRepository implements ReasoningRunRepository {
  readonly runs = new Map<string, ReasoningRunRecord>();
  readonly artifactsByRun = new Map<string, ReasoningRunArtifactRecord[]>();
  readonly byKey = new Map<string, string>();
  readonly replays: ReasoningReplayAttemptRecord[] = [];
  readonly calls = { persistRun: 0, findRunWithArtifacts: 0, appendReplayAttempt: 0 };

  async persistRun(input: PersistRunInput): Promise<PersistRunOutcome> {
    this.calls.persistRun += 1;
    const { run, artifacts } = input;
    const key = `${run.organizationId}::${run.idempotencyKey}`;
    const existingId = this.byKey.get(key);
    if (existingId) {
      const existing = this.runs.get(existingId)!;
      return existing.requestFingerprint === run.requestFingerprint
        ? { outcome: "IDEMPOTENT_REPLAY", run: existing }
        : { outcome: "KEY_FINGERPRINT_MISMATCH", run: existing };
    }
    const id = nextId("run");
    const now = new Date();
    const record: ReasoningRunRecord = { ...run, id, createdAt: now };
    this.runs.set(id, record);
    this.artifactsByRun.set(
      id,
      artifacts.map((a) => ({
        id: nextId("art"),
        organizationId: run.organizationId,
        runId: id,
        kind: a.kind,
        schemaVersion: a.schemaVersion,
        payload: a.payload,
        digest: a.digest,
        byteSize: a.byteSize,
        createdAt: now,
      })),
    );
    this.byKey.set(key, id);
    return { outcome: "CREATED", run: record };
  }

  async findRunWithArtifacts(
    organizationId: string,
    runId: string,
  ): Promise<ReasoningRunWithArtifacts | null> {
    this.calls.findRunWithArtifacts += 1;
    const run = this.runs.get(runId);
    // Tenant scope: a foreign org's run is simply not found.
    if (!run || run.organizationId !== organizationId) return null;
    return { run, artifacts: this.artifactsByRun.get(runId) ?? [] };
  }

  async appendReplayAttempt(input: AppendReplayInput): Promise<ReasoningReplayAttemptRecord> {
    this.calls.appendReplayAttempt += 1;
    const record: ReasoningReplayAttemptRecord = { ...input, id: nextId("rep"), createdAt: new Date() };
    this.replays.push(record);
    return record;
  }
}
