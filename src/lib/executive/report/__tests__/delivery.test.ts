/**
 * EXECUTIVE DASHBOARD row 10 — the delivery ledger.
 *
 * Production could show that exactly one report and one notification were
 * produced, and that no duplicate followed. It could NOT show who received
 * that notification or on what authority: `OrganizationMember` overwrites
 * role and status in place, and `Notification` records neither.
 *
 * The two properties that matter most here are ATOMICITY and FAIL-CLOSED
 * behaviour, because both of their failure modes are silent:
 *
 *   · claim first, send second — a crash between the two leaves a record
 *     saying the person was told, so every later pass skips them and the
 *     notification is lost for ever;
 *   · send without a ledger — an announcement nobody can later account for,
 *     which is the exact gap this table exists to close.
 *
 * The fake client below is transactional: a callback that throws discards
 * everything it wrote, exactly as PostgreSQL would. A fake that kept partial
 * writes could not fail the tests that matter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELIVERY_RULES_VERSION,
  deliverOnce,
  recordedRecipients,
  type DeliveryClient,
  type NotificationContent,
} from "../delivery";

/**
 * The three side effects the notification service used to perform, held
 * where a test can make one of them fail. They run AFTER the transaction
 * commits, so their failure must never change the delivery's verdict.
 */
const sideEffects = vi.hoisted(() => ({
  broadcastToUser: vi.fn(),
  recordUsage: vi.fn(async () => undefined),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: sideEffects.error },
}));
vi.mock("@/lib/realtime/sse-manager", () => ({
  getSseManager: () => ({ broadcastToUser: sideEffects.broadcastToUser }),
}));
vi.mock("@/lib/billing/usage", () => ({ recordUsage: sideEffects.recordUsage }));

/** The name the shipped migration gives this table's idempotency key. */
const LEDGER_INDEX = "ExecutiveReportDelivery_org_date_version_user_key";

/**
 * A client whose `$transaction` is real enough to matter: writes land in a
 * staging buffer and are committed only if the callback returns. If it
 * throws, they are discarded.
 */
function fakeClient(
  opts: {
    notificationFails?: boolean;
    /** A unique violation raised by the NOTIFICATION insert, not by the ledger. */
    notificationConflict?: boolean;
  } = {},
) {
  const committed = { deliveries: [] as Array<Record<string, unknown>>, notifications: [] as Array<Record<string, unknown>> };
  /**
   * Rows written by transactions that have not committed yet. A real unique
   * index conflicts with an UNCOMMITTED insert too — the second writer waits
   * and then fails — so a fake that only compared against committed rows
   * would let three concurrent attempts all succeed, which is precisely the
   * bug this suite has to be able to see.
   */
  const inFlight: Array<Array<Record<string, unknown>>> = [];
  let seq = 0;
  const keyOf = (d: Record<string, unknown>) =>
    [d.organizationId, d.businessDate, d.reportVersion, d.userId].join("\u0000");

  const client: DeliveryClient = {
    async $transaction(fn) {
      const staged = { deliveries: [] as Array<Record<string, unknown>>, notifications: [] as Array<Record<string, unknown>> };
      inFlight.push(staged.deliveries);
      const tx = {
        notification: {
          async create(args: unknown) {
            if (opts.notificationFails) throw new Error("notification insert failed");
            if (opts.notificationConflict) {
              // A different table's constraint. Reading this as "already
              // delivered" would drop the recipient permanently.
              throw Object.assign(new Error("Unique constraint failed"), {
                code: "P2002",
                meta: { modelName: "Notification", target: "Notification_pkey" },
              });
            }
            const data = (args as { data: Record<string, unknown> }).data;
            const row = { id: `ntf-${(seq += 1)}`, createdAt: new Date().toISOString(), ...data };
            staged.notifications.push(row);
            return row;
          },
        },
        executiveReportDelivery: {
          async create(args: unknown) {
            const data = (args as { data: Record<string, unknown> }).data;
            const clash = [...committed.deliveries, ...inFlight.flat()].some(r => keyOf(r) === keyOf(data));
            if (clash) throw Object.assign(new Error("Unique constraint failed"), {
                code: "P2002",
                // As the pg driver adapter reports it: the constraint NAME.
                meta: { modelName: "ExecutiveReportDelivery", target: LEDGER_INDEX },
              });
            staged.deliveries.push({ ...data });
            return data;
          },
        },
      };
      try {
        const result = await fn(tx);
        // Commit only on success — a throw above never reaches here.
        committed.deliveries.push(...staged.deliveries);
        committed.notifications.push(...staged.notifications);
        return result;
      } finally {
        // Whether it committed or rolled back, this transaction is no longer
        // in flight and its staged rows stop conflicting with anyone.
        const at = inFlight.indexOf(staged.deliveries);
        if (at >= 0) inFlight.splice(at, 1);
      }
    },
    executiveReportDelivery: {
      async findMany(args: unknown) {
        const where = (args as { where: Record<string, unknown> }).where;
        return committed.deliveries.filter(
          r =>
            r.organizationId === where.organizationId &&
            r.businessDate === where.businessDate &&
            r.reportVersion === where.reportVersion,
        );
      },
    },
  };
  return { client, committed };
}

