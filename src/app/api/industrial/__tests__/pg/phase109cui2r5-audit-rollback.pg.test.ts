/**
 * PHASE 109-C-UI.2-R5 stage 3, the half only PostgreSQL can prove.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A DOUBLE WAS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-process suite proves the fail-closed audit against a transaction-aware
 * fake — one I wrote, whose `$transaction` snapshots and restores its own tables
 * because a `$transaction` that merely ran the callback would make every
 * rollback assertion vacuous. That is a strong double and still my own
 * re-implementation of the rule under test.
 *
 * What it cannot prove is that PostgreSQL actually discards the engine's writes
 * when the audit insert fails inside the same interactive transaction. So here
 * the failure is a REAL one, produced the way R4 produced it by accident: the
 * acting user does not exist, `AuditLog.userId` carries a foreign key to `User`,
 * and the insert raises 23503 in the middle of the transaction.
 *
 * The contrast case matters as much as the failure. If only the failing case
 * were asserted, an endpoint that never wrote anything at all would pass it.
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule. Creates rows under a
 * `pgr5ar-` prefix and removes exactly those.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG = "pgr5ar-org";
const SITE = "pgr5ar-site";
const REAL_USER = "pgr5ar-user";
/** Deliberately never inserted into `User`. This is the whole mechanism. */
const GHOST_USER = "pgr5ar-ghost";

const h = vi.hoisted(() => ({ userId: "pgr5ar-user" as string }));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: h.userId, orgId: ORG, authMethod: "jwt", scopes: ["industrial.write"], keyId: "k" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: h.userId, orgId: ORG, role: "MANAGER" } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => [SITE],
  requireSiteActor: async (_req: unknown, orgId: string, siteId: string) =>
    siteId === SITE
      ? { ctx: { userId: h.userId, orgId, siteId, role: "SITE_MANAGER", implicit: false } }
      : { error: "Access to this site is not permitted", status: 403 },
}));

const { getPrisma } = await import("@/lib/db/prisma");
const { POST: run } = await import("@/app/api/industrial/automation/run/route");

type Model = {
  create: (a: unknown) => Promise<unknown>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
};
type Db = Record<string, Model>;

let db: Db;

const ANALYSIS = [
  "assetAlert",
  "maintenanceRecommendation",
  "assetIntelligenceSnapshot",
  "assetRiskScore",
  "assetHealthHistory",
] as const;

const post = (body: unknown) =>
  new NextRequest(new URL("/api/industrial/automation/run", "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

/** Remove ONLY the rows this file created. Never a blanket delete. */
async function purge() {
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: ORG } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: ORG } });
  await db.usageRecord.deleteMany({ where: { organizationId: ORG } });
  await db.auditLog.deleteMany({ where: { organizationId: ORG } });
  await db.industrialAsset.deleteMany({ where: { organizationId: ORG } });
  await db.industrialSite.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [REAL_USER, GHOST_USER] } } });
}

/** Every durable record this endpoint can produce, counted in one place. */
async function analysisRowCount(): Promise<number> {
  let total = 0;
  for (const m of ANALYSIS) total += await db[m].count({ where: { organizationId: ORG } });
  return total;
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purge();

  await db.user.create({
    data: {
      id: REAL_USER,
      name: "PG R5 Actor",
      email: "pgr5ar-user@example.invalid",
      passwordHash: "NOT-A-REAL-HASH",
      updatedAt: new Date(),
    },
  });
  await db.organization.create({
    data: { id: ORG, name: "PG R5 AR", slug: ORG, updatedAt: new Date() },
  });
  await db.industrialSite.create({
    data: { id: SITE, organizationId: ORG, name: SITE, slug: SITE, status: "ACTIVE", updatedAt: new Date() },
  });
  for (const id of ["pgr5ar-pump", "pgr5ar-plc"]) {
    await db.industrialAsset.create({
      data: { id, organizationId: ORG, siteId: SITE, name: id, updatedAt: new Date() },
    });
  }
});

afterAll(async () => {
  if (db) await purge();
});

beforeEach(async () => {
  h.userId = REAL_USER;
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: ORG } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: ORG } });
  await db.usageRecord.deleteMany({ where: { organizationId: ORG } });
  await db.auditLog.deleteMany({ where: { organizationId: ORG } });
});

const key = (s: string) => `pgr5ar-idem-${s}-000000`;

