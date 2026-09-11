/**
 * PHASE 109-C-UI.2 — the automation engine's scope and counters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE WAS REWRITTEN BY R3, EXACTLY AS R2 SAID IT WOULD BE
 * ─────────────────────────────────────────────────────────────────────────────
 * R2 could not close F-04 (the owner's ruling was outstanding), so it wrote this
 * file as a CHARACTERISATION of the defect and marked every assertion that a fix
 * would invert with `[F-04 CURRENT BEHAVIOUR]` and an "AFTER A FIX:" line. Its
 * header said: if these go red because someone site-scoped the engine, update
 * this file as part of that change — never loosen the engine to keep them green.
 *
 * R3 site-scoped the engine. Those assertions are now inverted, in place, and
 * each one names the R2 assertion it replaces. The R2 forward control (P4) had
 * already predicted the exact five that would fail; they are the five below.
 *
 * THE FAKE HONOURS `where`, including `{ in: [...] }`, and applies the schema
 * defaults the engine's de-duplication reads. A stub returning fixed arrays
 * would let every claim here pass against an engine with no predicates at all —
 * and a fake that dropped `dismissed`'s `@default(false)` reported working
 * de-duplication as broken, which is how R2 nearly filed a false defect.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_1 = "site-1";
const SITE_2 = "site-2";

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [field, cond] of Object.entries(where)) {
    const value = row[field];
    if (cond !== null && typeof cond === "object" && "in" in (cond as object)) {
      const list = (cond as { in: unknown[] }).in;
      if (!Array.isArray(list) || !list.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

let created: { model: string; data: Row }[] = [];
let reads: { model: string; where: Record<string, unknown> | undefined }[] = [];
let tables: Record<string, Row[]> = {};
let failing = new Set<string>();

/** Column defaults from prisma/schema.prisma that the engine relies on. */
const DEFAULTS: Record<string, Row> = {
  assetAlert: { dismissed: false, resolvedAt: null },
  maintenanceRecommendation: { dismissed: false },
};

function model(name: string) {
  return {
    findMany: async (q: { where?: Record<string, unknown>; take?: number }) => {
      reads.push({ model: name, where: q.where });
      const assetId = q.where?.assetId;
      if (typeof assetId === "string" && failing.has(assetId)) {
        throw new Error("simulated read failure");
      }
      const hit = (tables[name] ?? []).filter((r) => matches(r, q.where));
      return typeof q.take === "number" ? hit.slice(0, q.take) : hit;
    },
    findFirst: async (q: { where?: Record<string, unknown> }) => {
      reads.push({ model: name, where: q.where });
      return (tables[name] ?? []).find((r) => matches(r, q.where)) ?? null;
    },
    create: async (q: { data: Row }) => {
      created.push({ model: name, data: q.data });
      const withDefaults = { id: `${name}-${created.length}`, ...DEFAULTS[name], ...q.data };
      (tables[name] ??= []).push(withDefaults);
      return withDefaults;
    },
    update: async (q: { where: { id: string }; data: Row }) => q.data,
  };
}

const MODELS = [
  "industrialAsset", "assetHealthHistory", "telemetryRecord", "kPIRecord",
  "assetKnowledgeLink", "assetTag", "assetRiskScore",
  "assetIntelligenceSnapshot", "assetAlert", "maintenanceRecommendation",
];

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => Object.fromEntries(MODELS.map((m) => [m, model(m)])),
}));

const { runIntelligenceAutomation } = await import("@/lib/industrial/automation");
const { countersAreConsistent } = await import("@/lib/industrial/automation-scope");

const touched = (m: string) =>
  [...new Set(created.filter((c) => c.model === m).map((c) => String(c.data.assetId)))].sort();

const siteOf = () =>
  Object.fromEntries(tables.industrialAsset.map((a) => [String(a.id), String(a.siteId)]));

