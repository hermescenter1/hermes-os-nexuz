/**
 * Executive Management Center — nightly report generation.
 *
 * The fake database ENFORCES the unique key `(organizationId, businessDate,
 * version)` and throws a P2002 exactly as PostgreSQL would. That matters: the
 * idempotency claim in this module is "the constraint decides", so a fake that
 * merely stored rows would let a broken check-then-write pass.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "org-a";
const OTHER = "org-b";
const TZ = "Asia/Tehran";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  summary: null as unknown,
  summaryThrows: false,
  summaryCalls: [] as Array<Record<string, unknown>>,
  prismaMissing: false,
  audits: [] as Array<Record<string, unknown>>,
  seq: 0,
  /** Live rows the priority sources read. Edited AFTER a pass, on purpose. */
  live: { party: [] as Row[] },
  txIsolation: null as unknown,
  txCalls: 0,
  txThrows: false,
}));

/** A unique-key-enforcing fake of the report table. */
const reportDelegate = {
  async create(args: unknown) {
    const data = (args as { data: Row }).data;
    const clash = h.rows.some(
      r =>
        r.organizationId === data.organizationId &&
        r.businessDate === data.businessDate &&
        r.version === data.version,
    );
    if (clash) {
      const e = new Error("Unique constraint failed") as Error & { code: string };
      e.code = "P2002";
      throw e;
    }
    const row = { id: `rep-${++h.seq}`, notifiedAt: null, ...data };
    h.rows.push(row);
    return { ...row };
  },
  async findMany(args: unknown) {
    const a = (args ?? {}) as { where?: Row; orderBy?: Row; take?: number };
    let rows = h.rows.filter(r => {
      const w = a.where ?? {};
      return Object.entries(w).every(([k, v]) => r[k] === v);
    });
    rows = [...rows].sort((x, y) => Number(y.version) - Number(x.version));
    if (typeof a.take === "number") rows = rows.slice(0, a.take);
    return rows.map(r => ({ ...r }));
  },
  async findFirst(args: unknown) {
    return (await reportDelegate.findMany(args))[0] ?? null;
  },
  async updateMany(args: unknown) {
    const a = args as { where: Row; data: Row };
    const matched = h.rows.filter(r =>
      Object.entries(a.where).every(([k, v]) =>
        v === null
          ? r[k] === null
          : v instanceof Date // by value, as PostgreSQL compares a timestamp
            ? r[k] instanceof Date && (r[k] as Date).getTime() === v.getTime()
            : r[k] === v,
      ),
    );
    for (const r of matched) Object.assign(r, a.data);
    return { count: matched.length };
  },
  async count(args: unknown) {
    return (await reportDelegate.findMany(args)).length;
  },
};

/** The five priority sources. Only `party` carries rows in these tests. */
const emptyDelegate = { async findMany() { return []; } };
const partyDelegate = {
  async findMany() {
    // A COPY, as a real driver returns: a test that handed back the live
    // object could not tell a frozen snapshot from a live reference.
    return h.live.party.map(r => ({ ...r }));
  },
};

const prismaFake = {
  executiveDailyReport: reportDelegate,
  erpTask: emptyDelegate,
  erpWorkOrder: emptyDelegate,
  erpApprovalRequest: emptyDelegate,
  assetAlert: emptyDelegate,
  party: partyDelegate,
  async $transaction(fn: (c: unknown) => Promise<unknown>, opts?: unknown) {
    h.txCalls += 1;
    h.txIsolation = (opts as { isolationLevel?: unknown } | undefined)?.isolationLevel ?? null;
    if (h.txThrows) throw new Error("pool exhausted");
    return fn(prismaFake);
  },
};

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => (h.prismaMissing ? null : prismaFake),
}));

vi.mock("@/lib/executive/summary", () => ({
  buildExecutiveSummary: async (a: Record<string, unknown>) => {
    h.summaryCalls.push(a);
    if (h.summaryThrows) throw new Error("aggregation down");
    return h.summary;
  },
}));

vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async (e: Record<string, unknown>) => {
    h.audits.push(e);
  },
  SITE_AUDIT: {},
}));

import { generateDailyReport, claimNotification, releaseNotificationClaim } from "../generate";
import { CALC_VERSION } from "../contract";
import type { ExecutiveScope } from "../../contract";

/** 2026-10-11T08:00Z is 11:30 on the 11th in Tehran, so the 10th is finished. */
const NOW = Date.parse("2026-10-11T08:00:00Z");