describe("R5 · a real audit failure rolls the whole run back", () => {
  it("first, the contrast: a run that CAN be audited writes and commits", async () => {
    // Without this the failing case below proves nothing — an endpoint that
    // wrote nothing under any condition would satisfy it just as well.
    const res = await run(post({ siteId: SITE, idempotencyKey: key("ok") }));
    expect(res.status).toBe(200);
    expect(await db.auditLog.count({ where: { organizationId: ORG } })).toBe(1);
    expect(await analysisRowCount()).toBeGreaterThan(0);
  });

  it("when AuditLog_userId_fkey rejects the audit row, NOTHING survives", async () => {
    h.userId = GHOST_USER;
    const res = await run(post({ siteId: SITE, idempotencyKey: key("ghost") }));

    // Fail closed: an unauditable run is not a successful run.
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("AUDIT_OR_RUN_FAILED");

    // PostgreSQL discarded every write the engine made inside the transaction.
    expect(await analysisRowCount()).toBe(0);
    expect(await db.auditLog.count({ where: { organizationId: ORG } })).toBe(0);
  });

  it("the run row records the failure, so the scope is released not leaked", async () => {
    h.userId = GHOST_USER;
    await run(post({ siteId: SITE, idempotencyKey: key("released") }));

    const runs = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG } });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("FAILED");
    expect(runs[0].failureCode).toBe("AUDIT_OR_RUN_FAILED");
    // The counters must not claim work that was rolled back.
    expect(runs[0].assetsProcessed).toBe(0);

    // And the very next request for the same scope is accepted immediately,
    // rather than waiting out the fifteen-minute lease.
    h.userId = REAL_USER;
    const next = await run(post({ siteId: SITE, idempotencyKey: key("after-failure") }));
    expect(next.status).toBe(200);
  });

  /*
    ── R6: two failure modes the foreign-key case does not reach ──────────────

    A missing user is one specific rejection. These two inject failures the
    database raises on its own terms — a trigger that refuses the audit write,
    and a trigger that refuses one of the engine's writes partway through the
    batch. Both are removed again immediately, and both are scoped to a table
    this rehearsal is the only writer of.
  */
  const raw = (sql: string) =>
    (db as unknown as { $executeRawUnsafe: (s: string) => Promise<unknown> }).$executeRawUnsafe(sql);

  const withRefusingTrigger = async (table: string, fn: () => Promise<void>) => {
    await raw(`CREATE OR REPLACE FUNCTION r6_refuse() RETURNS trigger AS $fn$
                 BEGIN RAISE EXCEPTION 'R6_INJECTED_DB_FAILURE on %', TG_TABLE_NAME; END;
               $fn$ LANGUAGE plpgsql;`);
    await raw(`CREATE TRIGGER r6_refuse_trg BEFORE INSERT ON "${table}"
               FOR EACH ROW EXECUTE FUNCTION r6_refuse();`);
    try {
      await fn();
    } finally {
      await raw(`DROP TRIGGER IF EXISTS r6_refuse_trg ON "${table}";`);
      await raw(`DROP FUNCTION IF EXISTS r6_refuse();`);
    }
  };

  it("a database failure on the audit write — not an FK — also rolls everything back", async () => {
    await withRefusingTrigger("AuditLog", async () => {
      const res = await run(post({ siteId: SITE, idempotencyKey: key("db-fail") }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("AUDIT_OR_RUN_FAILED");
      expect(await analysisRowCount()).toBe(0);
    });
    // The trigger is gone, so the endpoint works again — proving the refusal
    // came from the injection and not from something this test broke.
    const after = await run(post({ siteId: SITE, idempotencyKey: key("db-fail-after") }));
    expect(after.status).toBe(200);
  });

  it("a failure PARTWAY THROUGH the engine's writes leaves nothing behind", async () => {
    /*
      The refusal lands on the engine's own output table, not on the audit. Note
      what this proves and what it does not: the run fails closed and no record
      survives, which is the property under test. It also shows why partial
      success cannot be reported for a DATABASE error — once one statement
      raises, PostgreSQL aborts the whole transaction, so the remaining assets
      and then the audit write fail too. The per-asset counters can only ever
      describe partial failure for errors that are not database errors.
    */
    await withRefusingTrigger("AssetRiskScore", async () => {
      const res = await run(post({ siteId: SITE, idempotencyKey: key("mid-fail") }));
      expect(res.status).toBe(500);
      expect(await analysisRowCount()).toBe(0);
      expect(await db.auditLog.count({ where: { organizationId: ORG } })).toBe(0);
    });
    const runs = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG } });
    expect(runs[0].status).toBe("FAILED");
  });

  it("a failed run is never metered", async () => {
    h.userId = GHOST_USER;
    await run(post({ siteId: SITE, idempotencyKey: key("unmetered") }));
    // Metering is fire-and-forget (FINDING-R6-002), so reading the table the
    // instant the response returns would find it empty whether or not a write
    // was on its way. Settle first, or this asserts nothing.
    await new Promise((r) => setTimeout(r, 1_500));
    expect(await db.usageRecord.count({ where: { organizationId: ORG } })).toBe(0);
  });
});
