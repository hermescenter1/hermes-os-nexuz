import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { createReasoningRun } from "@/lib/reasoning-runs/create-run";
import { replayReasoningRun } from "@/lib/reasoning-runs/replay-run";
import { reasoningRunRepository } from "@/lib/reasoning-runs/prisma-repository";
import { verifyRunIntegrity } from "@/lib/reasoning-runs/integrity";
import {
  INDUSTRIAL_BRAIN_ENGINE_ID,
  INDUSTRIAL_BRAIN_ENGINE_VERSION,
} from "@/lib/reasoning-runs/engine-industrial-brain";
import type { CreateRunInput } from "@/lib/reasoning-runs/types";

/**
 * PHASE 112 Part I — real-PostgreSQL rehearsal. Proves against the ACTUAL DB:
 * the additive migration is applied; the CHECK constraints (SHA-256 hex, byte
 * size > 0, terminal state), the immutability triggers (UPDATE rejected), the
 * composite tenant FKs, the (org, idempotencyKey) unique lock, and the RESTRICT
 * protection of a run's parent asset all exist and behave; and — via the ACTUAL
 * service on independent connections — that a concurrent create race yields a
 * single run, and that replay never mutates the original.
 */
const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;
const TAG = "pgit112";
const ORG = `${TAG}-org`;
const SITE = `${TAG}-site`;
const ASSET = `${TAG}-asset`;

type Pg = {
  $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>;
};
async function db(): Promise<Pg> {
  const p = await getPrisma();
  if (!p) throw new Error("PG rehearsal requires a real Prisma client");
  return p as unknown as Pg;
}

function baseInput(idempotencyKey: string, overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    organizationId: ORG,
    siteId: null,
    assetId: null,
    initiatedByUserId: null,
    sourceChannel: "INTERACTIVE",
    rawInput: {
      problemTitle: "PG rehearsal — drive overtemperature",
      observedSymptoms: "VFD reports overtemperature and the conveyor drive trips under load.",
    },
    idempotencyKey,
    engineId: INDUSTRIAL_BRAIN_ENGINE_ID,
    engineVersion: INDUSTRIAL_BRAIN_ENGINE_VERSION,
    ...overrides,
  };
}

async function cleanup() {
  const p = await db();
  // Runs first: DELETE cascades artifacts + replays (allowed — governed path).
  await p.$executeRawUnsafe(`DELETE FROM "ReasoningRun" WHERE "organizationId" = '${ORG}'`);
  await p.$executeRawUnsafe(`DELETE FROM "IndustrialAsset" WHERE "organizationId" = '${ORG}'`);
  await p.$executeRawUnsafe(`DELETE FROM "IndustrialSite" WHERE "organizationId" = '${ORG}'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id = '${ORG}'`);
}

