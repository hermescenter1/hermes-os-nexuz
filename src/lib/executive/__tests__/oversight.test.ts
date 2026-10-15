/**
 * Financial activity and approval oversight — behaviour.
 *
 * The fake database below records every query it receives. That is the point
 * of it: tenant scoping is asserted on the QUERY that reached the database,
 * not inferred from a plausible-looking result. A module that filtered the
 * output instead of the query would pass a result-only test and still read
 * another organization's rows.
 */
import { describe, expect, it } from "vitest";
import {
  buildFinancialOversight,
  OVERSIGHT_REASON,
  PENDING_SAMPLE_LIMIT,
  RECORDER_LIMIT,
  __test,
  type OversightDb,
} from "../oversight";
import type { ExecutiveScope } from "../contract";

const ORG = "org-a";
const NOW = Date.UTC(2026, 9, 12, 9, 0, 0); // 12:30 in Tehran

function scope(overrides: Partial<ExecutiveScope> = {}): ExecutiveScope {
  return {
    userId: "u-reader",
    organizationId: ORG,
    memberId: "m-reader",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: false, customers: false },
    allowedSiteIds: [],
    timeZone: "Asia/Tehran",
    dayCutoffMinutes: 0,
    correlationId: "corr-1",
    ...overrides,
  };
}

type Call = { delegate: string; method: string; args: Record<string, unknown> };

interface FakeData {
  currencyCurrent?: unknown[];
  currencyBaseline?: unknown[];
  categories?: unknown[];
  recorders?: unknown[];
  unattributedEntries?: number;
  recorderAmounts?: unknown[];
  projectsWithBudget?: number;
  projects?: unknown[];
  pendingTotal?: number;
  pending?: unknown[];
  decidedByStatus?: unknown[];
  topDeciders?: unknown[];
  unattributedDecisions?: number;
  deciderOutcomes?: unknown[];
  users?: unknown[];
  /** Delegate names whose every call throws. */
  failing?: string[];
}

function fake(data: FakeData = {}) {
  const calls: Call[] = [];

  function guard(delegate: string) {
    if (data.failing?.includes(delegate)) throw new Error("driver exploded: password=hunter2");
  }

  // The CURRENT window is the one that ends at `now`; the baseline ends where
  // the current one starts. Identifying it by its end rather than its start
  // holds for every range length.
  const isBaseline = (args: Record<string, unknown>) => {
    const where = args.where as { date?: { lt: Date } } | undefined;
    return where?.date !== undefined && where.date.lt.getTime() !== NOW;
  };

  const client: OversightDb = {
    erpProjectCost: {
      async groupBy(raw) {
        const args = raw as Record<string, unknown>;
        calls.push({ delegate: "erpProjectCost", method: "groupBy", args });
        guard("erpProjectCost");
        const by = (args.by as string[]).join(",");
        if (by === "currency") return isBaseline(args) ? (data.currencyBaseline ?? []) : (data.currencyCurrent ?? []);
        if (by === "currency,category") return data.categories ?? [];
        if (by === "createdBy") return data.recorders ?? [];
        if (by === "createdBy,currency") return data.recorderAmounts ?? [];
        throw new Error(`unexpected group-by ${by}`);
      },
      async count(raw) {
        const args = raw as Record<string, unknown>;
        calls.push({ delegate: "erpProjectCost", method: "count", args });
        guard("erpProjectCost");
        return data.unattributedEntries ?? 0;
      },
    },
    erpProject: {
      async count(raw) {
        calls.push({ delegate: "erpProject", method: "count", args: raw as Record<string, unknown> });
        guard("erpProject");
        return data.projectsWithBudget ?? 0;
      },
      async findMany(raw) {
        calls.push({ delegate: "erpProject", method: "findMany", args: raw as Record<string, unknown> });
        guard("erpProject");
        return data.projects ?? [];
      },
    },
    erpApprovalRequest: {
      async count(raw) {
        const args = raw as Record<string, unknown>;
        calls.push({ delegate: "erpApprovalRequest", method: "count", args });
        guard("erpApprovalRequest");
        const where = args.where as Record<string, unknown>;
        if (where.status === "PENDING") return data.pendingTotal ?? 0;
        return data.unattributedDecisions ?? 0;
      },
      async findMany(raw) {
        calls.push({ delegate: "erpApprovalRequest", method: "findMany", args: raw as Record<string, unknown> });
        guard("erpApprovalRequest");
        return data.pending ?? [];
      },
      async groupBy(raw) {
        const args = raw as Record<string, unknown>;
        calls.push({ delegate: "erpApprovalRequest", method: "groupBy", args });
        guard("erpApprovalRequest");
        const by = (args.by as string[]).join(",");
        if (by === "status") return data.decidedByStatus ?? [];
        if (by === "decidedBy") return data.topDeciders ?? [];
        if (by === "decidedBy,status") return data.deciderOutcomes ?? [];
        throw new Error(`unexpected group-by ${by}`);
      },
    },
    user: {
      async findMany(raw) {
        calls.push({ delegate: "user", method: "findMany", args: raw as Record<string, unknown> });
        guard("user");
        return data.users ?? [];
      },
    },
  };

  return { client, calls };
}

