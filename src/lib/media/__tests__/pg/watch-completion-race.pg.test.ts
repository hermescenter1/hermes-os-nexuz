import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import { recordWatchProgressForUser } from "@/lib/media/db";

/**
 * PHASE 102 / RELEASE BLOCKER 8 — the completion counter, against real
 * PostgreSQL.
 *
 * THE DEFECT
 * `recordWatchProgressForUser` decided `firstCompletion` from a prior read:
 *
 *     const existing = await tx.mediaWatchProgress.findFirst({ … });
 *     const firstCompletion = completed && !existing?.completedAt;
 *     …
 *     await tx.mediaWatchProgress.updateMany({ where: { id, organizationId, userId }, … });
 *     if (firstCompletion) await asset.updateMany({ … increment: 1 });
 *
 * Read, decide in application memory, write unconditionally. Two concurrent
 * requests for the SAME viewer both read `completedAt` as null, both concluded
 * they were first, both wrote, and both incremented — one viewer, two
 * completions, on a counter the product presents as "how many people finished
 * this". The update's predicate named the row and its owner but never the state
 * being changed, and the increment was conditioned on an in-memory verdict
 * rather than on anything the database had agreed to.
 *
 * WHY THIS FILE CANNOT BE A UNIT TEST
 * Every media unit harness stubs `$transaction` as a pass-through
 * (`db-visibility.test.ts` does it explicitly). There is no isolation, no row
 * lock and no second connection, so the race is not merely undetected there — it
 * is unrepresentable. The existing suite's "counts a completion once per
 * subject" case is sequential, and passed throughout.
 *
 * NO SLEEP ANYWHERE IN THIS FILE
 * The barrier does not assume the second writer is blocked after N milliseconds.
 * It OBSERVES the block, by polling `pg_stat_activity` from a third connection
 * until a backend in this database is genuinely waiting on a Lock. If that never
 * happens the test fails rather than proceeding on a timing guess, so a run on a
 * slow machine cannot turn into a false pass — or a false failure.
 */

const PG_ENABLED = process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;

const TAG = "pg102race";
const ORG = `${TAG}-org`;
const USER = `${TAG}-user`;
const ASSET = `${TAG}-asset`;
const PROGRESS = `${TAG}-progress`;

type Tx = {
  $executeRawUnsafe: (s: string, ...a: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(s: string, ...a: unknown[]) => Promise<T>;
  $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout?: number; maxWait?: number }) => Promise<T>;
};

async function db(): Promise<Tx> {
  const p = await getPrisma();
  if (!p) throw new Error("PG rehearsal requires a real Prisma client");
  return p as unknown as Tx;
}

/* ── Fixtures ──────────────────────────────────────────────────────────────*/

async function cleanup(): Promise<void> {
  const p = await db();
  await p.$executeRawUnsafe(`DELETE FROM "MediaWatchProgress" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "MediaViewEvent" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "MediaAsset" WHERE "organizationId" LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "User" WHERE id LIKE '${TAG}%'`);
  await p.$executeRawUnsafe(`DELETE FROM "Organization" WHERE id LIKE '${TAG}%'`);
}

async function seedAsset(): Promise<void> {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,now())
     ON CONFLICT (id) DO NOTHING`,
    ORG, `${TAG} org`, `${TAG}-slug`,
  );
  await p.$executeRawUnsafe(
    `INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt")
     VALUES ($1,$2,$3,'x','USER',now()) ON CONFLICT (id) DO NOTHING`,
    USER, `${TAG} viewer`, `${TAG}@example.test`,
  );
  await p.$executeRawUnsafe(
    // PUBLISHED requires publishedAt + storageKey + READY at the database
    // (MediaAsset_published_stamp_check), so the fixture is a genuinely
    // servable asset rather than one the schema would have refused.
    `INSERT INTO "MediaAsset"
       (id,"organizationId",slug,"primaryLocale",status,visibility,"processingState",
        "storageKey","storageProvider","publishedAt",
        "viewCount","saveCount","completionCount","noIndex","createdBy","updatedAt")
     VALUES ($1,$2,$3,'en','PUBLISHED','PUBLIC','READY',$4,'local',now(),0,0,0,false,$5,now())`,
    ASSET, ORG, `${TAG}-slug`,
    `media/${ORG}/${ASSET}/11111111-2222-4333-8444-555555555555.mp4`, USER,
  );
}

/** A watch-progress row that has NOT completed — the state the race starts from. */
async function seedProgress(progressPct = 10): Promise<void> {
  const p = await db();
  await p.$executeRawUnsafe(
    `INSERT INTO "MediaWatchProgress"
       (id,"organizationId","userId","mediaAssetId","positionSeconds","progressPct",
        "completedAt","lastWatchedAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,10,$5,NULL,now(),now(),now())`,
    PROGRESS, ORG, USER, ASSET, progressPct,
  );
}

