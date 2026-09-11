/**
 * PHASE 109-C-UI.2-R4 — the automation run endpoint against REAL PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT ONLY A REAL DATABASE CAN PROVE
 * ─────────────────────────────────────────────────────────────────────────────
 * The R3 suites run against a fake that ENFORCES the migration's two unique
 * indexes, which is a strong double — but it is still my own re-implementation
 * of the rule I wrote. It cannot prove that PostgreSQL creates the partial
 * index, that it raises 23505 where expected, or that a real transaction
 * discards the rows already written inside it.
 *
 * So here the DATA layer is entirely real: the run store, the engine, the site
 * repository, the audit service and the metering all talk to PostgreSQL through
 * the ordinary `getPrisma()` driver adapter, and the constraints are the ones
 * the migration created.
 *
 * Only the SESSION layer is mocked — `requirePlatformAuth`, `requireOrgActor`,
 * `getAllowedSiteIds` and `requireSiteActor` all need a signed cookie that does
 * not exist in a test process. Those four are already proven in-process against
 * the real permission matrices (76 tests); nothing about them is re-asserted
 * here, and the file says so rather than implying wider coverage than it has.
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule, and run only via
 * `npm run test:phase109cui2r3:postgres` with DATABASE_URL pointing at a
 * DISPOSABLE database. It creates its own rows under a `pgr4-` prefix and
 * removes exactly those rows afterwards.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "pgr4-org-a";
const ORG_B = "pgr4-org-b";
const SITE_A1 = "pgr4-site-a1";
const SITE_A2 = "pgr4-site-a2";
const SITE_A_MAINT = "pgr4-site-a-maint";
const SITE_B1 = "pgr4-site-b1";

const h = vi.hoisted(() => ({
  role: "MANAGER" as string,
  siteRole: "SITE_MANAGER" as string,
  authMethod: "jwt" as "jwt" | "apikey",
  scopes: ["industrial.write"] as string[],
  allowedSiteIds: [] as string[],
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: "pgr4-user", orgId: ORG_A, authMethod: h.authMethod, scopes: h.scopes, keyId: "k" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: "pgr4-user", orgId: ORG_A, role: h.role } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => h.allowedSiteIds,
  requireSiteActor: async (_req: unknown, orgId: string, siteId: string) =>
    h.allowedSiteIds.includes(siteId)
      ? { ctx: { userId: "pgr4-user", orgId, siteId, role: h.siteRole, implicit: false } }
      : { error: "Access to this site is not permitted", status: 403 },
}));

const { getPrisma } = await import("@/lib/db/prisma");
const { POST: run } = await import("@/app/api/industrial/automation/run/route");

type Db = Record<string, {
  create: (a: unknown) => Promise<unknown>;
  createMany?: (a: unknown) => Promise<unknown>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
  count: (a?: unknown) => Promise<number>;
}>;

let db: Db;

const post = (body: unknown) =>
  new NextRequest(new URL("/api/industrial/automation/run", "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

/** Remove ONLY this file's rows. Never a blanket delete. */
async function purge() {
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  for (const model of ["assetAlert", "maintenanceRecommendation", "assetIntelligenceSnapshot", "assetRiskScore", "assetHealthHistory"]) {
    await db[model].deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  }
  await db.industrialMeteringOutbox.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.industrialAsset.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.industrialSite.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.organization.deleteMany({ where: { id: { in: [ORG_A, ORG_B] } } });
  await db.user.deleteMany({ where: { id: "pgr4-user" } });
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purge();

  /*
    The actor has to EXIST. `AuditLog.userId` carries a foreign key to `User`,
    and `recordAuditEvent` swallows persistence failures — so with no user row
    the audit insert violated the FK, was discarded silently, and the audit
    assertions below failed against an empty table. The fixture was wrong; the
    silence that hid it is FINDING-R4-002 in the R4 report.
  */
  await db.user.create({
    data: {
      id: "pgr4-user", name: "PG R4 Actor", email: "pgr4-user@example.invalid",
      passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date(),
    },
  });
  await db.organization.create({ data: { id: ORG_A, name: "PG R4 A", slug: ORG_A, updatedAt: new Date() } });
  await db.organization.create({ data: { id: ORG_B, name: "PG R4 B", slug: ORG_B, updatedAt: new Date() } });
  for (const [id, org, status] of [
    [SITE_A1, ORG_A, "ACTIVE"],
    [SITE_A2, ORG_A, "ACTIVE"],
    // MAINTENANCE and INACTIVE are the REAL non-active values of
    // IndustrialSiteStatus. R3's fixtures used "ARCHIVED", which the enum does
    // not contain — see FINDING-R4-001.
    [SITE_A_MAINT, ORG_A, "MAINTENANCE"],
    [SITE_B1, ORG_B, "ACTIVE"],
  ] as const) {
    await db.industrialSite.create({
      data: { id, organizationId: org, name: id, slug: id, status, updatedAt: new Date() },
    });
  }
  for (const [id, org, site] of [
    ["pgr4-a1-pump", ORG_A, SITE_A1],
    ["pgr4-a1-plc", ORG_A, SITE_A1],
    ["pgr4-a2-motor", ORG_A, SITE_A2],
    ["pgr4-maint-valve", ORG_A, SITE_A_MAINT],
    ["pgr4-b1-pump", ORG_B, SITE_B1],
    /*
      A CORRUPT row on purpose: an ORG_B asset pointing at an ORG_A site. The
      foreign key permits it — `IndustrialAsset.siteId` references
      IndustrialSite(id) with no tenant composite — so this is a state the
      database can genuinely hold, and it is exactly what the organisation
      predicate on the asset selection defends against.

      Without it the M1 control (drop the organisation predicate) SURVIVED the
      real-database suite: with cuid site ids no two tenants share one, so the
      site predicate alone happened to be sufficient. A control that survives is
      a protection nobody is testing.
    */
    ["pgr4-cross-tenant", ORG_B, SITE_A1],
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
  h.role = "MANAGER";
  h.authMethod = "jwt";
  h.scopes = ["industrial.write"];
  h.allowedSiteIds = [SITE_A1];
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  for (const model of ["assetAlert", "maintenanceRecommendation", "assetIntelligenceSnapshot", "assetRiskScore", "assetHealthHistory"]) {
    await db[model].deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  }
  await db.industrialMeteringOutbox.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: [ORG_A, ORG_B] } } });
});

