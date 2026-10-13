/**
 * Tomorrow's priorities — behaviour.
 *
 * Two layers are tested separately on purpose. `classify` and `compareItems`
 * are pure, so every rule is pinned against exact timestamps. The assembly is
 * tested through a fake database that records each query, so axis refusals and
 * site scoping are asserted on what reached the database — not inferred from a
 * plausible list.
 */
import { describe, expect, it } from "vitest";
import {
  buildTomorrowsPriorities,
  CANDIDATE_LIMIT,
  classify,
  compareItems,
  DEFAULT_PRIORITY_CONFIG,
  PRIORITY_REASON,
  PRIORITY_RULES,
  validatePriorityConfig,
  __test,
  type Candidate,
  type PrioritiesDb,
  type PriorityConfig,
} from "../priorities";
import { nextBusinessDay, businessDayOf, previousBusinessDay } from "../period";
import type { ExecutiveScope } from "../contract";

const { HOUR_MS, DAY_MS } = __test;
const NOW = Date.UTC(2026, 9, 12, 9, 0, 0); // 12:30 Tehran, Monday 2026-10-12
// End of tomorrow in Tehran: 2026-10-13 24:00 local = 2026-10-13T20:30Z.
const HORIZON = Date.UTC(2026, 9, 13, 20, 30, 0);
const ctx = { nowMs: NOW, horizonEndMs: HORIZON, config: DEFAULT_PRIORITY_CONFIG };

function work(over: Partial<Extract<Candidate, { kind: "TASK" | "WORK_ORDER" }>> = {}): Candidate {
  return { kind: "TASK", id: "t1", title: "Task", priority: "MEDIUM", dueMs: NOW + HOUR_MS, createdMs: NOW - DAY_MS, ...over };
}

describe("the ordered rules", () => {
  it("files overdue work by its priority", () => {
    expect(classify(work({ priority: "CRITICAL", dueMs: NOW - 1 }), ctx)!.reason.ruleId).toBe("CRITICAL_WORK_OVERDUE");
    expect(classify(work({ priority: "HIGH", dueMs: NOW - 1 }), ctx)!.reason.ruleId).toBe("HIGH_WORK_OVERDUE");
    expect(classify(work({ priority: "MEDIUM", dueMs: NOW - 1 }), ctx)!.reason.ruleId).toBe("WORK_OVERDUE");
    expect(classify(work({ priority: "LOW", dueMs: NOW - 1 }), ctx)!.reason.ruleId).toBe("WORK_OVERDUE");
  });

  it("files work due before the end of tomorrow by urgency, and ignores work due later", () => {
    expect(classify(work({ priority: "HIGH", dueMs: HORIZON - 1 }), ctx)!.reason.ruleId).toBe("URGENT_WORK_DUE_SOON");
    expect(classify(work({ priority: "CRITICAL", dueMs: NOW + HOUR_MS }), ctx)!.reason.ruleId).toBe("URGENT_WORK_DUE_SOON");
    expect(classify(work({ priority: "LOW", dueMs: NOW + HOUR_MS }), ctx)!.reason.ruleId).toBe("WORK_DUE_SOON");
    // The horizon is EXCLUSIVE: due exactly at the end of tomorrow is not "before" it.
    expect(classify(work({ priority: "CRITICAL", dueMs: HORIZON }), ctx)).toBeNull();
  });

  it("reports how far past due, in whole days and remaining hours", () => {
    const item = classify(work({ priority: "HIGH", dueMs: NOW - (2 * DAY_MS + 5 * HOUR_MS + 59_000) }), ctx)!;
    expect(item.reason).toMatchObject({ days: 2, hours: 5, dueAtIso: null });
  });

  it("carries the due time for 'due soon' items", () => {
    const due = NOW + 3 * HOUR_MS;
    expect(classify(work({ dueMs: due }), ctx)!.reason.dueAtIso).toBe(new Date(due).toISOString());
  });

  it("files approvals by how long they have waited, at the configured thresholds", () => {
    const approval = (waited: number): Candidate => ({ kind: "APPROVAL", id: "a", title: "A", createdMs: NOW - waited });
    expect(classify(approval(3 * DAY_MS - 1), ctx)).toBeNull();
    expect(classify(approval(3 * DAY_MS), ctx)!.reason.ruleId).toBe("APPROVAL_LATE");
    expect(classify(approval(7 * DAY_MS - 1), ctx)!.reason.ruleId).toBe("APPROVAL_LATE");
    expect(classify(approval(7 * DAY_MS), ctx)!.reason.ruleId).toBe("APPROVAL_CRITICALLY_LATE");
  });

  it("files open alerts once they have been open longer than the grace period", () => {
    const alert = (severity: "CRITICAL" | "HIGH", age: number): Candidate => ({
      kind: "ALERT",
      id: "x",
      title: "X",
      severity,
      createdMs: NOW - age,
    });
    expect(classify(alert("CRITICAL", 4 * HOUR_MS - 1), ctx)).toBeNull();
    expect(classify(alert("CRITICAL", 4 * HOUR_MS), ctx)!.reason.ruleId).toBe("CRITICAL_ALERT_OPEN");
    expect(classify(alert("HIGH", 5 * HOUR_MS), ctx)!.reason.ruleId).toBe("HIGH_ALERT_OPEN");
  });

  it("honours a changed configuration instead of the defaults", () => {
    const config: PriorityConfig = { ...DEFAULT_PRIORITY_CONFIG, approvalStaleDays: 1, approvalCriticalDays: 2 };
    const item = classify({ kind: "APPROVAL", id: "a", title: "A", createdMs: NOW - 2 * DAY_MS }, { ...ctx, config });
    expect(item!.reason.ruleId).toBe("APPROVAL_CRITICALLY_LATE");
  });

  it("every rule id has exactly one tier, and the documented list is the classifier's whole vocabulary", () => {
    const ids = PRIORITY_RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PRIORITY_RULES.filter(r => r.tier === 1).map(r => r.id)).toEqual([
      "CRITICAL_WORK_OVERDUE",
      "CRITICAL_ALERT_OPEN",
      "APPROVAL_CRITICALLY_LATE",
    ]);
  });
});

