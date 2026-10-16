/**
 * EXECUTIVE DASHBOARD row 10 — the delivery ledger.
 *
 * What the production evidence showed: the scheduled cycle, the business-day
 * rollover, exactly one report and exactly one notification are all
 * verifiable after the fact. WHO was told, and on what authority, is not —
 * `OrganizationMember` overwrites role and status in place, and
 * `Notification` records neither.
 *
 * These tests cover what the ledger must guarantee, with the fake delegate
 * enforcing the real unique constraint rather than ignoring it. The constraint
 * itself, the append-only trigger and the shape checks are exercised against
 * real PostgreSQL in delivery-ledger.docker.test.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DELIVERY_RULES_VERSION, recordDelivery, recordedRecipients, type DeliveryDelegate } from "../delivery";

/**
 * A delegate that behaves like the table: it REJECTS a second row for the
 * same (organization, date, version, user) with Prisma's P2002, because a
 * fake that accepts duplicates could not fail the test that matters.
 */
function fakeDeliveries() {
  const rows: Array<Record<string, unknown>> = [];
  const keyOf = (d: Record<string, unknown>) =>
    [d.organizationId, d.businessDate, d.reportVersion, d.userId].join("\u0000");
  const delegate: DeliveryDelegate = {
    async create(args: unknown) {
      const data = (args as { data: Record<string, unknown> }).data;
      if (rows.some(r => keyOf(r) === keyOf(data))) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      rows.push({ ...data });
      return data;
    },
    async findMany(args: unknown) {
      const where = (args as { where: Record<string, unknown> }).where;
      return rows.filter(
        r =>
          r.organizationId === where.organizationId &&
          r.businessDate === where.businessDate &&
          r.reportVersion === where.reportVersion,
      );
    },
  };
  return { delegate, rows };
}

const RECIPIENT = { userId: "user-owner", role: "OWNER", status: "ACTIVE" };
const BASE = {
  organizationId: "org-a",
  businessDate: "2026-10-14",
  reportVersion: 1,
  recipient: RECIPIENT,
  allowedRoles: ["OWNER", "ADMIN"] as const,
  notificationId: null,
};

let fake: ReturnType<typeof fakeDeliveries>;
beforeEach(() => {
  fake = fakeDeliveries();
});

describe("the authority is recorded as it was at the moment of sending", () => {
  it("freezes the recipient's role and status into the row", () => {
    return recordDelivery(fake.delegate, BASE).then(result => {
      expect(result).toBe("RECORDED");
      expect(fake.rows).toHaveLength(1);
      expect(fake.rows[0]).toMatchObject({
        organizationId: "org-a",
        businessDate: "2026-10-14",
        reportVersion: 1,
        userId: "user-owner",
        roleAtSend: "OWNER",
        statusAtSend: "ACTIVE",
      });
    });
  });

  it("records the rule and the exact allowlist that admitted them", async () => {
    // A version string alone tells a later reader nothing about what it
    // contained, so the set is stored too — and sorted, so the stored value
    // does not depend on the order the allowlist happened to be written in.
    await recordDelivery(fake.delegate, BASE);
    expect(fake.rows[0].rulesVersion).toBe(DELIVERY_RULES_VERSION);
    expect(fake.rows[0].allowedRoles).toBe("ADMIN,OWNER");
  });

  it("stores the authority as given, without reinterpreting it", async () => {
    // If the database returns a role this code has never heard of, the record
    // must say so rather than normalise it into something familiar.
    await recordDelivery(fake.delegate, {
      ...BASE,
      recipient: { userId: "u1", role: "SOME_FUTURE_ROLE", status: "ACTIVE" },
    });
    expect(fake.rows[0].roleAtSend).toBe("SOME_FUTURE_ROLE");
  });

  it("carries no personal data", async () => {
    await recordDelivery(fake.delegate, BASE);
    const keys = Object.keys(fake.rows[0]).map(k => k.toLowerCase());
    for (const forbidden of ["name", "email", "phone", "telephone", "address"]) {
      expect(keys.some(k => k.includes(forbidden)), forbidden).toBe(false);
    }
  });
});

