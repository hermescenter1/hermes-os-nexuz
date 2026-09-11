/**
 * PHASE 109-C-UI.2-R6 — site/organisation semantics and the eight counters,
 * against REAL PostgreSQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE ADDS THAT THE OTHERS DO NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * The R3 suite proves the refusal matrix in process, against a fake. The R4
 * suite proves the happy paths against a real database. Neither proves, on a
 * real database, that a malformed or unusable scope writes NOTHING — and "the
 * refusal is correct" and "the refusal left no rows behind" are different
 * claims. A route can return 400 and still have written.
 *
 * So every refusal here is asserted twice: the status the caller sees, and the
 * state of the database afterwards. Zero analysis rows, zero run rows, zero
 * audit rows, zero meter rows.
 *
 * The counters are then checked against what the database actually holds rather
 * than against each other, because F-06 was precisely a counter that agreed
 * with itself while disagreeing with the work done.
 *
 * Excluded from `npm run test` by the `*.pg.test.ts` rule. Creates rows under a
 * `pgr6-` prefix and removes exactly those.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORG_A = "pgr6-org-a";
const ORG_B = "pgr6-org-b";
const SITE_A1 = "pgr6-site-a1";       // ACTIVE, 3 assets
const SITE_A2 = "pgr6-site-a2";       // ACTIVE, 1 asset
const SITE_MAINT = "pgr6-site-maint"; // MAINTENANCE, 1 asset
const SITE_INACT = "pgr6-site-inact"; // INACTIVE, 1 asset
const SITE_B1 = "pgr6-site-b1";       // ACTIVE, another tenant
const USER = "pgr6-user";

const h = vi.hoisted(() => ({
  role: "MANAGER" as string,
  siteRole: "SITE_MANAGER" as string,
  authMethod: "jwt" as "jwt" | "apikey",
  scopes: ["industrial.write"] as string[],
  allowedSiteIds: [] as string[],
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () => ({
    ctx: { userId: USER, orgId: ORG_A, authMethod: h.authMethod, scopes: h.scopes, keyId: "k" },
  }),
}));
vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () => ({ ctx: { userId: USER, orgId: ORG_A, role: h.role } }),
}));
vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => h.allowedSiteIds,
  /*
    The mock re-checks tenancy AND status against the real tables, because the
    production helper does. An earlier version authorised any id that appeared
    in `allowedSiteIds`, which made the allow-list the only gate and quietly
    removed the check this file exists to exercise.
  */
  requireSiteActor: async (_req: unknown, orgId: string, siteId: string) => {
    if (!h.allowedSiteIds.includes(siteId)) return { error: "not permitted", status: 403 };
    const { getPrisma } = await import("@/lib/db/prisma");
    const client = (await getPrisma()) as unknown as {
      industrialSite: { findMany: (a: unknown) => Promise<Record<string, unknown>[]> };
    };
    const rows = await client.industrialSite.findMany({ where: { id: siteId, organizationId: orgId } });
    if (rows.length === 0 || rows[0].status !== "ACTIVE") return { error: "not permitted", status: 403 };
    return { ctx: { userId: USER, orgId, siteId, role: h.siteRole, implicit: false } };
  },
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

const ORGS = [ORG_A, ORG_B];

const post = (body: unknown, query = "") =>
  new NextRequest(new URL(`/api/industrial/automation/run${query}`, "http://localhost"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

async function purge() {
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: ORGS } } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialAsset.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.industrialSite.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.organization.deleteMany({ where: { id: { in: ORGS } } });
  await db.user.deleteMany({ where: { id: USER } });
}

/** Rows written anywhere, for either tenant. The number a refusal must leave at 0. */
async function allWrittenRows(): Promise<number> {
  let total = 0;
  for (const m of ANALYSIS) total += await db[m].count({ where: { organizationId: { in: ORGS } } });
  total += await db.industrialAutomationRun.count({ where: { organizationId: { in: ORGS } } });
  total += await db.auditLog.count({ where: { organizationId: { in: ORGS } } });
  total += await db.usageRecord.count({ where: { organizationId: { in: ORGS } } });
  return total;
}

/** The distinct sites a given output table actually landed on. */
async function sitesTouched(model: string): Promise<string[]> {
  const rows = await db[model].findMany({ where: { organizationId: ORG_A } });
  const assets = await db.industrialAsset.findMany({ where: { organizationId: ORG_A } });
  const byId = new Map(assets.map((a) => [String(a.id), String(a.siteId)]));
  return [...new Set(rows.map((r) => byId.get(String(r.assetId))))].filter(Boolean).sort() as string[];
}

