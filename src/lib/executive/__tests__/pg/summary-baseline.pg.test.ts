/**
 * Executive Management Center — the performance baseline (requirement row 11).
 *
 * A REPEATABLE measurement of the real aggregation (`buildExecutiveSummary`,
 * the same function the page and the nightly report call) against a real
 * PostgreSQL, at a stated data volume.
 *
 *   EXECUTIVE_PERF_DB=postgresql://… npm run perf:executive
 *
 * SKIPPED unless `EXECUTIVE_PERF_DB` names a database, so it never runs in the
 * ordinary suite or in CI by accident, and it REFUSES any database that is not
 * plainly a test database — it writes thousands of rows.
 *
 * WHAT IS MEASURED WHERE, and why. The aggregation uses the application's OWN
 * client (`getPrisma()`), so a Prisma log listener on a second client sees
 * nothing: an earlier version of this file "measured" 0 queries and its N+1
 * assertion passed vacuously. PostgreSQL's own counters
 * (`pg_stat_user_tables`) do see every statement, but a backend flushes them
 * ASYNCHRONOUSLY, so a short window cannot be attributed reliably — the same
 * earlier version read 607 scans for one build (a backlog of 21) and then 0.
 *
 * So the two questions are answered where each can be answered honestly:
 *   * the EXACT statement count, and that it does not grow per row, is proven
 *     deterministically in `summary.test.ts` ("the aggregation's cost does not
 *     grow with the number of rows"), whose fake records every statement;
 *   * the COST AT VOLUME is measured here, in wall-clock time against real
 *     PostgreSQL, with the scan counters reported only as approximate context.
 *
 * WHAT THESE NUMBERS ARE: the cost of the data layer on the machine that ran
 * them, at the stated row count. They are NOT production response times: no
 * HTTP, no React rendering, no production hardware, no concurrent load. A
 * production figure has to be measured in production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildExecutiveSummary } from "../../summary";
import type { ExecutiveScope } from "../../scope";

const URL = process.env.EXECUTIVE_PERF_DB ?? "";
const ENABLED = URL !== "";
/** Refuse anything that is not plainly a throwaway test database. */
const ISOLATED = /_test|_ci|localhost|127\.0\.0\.1/.test(URL);

const VOLUME = { customers: Number(process.env.PERF_CUSTOMERS ?? 2_000) };
const REPEATS = Number(process.env.PERF_REPEATS ?? 21);
const REPORT = process.env.PERF_REPORT ?? "";
const SCALING_REPORT = process.env.PERF_SCALING_REPORT ?? "";
/** Timed builds per volume in the scaling test. */
const SAMPLES = Number(process.env.PERF_SCALING_SAMPLES ?? 15);
/** The tables the executive aggregation reads. */
const WATCHED = [
  "Party",
  "PartyInteraction",
  "ErpTask",
  "ErpWorkOrder",
  "ErpApprovalRequest",
  "ErpProject",
  "IndustrialSite",
  "IndustrialGateway",
  "TelemetryRecord",
  "AssetAlert",
];

let prisma: PrismaClient;
let organizationId = "";
let siteId = "";

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};

type Scans = Record<string, number>;

/** Scans per watched table, straight from PostgreSQL's own counters. */
async function scans(): Promise<Scans> {
  // The snapshot is cached per transaction; clear it so each read is current.
  // It returns void, so it is an EXECUTE, not a QUERY — and the statistics
  // query takes no parameters, because the adapter does not bind a JS array to
  // a text[] (both mistakes made this harness throw before it measured anything).
  await prisma.$executeRawUnsafe("SELECT pg_stat_clear_snapshot()");
  const rows = (await prisma.$queryRawUnsafe(
    "SELECT relname, COALESCE(seq_scan,0) + COALESCE(idx_scan,0) AS n FROM pg_stat_user_tables",
  )) as Array<{ relname: string; n: bigint | number }>;
  const watched = new Set(WATCHED);
  return Object.fromEntries(rows.filter(r => watched.has(r.relname)).map(r => [r.relname, Number(r.n)]));
}