describe("ordering is total and stable", () => {
  it("tier first, then longest under pressure, then id", () => {
    const items = [
      classify(work({ id: "b", priority: "LOW", dueMs: NOW - 10 * DAY_MS }), ctx)!, // tier 3, very overdue
      classify(work({ id: "z", priority: "CRITICAL", dueMs: NOW - HOUR_MS }), ctx)!, // tier 1
      classify(work({ id: "a", priority: "CRITICAL", dueMs: NOW - HOUR_MS }), ctx)!, // tier 1, same instant
      classify(work({ id: "c", priority: "CRITICAL", dueMs: NOW - DAY_MS }), ctx)!, // tier 1, older
    ].sort(compareItems);
    expect(items.map(i => i.id)).toEqual(["c", "a", "z", "b"]);
  });
});

describe("configuration is validated, never silently clamped", () => {
  it("accepts the defaults", () => {
    expect(validatePriorityConfig(DEFAULT_PRIORITY_CONFIG)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const problems = validatePriorityConfig({
      approvalStaleDays: 0,
      approvalCriticalDays: 2.5,
      alertAgeHours: 500,
      maxItems: 25,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        { field: "approvalStaleDays", problem: "OUT_OF_RANGE" },
        { field: "approvalCriticalDays", problem: "NOT_AN_INTEGER" },
        { field: "alertAgeHours", problem: "OUT_OF_RANGE" },
      ]),
    );
  });

  it("refuses a 'critically late' threshold that does not come after 'late'", () => {
    expect(
      validatePriorityConfig({ ...DEFAULT_PRIORITY_CONFIG, approvalStaleDays: 5, approvalCriticalDays: 5 }),
    ).toEqual([{ field: "approvalCriticalDays", problem: "NOT_AFTER_STALE" }]);
  });
});

describe("the horizon is the end of the next CALENDAR day in the zone", () => {
  it("is 24 hours past today's end on an ordinary day", () => {
    const today = businessDayOf({ nowMs: NOW, timeZone: "Asia/Tehran", cutoffMinutes: 0 });
    expect(nextBusinessDay(today).endMs).toBe(HORIZON);
  });

  it("is 23 hours away across a spring-forward day, not a fixed 24", () => {
    // Europe/Berlin springs forward on 2026-03-29.
    const sat = businessDayOf({ nowMs: Date.UTC(2026, 2, 28, 12), timeZone: "Europe/Berlin", cutoffMinutes: 0 });
    const sun = nextBusinessDay(sat);
    expect(sun.dateKey).toBe("2026-03-29");
    expect((sun.endMs - sun.startMs) / HOUR_MS).toBe(23);
  });

  it("is the exact inverse of previousBusinessDay, including at a 06:00 cutoff", () => {
    const today = businessDayOf({ nowMs: NOW, timeZone: "Asia/Tehran", cutoffMinutes: 360 });
    expect(previousBusinessDay(nextBusinessDay(today))).toEqual(today);
    expect(nextBusinessDay(today).cutoffMinutes).toBe(360);
  });
});

