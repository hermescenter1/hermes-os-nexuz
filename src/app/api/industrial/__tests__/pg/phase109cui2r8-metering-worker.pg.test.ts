/**
 * PHASE 109-C-UI.2-R8 — the metering worker against REAL PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A REAL DATABASE, AGAIN
 * ─────────────────────────────────────────────────────────────────────────────
 * Every property here is decided by PostgreSQL, not by application code:
 *
 *   * the lease is a CONDITIONAL update whose predicate two replicas evaluate
 *     against the same row;
 *   * exactly-once delivery is a conditional status transition;
 *   * "a crash loses nothing" is a statement about transaction rollback.
 *
 * A fake would be my own re-implementation of each. R4 and R5 both cost a full
 * evidence run to that lesson.
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule. Creates rows under a
 * `pgr8-` prefix and removes exactly those.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "pgr8-org-a";
const ORG_B = "pgr8-org-b";
const SITE_A = "pgr8-site-a";
const SITE_B = "pgr8-site-b";
const ASSET_A = "pgr8-asset-a";
const ASSET_B = "pgr8-asset-b";
const USER = "pgr8-user";

const h = vi.hoisted(() => ({ org: "pgr8-org-a", site: "pgr8-site-a" }));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: null, orgId: h.org, authMethod: "apikey", scopes: ["industrial.write"], keyId: "k" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: USER, orgId: h.org, role: "OWNER" } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => [h.site],
  requireSiteActor: async (_r: unknown, orgId: string, siteId: string) =>
    siteId === h.site
      ? { ctx: { userId: USER, orgId, siteId, role: "SITE_MANAGER", implicit: false } }
      : { error: "not permitted", status: 403 },
}));

const { getPrisma } = await import("@/lib/db/prisma");
const { POST: runAutomation } = await import("@/app/api/industrial/automation/run/route");
const {
  acquireLease,
  renewLease,
  releaseLease,
  runMeteringDeliveryPass,
  meteringHealth,
  publishMeteringGauges,
  METERING_LEASE_NAME,
  LEASE_TTL_MS,
} = await import("@/lib/industrial/metering-worker");
const { MAX_DELIVERY_ATTEMPTS } = await import("@/lib/industrial/metering-outbox");
const { snapshotMetrics, resetMetrics } = await import("@/lib/observability/metrics");

type Model = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  deleteMany: (a?: unknown) => Promise<{ count: number }>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
};
type Db = Record<string, Model> & { $executeRawUnsafe: (s: string) => Promise<unknown> };

let db: Db;

const ORGS = [ORG_A, ORG_B];
const ANALYSIS = [
  "assetAlert", "maintenanceRecommendation", "assetIntelligenceSnapshot",
  "assetRiskScore", "assetHealthHistory",
] as const;

const post = (body: unknown) =>
  new NextRequest(new URL("/api/industrial/automation/run", "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function purge() {
  await db.workerLease.deleteMany({ where: { name: METERING_LEASE_NAME } });
  await db.industrialMeteringOutbox.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: ORGS } } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAsset.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialSite.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: USER } });
}

/** Enqueue one metering event by running the real endpoint. */
async function enqueue(k: string, org = ORG_A, site = SITE_A) {
  h.org = org;
  h.site = site;
  const res = await runAutomation(post({ siteId: site, idempotencyKey: `pgr8-idem-${k}-000000` }));
  expect(res.status).toBe(200);
  h.org = ORG_A;
  h.site = SITE_A;
}

/** Inject a failure into UsageRecord inserts, run `fn`, then always remove it. */
async function withBrokenUsageRecord<T>(fn: () => Promise<T>): Promise<T> {
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION pgr8_break() RETURNS trigger AS $fn$
       BEGIN RAISE EXCEPTION 'PGR8_INJECTED'; END; $fn$ LANGUAGE plpgsql;`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER pgr8_break_trg BEFORE INSERT ON "UsageRecord"
     FOR EACH ROW EXECUTE FUNCTION pgr8_break();`,
  );
  try {
    return await fn();
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr8_break_trg ON "UsageRecord";`);
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr8_break();`);
  }
}

const makeDue = () =>
  db.industrialMeteringOutbox.updateMany({
    where: { organizationId: { in: ORGS } },
    data: { nextAttemptAt: new Date(Date.now() - 1_000) },
  });

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purge();

  await db.user.create({
    data: {
      id: USER, name: "PG R8 Actor", email: "pgr8-user@example.invalid",
      passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date(),
    },
  });
  for (const [id, name] of [[ORG_A, "PG R8 A"], [ORG_B, "PG R8 B"]] as const) {
    await db.organization.create({ data: { id, name, slug: id, updatedAt: new Date() } });
  }
  for (const [id, org] of [[SITE_A, ORG_A], [SITE_B, ORG_B]] as const) {
    await db.industrialSite.create({
      data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: new Date() },
    });
  }
  for (const [id, org, site] of [[ASSET_A, ORG_A, SITE_A], [ASSET_B, ORG_B, SITE_B]] as const) {
    await db.industrialAsset.create({
      data: { id, organizationId: org, siteId: site, name: id, updatedAt: new Date() },
    });
  }
});