/**
 * PostgreSQL flushes a backend's pending statistics on a timer (and at
 * transaction end), so a counter read straight after a query can miss it
 * entirely or carry a backlog from earlier work. Waiting before each read, and
 * measuring a BLOCK of builds rather than one, makes the delta trustworthy:
 * an earlier version of this harness reported 607 "scans per build" because it
 * caught up with 21 builds at once, and 0 for the next measurement.
 */
const SETTLE_MS = Number(process.env.PERF_SETTLE_MS ?? 1_500);
const BLOCK = Number(process.env.PERF_BLOCK ?? 10);

async function settledScans(): Promise<Scans> {
  await new Promise(r => setTimeout(r, SETTLE_MS));
  return scans();
}

/** Scans attributable to one build, averaged over a block of identical builds. */
async function scansPerBuild(run: () => Promise<unknown>, block = BLOCK): Promise<{ perBuild: number; byTable: Scans }> {
  const before = await settledScans();
  for (let i = 0; i < block; i += 1) await run();
  const delta = diff(before, await settledScans());
  return { perBuild: total(delta) / block, byTable: delta };
}

const diff = (before: Scans, after: Scans): Scans =>
  Object.fromEntries(
    WATCHED.map(t => [t, (after[t] ?? 0) - (before[t] ?? 0)]).filter(([, n]) => (n as number) > 0),
  );

const total = (s: Scans) => Object.values(s).reduce((a, b) => a + b, 0);

function scopeFor(): ExecutiveScope {
  return {
    userId: "perf-user",
    organizationId,
    memberId: "perf-member",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true },
    allowedSiteIds: siteId ? [siteId] : [],
    timeZone: "Asia/Tehran",
    dayCutoffMinutes: 0,
    correlationId: "perf",
  } as ExecutiveScope;
}

/** Top up this organization to `target` customers. Idempotent by the name prefix. */
async function seedCustomers(target: number): Promise<number> {
  const have = await prisma.party.count({ where: { organizationId, displayName: { startsWith: "Perf " } } });
  const need = Math.max(0, target - have);
  const now = Date.now();
  for (let from = 0; from < need; from += 500) {
    await prisma.party.createMany({
      data: Array.from({ length: Math.min(500, need - from) }, (_, i) => {
        const n = have + from + i;
        return {
          organizationId,
          displayName: `Perf Customer ${String(n).padStart(6, "0")}`,
          status: n % 7 === 0 ? ("PROSPECT" as const) : ("ACTIVE" as const),
          followUpOwnerId: n % 5 === 0 ? null : "perf-owner",
          nextActionAt: n % 3 === 0 ? new Date(now - 86_400_000) : new Date(now + 86_400_000),
          createdAt: new Date(now - (n % 365) * 86_400_000),
        };
      }),
    });
  }
  return prisma.party.count({ where: { organizationId } });
}