/* ── Assembly ──────────────────────────────────────────────────────────────── */

const ORG = "org-a";

function scope(over: Partial<ExecutiveScope> = {}): ExecutiveScope {
  return {
    userId: "u",
    organizationId: ORG,
    memberId: "m",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true },
    allowedSiteIds: ["site-1"],
    timeZone: "Asia/Tehran",
    dayCutoffMinutes: 0,
    correlationId: "c",
    ...over,
  };
}

type Call = { delegate: keyof PrioritiesDb; args: Record<string, unknown> };

function fake(rows: Partial<Record<keyof PrioritiesDb, unknown[]>> = {}, failing: (keyof PrioritiesDb)[] = []) {
  const calls: Call[] = [];
  const delegate = (name: keyof PrioritiesDb) => ({
    async findMany(args: unknown) {
      calls.push({ delegate: name, args: args as Record<string, unknown> });
      if (failing.includes(name)) throw new Error("driver exploded: secret=hunter2");
      return rows[name] ?? [];
    },
  });
  const client: PrioritiesDb = {
    erpTask: delegate("erpTask"),
    erpWorkOrder: delegate("erpWorkOrder"),
    erpApprovalRequest: delegate("erpApprovalRequest"),
    assetAlert: delegate("assetAlert"),
  };
  return { client, calls };
}