const RECIPIENT = { userId: "user-owner", role: "OWNER", status: "ACTIVE" };
const RECORD = {
  organizationId: "org-a",
  businessDate: "2026-10-14",
  reportVersion: 1,
  recipient: RECIPIENT,
  allowedRoles: ["OWNER", "ADMIN"] as const,
  notificationId: null,
};
const CONTENT: NotificationContent = {
  type: "info",
  title: "Executive daily report",
  message: "The management report for 2026-10-14 is ready.",
  metadata: { kind: "executive.report", businessDate: "2026-10-14" },
};

let fake: ReturnType<typeof fakeClient>;
beforeEach(() => {
  fake = fakeClient();
  sideEffects.broadcastToUser.mockReset();
  sideEffects.recordUsage.mockReset();
  sideEffects.recordUsage.mockResolvedValue(undefined);
  sideEffects.error.mockReset();
});

describe("the authority is recorded as it was at the moment of sending", () => {
  it("freezes the recipient's role and status into the row", async () => {
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("SENT");
    expect(fake.committed.deliveries[0]).toMatchObject({
      organizationId: "org-a",
      businessDate: "2026-10-14",
      reportVersion: 1,
      userId: "user-owner",
      roleAtSend: "OWNER",
      statusAtSend: "ACTIVE",
    });
  });

  it("records the rule and the exact allowlist that admitted them, sorted", async () => {
    // A version string alone tells a later reader nothing about what it
    // contained; sorting keeps the stored value independent of the order the
    // allowlist happened to be written in.
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect(fake.committed.deliveries[0].rulesVersion).toBe(DELIVERY_RULES_VERSION);
    expect(fake.committed.deliveries[0].allowedRoles).toBe("ADMIN,OWNER");
  });

  it("stores an unfamiliar role as given, without normalising it", async () => {
    await deliverOnce(
      fake.client,
      { ...RECORD, recipient: { userId: "u1", role: "SOME_FUTURE_ROLE", status: "ACTIVE" } },
      CONTENT,
    );
    expect(fake.committed.deliveries[0].roleAtSend).toBe("SOME_FUTURE_ROLE");
  });

  it("carries no personal data", async () => {
    await deliverOnce(fake.client, RECORD, CONTENT);
    const keys = Object.keys(fake.committed.deliveries[0]).map(k => k.toLowerCase());
    for (const forbidden of ["name", "email", "phone", "telephone", "address"]) {
      expect(keys.some(k => k.includes(forbidden)), forbidden).toBe(false);
    }
  });
});

