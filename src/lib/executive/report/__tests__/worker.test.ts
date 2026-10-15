/**
 * Executive Management Center — the nightly report pass.
 *
 * What these tests are actually for: a scheduler calls this repeatedly, from
 * several replicas, through outages. The properties that matter are therefore
 * "runs twice safely", "one sweeper at a time", "one tenant's failure does not
 * stop the rest", "every tenant is eventually reached" and "nobody is told
 * twice, and nobody is told they were told when they were not" — not "it
 * produced a report".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  prismaMissing: false,
  /** null means the lease is held by someone else. */
  lease: { holder: "me", fencingToken: 1, expiresAt: new Date() } as unknown,
  leaseCalls: [] as Array<Record<string, unknown>>,
  renewCalls: [] as Array<Record<string, unknown>>,
  /** false = the lease was taken over; renewLease answers null. */
  renewGrants: true,
  releaseCalls: [] as Array<Record<string, unknown>>,
  orgIds: ["org-a", "org-b", "org-c"],
  orgQuery: [] as Array<Record<string, unknown>>,
  siteIds: { "org-a": ["s1"], "org-b": [], "org-c": ["s2"] } as Record<string, string[]>,
  /** Per-organization generation outcome, keyed by id. */
  outcomes: {} as Record<string, { kind: string; reasonKey?: string }>,
  /** notifiedAtIso of an ALREADY_REPORTED report; absent = already announced. */
  notifiedAt: {} as Record<string, string | null>,
  generateCalls: [] as Array<Record<string, unknown>>,
  generateThrowsFor: null as string | null,
  claims: [] as Array<Record<string, unknown>>,
  claimGrants: true,
  releases: [] as Array<Record<string, unknown>>,
  /**
   * Members per organization; absent = one active owner. `role` and `status`
   * default to OWNER/ACTIVE, and the fake delegate APPLIES the where clause
   * rather than ignoring it — otherwise a test could only prove the worker
   * ASKS for the right rows, never that a viewer or a suspended member is
   * actually left out.
   */
  members: {} as Record<string, Array<{ userId: string; role?: string; status?: string }>>,
  memberQueries: [] as Array<Record<string, unknown>>,
  /** "ok" | "null" (service refused) | "throw". */
  notifyMode: "ok" as "ok" | "null" | "throw",
  notifications: [] as Array<Record<string, unknown>>,
  zone: { timeZone: "Asia/Tehran", dayCutoffMinutes: 0, configuredValid: true },
  /** Slice E: per-organization settings rows. `null` = the model is absent. */
  settingsRows: null as Array<Record<string, unknown>> | null,
  settingsQueries: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.prismaMissing
      ? null
      : {
          organization: {
            // Honours the cursor and the order the real query asks for.
            async findMany(args: unknown) {
              const a = args as { take?: number; where?: { id?: { gt?: string } } };
              h.orgQuery.push(a as Record<string, unknown>);
              const gt = a.where?.id?.gt;
              const ids = [...h.orgIds].sort().filter(id => gt === undefined || id > gt);
              return ids.slice(0, a.take ?? ids.length).map(id => ({ id }));
            },
          },
          industrialSite: {
            async findMany(args: unknown) {
              const where = (args as { where: { organizationId: string } }).where;
              return (h.siteIds[where.organizationId] ?? []).map(id => ({ id }));
            },
          },
          organizationMember: {
            async findMany(args: unknown) {
              h.memberQueries.push(args as Record<string, unknown>);
              const where = (args as { where: { organizationId: string; status?: string; role?: { in?: string[] } } })
                .where;
              const rows = h.members[where.organizationId] ?? [{ userId: "owner-1" }];
              const roles = where.role?.in;
              return rows.filter(
                m =>
                  (where.status === undefined || (m.status ?? "ACTIVE") === where.status) &&
                  (roles === undefined || roles.includes(m.role ?? "OWNER")),
              );
            },
          },
          ...(h.settingsRows === null
            ? {}
            : {
                executiveSettings: {
                  async findMany(args: unknown) {
                    h.settingsQueries.push(args as Record<string, unknown>);
                    return h.settingsRows ?? [];
                  },
                },
              }),
        },
}));

vi.mock("@/lib/industrial/metering-worker", () => ({
  acquireLease: async (opts: Record<string, unknown>) => {
    h.leaseCalls.push(opts);
    return h.lease;
  },
  renewLease: async (opts: Record<string, unknown>) => {
    h.renewCalls.push(opts);
    return h.renewGrants ? (opts.handle as unknown) : null;
  },
  releaseLease: async (opts: Record<string, unknown>) => {
    h.releaseCalls.push(opts);
    return true;
  },
}));

