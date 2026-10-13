/**
 * Per-organization executive settings — behaviour.
 *
 * The write path is tested through a fake transaction that records every call,
 * so the version condition, the "audit inside the same transaction" rule and
 * the conflict answers are asserted on what the database was asked to do.
 */
import { describe, expect, it, vi } from "vitest";

const audit = vi.hoisted(() => ({ calls: [] as Array<{ input: Record<string, unknown>; client: unknown }>, fail: false }));
vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEventOrThrow: async (input: Record<string, unknown>, client: unknown) => {
    audit.calls.push({ input, client });
    if (audit.fail) throw new Error("audit write failed");
  },
}));

import {
  loadExecutiveSettings,
  loadExecutiveSettingsMany,
  parseSettingsPayload,
  resolveFromRow,
  saveExecutiveSettings,
  validateExecutiveSettings,
  type ExecutiveSettingsValues,
  type SettingsDb,
} from "../settings";
import { DEFAULT_PRIORITY_CONFIG } from "../priorities";

const VALID: ExecutiveSettingsValues = {
  timeZone: "Europe/Berlin",
  dayCutoffMinutes: 360,
  priority: { approvalStaleDays: 2, approvalCriticalDays: 5, alertAgeHours: 1, maxItems: 30 },
};

const row = (over: Record<string, unknown> = {}) => ({
  organizationId: "org-a",
  timeZone: "Europe/Berlin",
  dayCutoffMinutes: 360,
  approvalStaleDays: 2,
  approvalCriticalDays: 5,
  alertAgeHours: 1,
  priorityMaxItems: 30,
  version: 4,
  updatedAt: new Date("2026-10-12T10:00:00Z"),
  updatedBy: "u-owner",
  ...over,
});

const ENV: NodeJS.ProcessEnv = { NODE_ENV: "test", HERMES_EXECUTIVE_TIME_ZONE: "Asia/Tehran", HERMES_EXECUTIVE_DAY_CUTOFF_MINUTES: "0" };

describe("validation", () => {
  it("accepts a sound configuration", () => {
    expect(validateExecutiveSettings(VALID)).toEqual([]);
  });

  it("reports every problem at once, including the priority ones", () => {
    const problems = validateExecutiveSettings({
      timeZone: "Mars/Olympus_Mons",
      dayCutoffMinutes: 1440,
      priority: { ...DEFAULT_PRIORITY_CONFIG, approvalStaleDays: 5, approvalCriticalDays: 5 },
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        { field: "timeZone", problem: "UNKNOWN_TIME_ZONE" },
        { field: "dayCutoffMinutes", problem: "OUT_OF_RANGE" },
        { field: "approvalCriticalDays", problem: "NOT_AFTER_STALE" },
      ]),
    );
  });

  it("treats a fractional cutoff as not an integer rather than rounding it", () => {
    expect(validateExecutiveSettings({ ...VALID, dayCutoffMinutes: 90.5 })).toEqual([
      { field: "dayCutoffMinutes", problem: "NOT_AN_INTEGER" },
    ]);
  });
});

describe("parsing an untrusted payload", () => {
  const good = {
    expectedVersion: 3,
    timeZone: " Europe/Berlin ",
    dayCutoffMinutes: 360,
    priority: { approvalStaleDays: 2, approvalCriticalDays: 5, alertAgeHours: 1, maxItems: 30 },
  };

  it("accepts the exact shape and trims the zone", () => {
    expect(parseSettingsPayload(good)).toEqual({ ok: true, values: VALID, expectedVersion: 3 });
  });

  it("refuses numbers sent as strings instead of coercing them", () => {
    const result = parseSettingsPayload({ ...good, priority: { ...good.priority, maxItems: "30" } });
    expect(result).toMatchObject({ ok: false, problems: [{ field: "maxItems", problem: "NOT_AN_INTEGER" }] });
  });

  it("refuses a missing or negative expectedVersion as malformed", () => {
    expect(parseSettingsPayload({ ...good, expectedVersion: undefined })).toEqual({ ok: false, malformed: true });
    expect(parseSettingsPayload({ ...good, expectedVersion: -1 })).toEqual({ ok: false, malformed: true });
    expect(parseSettingsPayload(null)).toEqual({ ok: false, malformed: true });
  });

  it("ignores an organizationId in the body — there is no field for it", () => {
    const result = parseSettingsPayload({ ...good, organizationId: "org-evil" });
    expect(result.ok && Object.keys(result.values)).toEqual(["timeZone", "dayCutoffMinutes", "priority"]);
  });
});