describe("the notification and the record are one transaction", () => {
  it("writes both, and freezes the notification's id into the record", async () => {
    const outcome = await deliverOnce(fake.client, RECORD, CONTENT);
    expect(outcome).toEqual({ kind: "SENT", notificationId: "ntf-1", sideEffectFailed: false });
    expect(fake.committed.notifications).toHaveLength(1);
    expect(fake.committed.deliveries).toHaveLength(1);
    expect(fake.committed.deliveries[0].notificationId).toBe("ntf-1");
  });

  it("writes NEITHER when the notification cannot be created", async () => {
    // The mirror of the claim-first bug: a ledger row without a notification
    // would silence every later pass for that recipient.
    const broken = fakeClient({ notificationFails: true });
    const outcome = await deliverOnce(broken.client, RECORD, CONTENT);
    expect(outcome.kind).toBe("FAILED");
    expect(broken.committed.deliveries).toHaveLength(0);
    expect(broken.committed.notifications).toHaveLength(0);
  });

  it("a FAILED delivery can be retried, because no claim survived it", async () => {
    // This is the property the whole design turns on. A crash between the
    // two writes must leave the recipient exactly as they were: untold, and
    // unrecorded, so the next pass tries again.
    const broken = fakeClient({ notificationFails: true });
    expect((await deliverOnce(broken.client, RECORD, CONTENT)).kind).toBe("FAILED");
    const stillUnrecorded = await recordedRecipients(
      broken.client.executiveReportDelivery as { findMany(a: unknown): Promise<Array<Record<string, unknown>>> },
      { organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 1 },
    );
    expect(stillUnrecorded.size).toBe(0);
    // And a later, healthy pass delivers.
    const healthy = fakeClient();
    expect((await deliverOnce(healthy.client, RECORD, CONTENT)).kind).toBe("SENT");
    expect(healthy.committed.notifications).toHaveLength(1);
  });

  it("rolls the notification back when the record loses the unique constraint", async () => {
    // Two replicas, one recipient. The loser's notification must not survive
    // its rolled-back claim, or the recipient is told twice.
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect(fake.committed.notifications).toHaveLength(1);
    const second = await deliverOnce(fake.client, RECORD, CONTENT);
    expect(second.kind).toBe("ALREADY");
    expect(fake.committed.notifications).toHaveLength(1);
    expect(fake.committed.deliveries).toHaveLength(1);
  });

  it("lets exactly one of three concurrent attempts through", async () => {
    const outcomes = await Promise.all([
      deliverOnce(fake.client, RECORD, CONTENT),
      deliverOnce(fake.client, RECORD, CONTENT),
      deliverOnce(fake.client, RECORD, CONTENT),
    ]);
    expect(outcomes.filter(o => o.kind === "SENT")).toHaveLength(1);
    expect(outcomes.filter(o => o.kind === "ALREADY")).toHaveLength(2);
    expect(fake.committed.notifications).toHaveLength(1);
    expect(fake.committed.deliveries).toHaveLength(1);
  });

  it("keeps FAILED and ALREADY apart", async () => {
    // "Already told" and "could not tell" must never collapse: one means
    // stop, the other means try again.
    const broken = fakeClient({ notificationFails: true });
    expect((await deliverOnce(broken.client, RECORD, CONTENT)).kind).toBe("FAILED");
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("ALREADY");
  });
});

/**
 * WHICH unique violation was it?
 *
 * Reading every P2002 as "already delivered" was wrong in a way that is
 * silent and permanent. A unique violation raised by the NOTIFICATION insert
 * — a primary-key collision, or any constraint a later release adds to that
 * table — would be reported as ALREADY, the recipient would be skipped by
 * every later pass, and no ledger row would exist to show it. The recipient
 * is simply never told, and nothing anywhere records that.
 *
 * So only THIS table's idempotency key means "already delivered", and
 * anything the classifier cannot positively identify is a retryable failure.
 * Failing in that direction costs a repeated attempt the unique index
 * refuses anyway; failing in the other direction costs the announcement.
 */
