/**
 * Executive Management Center — the nightly report pass.
 *
 * What these tests are actually for: a scheduler calls this repeatedly, from
 * several replicas, through outages. The properties that matter are therefore
 * "runs twice safely", "one sweeper at a time", "one tenant's failure does not
 * stop the rest" and "nobody is told twice" — not "it produced a report".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prismaMissing: false,
  /** null means the lease is held by someone else. */
  lease: { holder: "me", fencingToken: 1, expiresAt: new Date() } as unknown,
  leaseCalls: [] as Array<Record<string, unknown>>,
  orgIds: ["org-a", "org-b", "org-c"],
  orgQuery: [] as Array<Record<string, unknown>>,
  siteIds: { "org-a": ["s1"], "org-b": [], "org-c": ["s2"] } as Record<string, string[]>,
  /** Per-organization generation outcome, keyed by id. */
  outcomes: {} as Record<string, { kind: string; reasonKey?: string }>,
  generateCalls: [] as Array<Record<string, unknown>>,
  generateThrowsFor: null as string | null,
  claims: [] as Array<Record<string, unknown>>,
  claimGrants: true,
  notifications: [] as Array<Record<string, unknown>>,
  zone: { timeZone: "Asia/Tehran", dayCutoffMinutes: 0, configuredValid: true },
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.prismaMissing
      ? null
      : {
          organization: {
            async findMany(args: unknown) {
              h.orgQuery.push(args as Record<string, unknown>);
              const take = (args as { take?: number }).take ?? h.orgIds.length;
              return h.orgIds.slice(0, take).map(id => ({ id }));
            },
          },
          industrialSite: {
            async findMany(args: unknown) {
              const where = (args as { where: { organizationId: string } }).where;
              return (h.siteIds[where.organizationId] ?? []).map(id => ({ id }));
            },
          },
          organizationMember: {
            async findFirst() {
              return { userId: "owner-1" };
            },
          },
        },
}));

vi.mock("@/lib/industrial/metering-worker", () => ({
  acquireLease: async (opts: Record<string, unknown>) => {
    h.leaseCalls.push(opts);
    return h.lease;
  },
}));

vi.mock("@/lib/notifications/service", () => ({
  getNotificationService: () => ({
    create: async (n: Record<string, unknown>) => {
      h.notifications.push(n);
      return { id: "notif-1", ...n };
    },
  }),
}));

vi.mock("../generate", () => ({
  generateDailyReport: async (a: Record<string, unknown>) => {
    h.generateCalls.push(a);
    const orgId = (a.scope as { organizationId: string }).organizationId;
    if (h.generateThrowsFor === orgId) throw new Error("boom");
    const o = h.outcomes[orgId] ?? { kind: "CREATED" };
    if (o.kind === "CREATED" || o.kind === "CORRECTED" || o.kind === "ALREADY_REPORTED") {
      return {
        kind: o.kind,
        report: { organizationId: orgId, businessDate: a.businessDate, version: 1 },
      };
    }
    if (o.kind === "SKIPPED_NOT_FINISHED") {
      return { kind: o.kind, businessDate: a.businessDate };
    }
    return { kind: "FAILED", reasonKey: o.reasonKey ?? "executive.reasons.sourceUnavailable" };
  },
  claimNotification: async (a: Record<string, unknown>) => {
    h.claims.push(a);
    return h.claimGrants;
  },
}));

vi.mock("../../config", () => ({
  resolveReportingZone: () => h.zone,
}));

import { runReportPass, REPORT_LEASE_NAME, REPORT_LEASE_TTL_MS } from "../worker";

/** 2026-10-11T08:00Z is 11:30 on the 11th in Tehran, so the 10th is finished. */
const NOW = Date.parse("2026-10-11T08:00:00Z");
const run = (over: Record<string, unknown> = {}) =>
  runReportPass({ nowMs: NOW, holder: "replica-1", ...over });

beforeEach(() => {
  h.prismaMissing = false;
  h.lease = { holder: "me", fencingToken: 1, expiresAt: new Date() };
  h.leaseCalls = [];
  h.orgIds = ["org-a", "org-b", "org-c"];
  h.orgQuery = [];
  h.siteIds = { "org-a": ["s1"], "org-b": [], "org-c": ["s2"] };
  h.outcomes = {};
  h.generateCalls = [];
  h.generateThrowsFor = null;
  h.claims = [];
  h.claimGrants = true;
  h.notifications = [];
  h.zone = { timeZone: "Asia/Tehran", dayCutoffMinutes: 0, configuredValid: true };
});

describe("the pass targets the last FINISHED night", () => {
  it("reports yesterday in the configured zone, for every organization", async () => {
    const pass = await run();
    expect(pass.businessDate).toBe("2026-10-10");
    expect(pass.considered).toBe(3);
    expect(pass.created).toBe(3);
    for (const call of h.generateCalls) expect(call.businessDate).toBe("2026-10-10");
  });

  it("gives each organization its OWN sites, not a shared list", async () => {
    await run();
    const byOrg = Object.fromEntries(
      h.generateCalls.map(c => {
        const s = c.scope as { organizationId: string; allowedSiteIds: string[] };
        return [s.organizationId, s.allowedSiteIds];
      }),
    );
    expect(byOrg["org-a"]).toEqual(["s1"]);
    expect(byOrg["org-b"]).toEqual([]);
    expect(byOrg["org-c"]).toEqual(["s2"]);
  });

  it("generates at the organization's FULL breadth, not one reader's view", async () => {
    await run();
    const scope = h.generateCalls[0].scope as { authority: Record<string, boolean> };
    expect(scope.authority).toEqual({ operations: true, financial: true, industrial: true });
  });
});

