/**
 * PHASE 109-C-UI.2-R7 — referential integrity and durable metering, against
 * REAL PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY ASSERTION HERE NEEDS A REAL DATABASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Both findings this closes are statements about the DATABASE, not about the
 * application:
 *
 *   R6-001 — the five analysis output tables did not constrain `assetId`, so an
 *            orphan or cross-tenant analysis row was writable. A fake cannot
 *            prove a foreign key exists; it can only re-implement my own rule.
 *   R6-002 — metering was fire-and-forget. Exactly-once delivery is decided by
 *            a unique index and a conditional status transition, and both are
 *            PostgreSQL behaviours.
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule. Creates rows under a
 * `pgr7-` prefix and removes exactly those.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "pgr7-org-a";
const ORG_B = "pgr7-org-b";
const SITE_A = "pgr7-site-a";
const SITE_B = "pgr7-site-b";
const ASSET_A = "pgr7-asset-a";
const ASSET_A2 = "pgr7-asset-a2";
const ASSET_B = "pgr7-asset-b";
const USER = "pgr7-user";

const h = vi.hoisted(() => ({
  authMethod: "apikey" as "jwt" | "apikey",
  scopes: ["industrial.write"] as string[],
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: null, orgId: ORG_A, authMethod: h.authMethod, scopes: h.scopes, keyId: "k" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: USER, orgId: ORG_A, role: "OWNER" } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => [SITE_A],
  requireSiteActor: async (_r: unknown, orgId: string, siteId: string) =>
    siteId === SITE_A
      ? { ctx: { userId: USER, orgId, siteId, role: "SITE_MANAGER", implicit: false } }
      : { error: "not permitted", status: 403 },
}));

const { getPrisma } = await import("@/lib/db/prisma");
const { POST: run } = await import("@/app/api/industrial/automation/run/route");
const { deliverPendingMeteringEvents, MAX_DELIVERY_ATTEMPTS } = await import(
  "@/lib/industrial/metering-outbox"
);

type Model = {
  create: (a: unknown) => Promise<Record<string, unknown>>;
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
};
type Db = Record<string, Model> & {
  $executeRawUnsafe: (s: string) => Promise<unknown>;
  $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};

let db: Db;

const ANALYSIS = [
  "assetAlert",
  "maintenanceRecommendation",
  "assetIntelligenceSnapshot",
  "assetRiskScore",
  "assetHealthHistory",
] as const;

const ORGS = [ORG_A, ORG_B];

const post = (body: unknown) =>
  new NextRequest(new URL("/api/industrial/automation/run", "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function purge() {
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

/** Returns the SQLSTATE PostgreSQL raised, or "NO_ERROR" if it accepted the row. */
async function sqlstateOf(sql: string): Promise<string> {
  try {
    await db.$executeRawUnsafe(sql);
    return "NO_ERROR";
  } catch (e) {
    const meta = (e as { meta?: { code?: unknown } }).meta;
    const code = (e as { code?: unknown }).code ?? meta?.code;
    const msg = String((e as Error).message ?? "");
    if (typeof code === "string" && /^\d{5}$/.test(code)) return code;
    // Prisma wraps raw errors; the SQLSTATE is still in the message.
    const m = msg.match(/\b(2[0-9]{4})\b/);
    return m ? m[1] : `UNKNOWN:${String(code ?? "").slice(0, 20)}|${msg.slice(0, 120)}`;
  }
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purge();

  await db.user.create({
    data: {
      id: USER, name: "PG R7 Actor", email: "pgr7-user@example.invalid",
      passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date(),
    },
  });
  for (const [id, name] of [[ORG_A, "PG R7 A"], [ORG_B, "PG R7 B"]] as const) {
    await db.organization.create({ data: { id, name, slug: id, updatedAt: new Date() } });
  }
  for (const [id, org] of [[SITE_A, ORG_A], [SITE_B, ORG_B]] as const) {
    await db.industrialSite.create({
      data: { id, organizationId: org, name: id, slug: id, status: "ACTIVE", updatedAt: new Date() },
    });
  }
  for (const [id, org, site] of [
    [ASSET_A, ORG_A, SITE_A],
    [ASSET_A2, ORG_A, SITE_A],
    [ASSET_B, ORG_B, SITE_B],
  ] as const) {
    await db.industrialAsset.create({
      data: { id, organizationId: org, siteId: site, name: id, updatedAt: new Date() },
    });
  }
});

