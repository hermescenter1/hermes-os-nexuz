/**
 * PHASE 112 — Prisma implementation of the reasoning-run repository.
 *
 * Idempotency uses INSERT-under-unique-constraint as the lock (never
 * check-then-insert): the run + all artifacts are written in ONE interactive
 * transaction; a unique violation on (organizationId, idempotencyKey) means a
 * concurrent/retried request, and re-reading the winner's row classifies it as
 * an idempotent replay (same fingerprint) or a KEY_FINGERPRINT_MISMATCH.
 *
 * Fails closed when no database is configured.
 */
import { getPrisma } from "@/lib/db/prisma";
import {
  ReasoningRunStorageUnavailableError,
  type AppendReplayInput,
  type PersistRunInput,
  type PersistRunOutcome,
  type ReasoningRunRepository,
} from "./repository";
import type {
  ReasoningReplayAttemptRecord,
  ReasoningRunArtifactRecord,
  ReasoningRunRecord,
  ReasoningRunWithArtifacts,
} from "./types";

/** Minimal model-delegate surface we depend on (matches the repo's PrismaLike). */
interface Delegate {
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  findMany(args: { where: Record<string, unknown>; orderBy?: unknown }): Promise<Record<string, unknown>[]>;
}
interface TxLike {
  reasoningRun: Delegate;
  reasoningRunArtifact: Delegate;
  reasoningReplayAttempt: Delegate;
}
interface DbLike extends TxLike {
  $transaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>;
}

/** A unique-constraint violation, whichever driver reported it. */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === "P2002" || code === "23505") return true;
  return /unique constraint|duplicate key/i.test(String((e as Error)?.message ?? ""));
}

function toRunRecord(row: Record<string, unknown>): ReasoningRunRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    siteId: (row.siteId as string | null) ?? null,
    assetId: (row.assetId as string | null) ?? null,
    initiatedByUserId: (row.initiatedByUserId as string | null) ?? null,
    sourceChannel: row.sourceChannel as ReasoningRunRecord["sourceChannel"],
    status: row.status as ReasoningRunRecord["status"],
    engineId: row.engineId as string,
    engineVersion: row.engineVersion as string,
    rulePackVersion: row.rulePackVersion as string,
    caseCorpusVersion: (row.caseCorpusVersion as string | null) ?? null,
    caseCorpusChecksum: (row.caseCorpusChecksum as string | null) ?? null,
    graphRevision: (row.graphRevision as number | null) ?? null,
    graphChecksum: (row.graphChecksum as string | null) ?? null,
    documentCorpusChecksum: (row.documentCorpusChecksum as string | null) ?? null,
    modelProvider: (row.modelProvider as string | null) ?? null,
    modelVersion: (row.modelVersion as string | null) ?? null,
    modelConfigVersion: (row.modelConfigVersion as string | null) ?? null,
    schemaVersion: row.schemaVersion as string,
    idempotencyKey: row.idempotencyKey as string,
    requestFingerprint: row.requestFingerprint as string,
    parentRunId: (row.parentRunId as string | null) ?? null,
    startedAt: row.startedAt as Date,
    completedAt: (row.completedAt as Date | null) ?? null,
    inputDigest: row.inputDigest as string,
    outputDigest: row.outputDigest as string,
    manifestDigest: row.manifestDigest as string,
    errorClass: (row.errorClass as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

function toArtifactRecord(row: Record<string, unknown>): ReasoningRunArtifactRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    runId: row.runId as string,
    kind: row.kind as ReasoningRunArtifactRecord["kind"],
    schemaVersion: row.schemaVersion as string,
    payload: row.payload,
    digest: row.digest as string,
    byteSize: row.byteSize as number,
    createdAt: row.createdAt as Date,
  };
}

function toReplayRecord(row: Record<string, unknown>): ReasoningReplayAttemptRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    runId: row.runId as string,
    requestedByUserId: (row.requestedByUserId as string | null) ?? null,
    mode: row.mode as ReasoningReplayAttemptRecord["mode"],
    requestedEngineVersion: (row.requestedEngineVersion as string | null) ?? null,
    engineAvailability: row.engineAvailability as ReasoningReplayAttemptRecord["engineAvailability"],
    outcome: row.outcome as ReasoningReplayAttemptRecord["outcome"],
    originalOutputDigest: row.originalOutputDigest as string,
    replayedOutputDigest: (row.replayedOutputDigest as string | null) ?? null,
    mismatchSummary: (row.mismatchSummary as string | null) ?? null,
    correlationId: (row.correlationId as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

async function db(): Promise<DbLike> {
  const prisma = await getPrisma();
  if (!prisma) throw new ReasoningRunStorageUnavailableError();
  return prisma as unknown as DbLike;
}

export class PrismaReasoningRunRepository implements ReasoningRunRepository {
  async persistRun(input: PersistRunInput): Promise<PersistRunOutcome> {
    const prisma = await db();
    const { run, artifacts } = input;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.reasoningRun.create({ data: { ...run } });
        const runId = row.id as string;
        if (artifacts.length > 0) {
          await tx.reasoningRunArtifact.createMany({
            data: artifacts.map((a) => ({
              organizationId: run.organizationId,
              runId,
              kind: a.kind,
              schemaVersion: a.schemaVersion,
              payload: a.payload,
              digest: a.digest,
              byteSize: a.byteSize,
            })),
          });
        }
        return row;
      });
      return { outcome: "CREATED", run: toRunRecord(created) };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // The idempotency key already exists: re-read the winner and classify.
      const existing = await prisma.reasoningRun.findFirst({
        where: { organizationId: run.organizationId, idempotencyKey: run.idempotencyKey },
      });
      if (!existing) throw e; // a different unique violation — surface it
      const record = toRunRecord(existing);
      return record.requestFingerprint === run.requestFingerprint
        ? { outcome: "IDEMPOTENT_REPLAY", run: record }
        : { outcome: "KEY_FINGERPRINT_MISMATCH", run: record };
    }
  }

  async findRunWithArtifacts(
    organizationId: string,
    runId: string,
  ): Promise<ReasoningRunWithArtifacts | null> {
    const prisma = await db();
    // Tenant scoping at the query level: a foreign org's run is simply not found.
    const run = await prisma.reasoningRun.findFirst({ where: { organizationId, id: runId } });
    if (!run) return null;
    const artifacts = await prisma.reasoningRunArtifact.findMany({
      where: { organizationId, runId },
      orderBy: { kind: "asc" },
    });
    return { run: toRunRecord(run), artifacts: artifacts.map(toArtifactRecord) };
  }

  async appendReplayAttempt(input: AppendReplayInput): Promise<ReasoningReplayAttemptRecord> {
    const prisma = await db();
    const row = await prisma.reasoningReplayAttempt.create({ data: { ...input } });
    return toReplayRecord(row);
  }
}

/** Default singleton repository. */
export const reasoningRunRepository: ReasoningRunRepository = new PrismaReasoningRunRepository();