const SUMMARY = {
  generatedAtIso: new Date(NOW).toISOString(),
  range: "today",
  period: { current: {}, baseline: {} },
  timeZone: TZ,
  authority: { operations: true, financial: true, industrial: true, customers: true },
  sections: {
    operations: { status: "OPERATIONAL", data: { metrics: [] }, reasonKey: null },
    financial: { status: "OPERATIONAL", data: { metrics: [], ledgerAvailable: false }, reasonKey: null },
    industrial: { status: "FORBIDDEN", data: null, reasonKey: "executive.reasons.noSites" },
    // Slice G3: the tenant customer source exists now, so a frozen report
    // carries it like any other section.
    customers: { status: "OPERATIONAL", data: { metrics: [], financialsAvailable: false }, reasonKey: null },
  },
  actions: { status: "OPERATIONAL", data: [], reasonKey: null },
  dataQuality: [],
};

const scope = (over: Partial<ExecutiveScope> = {}): ExecutiveScope =>
  ({
    userId: "user-1",
    organizationId: ORG,
    memberId: "m-1",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true, customers: true },
    allowedSiteIds: [],
    timeZone: TZ,
    dayCutoffMinutes: 0,
    correlationId: "corr-1",
    ...over,
  }) as ExecutiveScope;

beforeEach(() => {
  h.rows = [];
  h.summary = SUMMARY;
  h.summaryThrows = false;
  h.summaryCalls = [];
  h.prismaMissing = false;
  h.audits = [];
  h.seq = 0;
  h.live = { party: [] };
  h.txIsolation = null;
  h.txCalls = 0;
  h.txThrows = false;
});

describe("it reports the last FINISHED day, never the one in progress", () => {
  it("defaults to yesterday in the organization's zone", async () => {
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out.kind).toBe("CREATED");
    expect(out.kind === "CREATED" && out.report.businessDate).toBe("2026-10-10");
  });

  it("covers the whole day as a COMPLETE window, so the comparison is defined", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const window = h.summaryCalls[0].window as {
      current: { complete: boolean };
      baseline: { complete: boolean };
      currentStartMs: number;
      currentEndMs: number;
    };
    expect(window.current.complete).toBe(true);
    expect(window.baseline.complete).toBe(true);
    // Tehran midnight to midnight: 2026-10-09T20:30Z .. 2026-10-10T20:30Z
    expect(new Date(window.currentStartMs).toISOString()).toBe("2026-10-09T20:30:00.000Z");
    expect(new Date(window.currentEndMs).toISOString()).toBe("2026-10-10T20:30:00.000Z");
  });

  it("refuses a day that has not finished yet", async () => {
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW, businessDate: "2026-10-11" });
    expect(out).toEqual({ kind: "SKIPPED_NOT_FINISHED", businessDate: "2026-10-11" });
    expect(h.rows).toHaveLength(0);
  });

  it("stamps the data cutoff at the END OF THE WINDOW, not at generation time", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const row = h.rows[0];
    // Nothing after the day boundary is in these figures.
    expect((row.dataCutoffAt as Date).toISOString()).toBe("2026-10-10T20:30:00.000Z");
    expect((row.generatedAt as Date).toISOString()).toBe(new Date(NOW).toISOString());
    expect((row.dataCutoffAt as Date).getTime()).toBeLessThan((row.generatedAt as Date).getTime());
  });

  it("freezes the zone and cutoff that were used", async () => {
    await generateDailyReport({ scope: scope({ timeZone: "Europe/Berlin", dayCutoffMinutes: 360 }), nowMs: NOW });
    expect(h.rows[0]).toMatchObject({ timeZone: "Europe/Berlin", dayCutoffMinutes: 360 });
  });
});

describe("idempotency is decided by the unique key, not by a pre-flight check", () => {
  it("a second ordinary run reports ALREADY_REPORTED and writes nothing", async () => {
    const first = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(first.kind).toBe("CREATED");

    const second = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(second.kind).toBe("ALREADY_REPORTED");
    expect(h.rows).toHaveLength(1);
    // The repeat run must not even build the summary again.
    expect(h.summaryCalls).toHaveLength(1);
  });

  it("two concurrent runs converge on ONE report — the loser does not fail", async () => {
    // Both see no existing row, both build, both insert. The constraint decides.
    const [a, b] = await Promise.all([
      generateDailyReport({ scope: scope(), nowMs: NOW }),
      generateDailyReport({ scope: scope(), nowMs: NOW }),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["ALREADY_REPORTED", "CREATED"]);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].version).toBe(1);
  });

  it("keeps organizations apart — the same night in another tenant is a different report", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const other = await generateDailyReport({ scope: scope({ organizationId: OTHER }), nowMs: NOW });
    expect(other.kind).toBe("CREATED");
    expect(h.rows).toHaveLength(2);
    expect(h.rows.map(r => r.organizationId).sort()).toEqual([ORG, OTHER].sort());
  });
});