describe("coordination: one sweeper at a time, and it is not load-bearing", () => {
  it("takes the lease under this job's own name and TTL", async () => {
    await run();
    expect(h.leaseCalls[0]).toMatchObject({
      name: REPORT_LEASE_NAME,
      ttlMs: REPORT_LEASE_TTL_MS,
      holder: "replica-1",
    });
  });

  it("does nothing when another replica holds the lease — a normal outcome, not an error", async () => {
    h.lease = null;
    const pass = await run();
    expect(pass.leaseHeld).toBe(false);
    expect(pass.considered).toBe(0);
    expect(h.generateCalls).toHaveLength(0);
  });

  it("can be told to skip the lease for a single operator run", async () => {
    const pass = await run({ withoutLease: true });
    expect(h.leaseCalls).toHaveLength(0);
    expect(pass.created).toBe(3);
  });
});

describe("the pass is bounded", () => {
  it("never considers more organizations than the batch allows", async () => {
    h.orgIds = Array.from({ length: 500 }, (_, i) => `org-${i}`);
    const pass = await run({ maxOrganizations: 5 });
    expect(pass.considered).toBe(5);
    expect(h.orgQuery[0]).toMatchObject({ take: 5 });
  });

  it("applies a default ceiling when none is given", async () => {
    h.orgIds = Array.from({ length: 500 }, (_, i) => `org-${i}`);
    const pass = await run();
    expect(pass.considered).toBeLessThanOrEqual(50);
  });
});

describe("a repeat pass is cheap and changes nothing", () => {
  it("counts already-reported organizations separately from created ones", async () => {
    h.outcomes = {
      "org-a": { kind: "ALREADY_REPORTED" },
      "org-b": { kind: "ALREADY_REPORTED" },
      "org-c": { kind: "CREATED" },
    };
    const pass = await run();
    expect(pass.alreadyReported).toBe(2);
    expect(pass.created).toBe(1);
    // Only the newly created one is announced.
    expect(h.claims).toHaveLength(1);
  });

  it("counts a night that has not finished without treating it as a failure", async () => {
    h.outcomes = { "org-a": { kind: "SKIPPED_NOT_FINISHED" } };
    const pass = await run();
    expect(pass.skippedNotFinished).toBe(1);
    expect(pass.failed).toBe(0);
  });
});

describe("one tenant's failure does not stop the others", () => {
  it("records the failure against its organization and keeps going", async () => {
    h.outcomes = { "org-b": { kind: "FAILED", reasonKey: "executive.reasons.sourceUnavailable" } };
    const pass = await run();
    expect(pass.created).toBe(2);
    expect(pass.failed).toBe(1);
    expect(pass.failures).toEqual([
      { organizationId: "org-b", reasonKey: "executive.reasons.sourceUnavailable" },
    ]);
  });

  it("survives a generator that throws, and still reports the rest", async () => {
    h.generateThrowsFor = "org-a";
    const pass = await run();
    expect(pass.failed).toBe(1);
    expect(pass.created).toBe(2);
    expect(pass.failures[0].organizationId).toBe("org-a");
  });

  it("never leaks the thrown message", async () => {
    h.generateThrowsFor = "org-a";
    const pass = await run();
    expect(JSON.stringify(pass)).not.toContain("boom");
  });

  it("does nothing at all without a database", async () => {
    h.prismaMissing = true;
    const pass = await run();
    expect(pass.considered).toBe(0);
    expect(pass.leaseHeld).toBe(false);
  });
});

describe("nobody is told twice", () => {
  it("claims the notification before sending it", async () => {
    await run();
    expect(h.claims).toHaveLength(3);
    expect(h.notifications).toHaveLength(3);
    // The claim carries the exact night and version being announced.
    expect(h.claims[0]).toMatchObject({ businessDate: "2026-10-10", version: 1 });
  });

  it("sends nothing when the claim is refused — another replica already did", async () => {
    h.claimGrants = false;
    const pass = await run();
    expect(pass.created).toBe(3);
    expect(pass.notified).toBe(0);
    expect(h.notifications).toHaveLength(0);
  });

  it("announces only that a report exists — never a figure from it", async () => {
    await run();
    const n = h.notifications[0];
    const serialized = JSON.stringify(n);
    expect(serialized).toContain("2026-10-10");
    // No metric, no count, no money. Opening the report is what checks
    // permission, so the notification must not carry data around that check.
    expect(serialized).not.toMatch(/overdue|budget|alert[s]?":\s*\d|cost/i);
    expect(n.metadata).toMatchObject({ kind: "executive.report", businessDate: "2026-10-10" });
  });

  it("notifies the organization OWNER, scoped to that organization", async () => {
    await run();
    expect(h.notifications[0]).toMatchObject({ userId: "owner-1", organizationId: "org-a" });
  });
});