function sumRow(fields: Record<string, unknown>, amount: number, count: number) {
  return { ...fields, _sum: { amount }, _count: { _all: count } };
}

describe("tenant scoping is applied to the query, not the result", () => {
  it("every query against a tenant-owned table carries the server-resolved organizationId", async () => {
    const { client, calls } = fake({
      currencyCurrent: [sumRow({ currency: "USD" }, 100, 1)],
      recorders: [{ createdBy: "u1", _count: { createdBy: 1 } }],
      topDeciders: [{ decidedBy: "u2", _count: { decidedBy: 1 } }],
      pendingTotal: 1,
      pending: [{ createdAt: new Date(NOW - 3_600_000), steps: [] }],
    });
    await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });

    const tenantCalls = calls.filter(c => c.delegate !== "user");
    expect(tenantCalls.length).toBeGreaterThan(8);
    for (const call of tenantCalls) {
      const where = call.args.where as Record<string, unknown>;
      expect(where.organizationId, `${call.delegate}.${call.method}`).toBe(ORG);
    }
  });

  it("every list and group-by that can grow is bounded", async () => {
    const { client, calls } = fake({
      recorders: [{ createdBy: "u1", _count: { createdBy: 1 } }],
      topDeciders: [{ decidedBy: "u2", _count: { decidedBy: 1 } }],
    });
    await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });

    const growable = calls.filter(
      c =>
        c.method === "findMany" ||
        (c.method === "groupBy" && (c.args.by as string[]).join(",") !== "status"),
    );
    expect(growable.length).toBeGreaterThan(5);
    for (const call of growable) {
      expect(typeof call.args.take, `${call.delegate}.${call.method} ${JSON.stringify(call.args.by)}`).toBe("number");
    }
  });
});

describe("axes are checked before the database is touched", () => {
  it("without the financial axis no cost or project query is issued and the section is FORBIDDEN", async () => {
    const { client, calls } = fake({ pendingTotal: 1, pending: [] });
    const result = await buildFinancialOversight({
      scope: scope({ authority: { operations: true, financial: false, industrial: false, customers: false } }),
      range: "today",
      nowMs: NOW,
      client,
    });
    expect(calls.some(c => c.delegate === "erpProjectCost" || c.delegate === "erpProject")).toBe(false);
    expect(result.sections.costActivity).toEqual({
      status: "FORBIDDEN",
      data: null,
      reasonKey: OVERSIGHT_REASON.forbiddenFinancial,
    });
  });

  it("without the operations axis no approval query is issued and the section is FORBIDDEN", async () => {
    const { client, calls } = fake({ currencyCurrent: [sumRow({ currency: "USD" }, 10, 1)] });
    const result = await buildFinancialOversight({
      scope: scope({ authority: { operations: false, financial: true, industrial: false, customers: false } }),
      range: "today",
      nowMs: NOW,
      client,
    });
    expect(calls.some(c => c.delegate === "erpApprovalRequest")).toBe(false);
    expect(result.sections.approvals.status).toBe("FORBIDDEN");
    expect(result.sections.approvals.reasonKey).toBe(OVERSIGHT_REASON.forbiddenOperations);
  });
});