describe.skipIf(!ENABLED)("executive summary — performance baseline on real PostgreSQL", () => {
  beforeAll(async () => {
    if (!ISOLATED) throw new Error("EXECUTIVE_PERF_DB must be an isolated test database");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) });
    const org = await prisma.organization.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
    if (!org) throw new Error("the perf database has no organization to measure");
    organizationId = org.id;
    siteId = (await prisma.industrialSite.findFirst({ where: { organizationId }, select: { id: true } }))?.id ?? "";
    await seedCustomers(VOLUME.customers);
  }, 900_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("measures the aggregation and records the baseline", async () => {
    const scope = scopeFor();
    const rows = {
      customers: await prisma.party.count({ where: { organizationId } }),
      interactions: await prisma.partyInteraction.count({ where: { organizationId } }),
      tasks: await prisma.erpTask.count({ where: { organizationId } }),
      alerts: await prisma.assetAlert.count({ where: { organizationId } }),
    };

    // One warm-up: the first call pays for connection setup and plan caching,
    // which is not what a steady-state page costs.
    await buildExecutiveSummary({ scope, range: "today", nowMs: Date.now() });

    const durations: number[] = [];
    for (let i = 0; i < REPEATS; i += 1) {
      const t0 = performance.now();
      const summary = await buildExecutiveSummary({ scope, range: "today", nowMs: Date.now() });
      durations.push(performance.now() - t0);
      expect(summary.sections.customers.status).toBe("OPERATIONAL");
    }

    // A block of builds, bracketed by PostgreSQL's own counters.
    const measured = await scansPerBuild(() => buildExecutiveSummary({ scope, range: "today", nowMs: Date.now() }));

    const payloadBytes = Buffer.byteLength(
      JSON.stringify(await buildExecutiveSummary({ scope, range: "today", nowMs: Date.now() })),
    );

    const baseline = {
      measuredAt: new Date().toISOString(),
      note: "Data-layer cost on the measuring machine. NOT a production response time.",
      rows,
      repeats: REPEATS,
      totalMs: {
        p50: Number(quantile(durations, 0.5).toFixed(2)),
        p95: Number(quantile(durations, 0.95).toFixed(2)),
        min: Number(Math.min(...durations).toFixed(2)),
        max: Number(Math.max(...durations).toFixed(2)),
      },
      scansPerBuild: {
        approxTotal: measured.perBuild,
        block: BLOCK,
        byTableForBlock: measured.byTable,
        note: "APPROXIMATE: PostgreSQL flushes per-backend counters asynchronously. The exact statement count is pinned in summary.test.ts.",
      },
      payloadBytes,
    };

    console.log("EXECUTIVE_BASELINE " + JSON.stringify(baseline, null, 2));
    if (REPORT) {
      mkdirSync(dirname(REPORT), { recursive: true });
      writeFileSync(REPORT, JSON.stringify(baseline, null, 2) + "\n");
    }

    // The instrument must have OBSERVED something — a zero would mean it is
    // broken, not that the page is free — and the figure must be bounded. It is
    // APPROXIMATE (asynchronous flushing), which is why the exact count lives
    // in the unit suite.
    expect(baseline.scansPerBuild.approxTotal).toBeGreaterThan(5);
    expect(baseline.scansPerBuild.byTableForBlock.Party ?? 0).toBeGreaterThan(0);
    expect(baseline.scansPerBuild.approxTotal).toBeLessThan(200);
  }, 900_000);

  it("does not get proportionally slower when the customer count doubles", async () => {
    const scope = scopeFor();
    const run = async () => {
      const t0 = performance.now();
      await buildExecutiveSummary({ scope, range: "today", nowMs: Date.now() });
      return performance.now() - t0;
    };
    const sample = async (n: number) => {
      const xs: number[] = [];
      for (let i = 0; i < n; i += 1) xs.push(await run());
      return quantile(xs, 0.5);
    };

    const smallRows = await prisma.party.count({ where: { organizationId } });
    await run(); // warm
    const smallP50 = await sample(SAMPLES);

    const bigRows = await seedCustomers(smallRows * 2);
    await run(); // warm
    const bigP50 = await sample(SAMPLES);

    const scaling = {
      measuredAt: new Date().toISOString(),
      note: "Timing at two data volumes on the measuring machine. NOT a production response time.",
      smallRows,
      bigRows,
      samples: SAMPLES,
      smallP50: Number(smallP50.toFixed(2)),
      bigP50: Number(bigP50.toFixed(2)),
      ratio: Number((bigP50 / smallP50).toFixed(2)),
    };
    // Written to a FILE as well as the console: vitest's reporter does not
    // forward console output when stdout is not a terminal, and evidence that
    // only exists on a terminal is not evidence.
    console.log("EXECUTIVE_SCALING " + JSON.stringify(scaling));
    if (SCALING_REPORT) {
      mkdirSync(dirname(SCALING_REPORT), { recursive: true });
      writeFileSync(SCALING_REPORT, JSON.stringify(scaling, null, 2) + "\n");
    }

    expect(bigRows).toBeGreaterThanOrEqual(smallRows * 2);
    // Doubling the rows must not double the time. A per-row query would make
    // the ratio about 2; bounded aggregate counts keep it near 1. The ceiling
    // is deliberately loose because this machine is shared.
    expect(bigP50 / smallP50).toBeLessThan(1.6);
  }, 900_000);
});