describe("a correction is a new version, never an edit", () => {
  it("writes version 2 naming the version it supersedes, with actor and reason", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const corrected = await generateDailyReport({
      scope: scope(),
      nowMs: NOW,
      correction: { actorUserId: "user-9", reason: "telemetry backfilled after the run" },
    });

    expect(corrected.kind).toBe("CORRECTED");
    expect(h.rows).toHaveLength(2);
    const v2 = h.rows.find(r => r.version === 2)!;
    expect(v2).toMatchObject({
      supersedesVersion: 1,
      regeneratedBy: "user-9",
      regenerationReason: "telemetry backfilled after the run",
    });
  });

  it("leaves version 1 byte-for-byte intact", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const v1Before = JSON.stringify(h.rows[0]);

    await generateDailyReport({
      scope: scope(),
      nowMs: NOW,
      correction: { actorUserId: "user-9", reason: "restated" },
    });

    const v1After = JSON.stringify(h.rows.find(r => r.version === 1));
    expect(v1After).toBe(v1Before);
  });

  it("audits the correction with the actor, the reason and the superseded version", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(h.audits).toHaveLength(0); // the routine nightly run is not audited per tenant

    await generateDailyReport({
      scope: scope(),
      nowMs: NOW,
      correction: { actorUserId: "user-9", reason: "restated" },
    });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      userId: "user-9",
      organizationId: ORG,
      action: "executive.report.regenerate",
      entityType: "ExecutiveDailyReport",
    });
    expect(h.audits[0].metadata).toMatchObject({
      businessDate: "2026-10-10",
      version: 2,
      supersedesVersion: 1,
      reason: "restated",
    });
  });
});

describe("the stored envelope is self-describing", () => {
  it("records the calculation version, so incomparable reports are visible", async () => {
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out.kind === "CREATED" && out.report.calcVersion).toBe(CALC_VERSION);
  });

  it("records which sections answered and why the others did not", async () => {
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    const coverage = out.kind === "CREATED" ? out.report.coverage : [];
    expect(coverage.map(c => c.section).sort()).toEqual(
      ["actions", "customers", "financial", "industrial", "operations"].sort(),
    );
    expect(coverage.find(c => c.section === "industrial")).toEqual({
      section: "industrial",
      status: "FORBIDDEN",
      reasonKey: "executive.reasons.noSites",
    });
    expect(coverage.find(c => c.section === "operations")?.reasonKey).toBeNull();
  });
});

describe("failure is reported, never papered over", () => {
  it("returns FAILED when the aggregation throws, and stores nothing", async () => {
    h.summaryThrows = true;
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out).toEqual({ kind: "FAILED", reasonKey: "executive.reasons.sourceUnavailable" });
    expect(h.rows).toHaveLength(0);
  });

  it("returns FAILED when there is no database, and stores nothing", async () => {
    h.prismaMissing = true;
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out.kind).toBe("FAILED");
    expect(h.rows).toHaveLength(0);
  });

  it("never leaks a driver message", async () => {
    h.summaryThrows = true;
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(JSON.stringify(out)).not.toContain("aggregation down");
  });
});

describe("a report is announced at most once", () => {
  const claim = () =>
    claimNotification({ organizationId: ORG, businessDate: "2026-10-10", version: 1, nowMs: NOW });

  it("grants the claim to exactly one caller", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    const results = await Promise.all([claim(), claim(), claim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("refuses a later claim once the row is marked", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    expect(h.rows[0].notifiedAt).not.toBeNull();
  });

  it("refuses a claim for a night that was never reported", async () => {
    expect(await claim()).toBe(false);
  });

  it("claims per version, so a correction can be announced on its own", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(await claim()).toBe(true);
    await generateDailyReport({
      scope: scope(),
      nowMs: NOW,
      correction: { actorUserId: "user-9", reason: "restated" },
    });
    const v2 = await claimNotification({
      organizationId: ORG,
      businessDate: "2026-10-10",
      version: 2,
      nowMs: NOW,
    });
    expect(v2).toBe(true);
  });
});

describe("a claim that reached nobody can be given back (slice F)", () => {
  const claim = (nowMs = NOW) =>
    claimNotification({ organizationId: ORG, businessDate: "2026-10-10", version: 1, nowMs });
  const release = (claimedAtMs: number) =>
    releaseNotificationClaim({ organizationId: ORG, businessDate: "2026-10-10", version: 1, claimedAtMs });

  it("clears the caller's own claim, so a later pass can claim again", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(await claim()).toBe(true);
    expect(await release(NOW)).toBe(true);
    expect(h.rows[0].notifiedAt).toBeNull();
    expect(await claim(NOW + 60_000)).toBe(true);
  });

  it("never clears a claim somebody else took since", async () => {
    await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(await claim(NOW + 60_000)).toBe(true); // another replica, later
    expect(await release(NOW)).toBe(false); // a stale release from the first
    expect(h.rows[0].notifiedAt).not.toBeNull();
  });

  it("releases nothing for a night that was never reported", async () => {
    expect(await release(NOW)).toBe(false);
  });
});