describe("money is never summed across currencies", () => {
  it("two currencies stay two totals, each with its own baseline comparison", async () => {
    const { client } = fake({
      currencyCurrent: [sumRow({ currency: "IRR" }, 5_000_000, 3), sumRow({ currency: "USD" }, 120, 2)],
      currencyBaseline: [sumRow({ currency: "USD" }, 100, 1)],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "last7Days", nowMs: NOW, client });
    const data = result.sections.costActivity.data!;

    expect(data.byCurrency.map(c => c.currency)).toEqual(["IRR", "USD"]);
    expect(data.exchangeRateAvailable).toBe(false);
    expect(data.ledgerAvailable).toBe(false);
    // No combined figure exists anywhere in the shape.
    expect(Object.keys(data)).not.toContain("total");
    expect(Object.keys(data)).not.toContain("totalAmount");

    const usd = data.byCurrency.find(c => c.currency === "USD")!;
    expect(usd.amount).toBe(120);
    expect(usd.baselineAmount).toBe(100);
    expect(usd.delta).toMatchObject({ kind: "CHANGE", absolute: 20, percent: 20 });

    // A currency absent from the baseline had zero recorded cost there: the
    // source answered "nothing", which is 0, not unknown.
    const irr = data.byCurrency.find(c => c.currency === "IRR")!;
    expect(irr.baselineAmount).toBe(0);
    expect(irr.delta).toEqual({ kind: "FROM_ZERO", absolute: 5_000_000 });
  });

  it("orders categories by currency first, so amounts in different currencies are never ranked against each other", async () => {
    const { client, calls } = fake({ currencyCurrent: [sumRow({ currency: "USD" }, 1, 1)] });
    await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const categoryCall = calls.find(c => (c.args.by as string[] | undefined)?.join(",") === "currency,category")!;
    expect(categoryCall.args.orderBy).toEqual([{ currency: "asc" }, { _sum: { amount: "desc" } }]);
  });
});