describe("only this table's idempotency key means ALREADY", () => {
  /** Drives deliverOnce against a client whose ledger insert throws `err`. */
  async function withLedgerError(err: unknown) {
    const seen = { deliveries: 0, notifications: 0 };
    const client: DeliveryClient = {
      async $transaction(fn) {
        return fn({
          notification: {
            async create() {
              seen.notifications += 1;
              return { id: "ntf-1", userId: RECIPIENT.userId, createdAt: new Date().toISOString() };
            },
          },
          executiveReportDelivery: {
            async create() {
              seen.deliveries += 1;
              throw err;
            },
          },
        });
      },
    };
    return { outcome: await deliverOnce(client, RECORD, CONTENT), seen };
  }

  it("reads the CONSTRAINT NAME form the pg driver adapter reports", async () => {
    const { outcome } = await withLedgerError(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { modelName: "ExecutiveReportDelivery", target: LEDGER_INDEX },
      }),
    );
    expect(outcome.kind).toBe("ALREADY");
  });

  it("reads the FIELD NAME form the binary engine reports, in any order", async () => {
    const { outcome } = await withLedgerError(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: {
          modelName: "ExecutiveReportDelivery",
          target: ["reportVersion", "organizationId", "userId", "businessDate"],
        },
      }),
    );
    expect(outcome.kind).toBe("ALREADY");
  });

  it("does NOT read a Notification conflict as ALREADY", async () => {
    // The whole point: this recipient was never told and nothing was
    // recorded, so the next pass must try again.
    const conflicted = fakeClient({ notificationConflict: true });
    const outcome = await deliverOnce(conflicted.client, RECORD, CONTENT);
    expect(outcome.kind).toBe("FAILED");
    expect(outcome.kind === "FAILED" && outcome.reason).toContain("Notification_pkey");
    // Neither row exists.
    expect(conflicted.committed.deliveries).toHaveLength(0);
    expect(conflicted.committed.notifications).toHaveLength(0);
    // And the recipient is still deliverable.
    const retry = fakeClient();
    expect((await deliverOnce(retry.client, RECORD, CONTENT)).kind).toBe("SENT");
    expect(retry.committed.deliveries).toHaveLength(1);
  });

  it("does NOT read a conflict on another MODEL as ALREADY", async () => {
    const { outcome } = await withLedgerError(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { modelName: "ExecutiveDailyReport", target: LEDGER_INDEX },
      }),
    );
    expect(outcome.kind).toBe("FAILED");
  });

  it("does NOT read an UNIDENTIFIED conflict as ALREADY", async () => {
    // Fail closed: a P2002 that names nothing could be any constraint, and
    // guessing "already delivered" is the one guess that loses a recipient.
    for (const meta of [undefined, {}, { target: "SomeOtherTable_key" }, { target: [] }]) {
      const { outcome } = await withLedgerError(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta }),
      );
      expect(outcome.kind).toBe("FAILED");
    }
  });

  it("still reads a genuine ledger conflict as ALREADY, through the full client", async () => {
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("ALREADY");
  });
});

/**
 * A SIDE EFFECT THAT FAILS AFTER THE COMMIT.
 *
 * The logger line, the real-time push and the usage record all happen once
 * both rows are on disk. If one of them fails, the delivery has still
 * happened: the person has a notification and the ledger says so. Calling
 * that FAILED would make the next pass retry a recipient who was already
 * told, and the only thing standing between that and a duplicate
 * announcement would be the unique index refusing the retry.
 */