/* ── The frozen priority list (requirement row 8) ──────────────────────────── */

describe("the nightly pass freezes a priority list it OBSERVED", () => {
  /** One customer whose promised follow-up is already overdue. */
  const overdueCustomer = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    displayName: "Pars Steel",
    nextActionAt: new Date(NOW - 3 * 86_400_000),
    createdAt: new Date(NOW - 40 * 86_400_000),
    ...over,
  });

  it("reads every priority source inside ONE repeatable-read transaction", async () => {
    h.live.party = [overdueCustomer()];
    await generateDailyReport({ scope: scope(), nowMs: NOW });

    // Five queries that each saw a different instant would freeze a composite
    // of states that never existed together.
    expect(h.txCalls).toBe(1);
    expect(h.txIsolation).toBe("RepeatableRead");
  });

  it("stores the list with its own observation time, the target day and the rules version", async () => {
    h.live.party = [overdueCustomer()];
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out.kind).toBe("CREATED");
    const p = out.kind === "CREATED" ? out.report.priorities : null;
    expect(p).not.toBeNull();

    expect(p!.basis).toBe("OBSERVED_AT_GENERATION");
    expect(p!.rulesVersion).toBe("priority-rules-2");
    // The day AFTER the reported day, not after the pass's own clock.
    expect(p!.reportBusinessDate).toBe(out.kind === "CREATED" ? out.report.businessDate : "");
    expect(p!.targetBusinessDate > p!.reportBusinessDate).toBe(true);
    // The observation time is its own field, not a copy of the record's.
    expect(typeof p!.observedAtIso).toBe("string");
    expect(p!.list.status).toBe("OPERATIONAL");
    expect(p!.list.data!.items.map(i => i.reason.ruleId)).toEqual(["FOLLOW_UP_OVERDUE"]);
  });

  it("does NOT change a stored snapshot when the live row changes afterwards", async () => {
    h.live.party = [overdueCustomer()];
    const first = await generateDailyReport({ scope: scope(), nowMs: NOW });
    const frozenTitle =
      first.kind === "CREATED" ? first.report.priorities!.list.data!.items[0].title : "";
    expect(frozenTitle).toBe("Pars Steel");

    // The follow-up is rescheduled and the customer renamed, exactly as a
    // user would do the next morning. The stored night must not move.
    h.live.party = [overdueCustomer({ displayName: "Renamed", nextActionAt: new Date(NOW + 99 * 86_400_000) })];

    const stored = h.rows[0].prioritySnapshot as { list: { data: { items: { title: string }[] } } };
    expect(stored.list.data.items[0].title).toBe("Pars Steel");
    expect(stored.list.data.items).toHaveLength(1);
  });

  it("records no list, rather than an empty one, when the sources cannot be read", async () => {
    // A report without priority sources is still a report. `null` must be
    // read as "not recorded", never as "nothing was due".
    h.live.party = [overdueCustomer()];
    h.txThrows = true;
    const out = await generateDailyReport({ scope: scope(), nowMs: NOW });
    expect(out.kind).toBe("CREATED");
    expect(out.kind === "CREATED" ? out.report.priorities : undefined).toBeNull();
  });

  it("gives a correction its OWN observation time and keeps the original", async () => {
    h.live.party = [overdueCustomer()];
    const first = await generateDailyReport({ scope: scope(), nowMs: NOW });
    const firstObserved = first.kind === "CREATED" ? first.report.priorities!.observedAtIso : "";

    // Days later the rows have moved on, and the night is restated.
    h.live.party = [overdueCustomer({ id: "c2", displayName: "Someone Else" })];
    const corrected = await generateDailyReport({
      scope: scope(),
      nowMs: NOW + 3 * 86_400_000,
      businessDate: first.kind === "CREATED" ? first.report.businessDate : undefined,
      correction: { actorUserId: "u-1", reason: "restated" },
    });

    expect(corrected.kind).toBe("CORRECTED");
    const second = corrected.kind === "CORRECTED" ? corrected.report.priorities! : null;
    expect(second).not.toBeNull();
    // It discloses that it looked at a LATER state, rather than inheriting
    // the original's observation time.
    expect(second!.observedAtIso).not.toBe(firstObserved);
    expect(second!.list.data!.items[0].title).toBe("Someone Else");

    // And the original is still there, untouched, as version 1.
    expect(h.rows).toHaveLength(2);
    const original = h.rows.find(r => r.version === 1)!;
    const originalList = original.prioritySnapshot as { list: { data: { items: { title: string }[] } } };
    expect(originalList.list.data.items[0].title).toBe("Pars Steel");
  });
});