async function completionCount(): Promise<number> {
  const p = await db();
  const rows = await p.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT "completionCount"::int AS n FROM "MediaAsset" WHERE id=$1`, ASSET,
  );
  return rows[0]?.n ?? -1;
}

async function completedAt(): Promise<Date | null> {
  const p = await db();
  const rows = await p.$queryRawUnsafe<Array<{ c: Date | null }>>(
    `SELECT "completedAt" AS c FROM "MediaWatchProgress" WHERE "organizationId"=$1 AND "userId"=$2`,
    ORG, USER,
  );
  return rows[0]?.c ?? null;
}

function complete() {
  return recordWatchProgressForUser({
    organizationId: ORG,
    userId: USER,
    mediaAssetId: ASSET,
    positionSeconds: 600,
    progressPct: 100,
  });
}

/* ── The barrier: OBSERVED, never timed ────────────────────────────────────*/

/**
 * Resolve once a backend in this database is genuinely waiting on a lock.
 *
 * Each iteration is a real round trip to PostgreSQL, so the loop is paced by the
 * database rather than by a timer, and it yields the event loop between probes
 * so the operation being waited on can make progress. It never assumes: if the
 * block does not appear within the bound it throws, and the test fails loudly
 * instead of continuing on a guess.
 */
async function waitUntilBlockedOnLock(maxProbes = 2000): Promise<void> {
  const p = await db();
  for (let probe = 0; probe < maxProbes; probe += 1) {
    const rows = await p.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND pid <> pg_backend_pid()`,
    );
    if ((rows[0]?.n ?? 0) > 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(
    "the second writer never blocked on a row lock — the barrier proved nothing, " +
      "so this run cannot distinguish a fixed race from a lucky interleaving",
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

it("integration database is configured (guards against a silent all-skip pass)", () => {
  expect(PG_ENABLED).toBe(true);
});

describe.skipIf(!PG_ENABLED)("Phase 102 — completion counter under real concurrency", () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await seedAsset();
  });

  it("increments exactly once when two writers race, held at the row lock", async () => {
    await seedProgress();

    const p = await db();
    let second: Awaited<ReturnType<typeof complete>> | null = null;
    let secondSettled = false;
    let secondPromise: Promise<void> | null = null;

    await p.$transaction(
      async (txA) => {
        // A holds the progress row. Anything that tries to UPDATE it blocks here.
        await txA.$queryRawUnsafe(
          `SELECT id FROM "MediaWatchProgress" WHERE id=$1 FOR UPDATE`,
          PROGRESS,
        );

        // B starts. It reads `completedAt` as NULL — exactly the read the old
        // implementation turned into an unconditional increment — and then
        // blocks on A's lock at the write.
        secondPromise = complete().then((r) => {
          second = r;
          secondSettled = true;
        });

        // OBSERVED, not timed.
        await waitUntilBlockedOnLock();
        expect(secondSettled, "B must still be blocked before A commits").toBe(false);

        // A commits the completion.
        await txA.$executeRawUnsafe(
          `UPDATE "MediaWatchProgress" SET "completedAt"=now(), "progressPct"=100, "updatedAt"=now()
            WHERE id=$1 AND "completedAt" IS NULL`,
          PROGRESS,
        );
        await txA.$executeRawUnsafe(
          `UPDATE "MediaAsset" SET "completionCount"="completionCount"+1 WHERE id=$1`,
          ASSET,
        );
      },
      { timeout: 20000, maxWait: 20000 },
    );

    await secondPromise;

    // B re-evaluated its predicate against the COMMITTED row, found
    // `completedAt` no longer null, matched nothing, and did not increment.
    expect(second).not.toBeNull();
    const outcome = second as unknown as
      | { ok: true; value: { completed: boolean; firstCompletion: boolean } }
      | { ok: false; reason: string };
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.value.completed).toBe(true);
    expect(outcome.ok && outcome.value.firstCompletion).toBe(false);

    // One viewer, one completion. Before the fix this was 2.
    expect(await completionCount()).toBe(1);
    expect(await completedAt()).not.toBeNull();
  });

  it("still records B's position after it loses the claim", async () => {
    await seedProgress();

    const p = await db();
    let secondPromise: Promise<unknown> | null = null;

    await p.$transaction(
      async (txA) => {
        await txA.$queryRawUnsafe(`SELECT id FROM "MediaWatchProgress" WHERE id=$1 FOR UPDATE`, PROGRESS);
        secondPromise = recordWatchProgressForUser({
          organizationId: ORG,
          userId: USER,
          mediaAssetId: ASSET,
          positionSeconds: 777,
          progressPct: 100,
        });
        await waitUntilBlockedOnLock();
        await txA.$executeRawUnsafe(
          `UPDATE "MediaWatchProgress" SET "completedAt"=now(), "positionSeconds"=1, "updatedAt"=now()
            WHERE id=$1 AND "completedAt" IS NULL`,
          PROGRESS,
        );
      },
      { timeout: 20000, maxWait: 20000 },
    );
    await secondPromise;

    // Losing the completion claim is not a reason to drop the viewer's place in
    // the video — the position is still real and must still be recorded.
    const rows = await p.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT "positionSeconds"::int AS n FROM "MediaWatchProgress" WHERE id=$1`, PROGRESS,
    );
    expect(rows[0].n).toBe(777);
    expect(await completionCount()).toBe(0); // A's raw UPDATE did not increment
  });

  it("increments exactly once for N genuinely concurrent completions", async () => {
    await seedProgress();

    const CONCURRENCY = 12;
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => complete()));

    const succeeded = results.filter((r) => r.ok);
    const firsts = succeeded.filter((r) => r.ok && r.value.firstCompletion);

    // Every call either completed or conflicted; none errored.
    expect(results.every((r) => r.ok || r.reason === "CONFLICT")).toBe(true);
    expect(succeeded.length).toBeGreaterThan(0);

    // EXACTLY ONE writer may claim the transition, and the counter agrees.
    expect(firsts).toHaveLength(1);
    expect(await completionCount()).toBe(1);
  });

  it("increments exactly once when N writers race with NO pre-existing row", async () => {
    // The create path's compare-and-swap is the unique constraint. A loser
    // surfaces as CONFLICT rather than as a second increment.
    const CONCURRENCY = 12;
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => complete()));

    const firsts = results.filter((r) => r.ok && r.value.firstCompletion);
    expect(firsts).toHaveLength(1);
    expect(await completionCount()).toBe(1);

    const p = await db();
    const rows = await p.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "MediaWatchProgress" WHERE "organizationId"=$1 AND "userId"=$2`,
      ORG, USER,
    );
    expect(rows[0].n).toBe(1);
  });

  it("replaying the same completion never inflates the counter", async () => {
    await seedProgress();

    const first = await complete();
    expect(first.ok && first.value.firstCompletion).toBe(true);

    for (let i = 0; i < 5; i += 1) {
      const again = await complete();
      expect(again.ok && again.value.completed).toBe(true);
      expect(again.ok && again.value.firstCompletion).toBe(false);
    }
    expect(await completionCount()).toBe(1);
  });

  it("does not count progress below the threshold, and counts it once it crosses", async () => {
    await seedProgress();

    const below = await recordWatchProgressForUser({
      organizationId: ORG, userId: USER, mediaAssetId: ASSET,
      positionSeconds: 100, progressPct: 94,
    });
    expect(below.ok && below.value.completed).toBe(false);
    expect(below.ok && below.value.firstCompletion).toBe(false);
    expect(await completionCount()).toBe(0);
    expect(await completedAt()).toBeNull();

    const crossed = await complete();
    expect(crossed.ok && crossed.value.firstCompletion).toBe(true);
    expect(await completionCount()).toBe(1);
  });

  it("keeps the counter tenant-scoped — another organization's race cannot move it", async () => {
    await seedProgress();
    expect((await complete()).ok).toBe(true);
    expect(await completionCount()).toBe(1);

    const foreign = await recordWatchProgressForUser({
      organizationId: `${TAG}-otherorg`,
      userId: USER,
      mediaAssetId: ASSET,
      positionSeconds: 600,
      progressPct: 100,
    });
    expect(foreign.ok).toBe(false);
    expect(await completionCount()).toBe(1);
  });
});