const key = (s: string) => `pgr4-idem-${s}-000000`;

const siteOfWrites = async (model: string) => {
  const rows = await db[model].findMany({ where: { organizationId: ORG_A } });
  const assets = await db.industrialAsset.findMany({ where: { organizationId: ORG_A } });
  const byId = new Map(assets.map((a) => [String(a.id), String(a.siteId)]));
  return [...new Set(rows.map((r) => byId.get(String(r.assetId))))].sort();
};

describe("R4 · a SITE run against real PostgreSQL", () => {
  it("writes only to the named site, and the row records what it did", async () => {
    const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("site") }));
    expect(res.status).toBe(200);
    const { run: r } = await res.json();

    expect(r.scopeMode).toBe("SITE");
    expect(r.siteId).toBe(SITE_A1);
    expect(r.status).toBe("COMPLETED");
    expect(r.assetsDiscovered).toBe(2);
    expect(r.assetsProcessed).toBe(2);
    expect(r.assetsFailed).toBe(0);

    // Every durable record landed on site A1 and nowhere else.
    expect(await siteOfWrites("assetIntelligenceSnapshot")).toEqual([SITE_A1]);
    expect(await siteOfWrites("assetRiskScore")).toEqual([SITE_A1]);
    expect(await siteOfWrites("assetAlert")).toEqual([SITE_A1]);

    // And the stored run agrees with the response.
    const stored = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG_A } });
    expect(stored).toHaveLength(1);
    expect(stored[0].assetsProcessed).toBe(r.assetsProcessed);
    expect(stored[0].status).toBe("COMPLETED");
  });

  it("never touches the other organisation, even one squatting on this site", async () => {
    await run(post({ siteId: SITE_A1, idempotencyKey: key("xorg") }));
    // ORG_B's `pgr4-cross-tenant` asset sits on SITE_A1. The site predicate
    // alone would sweep it in; the organisation predicate is what keeps it out.
    const foreign = await db.assetIntelligenceSnapshot.count({ where: { organizationId: ORG_B } });
    expect(foreign).toBe(0);
    const touched = await db.assetIntelligenceSnapshot.findMany({ where: { organizationId: ORG_A } });
    expect(touched.map((r) => String(r.assetId)).sort()).toEqual(["pgr4-a1-plc", "pgr4-a1-pump"]);
  });

  it("records exactly one audit row and, for a JWT session, no meter row", async () => {
    await run(post({ siteId: SITE_A1, idempotencyKey: key("audit") }));
    const audits = await db.auditLog.findMany({ where: { organizationId: ORG_A } });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("industrial.automation.run.site");
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });
});