afterAll(async () => {
  if (db) await purge();
});

beforeEach(async () => {
  h.authMethod = "apikey";
  h.scopes = ["industrial.write"];
  await db.industrialMeteringOutbox.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: ORGS } } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
});

const key = (s: string) => `pgr7-idem-${s}-000000`;

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R7 · the asset foreign key is enforced by PostgreSQL", () => {
  const TABLES: [string, string][] = [
    ["AssetAlert", `'HEALTH_DEGRADATION','HIGH','t','d','{}'::jsonb,false,now(),now()`],
    ["AssetRiskScore", `50,'MEDIUM',1,1,1,1,1,1,now(),'{}'::jsonb`],
    ["AssetIntelligenceSnapshot", `null,'UNKNOWN',null,'unknown','unknown',0,0,null,null,'{}'::jsonb,now()`],
    ["AssetHealthHistory", `80,'healthy',now()`],
    ["MaintenanceRecommendation", `'inspection','MEDIUM','t','d','MEDIUM','[]'::jsonb,'[]'::jsonb,false,now(),now(),'{}'::jsonb`],
  ];

  const COLUMNS: Record<string, string> = {
    AssetAlert: `"id","organizationId","assetId","alertType",severity,title,description,metadata,dismissed,"createdAt","updatedAt"`,
    AssetRiskScore: `"id","organizationId","assetId","riskScore",confidence,"healthTrendScore","alarmTrendScore","kpiDegradationScore","telQualityScore","telFreshnessScore","criticalityFactor","createdAt",metadata`,
    AssetIntelligenceSnapshot: `"id","organizationId","assetId","riskScore","riskLevel","healthScore","healthStatus","healthTrend","tagCount","knowledgeTotal","deltaRiskScore","deltaHealth",metadata,"createdAt"`,
    AssetHealthHistory: `"id","organizationId","assetId","healthScore","healthStatus","createdAt"`,
    MaintenanceRecommendation: `"id","organizationId","assetId","recommendationType",priority,title,description,confidence,evidence,"evidenceRecordIds",dismissed,"createdAt","updatedAt",metadata`,
  };

  const insert = (table: string, id: string, org: string, asset: string) =>
    `INSERT INTO "${table}"(${COLUMNS[table]}) VALUES ('${id}','${org}','${asset}',${
      TABLES.find(([t]) => t === table)![1]
    });`;

  for (const [table] of TABLES) {
    it(`${table}: an assetId naming nothing is refused with 23503`, async () => {
      // 23503 is foreign_key_violation. Asserting the SQLSTATE and not merely
      // "it threw" is the point: a NOT NULL or a type error would also throw,
      // and would prove nothing about the relation.
      const state = await sqlstateOf(insert(table, `pgr7-ghost-${table}`, ORG_A, "pgr7-no-such-asset"));
      expect(state).toBe("23503");
    });

    it(`${table}: an asset in ANOTHER organisation is refused with 23503`, async () => {
      // The composite key is what makes this fail. A single-column FK would
      // accept it happily — the asset exists, it just belongs to someone else.
      const state = await sqlstateOf(insert(table, `pgr7-xorg-${table}`, ORG_A, ASSET_B));
      expect(state).toBe("23503");
    });

    it(`${table}: a legitimate row is still accepted`, async () => {
      // Without this the two refusals above would be satisfied by a table that
      // rejects everything.
      const state = await sqlstateOf(insert(table, `pgr7-ok-${table}`, ORG_A, ASSET_A));
      expect(state).toBe("NO_ERROR");
    });
  }

  it("assetId cannot be NULL in any of the five tables", async () => {
    /*
      Added after the M3 control SURVIVED. `assetId` was already NOT NULL before
      R7, so nothing in the suite ever tried to insert one — and a column
      constraint nobody tests is a column constraint that can be dropped by a
      future migration without a single test noticing. 23502 is not_null_violation.
    */
    for (const [table] of TABLES) {
      const state = await sqlstateOf(
        `INSERT INTO "${table}"(${COLUMNS[table]}) VALUES ('pgr7-null-${table}','${ORG_A}',NULL,${
          TABLES.find(([t]) => t === table)![1]
        });`,
      );
      expect(state).toBe("23502");
    }
  });

  it("deleting an asset that has analysis history is REFUSED, not cascaded", async () => {
    await db.assetRiskScore.create({
      data: {
        organizationId: ORG_A, assetId: ASSET_A2, riskScore: 42, confidence: "MEDIUM",
        healthTrendScore: 1, alarmTrendScore: 1, kpiDegradationScore: 1,
        telQualityScore: 1, telFreshnessScore: 1, criticalityFactor: 1,
      },
    });
    const state = await sqlstateOf(`DELETE FROM "IndustrialAsset" WHERE id = '${ASSET_A2}';`);
    expect(state).toBe("23503");

    // The history is still there — RESTRICT, not CASCADE. This is the assertion
    // that would go red if anyone changed the delete action.
    expect(await db.assetRiskScore.count({ where: { assetId: ASSET_A2 } })).toBe(1);
    expect(await db.industrialAsset.count({ where: { id: ASSET_A2 } })).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R7 · metering is durable, and enqueued inside the run transaction", () => {
  it("an API-key run leaves exactly one PENDING outbox row carrying its context", async () => {
    const res = await run(post({ siteId: SITE_A, idempotencyKey: key("enqueue") }));
    expect(res.status).toBe(200);

    const rows = await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.status).toBe("PENDING");
    expect(r.scopeMode).toBe("SITE");
    expect(r.siteId).toBe(SITE_A);
    expect(r.operation).toBe("industrial.automation.run");
    expect(r.metric).toBe("industrial_automation_runs");
    expect(r.idempotencyKey).toBe(key("enqueue"));
    expect(String(r.runId)).not.toBe("");
    expect(String(r.requestId)).toMatch(/^iar_/);
    expect(r.authMethod).toBe("apikey");

    // Nothing has been billed yet — enqueuing is not delivering.
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("a JWT run enqueues nothing, so a session still cannot inflate usage", async () => {
    h.authMethod = "jwt";
    const res = await run(post({ siteId: SITE_A, idempotencyKey: key("jwt") }));
    expect(res.status).toBe(200);
    expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("a FAILED run leaves no outbox row — the event dies with the transaction", async () => {
    /*
      This is the property the old code could not have. The outbox write and the
      analysis write are the same transaction, so there is no window in which
      one exists without the other, and no crash can land between them.
    */
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr7_refuse() RETURNS trigger AS $fn$
         BEGIN RAISE EXCEPTION 'PGR7_INJECTED'; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr7_refuse_trg BEFORE INSERT ON "AssetRiskScore"
       FOR EACH ROW EXECUTE FUNCTION pgr7_refuse();`,
    );
    try {
      const res = await run(post({ siteId: SITE_A, idempotencyKey: key("rollback") }));
      expect(res.status).toBe(500);
      expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(0);
      expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr7_refuse_trg ON "AssetRiskScore";`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr7_refuse();`);
    }
  });

  it("an outbox write that FAILS takes the whole run down with it", async () => {
    /*
      Added after M6 and M7 both SURVIVED, and it is the single assertion that
      kills them both.

      M6 makes `enqueueMeteringEvent` swallow its error, so the run would answer
      200 with no event recorded — the fire-and-forget defect returning by
      another door.
      M7 moves the enqueue OUTSIDE the run's transaction, so the analysis rows
      would already be committed when it fails, leaving a run that happened and
      a billing event that does not exist.

      Both are caught by the same pair of expectations: the request fails, AND
      the analysis is gone. Nothing else in the suite could distinguish them,
      because every other failure path fails before the enqueue is reached.
    */
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr7_refuse_outbox() RETURNS trigger AS $fn$
         BEGIN RAISE EXCEPTION 'PGR7_OUTBOX_REFUSED'; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr7_refuse_outbox_trg BEFORE INSERT ON "IndustrialMeteringOutbox"
       FOR EACH ROW EXECUTE FUNCTION pgr7_refuse_outbox();`,
    );
    try {
      const res = await run(post({ siteId: SITE_A, idempotencyKey: key("outbox-fail") }));
      expect(res.status).toBe(500);

      // The run rolled back with it — this is what M7 breaks.
      for (const m of ANALYSIS) {
        expect(await db[m].count({ where: { organizationId: ORG_A } })).toBe(0);
      }
      expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(0);
      expect(await db.auditLog.count({ where: { organizationId: ORG_A } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS pgr7_refuse_outbox_trg ON "IndustrialMeteringOutbox";`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr7_refuse_outbox();`);
    }

    // With the trigger gone the endpoint works again, so the refusal above came
    // from the injection and not from something this test broke.
    const after = await run(post({ siteId: SITE_A, idempotencyKey: key("outbox-fail-after") }));
    expect(after.status).toBe(200);
  });

  it("enqueuing the SAME event twice is recognised, not duplicated", async () => {
    /*
      Added after M10 SURVIVED. Through the route a replay never reaches the
      enqueue at all — `claimRun` answers first — so the route-level test could
      not see M10 re-inserting under a fresh key. This calls the function
      directly, twice, which is the only place the duplicate branch is reachable.
    */
    const { enqueueMeteringEvent } = await import("@/lib/industrial/metering-outbox");
    const event = {
      organizationId: ORG_A,
      siteId: SITE_A,
      scopeMode: "SITE" as const,
      actorId: null,
      actorRole: "apikey",
      authMethod: "apikey",
      runId: "pgr7-run-dup",
      requestId: "iar_dup",
      idempotencyKey: key("direct-dup"),
    };

    expect(await enqueueMeteringEvent(event, db)).toBe("ENQUEUED");
    expect(await enqueueMeteringEvent(event, db)).toBe("ALREADY_ENQUEUED");
    expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(1);

    // And delivery still bills it once.
    await deliverPendingMeteringEvents();
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("a replay does not enqueue a second event", async () => {
    await run(post({ siteId: SITE_A, idempotencyKey: key("replay") }));
    const second = await run(post({ siteId: SITE_A, idempotencyKey: key("replay") }));
    expect((await second.json()).replayed).toBe(true);
    expect(await db.industrialMeteringOutbox.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("the unique key refuses a duplicate event even inserted directly", async () => {
    await run(post({ siteId: SITE_A, idempotencyKey: key("dupe") }));
    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    const state = await sqlstateOf(
      `INSERT INTO "IndustrialMeteringOutbox"
        ("id","organizationId","siteId","scopeMode","actorRole","authMethod",operation,metric,value,
         "runId","requestId","idempotencyKey","updatedAt")
       VALUES ('pgr7-dup-direct','${ORG_A}','${SITE_A}','SITE','OWNER','apikey',
               'industrial.automation.run','${String(row.metric)}',1,'r','q','${String(row.idempotencyKey)}',now());`,
    );
    expect(state).toBe("23505");
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */

describe("R7 · delivery is exactly-once and survives restarts", () => {
  const enqueueOne = async (k: string) => {
    const res = await run(post({ siteId: SITE_A, idempotencyKey: key(k) }));
    expect(res.status).toBe(200);
  };

  it("delivery creates exactly one UsageRecord and marks the event DELIVERED", async () => {
    await enqueueOne("deliver");
    const report = await deliverPendingMeteringEvents();
    expect(report.delivered).toBe(1);

    const meters = await db.usageRecord.findMany({ where: { organizationId: ORG_A } });
    expect(meters).toHaveLength(1);
    expect(meters[0].metric).toBe("industrial_automation_runs");

    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    expect(row.status).toBe("DELIVERED");
    expect(row.deliveredAt).not.toBeNull();
    expect(row.usageRecordId).toBe(String(meters[0].id));
  });

  it("running the worker again delivers nothing — no double billing", async () => {
    await enqueueOne("twice");
    await deliverPendingMeteringEvents();
    const second = await deliverPendingMeteringEvents();
    expect(second.delivered).toBe(0);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("two workers racing the same event bill it once", async () => {
    /*
      Both call the same conditional claim. PostgreSQL serialises them on the
      row; the loser re-reads `status` after the winner commits, matches zero
      rows, and skips. Note what is NOT claimed here: this is one process, so it
      is the CLAIM being tested, not OS-level scheduling. The two-process proof
      is the separate harness.
    */
    await enqueueOne("race");
    const [a, b] = await Promise.all([
      deliverPendingMeteringEvents(),
      deliverPendingMeteringEvents(),
    ]);
    expect(a.delivered + b.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("a crash mid-delivery leaves the event redeliverable, never half-delivered", async () => {
    await enqueueOne("crash");
    // The UsageRecord insert fails, so the claim rolls back with it.
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr7_crash() RETURNS trigger AS $fn$
         BEGIN RAISE EXCEPTION 'PGR7_DELIVERY_CRASH'; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr7_crash_trg BEFORE INSERT ON "UsageRecord"
       FOR EACH ROW EXECUTE FUNCTION pgr7_crash();`,
    );
    let after: Record<string, unknown>;
    try {
      const report = await deliverPendingMeteringEvents();
      expect(report.delivered).toBe(0);
      expect(report.retrying).toBe(1);
      after = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
      // Not lost, not delivered: visible, counted, and scheduled to try again.
      expect(after.status).toBe("RETRYING");
      expect(Number(after.attempts)).toBe(1);
      expect(after.lastErrorCode).not.toBeNull();
      expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr7_crash_trg ON "UsageRecord";`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr7_crash();`);
    }

    // Restart: a fresh worker picks it up and completes it, exactly once.
    await db.industrialMeteringOutbox.updateMany({
      where: { organizationId: ORG_A },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    const recovered = await deliverPendingMeteringEvents();
    expect(recovered.delivered).toBe(1);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("an event that keeps failing becomes DEAD_LETTER, never a silent drop", async () => {
    await enqueueOne("dead");
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr7_always() RETURNS trigger AS $fn$
         BEGIN RAISE EXCEPTION 'PGR7_ALWAYS_FAILS'; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr7_always_trg BEFORE INSERT ON "UsageRecord"
       FOR EACH ROW EXECUTE FUNCTION pgr7_always();`,
    );
    try {
      for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i += 1) {
        await db.industrialMeteringOutbox.updateMany({
          where: { organizationId: ORG_A },
          data: { nextAttemptAt: new Date(Date.now() - 1_000) },
        });
        await deliverPendingMeteringEvents();
      }
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr7_always_trg ON "UsageRecord";`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr7_always();`);
    }

    const row = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
    expect(row.status).toBe("DEAD_LETTER");
    expect(Number(row.attempts)).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(row.lastErrorCode).not.toBeNull();
    // The event is still there to be found. That is the whole difference from
    // fire-and-forget: a failure you can see and count.
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("backoff grows, so a broken downstream is not hammered", async () => {
    await enqueueOne("backoff");
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION pgr7_slow() RETURNS trigger AS $fn$
         BEGIN RAISE EXCEPTION 'PGR7_FAIL'; END; $fn$ LANGUAGE plpgsql;`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER pgr7_slow_trg BEFORE INSERT ON "UsageRecord"
       FOR EACH ROW EXECUTE FUNCTION pgr7_slow();`,
    );
    try {
      const t0 = Date.now();
      await deliverPendingMeteringEvents({ nowMs: t0 });
      const first = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
      const gap1 = new Date(String(first.nextAttemptAt)).getTime() - t0;

      await db.industrialMeteringOutbox.updateMany({
        where: { organizationId: ORG_A },
        data: { nextAttemptAt: new Date(t0 - 1_000) },
      });
      await deliverPendingMeteringEvents({ nowMs: t0 });
      const second = (await db.industrialMeteringOutbox.findMany({ where: { organizationId: ORG_A } }))[0];
      const gap2 = new Date(String(second.nextAttemptAt)).getTime() - t0;

      expect(gap2).toBeGreaterThan(gap1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pgr7_slow_trg ON "UsageRecord";`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS pgr7_slow();`);
    }
  });

  it("delivery never crosses a tenant boundary", async () => {
    await enqueueOne("tenant");
    await deliverPendingMeteringEvents();
    expect(await db.usageRecord.count({ where: { organizationId: ORG_B } })).toBe(0);
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(1);
  });
});