describe("idempotency: the constraint decides, not a prior read", () => {
  it("records the first attempt and refuses the second", async () => {
    expect(await recordDelivery(fake.delegate, BASE)).toBe("RECORDED");
    expect(await recordDelivery(fake.delegate, BASE)).toBe("ALREADY");
    expect(fake.rows).toHaveLength(1);
  });

  it("refuses a concurrent second attempt, not just a sequential one", async () => {
    // Two replicas claiming the same recipient at the same time. Exactly one
    // may win; a design that read first and wrote later would let both.
    const results = await Promise.all([
      recordDelivery(fake.delegate, BASE),
      recordDelivery(fake.delegate, BASE),
      recordDelivery(fake.delegate, BASE),
    ]);
    expect(results.filter(r => r === "RECORDED")).toHaveLength(1);
    expect(results.filter(r => r === "ALREADY")).toHaveLength(2);
    expect(fake.rows).toHaveLength(1);
  });

  it("treats a CORRECTION as its own delivery", async () => {
    // Version 2 is a restatement of the night, not an edit of version 1, so
    // telling someone about it is a new delivery with its own authority.
    await recordDelivery(fake.delegate, BASE);
    expect(await recordDelivery(fake.delegate, { ...BASE, reportVersion: 2 })).toBe("RECORDED");
    expect(fake.rows).toHaveLength(2);
  });

  it("treats a different night as its own delivery", async () => {
    await recordDelivery(fake.delegate, BASE);
    expect(await recordDelivery(fake.delegate, { ...BASE, businessDate: "2026-10-15" })).toBe("RECORDED");
  });

  it("reports a write it could not make as FAILED, never as ALREADY", async () => {
    // "Already told" and "could not tell" must not collapse into one answer:
    // the caller sends on RECORDED only, and a FAILED claim must not be
    // mistaken for a delivery that happened.
    const broken: DeliveryDelegate = {
      async create() {
        throw new Error("connection terminated unexpectedly");
      },
      async findMany() {
        return [];
      },
    };
    expect(await recordDelivery(broken, BASE)).toBe("FAILED");
  });
});

describe("tenant isolation", () => {
  it("lets two organizations record the same recipient for the same night", async () => {
    // One person may hold a seat in two tenants, and each tenant's report is
    // its own delivery. The key is scoped by organization first.
    expect(await recordDelivery(fake.delegate, BASE)).toBe("RECORDED");
    expect(await recordDelivery(fake.delegate, { ...BASE, organizationId: "org-b" })).toBe("RECORDED");
    expect(fake.rows).toHaveLength(2);
  });

  it("never returns another organization's deliveries", async () => {
    await recordDelivery(fake.delegate, BASE);
    await recordDelivery(fake.delegate, { ...BASE, organizationId: "org-b", recipient: { ...RECIPIENT, userId: "user-b" } });
    const mine = await recordedRecipients(fake.delegate, {
      organizationId: "org-a",
      businessDate: "2026-10-14",
      reportVersion: 1,
    });
    expect([...mine]).toEqual(["user-owner"]);
  });

  it("scopes the read by organization, date AND version", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const spy: DeliveryDelegate = {
      async create() {
        return {};
      },
      async findMany(args: unknown) {
        seen.push((args as { where: Record<string, unknown> }).where);
        return [];
      },
    };
    await recordedRecipients(spy, { organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 3 });
    expect(seen[0]).toEqual({ organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 3 });
  });
});

describe("an unreadable ledger fails safe", () => {
  it("returns an empty set rather than claiming nobody was told", async () => {
    // Reading "nobody recorded" out of a failed read would be the same
    // mistake as reading a zero-row query as "no duplicates". The caller
    // still attempts each recipient, and the unique constraint still decides.
    const broken: DeliveryDelegate = {
      async create() {
        return {};
      },
      async findMany() {
        throw new Error("relation does not exist");
      },
    };
    const seen = await recordedRecipients(broken, {
      organizationId: "org-a",
      businessDate: "2026-10-14",
      reportVersion: 1,
    });
    expect(seen.size).toBe(0);
  });
});