describe("resolving the values in force", () => {
  it("uses the environment and product defaults when no row exists", () => {
    const r = resolveFromRow(null, ENV);
    expect(r).toMatchObject({ source: "DEFAULT", storedRowRejected: false, version: 0 });
    expect(r.values).toEqual({ timeZone: "Asia/Tehran", dayCutoffMinutes: 0, priority: DEFAULT_PRIORITY_CONFIG });
  });

  it("uses a valid row as a whole", () => {
    const r = resolveFromRow(row(), ENV);
    expect(r).toMatchObject({ source: "ORGANIZATION", storedRowRejected: false, version: 4, updatedBy: "u-owner" });
    expect(r.values).toEqual(VALID);
  });

  it("sets aside a row the runtime can no longer use — as a WHOLE, never half-applied — and says so", () => {
    const r = resolveFromRow(row({ timeZone: "Atlantis/Lost" }), ENV);
    expect(r.source).toBe("DEFAULT");
    expect(r.storedRowRejected).toBe(true);
    // The row's valid thresholds are NOT kept: a combination nobody chose.
    expect(r.values.priority).toEqual(DEFAULT_PRIORITY_CONFIG);
    expect(r.values.timeZone).toBe("Asia/Tehran");
  });

  it("reports a misconfigured environment fallback", () => {
    const r = resolveFromRow(null, { NODE_ENV: "test", HERMES_EXECUTIVE_TIME_ZONE: "Not/AZone" });
    expect(r.environmentValid).toBe(false);
  });
});

function fakeDb(state: { row: Record<string, unknown> | null; updateCount?: number; createThrows?: unknown; findThrows?: boolean }) {
  const calls: Array<{ op: string; args: unknown }> = [];
  const delegate = {
    async findUnique(args: unknown) {
      calls.push({ op: "findUnique", args });
      if (state.findThrows) throw new Error("db down");
      return state.row;
    },
    async findMany(args: unknown) {
      calls.push({ op: "findMany", args });
      if (state.findThrows) throw new Error("db down");
      return state.row ? [state.row] : [];
    },
    async create(args: unknown) {
      calls.push({ op: "create", args });
      if (state.createThrows) throw state.createThrows;
      return {};
    },
    async updateMany(args: unknown) {
      calls.push({ op: "updateMany", args });
      return { count: state.updateCount ?? 1 };
    },
  };
  const tx = { executiveSettings: delegate, auditLog: {} };
  const client = {
    executiveSettings: delegate,
    async $transaction<T>(fn: (t: typeof tx) => Promise<T>) {
      calls.push({ op: "$transaction", args: null });
      return fn(tx);
    },
  } as unknown as SettingsDb;
  return { client, calls, tx };
}

describe("loading", () => {
  it("reads one row by the organization's primary key", async () => {
    const { client, calls } = fakeDb({ row: row() });
    const r = await loadExecutiveSettings("org-a", client);
    expect(calls).toEqual([{ op: "findUnique", args: { where: { organizationId: "org-a" } } }]);
    expect(r.source).toBe("ORGANIZATION");
  });

  it("degrades to the fallback when the database cannot be read", async () => {
    const { client } = fakeDb({ row: null, findThrows: true });
    expect((await loadExecutiveSettings("org-a", client)).source).toBe("DEFAULT");
  });

  it("loads many organizations in ONE bounded query and fills the rest with the fallback", async () => {
    const { client, calls } = fakeDb({ row: row({ organizationId: "org-b" }) });
    const map = await loadExecutiveSettingsMany(["org-a", "org-b"], client);
    expect(calls).toEqual([
      { op: "findMany", args: { where: { organizationId: { in: ["org-a", "org-b"] } }, take: 2 } },
    ]);
    expect(map.get("org-a")!.source).toBe("DEFAULT");
    expect(map.get("org-b")!.source).toBe("ORGANIZATION");
  });
});