afterAll(async () => {
  if (db) await purge();
});

beforeEach(async () => {
  h.org = ORG_A;
  h.site = SITE_A;
  resetMetrics();
  await db.workerLease.deleteMany({ where: { name: METERING_LEASE_NAME } });
  await db.industrialMeteringOutbox.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: ORGS } } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · normal delivery", () => {
  it("a pass takes the lease, delivers, and releases it again", async () => {
    await enqueue("normal");
    const r = await runMeteringDeliveryPass({ holder: "w1" });

    expect(r.acquired).toBe(true);
    expect(r.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);

    // Released, not merely expired: the next replica may start immediately.
    const lease = await db.workerLease.findFirst({ where: { name: METERING_LEASE_NAME } });
    expect(lease).not.toBeNull();
    expect(new Date(String(lease!.expiresAt)).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("a pass with nothing due is a no-op, not an error", async () => {
    const r = await runMeteringDeliveryPass({ holder: "w1" });
    expect(r.acquired).toBe(true);
    expect(r.delivered).toBe(0);
  });

  it("the batch limit is honoured, so a pass stays bounded", async () => {
    for (const k of ["b1", "b2", "b3"]) await enqueue(k);
    const first = await runMeteringDeliveryPass({ holder: "w1", limit: 2 });
    expect(first.delivered).toBe(2);
    const second = await runMeteringDeliveryPass({ holder: "w1", limit: 2 });
    expect(second.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · the distributed lease", () => {
  it("a second holder is refused while the first holds it", async () => {
    const a = await acquireLease({ holder: "w1", client: db });
    expect(a).not.toBeNull();
    const b = await acquireLease({ holder: "w2", client: db });
    expect(b).toBeNull();
  });

  it("two replicas racing an unheld lease: exactly one wins", async () => {
    const [a, b] = await Promise.all([
      acquireLease({ holder: "w1", client: db }),
      acquireLease({ holder: "w2", client: db }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("two replicas racing an EXPIRED lease: exactly one wins", async () => {
    // The interesting case. Both read the same stale row and both try to take
    // it; only the conditional predicate can separate them.
    await acquireLease({ holder: "w0", client: db, nowMs: Date.now() - LEASE_TTL_MS * 2 });
    const [a, b] = await Promise.all([
      acquireLease({ holder: "w1", client: db }),
      acquireLease({ holder: "w2", client: db }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("a crashed holder's lease expires and is reclaimed — no manual recovery", async () => {
    const dead = await acquireLease({ holder: "crashed", client: db });
    expect(dead).not.toBeNull();
    // The process is gone; nothing releases the lease. Time does.
    await db.workerLease.updateMany({
      where: { name: METERING_LEASE_NAME },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const next = await acquireLease({ holder: "fresh", client: db });
    expect(next).not.toBeNull();
    expect(next!.fencingToken).toBeGreaterThan(dead!.fencingToken);
  });

  it("a superseded holder cannot renew or release — the fencing token stops it", async () => {
    const stale = await acquireLease({ holder: "w1", client: db });
    await db.workerLease.updateMany({
      where: { name: METERING_LEASE_NAME },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const fresh = await acquireLease({ holder: "w2", client: db });
    expect(fresh).not.toBeNull();

    // w1 wakes up believing it still owns the job.
    expect(await renewLease({ handle: stale!, client: db })).toBeNull();
    expect(await releaseLease({ handle: stale!, client: db })).toBe(false);

    // And w2's lease is untouched by w1's attempts.
    const row = await db.workerLease.findFirst({ where: { name: METERING_LEASE_NAME } });
    expect(row!.holder).toBe("w2");
    expect(new Date(String(row!.expiresAt)).getTime()).toBeGreaterThan(Date.now());
  });

  it("a non-holder pass delivers nothing and says so", async () => {
    await enqueue("locked");
    await acquireLease({ holder: "other", client: db });

    const r = await runMeteringDeliveryPass({ holder: "me" });
    expect(r.acquired).toBe(false);
    expect(r.delivered).toBe(0);
    // The event is untouched — deferred, never dropped.
    expect(await db.industrialMeteringOutbox.count({ where: { status: "PENDING" } })).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("two duplicate workers in one pass each bill nothing twice", async () => {
    await enqueue("dupe-worker");
    const [a, b] = await Promise.all([
      runMeteringDeliveryPass({ holder: "w1" }),
      runMeteringDeliveryPass({ holder: "w2" }),
    ]);
    expect(a.delivered + b.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("two sweeps that genuinely OVERLAP still bill exactly once", async () => {
    /*
      Added after the M2 control SURVIVED, and the reason it survived is worth
      recording: the lease worked too well. Every other concurrency test here is
      decided before the delivery claim is ever reached — one replica takes the
      lease and the other returns immediately — so the per-row conditional
      transition, which is the actual exactly-once guarantee, was never
      exercised by this file at all.

      Overlap has to be forced. A trigger makes the first delivery hold its
      transaction open for a second; both passes have already read the same due
      row by then, so the second one's claim UPDATE blocks on the row lock,
      re-evaluates `status` after the first commits, and matches nothing.

      Remove the status predicate and the second claim matches unconditionally,
      and the event is billed twice. That is M2.
    */
    await enqueue("true-overlap");
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr8_slow() RETURNS trigger AS $fn$
         BEGIN PERFORM pg_sleep(1); RETURN NEW; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr8_slow_trg BEFORE INSERT ON "UsageRecord"
       FOR EACH ROW EXECUTE FUNCTION pgr8_slow();`,
    );
    try {
      // Same holder, so BOTH acquire the lease and both genuinely sweep.
      const [a, b] = await Promise.all([
        runMeteringDeliveryPass({ holder: "overlap" }),
        runMeteringDeliveryPass({ holder: "overlap" }),
      ]);
      expect(a.delivered + b.delivered).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr8_slow_trg ON "UsageRecord";`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr8_slow();`);
    }
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
    // Scoped to this file's organisation. The first version counted DELIVERED
    // across the whole table and read 9, because other rows live in the same
    // rehearsal database — an assertion that only holds on an empty database is
    // not an assertion about this code.
    expect(
      await db.industrialMeteringOutbox.count({
        where: { organizationId: ORG_A, status: "DELIVERED" },
      }),
    ).toBe(1);
  });

  it("with the lease REMOVED entirely, delivery is still exactly-once", async () => {
    /*
      The lease is coordination, not correctness — and this is the test that
      proves the distinction rather than asserting it. Both passes hold the same
      lease name, so both sweep; the per-row conditional claim still allows only
      one delivery.
    */
    await enqueue("no-lease");
    const [a, b] = await Promise.all([
      runMeteringDeliveryPass({ holder: "same-holder" }),
      runMeteringDeliveryPass({ holder: "same-holder" }),
    ]);
    expect(a.delivered + b.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · crash, restart and recovery", () => {
  it("a crash BEFORE delivery leaves the event deliverable", async () => {
    await enqueue("crash-before");
    // The pass never ran. Nothing changed.
    expect(await db.industrialMeteringOutbox.count({ where: { status: "PENDING" } })).toBe(1);
    const r = await runMeteringDeliveryPass({ holder: "restarted" });
    expect(r.delivered).toBe(1);
  });

  it("a crash DURING delivery rolls back and the event is retried, never lost", async () => {
    await enqueue("crash-during");
    await withBrokenUsageRecord(async () => {
      const r = await runMeteringDeliveryPass({ holder: "w1" });
      expect(r.delivered).toBe(0);
      expect(r.retrying).toBe(1);
    });
    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    expect(row.status).toBe("RETRYING");
    expect(row.lastErrorCode).not.toBeNull();
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);

    await makeDue();
    const again = await runMeteringDeliveryPass({ holder: "restarted" });
    expect(again.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("a crash AFTER delivery does not bill a second time on restart", async () => {
    await enqueue("crash-after");
    await runMeteringDeliveryPass({ holder: "w1" });
    // Restart: a fresh replica sweeps the same table.
    const after = await runMeteringDeliveryPass({ holder: "restarted" });
    expect(after.delivered).toBe(0);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("a crash while HOLDING the lease does not park the job", async () => {
    await enqueue("crash-holding");
    await withBrokenUsageRecord(async () => {
      await runMeteringDeliveryPass({ holder: "doomed" });
    });
    // The pass released its lease on the way out, so the next replica does not
    // have to wait out the TTL.
    const next = await acquireLease({ holder: "next", client: db });
    expect(next).not.toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · retry, backoff and dead-letter", () => {
  it("a failed delivery is rescheduled further into the future each time", async () => {
    await enqueue("backoff");
    const gaps: number[] = [];
    await withBrokenUsageRecord(async () => {
      for (let i = 0; i < 2; i += 1) {
        const t = Date.now();
        await makeDue();
        await runMeteringDeliveryPass({ holder: "w1", nowMs: t });
        const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
        gaps.push(new Date(String(row.nextAttemptAt)).getTime() - t);
      }
    });
    expect(gaps[1]).toBeGreaterThan(gaps[0]);
  });

  it("after the bounded budget the event becomes DEAD_LETTER, never a silent drop", async () => {
    await enqueue("dead");
    await withBrokenUsageRecord(async () => {
      for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
        await makeDue();
        await runMeteringDeliveryPass({ holder: "w1" });
      }
    });
    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    expect(row.status).toBe("DEAD_LETTER");
    expect(Number(row.attempts)).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(row.lastErrorCode).not.toBeNull();
    // Still there to be found. That is the whole difference from fire-and-forget.
    expect(await db.industrialMeteringOutbox.count({ where: { status: "DEAD_LETTER" } })).toBe(1);
  });

  it("a DEAD_LETTER event is not picked up again by a later pass", async () => {
    await enqueue("dead-stays");
    await withBrokenUsageRecord(async () => {
      for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
        await makeDue();
        await runMeteringDeliveryPass({ holder: "w1" });
      }
    });
    const r = await runMeteringDeliveryPass({ holder: "w1" });
    expect(r.delivered).toBe(0);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("a run replayed after a failure still produces exactly one meter", async () => {
    await enqueue("replay-after-fail");
    await withBrokenUsageRecord(async () => {
      await runMeteringDeliveryPass({ holder: "w1" });
    });
    // The caller retries the whole industrial run with the same key.
    await runAutomation(post({ siteId: SITE_A, idempotencyKey: "pgr8-idem-replay-after-fail-000000" }));
    expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(1);

    await makeDue();
    await runMeteringDeliveryPass({ holder: "w1" });
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · health and metrics", () => {
  it("health reports every status, the oldest pending age and the lease", async () => {
    await enqueue("health");
    await db.industrialMeteringOutbox.updateMany({
      where: { organizationId: ORG_A },
      data: { createdAt: new Date(Date.now() - 90_000) },
    });

    /*
      `meteringHealth()` is estate-wide by design — the gauges carry no tenant
      dimension, which is the metric catalogue's own rule. So this test measures
      CHANGE rather than absolutes. Asserting `PENDING === 1` passed only while
      this file happened to be the sole writer in the database, and broke the
      moment the suite ran alongside its siblings.
    */
    const before = await meteringHealth();
    expect(before.counts.PENDING).toBeGreaterThanOrEqual(1);
    // The number that actually says whether the worker is running.
    expect(before.oldestPendingAgeMs).toBeGreaterThanOrEqual(60_000);

    await runMeteringDeliveryPass({ holder: "w1" });

    const after = await meteringHealth();
    expect(after.counts.PENDING).toBe(before.counts.PENDING - 1);
    expect(after.counts.DELIVERED).toBe(before.counts.DELIVERED + 1);
    expect(after.lease?.holder).toBe("w1");
    // This file's own row is gone from the queue.
    expect(
      await db.industrialMeteringOutbox.count({
        where: { organizationId: ORG_A, status: "PENDING" },
      }),
    ).toBe(0);
  });

  it("the gauges and counters are published to the shared registry", async () => {
    await enqueue("metrics");
    await runMeteringDeliveryPass({ holder: "w1" });
    await publishMeteringGauges();

    const snap = JSON.stringify(snapshotMetrics());
    for (const name of [
      "industrial_metering_outbox_pending",
      "industrial_metering_outbox_delivered",
      "industrial_metering_outbox_retrying",
      "industrial_metering_outbox_dead_letter",
      "industrial_metering_oldest_pending_age_seconds",
      "industrial_metering_delivered_total",
      "industrial_metering_worker_passes_total",
    ]) {
      expect(snap).toContain(name);
    }
  });

  it("a non-holder pass is counted as not_leader, not as an error", async () => {
    await acquireLease({ holder: "other", client: db });
    await runMeteringDeliveryPass({ holder: "me" });
    expect(JSON.stringify(snapshotMetrics())).toContain("not_leader");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R8 · tenant and site scope survive delivery", () => {
  it("a delivered UsageRecord belongs to the run's own organisation only", async () => {
    await enqueue("tenant-a", ORG_A, SITE_A);
    await enqueue("tenant-b", ORG_B, SITE_B);
    const r = await runMeteringDeliveryPass({ holder: "w1" });
    expect(r.delivered).toBe(2);

    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_B } })).toBe(1);
  });

  it("the outbox row keeps the site and scope the run was executed with", async () => {
    await enqueue("scope-kept");
    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    expect(row.siteId).toBe(SITE_A);
    expect(row.scopeMode).toBe("SITE");
    expect(row.operation).toBe("industrial.automation.run");
  });
});