beforeEach(() => {
  created = [];
  reads = [];
  failing = new Set();
  tables = {
    industrialAsset: [
      { id: "a1", organizationId: ORG_A, siteId: SITE_1, assetType: "PUMP" },
      { id: "a2", organizationId: ORG_A, siteId: SITE_1, assetType: "PLC" },
      { id: "a3", organizationId: ORG_A, siteId: SITE_2, assetType: "MOTOR" },
      { id: "b1", organizationId: ORG_B, siteId: "site-b", assetType: "PUMP" },
    ],
    assetHealthHistory: [], telemetryRecord: [], kPIRecord: [],
    assetKnowledgeLink: [], assetTag: [], assetRiskScore: [],
    assetIntelligenceSnapshot: [], assetAlert: [], maintenanceRecommendation: [],
  };
});

/* ── the organisation boundary — unchanged, still correct ─────────────────── */

describe("the organisation boundary holds", () => {
  it("a run never reads or writes another organisation's asset", async () => {
    const result = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1, SITE_2] });
    expect(result.counters.assetsProcessed).toBe(3);
    expect(created.some((c) => String(c.data.assetId) === "b1")).toBe(false);
  });

  it("every write carries the acting organisation", async () => {
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(created.every((c) => c.data.organizationId === ORG_A)).toBe(true);
  });
});

/* ── F-04 CLOSED — each test names the R2 assertion it replaces ───────────── */

describe("F-04 CLOSED · the run is scoped to the sites it was given", () => {
  it("the asset selection carries BOTH predicates, in the query", async () => {
    // Replaces R2's "[F-04 CURRENT BEHAVIOUR] the asset selection carries NO
    // site predicate", whose `where` had exactly one key.
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    const selection = reads.find((r) => r.model === "industrialAsset")!;
    expect(selection.where).toEqual({ organizationId: ORG_A, siteId: { in: [SITE_1] } });
  });

  it("a site-1 run writes nothing against site 2", async () => {
    // Replaces R2's "one run writes to EVERY site in the organisation".
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    const site = siteOf();
    const sites = new Set(created.map((c) => site[String(c.data.assetId)]));
    expect([...sites]).toEqual([SITE_1]);
    expect(touched("assetIntelligenceSnapshot")).toEqual(["a1", "a2"]);
  });

  it("alerts and recommendations are confined to the scope too", async () => {
    // Replaces R2's "alerts are created for assets in every site".
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_2] });
    expect(touched("assetAlert")).toEqual(["a3"]);
    expect(touched("maintenanceRecommendation")).toEqual(["a3"]);
  });

  it("the result names the exact sites covered", async () => {
    // Replaces R2's "the reported counts are organisation-wide" / "no site
    // dimension". The run now says what it covered rather than implying it.
    const result = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_2] });
    expect(result.siteIds).toEqual([SITE_2]);
    expect(result.counters.assetsDiscovered).toBe(1);
  });

  it("the engine REQUIRES a scope — there is no one-argument form", () => {
    // Replaces R2's "the engine's signature accepts an organisation and nothing
    // else". A caller can no longer forget to narrow the run.
    expect(runIntelligenceAutomation.length).toBe(2);
  });

  it("an empty scope runs nothing — it is never widened to the organisation", async () => {
    const result = await runIntelligenceAutomation(ORG_A, { siteIds: [] });
    expect(result.failureCode).toBe("EMPTY_SCOPE");
    expect(result.counters.assetsDiscovered).toBe(0);
    expect(created).toHaveLength(0);
    // Nothing was even read: the refusal precedes the database.
    expect(reads).toHaveLength(0);
  });

  it("a duplicated site id changes nothing", async () => {
    const once = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    created = [];
    const twice = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1, SITE_1, SITE_1] });
    expect(twice.siteIds).toEqual(once.siteIds);
  });

  it("a site belonging to another organisation contributes nothing", async () => {
    const result = await runIntelligenceAutomation(ORG_A, { siteIds: ["site-b"] });
    expect(result.counters.assetsDiscovered).toBe(0);
    expect(created).toHaveLength(0);
  });
});

/* ── F-06 CLOSED — the counters mean what they say ────────────────────────── */