describe("who recorded the cost", () => {
  it("counts unattributed entries exactly and never assigns them to anyone", async () => {
    const { client, calls } = fake({
      currencyCurrent: [sumRow({ currency: "USD" }, 300, 4)],
      recorders: [
        { createdBy: "u-acc", _count: { createdBy: 3 } },
        { createdBy: "u-pm", _count: { createdBy: 1 } },
      ],
      unattributedEntries: 2,
      recorderAmounts: [
        sumRow({ createdBy: "u-acc", currency: "USD" }, 250, 3),
        sumRow({ createdBy: "u-acc", currency: "EUR" }, 40, 1),
        sumRow({ createdBy: "u-pm", currency: "USD" }, 50, 1),
      ],
      users: [{ id: "u-acc", name: "Accountant One" }],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const data = result.sections.costActivity.data!;

    expect(data.unattributedEntries).toBe(2);
    expect(data.recorders.map(r => r.userId)).toEqual(["u-acc", "u-pm"]);
    expect(data.recorders[0]).toMatchObject({
      displayName: "Accountant One",
      entries: 3,
      amounts: [
        { currency: "EUR", amount: 40 },
        { currency: "USD", amount: 250 },
      ],
    });
    // An id with no user row is shown as unresolved, not guessed.
    expect(data.recorders[1].displayName).toBeNull();

    // The ranking query excludes NULL, so NULL can never occupy a recorder slot.
    const ranking = calls.find(c => (c.args.by as string[] | undefined)?.join(",") === "createdBy")!;
    expect((ranking.args.where as Record<string, unknown>).createdBy).toEqual({ not: null });
  });

  it("detects truncation by reading one row beyond the limit", async () => {
    const recorders = Array.from({ length: RECORDER_LIMIT + 1 }, (_, i) => ({
      createdBy: `u${i}`,
      _count: { createdBy: 20 - i },
    }));
    const { client } = fake({ recorders });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const data = result.sections.costActivity.data!;
    expect(data.recorders).toHaveLength(RECORDER_LIMIT);
    expect(data.recordersTruncated).toBe(true);
  });

  it("looks names up ONCE for both sections, and reads the name only — never the email", async () => {
    const { client, calls } = fake({
      recorders: [{ createdBy: "u-acc", _count: { createdBy: 1 } }],
      topDeciders: [{ decidedBy: "u-mgr", _count: { decidedBy: 1 } }],
    });
    await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const lookups = calls.filter(c => c.delegate === "user");
    expect(lookups).toHaveLength(1);
    expect(lookups[0].args.select).toEqual({ id: true, name: true });
    const ids = (lookups[0].args.where as { id: { in: string[] } }).id.in;
    expect(ids.sort()).toEqual(["u-acc", "u-mgr"]);
  });

  it("a failed name lookup degrades to unresolved names, not to a failed section", async () => {
    const { client } = fake({
      currencyCurrent: [sumRow({ currency: "USD" }, 5, 1)],
      recorders: [{ createdBy: "u-acc", _count: { createdBy: 1 } }],
      failing: ["user"],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    expect(result.sections.costActivity.status).toBe("OPERATIONAL");
    expect(result.sections.costActivity.data!.recorders[0].displayName).toBeNull();
  });
});

describe("projects over budget", () => {
  it("lists only projects whose recorded cost exceeds the budget, largest overrun first, and skips unreadable rows", async () => {
    const { client } = fake({
      projectsWithBudget: 5,
      projects: [
        { id: "p1", name: "On budget", budget: 100, actualCost: 100 },
        { id: "p2", name: "Small overrun", budget: 100, actualCost: 110 },
        { id: "p3", name: "Large overrun", budget: 100, actualCost: 400 },
        { id: "p4", name: "Unreadable", budget: 100, actualCost: Number.NaN },
        { id: "p5", name: "Under", budget: 100, actualCost: 20 },
      ],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const data = result.sections.costActivity.data!;
    expect(data.overBudget.map(p => p.projectId)).toEqual(["p3", "p2"]);
    expect(data.overBudget[0].overrun).toBe(300);
    expect(data.overBudgetCount).toBe(2);
    expect(data.projectsTruncated).toBe(false);
  });

  it("says when more projects carry a budget than were read", async () => {
    const { client } = fake({
      projectsWithBudget: 900,
      projects: [{ id: "p1", name: "A", budget: 1, actualCost: 2 }],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    expect(result.sections.costActivity.data!.projectsTruncated).toBe(true);
  });
});

describe("approvals awaiting a decision", () => {
  it("groups by the role of the step that is blocking each request, with ages, and keeps 'no pending step' as its own bucket", async () => {
    const hours = (h: number) => new Date(NOW - h * 3_600_000);
    const { client } = fake({
      pendingTotal: 5,
      pending: [
        { createdAt: hours(200), steps: [{ approverRole: "FINANCE_MANAGER" }] },
        { createdAt: hours(30), steps: [{ approverRole: "FINANCE_MANAGER" }] },
        { createdAt: hours(2), steps: [{ approverRole: "FINANCE_MANAGER" }] },
        { createdAt: hours(100), steps: [{ approverRole: "PROJECT_MANAGER" }] },
        { createdAt: hours(5), steps: [] },
      ],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const data = result.sections.approvals.data!;

    expect(data.pendingTotal).toBe(5);
    expect(data.pendingByRole[0]).toEqual({
      approverRole: "FINANCE_MANAGER",
      total: 3,
      age: { underOneDay: 1, oneToThreeDays: 1, threeToSevenDays: 0, overSevenDays: 1 },
    });
    expect(data.pendingByRole.find(r => r.approverRole === "PROJECT_MANAGER")!.age.threeToSevenDays).toBe(1);
    expect(data.pendingByRole.find(r => r.approverRole === null)!.total).toBe(1);
    expect(data.oldestPendingIso).toBe(hours(200).toISOString());
    expect(data.pendingTruncated).toBe(false);
  });

  it("reads the OLDEST pending first and says when the breakdown is only a sample", async () => {
    const { client, calls } = fake({
      pendingTotal: PENDING_SAMPLE_LIMIT + 50,
      pending: [{ createdAt: new Date(NOW - 1000), steps: [] }],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const list = calls.find(c => c.delegate === "erpApprovalRequest" && c.method === "findMany")!;
    expect(list.args.orderBy).toEqual({ createdAt: "asc" });
    expect(list.args.take).toBe(PENDING_SAMPLE_LIMIT);
    expect(result.sections.approvals.data!.pendingTotal).toBe(PENDING_SAMPLE_LIMIT + 50);
    expect(result.sections.approvals.data!.pendingTruncated).toBe(true);
  });

  it("ranks deciders by volume as the database returned them and splits each by outcome", async () => {
    const { client } = fake({
      decidedByStatus: [
        { status: "APPROVED", _count: { _all: 4 } },
        { status: "REJECTED", _count: { _all: 1 } },
        { status: "CANCELLED", _count: { _all: 2 } },
      ],
      topDeciders: [
        { decidedBy: "u-busy", _count: { decidedBy: 4 } },
        { decidedBy: "u-quiet", _count: { decidedBy: 1 } },
      ],
      unattributedDecisions: 2,
      deciderOutcomes: [
        { decidedBy: "u-busy", status: "APPROVED", _count: { _all: 3 } },
        { decidedBy: "u-busy", status: "REJECTED", _count: { _all: 1 } },
        { decidedBy: "u-quiet", status: "APPROVED", _count: { _all: 1 } },
      ],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    const data = result.sections.approvals.data!;
    expect(data).toMatchObject({ decidedApproved: 4, decidedRejected: 1, decidedCancelled: 2, unattributedDecisions: 2 });
    expect(data.deciders).toEqual([
      { userId: "u-busy", displayName: null, approved: 3, rejected: 1 },
      { userId: "u-quiet", displayName: null, approved: 1, rejected: 0 },
    ]);
  });

  it("age buckets have exact boundaries", () => {
    const { ageBucket, DAY_MS } = __test;
    expect(ageBucket(0)).toBe("underOneDay");
    expect(ageBucket(DAY_MS - 1)).toBe("underOneDay");
    expect(ageBucket(DAY_MS)).toBe("oneToThreeDays");
    expect(ageBucket(3 * DAY_MS)).toBe("threeToSevenDays");
    expect(ageBucket(7 * DAY_MS)).toBe("overSevenDays");
  });
});

describe("absence and failure are stated, never rendered as health", () => {
  it("an organization with no rows at all reads EMPTY with a reason, in both sections", async () => {
    const { client } = fake();
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    expect(result.sections.costActivity).toEqual({ status: "EMPTY", data: null, reasonKey: OVERSIGHT_REASON.noRows });
    expect(result.sections.approvals).toEqual({ status: "EMPTY", data: null, reasonKey: OVERSIGHT_REASON.noRows });
  });

  it("with no database client, held axes are UNAVAILABLE and refused axes stay FORBIDDEN", async () => {
    const result = await buildFinancialOversight({
      scope: scope({ authority: { operations: false, financial: true, industrial: false, customers: false } }),
      range: "today",
      nowMs: NOW,
      client: null,
    });
    expect(result.sections.costActivity.status).toBe("UNAVAILABLE");
    expect(result.sections.approvals.status).toBe("FORBIDDEN");
  });

  it("one failing source marks only its own section UNAVAILABLE, and the driver message never escapes", async () => {
    const { client } = fake({
      pendingTotal: 2,
      pending: [{ createdAt: new Date(NOW - 1000), steps: [] }],
      failing: ["erpProjectCost"],
    });
    const result = await buildFinancialOversight({ scope: scope(), range: "today", nowMs: NOW, client });
    expect(result.sections.costActivity).toEqual({
      status: "UNAVAILABLE",
      data: null,
      reasonKey: OVERSIGHT_REASON.sourceUnavailable,
    });
    expect(result.sections.approvals.status).toBe("OPERATIONAL");
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});