it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("Phase 112 PG", () => {
  beforeAll(async () => {
    await cleanup();
    const p = await db();
    await p.$executeRawUnsafe(
      `INSERT INTO "Organization" (id,name,slug,settings,"createdAt","updatedAt") VALUES ('${ORG}','O','${TAG}-slug','{}'::jsonb,now(),now())`,
    );
    await p.$executeRawUnsafe(
      `INSERT INTO "IndustrialSite" (id,"organizationId",name,slug,status,"createdAt","updatedAt") VALUES ('${SITE}','${ORG}','S','${TAG}-site-slug','ACTIVE',now(),now())`,
    );
    await p.$executeRawUnsafe(
      `INSERT INTO "IndustrialAsset" (id,"organizationId","siteId",name,"assetType",protocol,status,metadata,"createdAt","updatedAt") VALUES ('${ASSET}','${ORG}','${SITE}','A','OTHER','OTHER','ACTIVE','{}'::jsonb,now(),now())`,
    );
  });
  afterAll(cleanup);
  beforeEach(async () => {
    await (await db()).$executeRawUnsafe(`DELETE FROM "ReasoningRun" WHERE "organizationId" = '${ORG}'`);
  });

  it("the migration is applied and the Phase 112 constraints/triggers/indexes exist", async () => {
    const p = await db();
    const mig = await p.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%phase112_immutable_reasoning_run%' AND finished_at IS NOT NULL`,
    );
    expect(mig.length).toBe(1);

    const chk = await p.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname IN (
        'ReasoningRun_outputDigest_sha256_check','ReasoningRun_inputDigest_sha256_check',
        'ReasoningRun_manifestDigest_sha256_check','ReasoningRun_terminal_state_check',
        'ReasoningRunArtifact_digest_sha256_check','ReasoningRunArtifact_byteSize_positive_check',
        'ReasoningRunArtifact_run_tenant_fkey','ReasoningReplayAttempt_run_tenant_fkey',
        'ReasoningRun_parent_tenant_fkey') ORDER BY conname`,
    );
    expect(chk.length).toBe(9);

    const trg = await p.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgname IN (
        'reasoning_run_no_update_trg','reasoning_run_artifact_no_update_trg','reasoning_replay_attempt_no_update_trg') ORDER BY tgname`,
    );
    expect(trg.length).toBe(3);

    const idx = await p.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('ReasoningRun_organizationId_id_key','ReasoningRun_organizationId_idempotencyKey_key','ReasoningRunArtifact_organizationId_runId_kind_key') ORDER BY indexname`,
    );
    expect(idx.length).toBe(3);
  });

  it("creates a run, reads it back, and verifies integrity", async () => {
    const res = await createReasoningRun(baseInput(`${TAG}-key-basic-0001`));
    expect(res.status).toBe("CREATED");
    const found = await reasoningRunRepository.findRunWithArtifacts(ORG, res.run!.id);
    expect(found).not.toBeNull();
    expect(verifyRunIntegrity(found!.run, found!.artifacts).ok).toBe(true);
    expect(found!.run.outputDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the immutability triggers reject UPDATE on the run and its artifacts", async () => {
    const res = await createReasoningRun(baseInput(`${TAG}-key-immut-0001`));
    const p = await db();
    await expect(
      p.$executeRawUnsafe(`UPDATE "ReasoningRun" SET "errorClass" = 'x' WHERE id = '${res.run!.id}'`),
    ).rejects.toBeTruthy();
    await expect(
      p.$executeRawUnsafe(`UPDATE "ReasoningRunArtifact" SET "byteSize" = "byteSize" + 1 WHERE "runId" = '${res.run!.id}'`),
    ).rejects.toBeTruthy();
  });

  it("the SHA-256 and positive-byte-size CHECKs reject bad artifact rows", async () => {
    const res = await createReasoningRun(baseInput(`${TAG}-key-check-0001`));
    const p = await db();
    const runId = res.run!.id;
    // Bad (non-hex) digest.
    await expect(
      p.$executeRawUnsafe(
        `INSERT INTO "ReasoningRunArtifact" (id,"organizationId","runId",kind,"schemaVersion",payload,digest,"byteSize","createdAt")
         VALUES ('${TAG}-art-baddigest','${ORG}','${runId}','HUMAN_DECISION','1.0.0','{}'::jsonb,'NOT-HEX',10,now())`,
      ),
    ).rejects.toBeTruthy();
    // Non-positive byte size.
    await expect(
      p.$executeRawUnsafe(
        `INSERT INTO "ReasoningRunArtifact" (id,"organizationId","runId",kind,"schemaVersion",payload,digest,"byteSize","createdAt")
         VALUES ('${TAG}-art-badsize','${ORG}','${runId}','HUMAN_DECISION','1.0.0','{}'::jsonb,'${"a".repeat(64)}',0,now())`,
      ),
    ).rejects.toBeTruthy();
  });

  it("a concurrent create race with the same idempotency key yields a single run", async () => {
    const key = `${TAG}-key-concurrent-01`;
    const [a, b] = await Promise.all([
      createReasoningRun(baseInput(key)),
      createReasoningRun(baseInput(key)),
    ]);
    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(["CREATED", "IDEMPOTENT_REPLAY"]);
    expect(a.run!.id).toBe(b.run!.id);
    const p = await db();
    const rows = await p.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "ReasoningRun" WHERE "organizationId" = '${ORG}' AND "idempotencyKey" = '${key}'`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("reusing a key with a different request is a fingerprint mismatch", async () => {
    const key = `${TAG}-key-mismatch-001`;
    await createReasoningRun(baseInput(key));
    const res = await createReasoningRun(
      baseInput(key, {
        rawInput: {
          problemTitle: "A different fault about a stuck damper actuator",
          observedSymptoms: "Damper does not move to the commanded position and feedback is stale.",
        },
      }),
    );
    expect(res.status).toBe("KEY_FINGERPRINT_MISMATCH");
  });

  it("RESTRICT protects a run's parent asset from deletion", async () => {
    await createReasoningRun(baseInput(`${TAG}-key-asset-0001`, { siteId: SITE, assetId: ASSET }));
    const p = await db();
    await expect(
      p.$executeRawUnsafe(`DELETE FROM "IndustrialAsset" WHERE id = '${ASSET}'`),
    ).rejects.toBeTruthy();
  });

  it("replay appends attempts and never mutates the original run", async () => {
    const res = await createReasoningRun(baseInput(`${TAG}-key-replay-0001`));
    const runId = res.run!.id;
    const p = await db();
    const before = await p.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "outputDigest","manifestDigest","createdAt" FROM "ReasoningRun" WHERE id = '${runId}'`,
    );

    await replayReasoningRun({ organizationId: ORG, runId, requestedByUserId: null, mode: "ARCHIVAL", correlationId: null });
    await replayReasoningRun({ organizationId: ORG, runId, requestedByUserId: null, mode: "EXECUTION", correlationId: null });

    const attempts = await p.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "ReasoningReplayAttempt" WHERE "runId" = '${runId}'`,
    );
    expect(Number(attempts[0].n)).toBe(2);

    const after = await p.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "outputDigest","manifestDigest","createdAt" FROM "ReasoningRun" WHERE id = '${runId}'`,
    );
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));

    const exec = await p.$queryRawUnsafe<{ outcome: string }[]>(
      `SELECT outcome FROM "ReasoningReplayAttempt" WHERE "runId" = '${runId}' AND mode = 'EXECUTION'`,
    );
    expect(exec[0].outcome).toBe("MATCH");
  });

  it("governed deletion is possible: deleting a run cascades its artifacts", async () => {
    const res = await createReasoningRun(baseInput(`${TAG}-key-delete-0001`));
    const runId = res.run!.id;
    const p = await db();
    await p.$executeRawUnsafe(`DELETE FROM "ReasoningRun" WHERE id = '${runId}'`);
    const arts = await p.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "ReasoningRunArtifact" WHERE "runId" = '${runId}'`,
    );
    expect(Number(arts[0].n)).toBe(0);
  });
});