describe("a failed side effect does not undo a durable delivery", () => {
  it("still reports SENT, keeps both rows, and flags the side effect", async () => {
    sideEffects.broadcastToUser.mockImplementationOnce(() => {
      throw new Error("sse transport is down");
    });
    const outcome = await deliverOnce(fake.client, RECORD, CONTENT);
    expect(outcome.kind).toBe("SENT");
    expect(outcome.kind === "SENT" && outcome.sideEffectFailed).toBe(true);
    expect(fake.committed.deliveries).toHaveLength(1);
    expect(fake.committed.notifications).toHaveLength(1);
  });

  it("reports the side-effect failure separately, on its own log line", async () => {
    sideEffects.broadcastToUser.mockImplementationOnce(() => {
      throw new Error("sse transport is down");
    });
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect(sideEffects.error).toHaveBeenCalledTimes(1);
    expect(String(sideEffects.error.mock.calls[0]?.[0])).toContain("side effect failed");
  });

  it("does not produce a SECOND notification when the pass runs again", async () => {
    sideEffects.broadcastToUser.mockImplementationOnce(() => {
      throw new Error("sse transport is down");
    });
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("SENT");
    // The retry a worker would make. It must lose.
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("ALREADY");
    expect(fake.committed.notifications).toHaveLength(1);
    expect(fake.committed.deliveries).toHaveLength(1);
  });

  it("survives a rejected usage-metering call without an unhandled rejection", async () => {
    sideEffects.recordUsage.mockRejectedValueOnce(new Error("metering is down"));
    const outcome = await deliverOnce(fake.client, RECORD, CONTENT);
    expect(outcome.kind).toBe("SENT");
    expect(fake.committed.deliveries).toHaveLength(1);
    // Let the rejection settle; it must have been handled, not thrown.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sideEffects.error).toHaveBeenCalled();
  });

  it("reports no side-effect failure when everything gets through", async () => {
    const outcome = await deliverOnce(fake.client, RECORD, CONTENT);
    expect(outcome.kind === "SENT" && outcome.sideEffectFailed).toBe(false);
    expect(sideEffects.error).not.toHaveBeenCalled();
  });
});

describe("a correction, and another night, are their own deliveries", () => {
  it("accepts the same recipient for report version 2", async () => {
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect((await deliverOnce(fake.client, { ...RECORD, reportVersion: 2 }, CONTENT)).kind).toBe("SENT");
    expect(fake.committed.deliveries).toHaveLength(2);
  });

  it("accepts the same recipient for another business date", async () => {
    await deliverOnce(fake.client, RECORD, CONTENT);
    expect((await deliverOnce(fake.client, { ...RECORD, businessDate: "2026-10-15" }, CONTENT)).kind).toBe("SENT");
  });
});

describe("tenant isolation", () => {
  it("lets two organizations record the same recipient for the same night", async () => {
    expect((await deliverOnce(fake.client, RECORD, CONTENT)).kind).toBe("SENT");
    expect((await deliverOnce(fake.client, { ...RECORD, organizationId: "org-b" }, CONTENT)).kind).toBe("SENT");
    expect(fake.committed.deliveries).toHaveLength(2);
  });

  it("never returns another organization's deliveries", async () => {
    await deliverOnce(fake.client, RECORD, CONTENT);
    await deliverOnce(
      fake.client,
      { ...RECORD, organizationId: "org-b", recipient: { ...RECIPIENT, userId: "user-b" } },
      CONTENT,
    );
    const mine = await recordedRecipients(
      fake.client.executiveReportDelivery as { findMany(a: unknown): Promise<Array<Record<string, unknown>>> },
      { organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 1 },
    );
    expect([...mine]).toEqual(["user-owner"]);
  });

  it("scopes the read by organization, date AND version", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await recordedRecipients(
      {
        async findMany(args: unknown) {
          seen.push((args as { where: Record<string, unknown> }).where);
          return [];
        },
      },
      { organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 3 },
    );
    expect(seen[0]).toEqual({ organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 3 });
  });
});

describe("an unreadable ledger fails safe", () => {
  it("returns an empty set rather than claiming nobody was told", async () => {
    // Reading "nobody recorded" out of a failed read would be the same
    // mistake as reading a zero-row query as "no duplicates". The caller
    // still attempts each recipient, and the unique constraint still decides.
    const seen = await recordedRecipients(
      {
        async findMany() {
          throw new Error("relation does not exist");
        },
      },
      { organizationId: "org-a", businessDate: "2026-10-14", reportVersion: 1 },
    );
    expect(seen.size).toBe(0);
  });
});