describe("assembly", () => {
  it("scopes every query to the organization, and bounds every read", async () => {
    const { client, calls } = fake();
    await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect((call.args.where as Record<string, unknown>).organizationId, call.delegate).toBe(ORG);
      expect(call.args.take, call.delegate).toBe(CANDIDATE_LIMIT);
    }
  });

  it("narrows alerts to the reader's sites in the query itself", async () => {
    const { client, calls } = fake();
    await buildTomorrowsPriorities({ scope: scope({ allowedSiteIds: ["s1", "s2"] }), nowMs: NOW, client });
    const where = calls.find(c => c.delegate === "assetAlert")!.args.where as Record<string, unknown>;
    expect(where.asset).toEqual({ organizationId: ORG, siteId: { in: ["s1", "s2"] } });
  });

  it("reads only work due before the horizon, and only approvals already late", async () => {
    const { client, calls } = fake();
    await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    const task = calls.find(c => c.delegate === "erpTask")!.args.where as { dueDate: { lt: Date }; status: unknown };
    expect(task.dueDate.lt.getTime()).toBe(HORIZON);
    expect(task.status).toEqual({ notIn: ["DONE", "CANCELLED"] });
    const wo = calls.find(c => c.delegate === "erpWorkOrder")!.args.where as { status: unknown };
    expect(wo.status).toEqual({ notIn: ["COMPLETED", "CANCELLED"] });
    const ap = calls.find(c => c.delegate === "erpApprovalRequest")!.args.where as { createdAt: { lte: Date } };
    expect(ap.createdAt.lte.getTime()).toBe(NOW - 3 * DAY_MS);
  });

  it("without the operations axis, issues no work or approval query and says the sources were excluded", async () => {
    const { client, calls } = fake({
      assetAlert: [{ id: "x", title: "Overheat", severity: "CRITICAL", createdAt: new Date(NOW - 6 * HOUR_MS) }],
    });
    const result = await buildTomorrowsPriorities({
      scope: scope({ authority: { operations: false, financial: false, industrial: true } }),
      nowMs: NOW,
      client,
    });
    expect(calls.map(c => c.delegate)).toEqual(["assetAlert"]);
    const data = result.priorities.data!;
    expect(data.items.map(i => i.reason.ruleId)).toEqual(["CRITICAL_ALERT_OPEN"]);
    expect(data.sources.filter(s => s.excludedReasonKey === PRIORITY_REASON.forbiddenOperations).map(s => s.source)).toEqual([
      "tasks",
      "workOrders",
      "approvals",
    ]);
  });

  it("with the industrial axis but no site, reads no alerts and says why", async () => {
    const { client, calls } = fake();
    const result = await buildTomorrowsPriorities({ scope: scope({ allowedSiteIds: [] }), nowMs: NOW, client });
    expect(calls.some(c => c.delegate === "assetAlert")).toBe(false);
    const alerts = result.priorities.data!.sources.find(s => s.source === "alerts")!;
    expect(alerts.excludedReasonKey).toBe(PRIORITY_REASON.noSites);
  });

  it("with neither axis, is FORBIDDEN and touches nothing", async () => {
    const { client, calls } = fake();
    const result = await buildTomorrowsPriorities({
      scope: scope({ authority: { operations: false, financial: true, industrial: false } }),
      nowMs: NOW,
      client,
    });
    expect(calls).toHaveLength(0);
    expect(result.priorities.status).toBe("FORBIDDEN");
  });

  it("ranks across sources, counts every tier, and cuts the list at maxItems with a flag", async () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      priority: "LOW",
      dueDate: new Date(NOW - (i + 1) * HOUR_MS),
      createdAt: new Date(NOW - 10 * DAY_MS),
    }));
    const { client } = fake({
      erpTask: tasks,
      erpApprovalRequest: [{ id: "a1", title: "Capital", createdAt: new Date(NOW - 9 * DAY_MS) }],
    });
    const result = await buildTomorrowsPriorities({
      scope: scope(),
      nowMs: NOW,
      config: { ...DEFAULT_PRIORITY_CONFIG, maxItems: 5 },
      client,
    });
    const data = result.priorities.data!;
    expect(data.items[0]).toMatchObject({ kind: "APPROVAL", tier: 1, reason: { ruleId: "APPROVAL_CRITICALLY_LATE", days: 9 } });
    expect(data.items).toHaveLength(5);
    expect(data.totalPriorities).toBe(7);
    expect(data.listTruncated).toBe(true);
    expect(data.tierCounts).toEqual({ 1: 1, 2: 0, 3: 6 });
  });

  it("skips a row it cannot read fully instead of ranking it as LOW or due now", async () => {
    const { client } = fake({
      erpTask: [
        { id: "ok", title: "Readable", priority: "HIGH", dueDate: new Date(NOW - HOUR_MS), createdAt: new Date(NOW) },
        { id: "bad-priority", title: "?", priority: "URGENT", dueDate: new Date(NOW - HOUR_MS), createdAt: new Date(NOW) },
        { id: "no-due", title: "?", priority: "HIGH", dueDate: null, createdAt: new Date(NOW) },
      ],
    });
    const result = await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(result.priorities.data!.items.map(i => i.id)).toEqual(["ok"]);
  });

  it("flags a source that hit the read limit", async () => {
    const tasks = Array.from({ length: CANDIDATE_LIMIT }, (_, i) => ({
      id: `t${String(i).padStart(3, "0")}`,
      title: "T",
      priority: "LOW",
      dueDate: new Date(NOW - HOUR_MS),
      createdAt: new Date(NOW),
    }));
    const { client } = fake({ erpTask: tasks });
    const result = await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(result.priorities.data!.sources.find(s => s.source === "tasks")!.truncated).toBe(true);
  });

  it("an organization with nothing pressing, reading every source, is EMPTY with a reason", async () => {
    const { client } = fake();
    const result = await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(result.priorities).toEqual({ status: "EMPTY", data: null, reasonKey: PRIORITY_REASON.noRows });
  });

  it("a failing source makes the whole list UNAVAILABLE rather than a partial list posing as complete", async () => {
    const { client } = fake(
      { erpTask: [{ id: "t", title: "T", priority: "CRITICAL", dueDate: new Date(NOW - 1), createdAt: new Date(NOW) }] },
      ["erpApprovalRequest"],
    );
    const result = await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(result.priorities).toEqual({ status: "UNAVAILABLE", data: null, reasonKey: PRIORITY_REASON.sourceUnavailable });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("refuses an invalid configuration rather than ranking with thresholds nobody chose", async () => {
    const { client } = fake();
    await expect(
      buildTomorrowsPriorities({
        scope: scope(),
        nowMs: NOW,
        config: { ...DEFAULT_PRIORITY_CONFIG, approvalCriticalDays: 1 },
        client,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("states the horizon and the thresholds in force, so the screen can quote them", async () => {
    const { client } = fake();
    const result = await buildTomorrowsPriorities({ scope: scope(), nowMs: NOW, client });
    expect(result.horizonEndIso).toBe(new Date(HORIZON).toISOString());
    expect(result.config).toEqual(DEFAULT_PRIORITY_CONFIG);
  });
});