vi.mock("@/lib/notifications/service", () => ({
  getNotificationService: () => ({
    create: async (n: Record<string, unknown>) => {
      if (h.notifyMode === "throw") throw new Error("smtp down");
      if (h.notifyMode === "null") return null;
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
      const notifiedAtIso =
        o.kind === "ALREADY_REPORTED"
          ? orgId in h.notifiedAt
            ? h.notifiedAt[orgId]
            : "2026-10-11T00:30:00.000Z"
          : null;
      return {
        kind: o.kind,
        report: { organizationId: orgId, businessDate: a.businessDate, version: 1, notifiedAtIso },
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
  releaseNotificationClaim: async (a: Record<string, unknown>) => {
    h.releases.push(a);
    return true;
  },
}));

vi.mock("../../config", () => ({
  resolveReportingZone: () => h.zone,
}));

import {
  runReportPass,
  MAX_NOTIFY_RECIPIENTS,
  REPORT_LEASE_NAME,
  REPORT_LEASE_TTL_MS,
} from "../worker";

/** 2026-10-11T08:00Z is 11:30 on the 11th in Tehran, so the 10th is finished. */
const NOW = Date.parse("2026-10-11T08:00:00Z");
const run = (over: Record<string, unknown> = {}) =>
  runReportPass({ nowMs: NOW, holder: "replica-1", clock: () => NOW, ...over });

beforeEach(() => {
  h.prismaMissing = false;
  h.lease = { holder: "me", fencingToken: 1, expiresAt: new Date() };
  h.leaseCalls = [];
  h.renewCalls = [];
  h.renewGrants = true;
  h.releaseCalls = [];
  h.orgIds = ["org-a", "org-b", "org-c"];
  h.orgQuery = [];
  h.siteIds = { "org-a": ["s1"], "org-b": [], "org-c": ["s2"] };
  h.outcomes = {};
  h.notifiedAt = {};
  h.generateCalls = [];
  h.generateThrowsFor = null;
  h.claims = [];
  h.claimGrants = true;
  h.releases = [];
  h.members = {};
  h.memberQueries = [];
  h.notifyMode = "ok";
  h.notifications = [];
  h.zone = { timeZone: "Asia/Tehran", dayCutoffMinutes: 0, configuredValid: true };
  h.settingsRows = null;
  h.settingsQueries = [];
});

describe("each organization reports ITS OWN last completed night (slice E)", () => {
  const settingsRow = (organizationId: string, timeZone: string, dayCutoffMinutes = 0) => ({
    organizationId,
    timeZone,
    dayCutoffMinutes,
    approvalStaleDays: 3,
    approvalCriticalDays: 7,
    alertAgeHours: 4,
    priorityMaxItems: 25,
    version: 1,
    updatedAt: new Date(NOW),
    updatedBy: "u",
  });

  it("targets different dates for organizations in different zones, in the same pass", async () => {
    // 08:00Z: Tehran is 11:30 on the 11th (the 10th is finished); Pago Pago
    // (UTC-11) is 21:00 on the 10th, so for it only the 9th is finished.
    h.settingsRows = [settingsRow("org-b", "Pacific/Pago_Pago")];
    const pass = await run();
    const byOrg = Object.fromEntries(h.generateCalls.map(c => [(c.scope as { organizationId: string }).organizationId, c]));
    expect(byOrg["org-a"].businessDate).toBe("2026-10-10");
    expect(byOrg["org-b"].businessDate).toBe("2026-10-09");
    expect((byOrg["org-b"].scope as { timeZone: string }).timeZone).toBe("Pacific/Pago_Pago");
    expect(pass.distinctBusinessDates).toEqual(["2026-10-09", "2026-10-10"]);
    // The pass-level date stays the DEFAULT zone's night, for operators.
    expect(pass.businessDate).toBe("2026-10-10");
  });

  it("honours an organization's own cutoff", async () => {
    // A 12:00 cutoff in Tehran: at 11:30 on the 11th, the business day that
    // began at noon on the 10th is still running, so the 9th is the last finished.
    h.settingsRows = [settingsRow("org-c", "Asia/Tehran", 720)];
    await run();
    const call = h.generateCalls.find(c => (c.scope as { organizationId: string }).organizationId === "org-c")!;
    expect(call.businessDate).toBe("2026-10-09");
    expect((call.scope as { dayCutoffMinutes: number }).dayCutoffMinutes).toBe(720);
  });

  it("reads every organization's settings in ONE bounded query", async () => {
    h.settingsRows = [];
    await run();
    expect(h.settingsQueries).toEqual([{ where: { organizationId: { in: ["org-a", "org-b", "org-c"] } }, take: 3 }]);
  });

  it("falls back to the default zone for every organization when the model is absent", async () => {
    h.settingsRows = null;
    const pass = await run();
    for (const call of h.generateCalls) expect(call.businessDate).toBe("2026-10-10");
    expect(pass.distinctBusinessDates).toEqual(["2026-10-10"]);
  });
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
    expect(scope.authority).toEqual({ operations: true, financial: true, industrial: true, customers: true });
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

describe("every tenant is reached: the cursor (slice F)", () => {
  it("chains bounded batches until the cursor runs out, visiting each organization exactly once", async () => {
    h.orgIds = Array.from({ length: 120 }, (_, i) => `org-${String(i).padStart(3, "0")}`);
    const visited: string[] = [];
    let after: string | null = null;
    const passes: Array<{ considered: number; next: string | null }> = [];
    do {
      h.generateCalls = [];
      const pass = await run({ maxOrganizations: 50, afterOrganizationId: after });
      visited.push(...h.generateCalls.map(c => (c.scope as { organizationId: string }).organizationId));
      passes.push({ considered: pass.considered, next: pass.nextAfterOrganizationId });
      after = pass.nextAfterOrganizationId;
    } while (after !== null && passes.length < 10);

    expect(passes).toEqual([
      { considered: 50, next: "org-049" },
      { considered: 50, next: "org-099" },
      { considered: 20, next: null },
    ]);
    expect(visited).toHaveLength(120);
    expect(new Set(visited).size).toBe(120);
    // The 51st organization — the one the old query never reached — is reported.
    expect(visited).toContain("org-050");
  });

  it("asks the database for ids AFTER the cursor, in id order", async () => {
    await run({ afterOrganizationId: "org-a" });
    expect(h.orgQuery[0]).toMatchObject({ where: { id: { gt: "org-a" } }, orderBy: { id: "asc" } });
    expect(h.generateCalls).toHaveLength(2);
  });

  it("starts from the beginning without a cursor, and echoes the cursor it was given", async () => {
    const first = await run();
    expect(h.orgQuery[0]).not.toHaveProperty("where");
    expect(first.afterOrganizationId).toBeNull();
    expect((await run({ afterOrganizationId: "org-a" })).afterOrganizationId).toBe("org-a");
  });

  it("a full last batch hands back a cursor, and the empty batch after it ends the sweep", async () => {
    const full = await run({ maxOrganizations: 3 });
    expect(full.nextAfterOrganizationId).toBe("org-c");
    const empty = await run({ maxOrganizations: 3, afterOrganizationId: "org-c" });
    expect(empty.considered).toBe(0);
    expect(empty.nextAfterOrganizationId).toBeNull();
  });
});

describe("the lease is renewed while a batch runs and released when it ends (slice F)", () => {
  it("releases the lease it took, under this job's name, so a chained request can take it at once", async () => {
    await run();
    expect(h.releaseCalls).toHaveLength(1);
    expect(h.releaseCalls[0]).toMatchObject({ handle: h.lease, name: REPORT_LEASE_NAME });
  });

  it("releases nothing when it never held the lease", async () => {
    h.lease = null;
    await run();
    expect(h.releaseCalls).toHaveLength(0);
    await run({ withoutLease: true });
    expect(h.releaseCalls).toHaveLength(0);
  });

  it("renews before the lease can expire during a slow batch", async () => {
    let t = NOW;
    // Each organization takes half a lease: renewal must happen inside the batch.
    const clock = () => (t += REPORT_LEASE_TTL_MS / 2);
    const pass = await run({ clock });
    expect(h.renewCalls.length).toBeGreaterThan(0);
    expect(h.renewCalls[0]).toMatchObject({ name: REPORT_LEASE_NAME, ttlMs: REPORT_LEASE_TTL_MS });
    expect(pass.leaseLost).toBe(false);
    expect(pass.considered).toBe(3);
  });

  it("stops when the lease was taken over, and resumes exactly where it stopped", async () => {
    let t = NOW;
    let tick = 0;
    // Fast for the first organization, then slow enough to need a renewal.
    const clock = () => (tick++ < 2 ? t : (t += REPORT_LEASE_TTL_MS));
    h.renewGrants = false;
    const pass = await run({ clock });
    expect(pass.leaseLost).toBe(true);
    expect(h.generateCalls.map(c => (c.scope as { organizationId: string }).organizationId)).toEqual(["org-a"]);
    expect(pass.nextAfterOrganizationId).toBe("org-a");
  });

  it("does not renew a fast batch at all", async () => {
    await run();
    expect(h.renewCalls).toHaveLength(0);
  });
});

describe("nobody is told they were told when they were not (slice F)", () => {
  it("tells every active owner and administrator, once each, scoped to the organization", async () => {
    h.orgIds = ["org-a"];
    h.members = { "org-a": [{ userId: "owner-1" }, { userId: "admin-2" }, { userId: "owner-1" }] };
    const pass = await run();
    expect(h.notifications.map(n => n.userId)).toEqual(["owner-1", "admin-2"]);
    expect(h.notifications.every(n => n.organizationId === "org-a")).toBe(true);
    expect(pass.notified).toBe(1); // one REPORT announced, to two people
    expect(h.memberQueries[0]).toMatchObject({
      where: { organizationId: "org-a", status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      take: MAX_NOTIFY_RECIPIENTS,
    });
  });

  it("tells nobody outside the two notified roles, however senior the title sounds", async () => {
    // A notification is an authority signal, so the allowlist is roles, not
    // seniority: MANAGER and BILLING_ADMIN both read as "manager" in ordinary
    // speech and neither is on it. The filtering happens in the query, and
    // this fake applies that query, so a widened `in` list is what it takes
    // to change this outcome — not a renamed title.
    h.orgIds = ["org-a"];
    h.members = {
      "org-a": [
        { userId: "owner-1", role: "OWNER" },
        { userId: "manager-2", role: "MANAGER" },
        { userId: "billing-3", role: "BILLING_ADMIN" },
        { userId: "engineer-4", role: "ENGINEER" },
        { userId: "viewer-5", role: "VIEWER" },
      ],
    };
    const pass = await run();
    expect(h.notifications.map(n => n.userId)).toEqual(["owner-1"]);
    expect(pass.notified).toBe(1);
  });

  it("tells nobody whose membership is not ACTIVE", async () => {
    // A revoked or pending administrator keeps the role on the row. Status is
    // the other half of the predicate and has to carry its own weight.
    h.orgIds = ["org-a"];
    h.members = {
      "org-a": [
        { userId: "admin-live", role: "ADMIN", status: "ACTIVE" },
        { userId: "admin-suspended", role: "ADMIN", status: "SUSPENDED" },
        { userId: "owner-invited", role: "OWNER", status: "INVITED" },
      ],
    };
    await run();
    expect(h.notifications.map(n => n.userId)).toEqual(["admin-live"]);
  });

  it("reports NO_RECIPIENT when every member is filtered out, instead of announcing into the void", async () => {
    // The organization HAS members; none of them may be told. That must be
    // the undelivered path with the claim handed back, not a silent success.
    h.orgIds = ["org-a"];
    h.members = { "org-a": [{ userId: "viewer-5", role: "VIEWER" }, { userId: "old-admin", role: "ADMIN", status: "REMOVED" }] };
    const pass = await run();
    expect(pass.notified).toBe(0);
    expect(pass.undelivered).toEqual([{ organizationId: "org-a", businessDate: "2026-10-10", reason: "NO_RECIPIENT" }]);
    expect(h.releases).toEqual([{ organizationId: "org-a", businessDate: "2026-10-10", version: 1, claimedAtMs: NOW }]);
  });

  it("gives the claim back and lists the report when there is nobody to tell", async () => {
    h.orgIds = ["org-a"];
    h.members = { "org-a": [] };
    const pass = await run();
    expect(pass.notified).toBe(0);
    expect(pass.undelivered).toEqual([{ organizationId: "org-a", businessDate: "2026-10-10", reason: "NO_RECIPIENT" }]);
    // Fenced on the exact claim it took.
    expect(h.releases).toEqual([{ organizationId: "org-a", businessDate: "2026-10-10", version: 1, claimedAtMs: NOW }]);
  });

  it("gives the claim back when every send failed, whether refused or thrown", async () => {
    for (const mode of ["null", "throw"] as const) {
      h.releases = [];
      h.notifyMode = mode;
      const pass = await run();
      expect(pass.notified, mode).toBe(0);
      expect(pass.undelivered.map(u => u.reason), mode).toEqual(["DELIVERY_FAILED", "DELIVERY_FAILED", "DELIVERY_FAILED"]);
      expect(h.releases, mode).toHaveLength(3);
      expect(JSON.stringify(pass), mode).not.toContain("smtp down");
    }
  });

  it("retries an existing report whose announcement reached nobody", async () => {
    h.outcomes = { "org-a": { kind: "ALREADY_REPORTED" } };
    h.notifiedAt = { "org-a": null };
    h.orgIds = ["org-a"];
    const pass = await run();
    expect(pass.alreadyReported).toBe(1);
    expect(h.claims).toHaveLength(1);
    expect(pass.notified).toBe(1);
    expect(h.releases).toHaveLength(0);
  });

  it("leaves an already announced report alone, at no cost", async () => {
    h.outcomes = { "org-a": { kind: "ALREADY_REPORTED" } };
    h.orgIds = ["org-a"];
    await run();
    expect(h.claims).toHaveLength(0);
    expect(h.memberQueries).toHaveLength(0);
  });

  it("neither sends nor releases when another replica holds the claim", async () => {
    h.claimGrants = false;
    const pass = await run();
    expect(h.releases).toHaveLength(0);
    expect(pass.undelivered).toEqual([]);
    expect(h.memberQueries).toHaveLength(0);
  });
});