describe("R4 · idempotency against the real UNIQUE constraint", () => {
  it("a replay returns the original run and executes nothing", async () => {
    const first = await (await run(post({ siteId: SITE_A1, idempotencyKey: key("replay") }))).json();
    const snapshotsAfterFirst = await db.assetIntelligenceSnapshot.count({ where: { organizationId: ORG_A } });

    const second = await (await run(post({ siteId: SITE_A1, idempotencyKey: key("replay") }))).json();
    expect(second.replayed).toBe(true);
    expect(second.run.requestId).toBe(first.run.requestId);
    expect(await db.assetIntelligenceSnapshot.count({ where: { organizationId: ORG_A } })).toBe(snapshotsAfterFirst);
    expect(await db.industrialAutomationRun.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("a replay is audited once, not twice", async () => {
    await run(post({ siteId: SITE_A1, idempotencyKey: key("audit-once") }));
    await run(post({ siteId: SITE_A1, idempotencyKey: key("audit-once") }));
    expect(await db.auditLog.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("an API-key replay is metered exactly once", async () => {
    /*
      ── R7 rewrote this test, because R7 changed the contract it describes ──

      R6 found the old shape: `meterIndustrialEvent` was fire-and-forget, and
      this test read `UsageRecord` immediately, so it was asserting a timing
      accident. R6 made it wait for the row.

      R7 removed the race entirely. The run now writes a metering event to
      `IndustrialMeteringOutbox` INSIDE its own transaction, and a separate
      worker delivers it to `UsageRecord`. Waiting for a usage row after the
      response therefore waits forever — correctly — because no worker has run.
      That is exactly how this test failed when the change landed, and the test
      was the thing that was out of date.

      The property is unchanged and is now checked at both ends: a replay
      enqueues ONE event, and delivering it produces ONE usage row.
    */
    h.authMethod = "apikey";
    await run(post({ siteId: SITE_A1, idempotencyKey: key("meter-once") }));
    await run(post({ siteId: SITE_A1, idempotencyKey: key("meter-once") }));

    // Durable the moment the run committed — no polling, nothing in flight.
    const events = await db.industrialMeteringOutbox.findMany({
      where: { organizationId: ORG_A },
    });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("PENDING");
    expect(events[0].metric).toBe("industrial_automation_runs");

    // And nothing is billed until the worker says so.
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);

    const { deliverPendingMeteringEvents } = await import("@/lib/industrial/metering-outbox");
    await deliverPendingMeteringEvents();

    const meters = await db.usageRecord.findMany({ where: { organizationId: ORG_A } });
    expect(meters).toHaveLength(1);
    expect(meters[0].metric).toBe("industrial_automation_runs");
  });

  it("two CONCURRENT requests with the SAME key still execute once", async () => {
    /*
      This is the case the DATABASE constraint exists for, and the one this
      suite was missing. The sequential replay above is won by `claimRun`'s
      lookup, so dropping the unique index left the suite green — a surviving
      mutation, and proof that the index was untested rather than untestable.

      Two requests in flight together both pass that lookup; only the UNIQUE
      (organizationId, idempotencyKey) index can decide between them. Drop it
      and this test fails.
    */
    const [a, b] = await Promise.all([
      run(post({ siteId: SITE_A1, idempotencyKey: key("race-same") })),
      run(post({ siteId: SITE_A1, idempotencyKey: key("race-same") })),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const bodies = await Promise.all([a.json(), b.json()]);
    // Exactly one executed; the other was recognised as the same operation.
    expect(bodies.filter((x) => x.replayed === false)).toHaveLength(1);
    expect(bodies.filter((x) => x.replayed === true)).toHaveLength(1);
    // One run row, one set of analysis records, one audit entry.
    expect(await db.industrialAutomationRun.count({ where: { organizationId: ORG_A } })).toBe(1);
    expect(await db.assetIntelligenceSnapshot.count({ where: { organizationId: ORG_A } })).toBe(2);
    expect(await db.auditLog.count({ where: { organizationId: ORG_A } })).toBe(1);
  });

  it("the same key for a different scope is refused, not answered", async () => {
    h.allowedSiteIds = [SITE_A1, SITE_A2];
    expect((await run(post({ siteId: SITE_A1, idempotencyKey: key("scope") }))).status).toBe(200);
    const res = await run(post({ siteId: SITE_A2, idempotencyKey: key("scope") }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("IDEMPOTENCY_KEY_SCOPE_MISMATCH");
  });
});

describe("R4 · concurrency against the real PARTIAL unique index", () => {
  it("two different keys racing one scope: one 200, one 409, one execution", async () => {
    const [a, b] = await Promise.all([
      run(post({ siteId: SITE_A1, idempotencyKey: key("race-a") })),
      run(post({ siteId: SITE_A1, idempotencyKey: key("race-b") })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const busy = a.status === 409 ? a : b;
    expect((await busy.json()).error).toBe("SCOPE_BUSY");
    // Exactly one run got as far as writing analysis records.
    const runs = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG_A } });
    expect(runs.filter((r) => r.status === "COMPLETED")).toHaveLength(1);
  });

  it("a completed run does not block the next one", async () => {
    expect((await run(post({ siteId: SITE_A1, idempotencyKey: key("seq-1") }))).status).toBe(200);
    expect((await run(post({ siteId: SITE_A1, idempotencyKey: key("seq-2") }))).status).toBe(200);
  });

  it("a stale lease is reclaimed rather than locking the site forever", async () => {
    await db.industrialAutomationRun.create({
      data: {
        id: "pgr4-stale", organizationId: ORG_A, siteId: SITE_A1, siteScopeKey: SITE_A1,
        scopeMode: "SITE", status: "RUNNING", idempotencyKey: key("stale-holder"),
        requestId: "req-stale", actorRole: "OWNER", authMethod: "jwt",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("after-stale") }));
    expect(res.status).toBe(200);
    const stale = await db.industrialAutomationRun.findMany({ where: { id: "pgr4-stale" } });
    expect(stale[0].status).toBe("EXPIRED");
  });
});

describe("R4 · organisation-wide against real data", () => {
  it("MANAGER is refused", async () => {
    h.role = "MANAGER";
    const res = await run(post({ idempotencyKey: key("mgr-org"), scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(403);
    expect(await db.industrialAutomationRun.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("OWNER gets the challenge first and nothing is written", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2, SITE_A_MAINT];
    const res = await run(post({ idempotencyKey: key("owner-challenge"), scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(412);
    expect(await db.industrialAutomationRun.count({ where: { organizationId: ORG_A } })).toBe(0);
  });

  it("confirmed, it covers the ACTIVE sites and names the excluded one", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2, SITE_A_MAINT];
    const res = await run(
      post({
        idempotencyKey: key("owner-run"),
        scopeMode: "ORGANISATION",
        confirmOrganisationWide: true,
        reason: "R4 rehearsal — estate-wide recalculation",
      }),
    );
    expect(res.status).toBe(200);
    const { run: r } = await res.json();
    expect([...r.sitesIncluded].sort()).toEqual([SITE_A1, SITE_A2].sort());
    // A MAINTENANCE site is excluded and SAID SO, not silently dropped.
    expect(r.sitesExcluded).toEqual([SITE_A_MAINT]);
    expect(r.assetsProcessed).toBe(3);
    // The maintenance site's asset was genuinely not touched.
    expect(await siteOfWrites("assetIntelligenceSnapshot")).toEqual([SITE_A1, SITE_A2].sort());

    const audits = await db.auditLog.findMany({ where: { organizationId: ORG_A } });
    expect(audits[0].action).toBe("industrial.automation.run.organisation_wide");
  });
});