describe("saving", () => {
  const base = { organizationId: "org-a", actorUserId: "u-owner", correlationId: "corr", values: VALID };

  it("creates version 1 when no row exists, and audits it inside the same transaction", async () => {
    audit.calls = [];
    const { client, calls, tx } = fakeDb({ row: null });
    const out = await saveExecutiveSettings({ ...base, expectedVersion: 0, client });
    expect(out).toEqual({ kind: "SAVED", version: 1 });
    expect(calls.map(c => c.op)).toEqual(["$transaction", "findUnique", "create"]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0].client).toBe(tx); // the TRANSACTION client, not a separate one
    expect(audit.calls[0].input).toMatchObject({
      action: "executive.settings.update",
      organizationId: "org-a",
      userId: "u-owner",
      metadata: { before: null, version: 1, after: { timeZone: "Europe/Berlin", dayCutoffMinutes: 360 } },
    });
  });

  it("updates with the version in the WHERE clause and bumps it", async () => {
    audit.calls = [];
    const { client, calls } = fakeDb({ row: row({ version: 4 }) });
    const out = await saveExecutiveSettings({ ...base, expectedVersion: 4, client });
    expect(out).toEqual({ kind: "SAVED", version: 5 });
    const update = calls.find(c => c.op === "updateMany")!.args as { where: unknown; data: { version: number } };
    expect(update.where).toEqual({ organizationId: "org-a", version: 4 });
    expect(update.data.version).toBe(5);
    expect((audit.calls[0].input.metadata as { before: unknown }).before).toMatchObject({ timeZone: "Europe/Berlin" });
  });

  it("refuses a stale version with CONFLICT and writes nothing", async () => {
    audit.calls = [];
    const { client, calls } = fakeDb({ row: row({ version: 6 }) });
    const out = await saveExecutiveSettings({ ...base, expectedVersion: 4, client });
    expect(out).toEqual({ kind: "CONFLICT", currentVersion: 6 });
    expect(calls.some(c => c.op === "updateMany" || c.op === "create")).toBe(false);
    expect(audit.calls).toHaveLength(0);
  });

  it("treats a concurrent writer that won the version race as a conflict", async () => {
    audit.calls = [];
    const { client } = fakeDb({ row: row({ version: 4 }), updateCount: 0 });
    expect(await saveExecutiveSettings({ ...base, expectedVersion: 4, client })).toEqual({ kind: "CONFLICT", currentVersion: 4 });
    expect(audit.calls).toHaveLength(0);
  });

  it("treats two first saves racing to create as a conflict, not an outage", async () => {
    const { client } = fakeDb({ row: null, createThrows: Object.assign(new Error("unique"), { code: "P2002" }) });
    expect(await saveExecutiveSettings({ ...base, expectedVersion: 0, client })).toEqual({ kind: "CONFLICT", currentVersion: 1 });
  });

  it("does not commit a change whose audit write failed", async () => {
    audit.calls = [];
    audit.fail = true;
    const { client } = fakeDb({ row: null });
    const out = await saveExecutiveSettings({ ...base, expectedVersion: 0, client });
    audit.fail = false;
    // The throw escapes the transaction callback, so the transaction rolls back.
    expect(out).toEqual({ kind: "UNAVAILABLE" });
  });

  it("refuses invalid values before touching the database", async () => {
    const { client, calls } = fakeDb({ row: null });
    const out = await saveExecutiveSettings({ ...base, values: { ...VALID, dayCutoffMinutes: -5 }, expectedVersion: 0, client });
    expect(out.kind).toBe("INVALID");
    expect(calls).toHaveLength(0);
  });
});