describe("F-06 CLOSED · discovered, attempted, processed and failed are four numbers", () => {
  it("a clean run: discovered = attempted = processed, failed = 0", async () => {
    const { counters } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(counters.assetsDiscovered).toBe(2);
    expect(counters.assetsAttempted).toBe(2);
    expect(counters.assetsProcessed).toBe(2);
    expect(counters.assetsFailed).toBe(0);
    expect(countersAreConsistent(counters)).toBe(true);
  });

  it("when EVERY asset fails, assetsProcessed is 0 — not the fetched count", async () => {
    // Replaces R2's "[F-06 CURRENT BEHAVIOUR] `assetsProcessed` counts assets
    // FETCHED, not processed", which reported three processed alongside three
    // errors and zero snapshots.
    failing = new Set(["a1", "a2"]);
    const { counters, failures } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(counters.assetsDiscovered).toBe(2);
    expect(counters.assetsAttempted).toBe(2);
    expect(counters.assetsProcessed).toBe(0);
    expect(counters.assetsFailed).toBe(2);
    expect(counters.snapshotsCreated).toBe(0);
    expect(failures.map((f) => f.assetId).sort()).toEqual(["a1", "a2"]);
    expect(countersAreConsistent(counters)).toBe(true);
  });

  it("a partial failure is reported honestly on both sides", async () => {
    failing = new Set(["a2"]);
    const { counters, failures } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(counters.assetsProcessed).toBe(1);
    expect(counters.assetsFailed).toBe(1);
    expect(counters.snapshotsCreated).toBe(1);
    expect(failures).toHaveLength(1);
    expect(countersAreConsistent(counters)).toBe(true);
  });

  it("failures carry a closed code, never a raw error string", async () => {
    // The old engine pushed `String(e)` into the response, publishing whatever
    // the driver put in the message.
    failing = new Set(["a1"]);
    const { failures } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(failures[0].code).toBe("ASSET_PROCESSING_FAILED");
    expect(failures[0].code).not.toContain("simulated read failure");
  });

  it("snapshots and risk scores are counted per successful asset", async () => {
    const { counters } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1, SITE_2] });
    expect(counters.snapshotsCreated).toBe(3);
    expect(counters.riskScoresCreated).toBe(3);
    expect(counters.snapshotsCreated).toBeLessThanOrEqual(counters.assetsProcessed);
  });

  it("no counter is derived from the length of the fetched array", async () => {
    // The structural statement of F-06: with a mixture, the fetched length (3)
    // equals none of processed (2) or failed (1).
    failing = new Set(["a3"]);
    const { counters } = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1, SITE_2] });
    expect(counters.assetsDiscovered).toBe(3);
    expect(counters.assetsProcessed).toBe(2);
    expect(counters.assetsFailed).toBe(1);
  });
});

/* ── de-duplication, unchanged ────────────────────────────────────────────── */

describe("repeat execution within a scope", () => {
  it("alerts and recommendations de-duplicate on a second run", async () => {
    const first = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    const second = await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(first.counters.alertsCreated).toBeGreaterThan(0);
    expect(second.counters.alertsCreated).toBe(0);
    expect(second.counters.recommendationsCreated).toBe(0);
  });

  it("snapshots still are not de-duplicated at the engine — that is the RUN's job now", async () => {
    // F-05 is closed at the route by the idempotency key, not by dedup here: two
    // deliberate runs of the same scope SHOULD produce two snapshots, because
    // that is a genuine second measurement. What must not happen is a RETRY
    // producing one, and that is enforced by the run store.
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    await runIntelligenceAutomation(ORG_A, { siteIds: [SITE_1] });
    expect(created.filter((c) => c.model === "assetIntelligenceSnapshot")).toHaveLength(4);
  });

  it("an unavailable database is reported honestly, not as an empty success", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => null }));
    const { runIntelligenceAutomation: run } = await import("@/lib/industrial/automation");
    const result = await run(ORG_A, { siteIds: [SITE_1] });
    expect(result.failureCode).toBe("DATABASE_UNAVAILABLE");
    expect(result.counters.assetsDiscovered).toBe(0);
    vi.doUnmock("@/lib/db/prisma");
    vi.resetModules();
  });
});