beforeAll(async () => {
  const client = await getPrisma();
  if (!client) throw new Error("No database. Set DATABASE_URL to a DISPOSABLE PostgreSQL.");
  db = client as unknown as Db;
  await purge();

  await db.user.create({
    data: {
      id: USER, name: "PG R6 Actor", email: "pgr6-user@example.invalid",
      passwordHash: "NOT-A-REAL-HASH", updatedAt: new Date(),
    },
  });
  for (const [id, name] of [[ORG_A, "PG R6 A"], [ORG_B, "PG R6 B"]] as const) {
    await db.organization.create({ data: { id, name, slug: id, updatedAt: new Date() } });
  }
  for (const [id, org, status] of [
    [SITE_A1, ORG_A, "ACTIVE"],
    [SITE_A2, ORG_A, "ACTIVE"],
    [SITE_MAINT, ORG_A, "MAINTENANCE"],
    [SITE_INACT, ORG_A, "INACTIVE"],
    [SITE_B1, ORG_B, "ACTIVE"],
  ] as const) {
    await db.industrialSite.create({
      data: { id, organizationId: org, name: id, slug: id, status, updatedAt: new Date() },
    });
  }
  for (const [id, org, site] of [
    ["pgr6-a1-pump", ORG_A, SITE_A1],
    ["pgr6-a1-plc", ORG_A, SITE_A1],
    ["pgr6-a1-motor", ORG_A, SITE_A1],
    ["pgr6-a2-valve", ORG_A, SITE_A2],
    ["pgr6-maint-fan", ORG_A, SITE_MAINT],
    ["pgr6-inact-drive", ORG_A, SITE_INACT],
    ["pgr6-b1-pump", ORG_B, SITE_B1],
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
  h.siteRole = "SITE_MANAGER";
  h.authMethod = "jwt";
  h.scopes = ["industrial.write"];
  h.allowedSiteIds = [SITE_A1];
  await db.industrialAutomationRun.deleteMany({ where: { organizationId: { in: ORGS } } });
  for (const m of ANALYSIS) await db[m].deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.usageRecord.deleteMany({ where: { organizationId: { in: ORGS } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ORGS } } });
});

const key = (s: string) => `pgr6-idem-${s}-000000`;

describe("R6 · SITE mode — an unusable scope writes nothing at all", () => {
  const cases: [string, unknown, string, number][] = [
    ["siteId absent",        { idempotencyKey: key("no-site") },                          "SITE_ID_REQUIRED", 400],
    // Not SITE_ID_REQUIRED: an empty string is a value that was SUPPLIED and is
    // unusable, which is a different thing from a field that was left out. I
    // expected the "required" code here and the route was the more precise of
    // the two.
    ["siteId empty string",  { siteId: "", idempotencyKey: key("empty") },                "SITE_ID_INVALID",  400],
    ["siteId whitespace",    { siteId: "   ", idempotencyKey: key("ws") },                "SITE_ID_INVALID",  400],
    ["siteId malformed",     { siteId: "../../etc/passwd", idempotencyKey: key("path") }, "SITE_ID_INVALID",  400],
    ["siteId too short",     { siteId: "ab", idempotencyKey: key("short") },              "SITE_ID_INVALID",  400],
    ["siteId is an array",   { siteId: [SITE_A1, SITE_A2], idempotencyKey: key("arr") },  "MALFORMED_REQUEST", 400],
  ];

  for (const [label, body, code, status] of cases) {
    it(`${label} -> ${code}, and zero rows anywhere`, async () => {
      const res = await run(post(body));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
      expect(await allWrittenRows()).toBe(0);
    });
  }

  it("siteId given twice with different values is refused, not resolved", async () => {
    // Body and query string disagreeing is ambiguity, and picking a winner
    // would let a caller smuggle a second site past whichever layer reads first.
    const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("dupe") }, `?siteId=${SITE_A2}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MALFORMED_REQUEST");
    expect(await allWrittenRows()).toBe(0);
  });

  it("a site belonging to ANOTHER organisation is 404, never 403", async () => {
    // 403 would confirm the site exists. The caller must not be able to
    // enumerate another tenant's estate through the status code.
    const res = await run(post({ siteId: SITE_B1, idempotencyKey: key("xorg") }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("SITE_ID_NOT_PERMITTED");
    expect(await allWrittenRows()).toBe(0);
  });

  it("a MAINTENANCE site is refused even when it is in the allow-list", async () => {
    h.allowedSiteIds = [SITE_A1, SITE_MAINT];
    const res = await run(post({ siteId: SITE_MAINT, idempotencyKey: key("maint") }));
    expect(res.status).toBe(404);
    expect(await allWrittenRows()).toBe(0);
  });

  it("an INACTIVE site is refused even when it is in the allow-list", async () => {
    h.allowedSiteIds = [SITE_A1, SITE_INACT];
    const res = await run(post({ siteId: SITE_INACT, idempotencyKey: key("inact") }));
    expect(res.status).toBe(404);
    expect(await allWrittenRows()).toBe(0);
  });

  it("a MANAGER cannot reach a sibling site it was not granted", async () => {
    h.allowedSiteIds = [SITE_A1];
    const res = await run(post({ siteId: SITE_A2, idempotencyKey: key("sibling") }));
    expect(res.status).toBe(404);
    expect(await allWrittenRows()).toBe(0);
  });

  it("an actor with NO sites is refused before any site is named", async () => {
    h.allowedSiteIds = [];
    const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("nosites") }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("NO_ACCESSIBLE_SITE");
    expect(await allWrittenRows()).toBe(0);
  });
});

describe("R6 · the eight counters, checked against the database", () => {
  it("a three-asset site reports three, and every count matches the rows written", async () => {
    h.allowedSiteIds = [SITE_A1];
    const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("counters") }));
    expect(res.status).toBe(200);
    const { run: r } = await res.json();

    expect(r.assetsDiscovered).toBe(3);
    expect(r.assetsAttempted).toBe(3);
    expect(r.assetsProcessed).toBe(3);
    expect(r.assetsFailed).toBe(0);

    // Each creation counter against the actual table, not against another counter.
    expect(r.snapshotsCreated).toBe(
      await db.assetIntelligenceSnapshot.count({ where: { organizationId: ORG_A } }),
    );
    expect(r.riskScoresCreated).toBe(
      await db.assetRiskScore.count({ where: { organizationId: ORG_A } }),
    );
    expect(r.alertsCreated).toBe(await db.assetAlert.count({ where: { organizationId: ORG_A } }));
    expect(r.recommendationsCreated).toBe(
      await db.maintenanceRecommendation.count({ where: { organizationId: ORG_A } }),
    );

    // And the stored run agrees with what the caller was told.
    const stored = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG_A } });
    expect(stored).toHaveLength(1);
    expect(stored[0].assetsDiscovered).toBe(3);
    expect(stored[0].assetsProcessed).toBe(3);
    expect(stored[0].assetsFailed).toBe(0);
    expect(stored[0].status).toBe("COMPLETED");
  });

  it("the run touches the named site and no other, including the other tenant", async () => {
    h.allowedSiteIds = [SITE_A1];
    await run(post({ siteId: SITE_A1, idempotencyKey: key("only-a1") }));

    expect(await sitesTouched("assetIntelligenceSnapshot")).toEqual([SITE_A1]);
    expect(await sitesTouched("assetRiskScore")).toEqual([SITE_A1]);
    for (const m of ANALYSIS) {
      expect(await db[m].count({ where: { organizationId: ORG_B } })).toBe(0);
    }
  });

  it("when EVERY asset fails, assetsProcessed is 0 and nothing is left behind", async () => {
    /*
      F-06 in its original form: `assetsProcessed` was the length of the fetched
      array, so a run in which every asset threw still reported them all as
      processed. The failure is injected at the database — a trigger that
      refuses one of the engine's output writes — so this is a real refusal, not
      a stubbed one.

      The trigger sits on `AssetRiskScore` and NOT on `AssetHealthHistory`,
      which was the first table I tried. That write is conditional: the engine
      appends history only when the asset already has a health score, so on a
      fresh fixture the trigger never fired and the run returned 200. An
      injection into a statement that never executes proves nothing.

      What the run records afterwards is `assetsProcessed = 0`. It cannot record
      "3 discovered, 0 processed, 3 failed" and commit, because a PostgreSQL
      error aborts the surrounding transaction: the remaining statements and
      then the audit write fail too, and the whole run is rolled back. The
      counters can describe partial failure only for errors that are not
      database errors. That is the fail-closed behaviour the owner ruled for,
      and it is asserted here rather than assumed.
    */
    h.allowedSiteIds = [SITE_A1];
    const raw = (sql: string) =>
      (db as unknown as { $executeRawUnsafe: (s: string) => Promise<unknown> }).$executeRawUnsafe(sql);

    await raw(`CREATE OR REPLACE FUNCTION r6_refuse_all() RETURNS trigger AS $fn$
                 BEGIN RAISE EXCEPTION 'R6_ALL_ASSETS_FAIL'; END;
               $fn$ LANGUAGE plpgsql;`);
    await raw(`CREATE TRIGGER r6_refuse_all_trg BEFORE INSERT ON "AssetRiskScore"
               FOR EACH ROW EXECUTE FUNCTION r6_refuse_all();`);
    try {
      const res = await run(post({ siteId: SITE_A1, idempotencyKey: key("allfail") }));
      expect(res.status).toBe(500);

      const stored = await db.industrialAutomationRun.findMany({ where: { organizationId: ORG_A } });
      expect(stored).toHaveLength(1);
      expect(stored[0].assetsProcessed).toBe(0);
      expect(stored[0].status).toBe("FAILED");

      for (const m of ANALYSIS) {
        expect(await db[m].count({ where: { organizationId: ORG_A } })).toBe(0);
      }
      expect(await db.auditLog.count({ where: { organizationId: ORG_A } })).toBe(0);
    } finally {
      await raw(`DROP TRIGGER IF EXISTS r6_refuse_all_trg ON "AssetRiskScore";`);
      await raw(`DROP FUNCTION IF EXISTS r6_refuse_all();`);
    }

    // The scope is free again the moment the failure is recorded.
    const next = await run(post({ siteId: SITE_A1, idempotencyKey: key("allfail-after") }));
    expect(next.status).toBe(200);
  });

  it("a JWT run writes no meter row at all", async () => {
    h.allowedSiteIds = [SITE_A1];
    await run(post({ siteId: SITE_A1, idempotencyKey: key("no-meter") }));
    // Metering is fire-and-forget, so settle before concluding it did not happen.
    await new Promise((r) => setTimeout(r, 1_500));
    expect(await db.usageRecord.count({ where: { organizationId: ORG_A } })).toBe(0);
  });
});

describe("R6 · ORGANISATION mode", () => {
  it("MANAGER holding manage_industrial is still refused", async () => {
    h.role = "MANAGER";
    h.allowedSiteIds = [SITE_A1, SITE_A2];
    const res = await run(post({ idempotencyKey: key("mgr"), scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ORG_WIDE_NOT_PERMITTED");
    expect(await allWrittenRows()).toBe(0);
  });

  it("OWNER without confirmation gets the challenge and writes nothing", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2, SITE_MAINT, SITE_INACT];
    const res = await run(post({ idempotencyKey: key("challenge"), scopeMode: "ORGANISATION" }));
    expect(res.status).toBe(412);
    expect((await res.json()).error).toBe("ORG_WIDE_CONFIRMATION_REQUIRED");
    expect(await allWrittenRows()).toBe(0);
  });

  it("confirmation without a reason is still refused", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2];
    const res = await run(
      post({ idempotencyKey: key("noreason"), scopeMode: "ORGANISATION", confirmOrganisationWide: true }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("ORG_WIDE_REASON_REQUIRED");
    expect(await allWrittenRows()).toBe(0);
  });

  it("naming a site in ORGANISATION mode is refused rather than silently ignored", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2];
    const res = await run(
      post({ siteId: SITE_A1, idempotencyKey: key("bothscopes"), scopeMode: "ORGANISATION" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SITE_ID_NOT_ALLOWED_IN_ORG_MODE");
    expect(await allWrittenRows()).toBe(0);
  });

  it("confirmed, it covers both ACTIVE sites and NAMES the two it left out", async () => {
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_A1, SITE_A2, SITE_MAINT, SITE_INACT];
    const res = await run(
      post({
        idempotencyKey: key("orgrun"),
        scopeMode: "ORGANISATION",
        confirmOrganisationWide: true,
        reason: "R6 rehearsal — estate-wide recalculation",
      }),
    );
    expect(res.status).toBe(200);
    const { run: r } = await res.json();

    expect([...r.sitesIncluded].sort()).toEqual([SITE_A1, SITE_A2].sort());
    // Excluded, and SAID SO. A silently dropped site is indistinguishable from
    // a site that was analysed and found clean.
    expect([...r.sitesExcluded].sort()).toEqual([SITE_INACT, SITE_MAINT].sort());

    // Four assets across the two ACTIVE sites; the maintenance and inactive
    // sites keep their assets untouched.
    expect(r.assetsDiscovered).toBe(4);
    expect(r.assetsProcessed).toBe(4);
    expect(await sitesTouched("assetIntelligenceSnapshot")).toEqual([SITE_A1, SITE_A2].sort());

    // The audit row names the org-wide action specifically.
    const audits = await db.auditLog.findMany({ where: { organizationId: ORG_A } });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("industrial.automation.run.organisation_wide");

    // And the other tenant is untouched, which is the whole point of "org-wide".
    for (const m of ANALYSIS) {
      expect(await db[m].count({ where: { organizationId: ORG_B } })).toBe(0);
    }
  });

  it("an org-wide run whose every site is unusable is refused, not widened", async () => {
    // The failure mode this forbids: "no usable site" quietly becoming "all sites".
    h.role = "OWNER";
    h.allowedSiteIds = [SITE_MAINT, SITE_INACT];
    const res = await run(
      post({
        idempotencyKey: key("allexcluded"),
        scopeMode: "ORGANISATION",
        confirmOrganisationWide: true,
        reason: "R6 rehearsal — no usable site remains",
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("NO_ACCESSIBLE_SITE");
    expect(await allWrittenRows()).toBe(0);
  });
});
