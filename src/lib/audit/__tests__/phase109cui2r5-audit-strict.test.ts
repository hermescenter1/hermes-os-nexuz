/**
 * PHASE 109-C-UI.2-R5 — `recordAuditEventOrThrow`, tested directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE HAD TO EXIST
 * ─────────────────────────────────────────────────────────────────────────────
 * The route suite mocks the strict recorder in order to drive the fail-closed
 * path, which is the right thing for testing the ROUTE — but it means mutating
 * the recorder's real implementation changes nothing there. The M12 control
 * (make the strict recorder swallow again, exactly as R4 found the loose one
 * doing) SURVIVED the whole in-process battery for that reason.
 *
 * A protection nobody's tests depend on is a protection nobody is testing. So
 * the recorder is exercised here against its own fake client, with no route in
 * the way, and M12 now has something to break.
 *
 * The distinction under test is narrow and load-bearing: `recordAuditEvent`
 * MUST keep swallowing — dozens of callers depend on an audit failure never
 * breaking their request — while `recordAuditEventOrThrow` MUST NOT.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  /** null = no client at all; "throw" = the insert fails. */
  mode: "ok" as "ok" | "throw" | "no-client",
  written: [] as Row[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.mode === "no-client"
      ? null
      : {
          auditLog: {
            create: async (q: { data: Row }) => {
              if (h.mode === "throw") {
                // The shape PostgreSQL actually produced in R4: a foreign-key
                // violation on AuditLog.userId, which the loose recorder
                // discarded so quietly that the rows simply never appeared.
                const e = new Error(
                  'insert or update on table "AuditLog" violates foreign key constraint "AuditLog_userId_fkey"',
                ) as Error & { code?: string };
                e.code = "23503";
                throw e;
              }
              h.written.push(q.data);
              return q.data;
            },
            /*
              In "throw" mode the READ fails too. That matters: my first version
              returned [] here, so `findAuditEventsByCorrelation` reported a
              successful empty database read and never reached the in-process
              fallback — the two buffer assertions below were passing judgement
              on a path they never entered. A database that cannot accept a
              write is usually not serving reads either, and the fallback exists
              for exactly that state.
            */
            findMany: async () => {
              if (h.mode === "throw") throw new Error("read failed too");
              return [];
            },
          },
        },
}));

vi.mock("@/lib/storage/storage-mode", () => ({
  getStorageMode: () => "database",
  isDatabaseMode: () => true,
}));

const { recordAuditEvent, recordAuditEventOrThrow, findAuditEventsByCorrelation } = await import(
  "@/lib/audit/audit-service"
);

/**
 * Read the in-process buffer, not the database.
 *
 * `findAuditEventsByCorrelation` prefers the database and falls back to the
 * buffer when the model throws — which is exactly the state these two tests
 * create, so the fallback is the path under test.
 */
const buffered = async (correlationId: string) =>
  (await findAuditEventsByCorrelation(correlationId)).events;

const input = {
  action: "industrial.automation.run.organisation_wide",
  entityType: "industrial",
  entityId: "run-1",
  organizationId: "org-a",
  userId: "user-1",
  outcome: "success",
  correlationId: "iar_test",
  metadata: { requestId: "iar_test", counters: { assetsProcessed: 2 } },
};

beforeEach(() => {
  h.mode = "ok";
  h.written = [];
});

describe("R5 · recordAuditEventOrThrow", () => {
  it("persists the event with every field it was given", async () => {
    await recordAuditEventOrThrow(input);
    expect(h.written).toHaveLength(1);
    const w = h.written[0];
    expect(w.action).toBe(input.action);
    expect(w.organizationId).toBe("org-a");
    expect(w.userId).toBe("user-1");
    expect(w.outcome).toBe("success");
    expect(w.correlationId).toBe("iar_test");
    expect(w.metadata).toEqual(input.metadata);
  });

  it("THROWS when the insert fails — this is the whole point", async () => {
    h.mode = "throw";
    await expect(recordAuditEventOrThrow(input)).rejects.toThrow(/AuditLog_userId_fkey/);
  });

  it("throws when there is no client at all in database mode", async () => {
    // "No model" is not "nothing to do": in database mode it means the write
    // could not even be attempted, which is exactly what must not pass silently.
    h.mode = "no-client";
    await expect(recordAuditEventOrThrow(input)).rejects.toThrow("AUDIT_MODEL_UNAVAILABLE");
  });

  it("writes through an injected client — the transaction case", async () => {
    const tx = { auditLog: { create: vi.fn(async (q: { data: Row }) => q.data) } };
    await recordAuditEventOrThrow(input, tx);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    // The ambient client must not have been used when a transaction was given.
    expect(h.written).toHaveLength(0);
  });

  it("still records the attempt in the in-process buffer when persistence throws", async () => {
    // A throwing persistence failure must not also erase the running session's
    // view of what was attempted.
    h.mode = "throw";
    await recordAuditEventOrThrow({ ...input, entityId: "run-buffered" }).catch(() => undefined);
    const events = await buffered("iar_test");
    expect(events.some((e) => e.entityId === "run-buffered")).toBe(true);
  });
});

describe("R5 · recordAuditEvent keeps its best-effort contract", () => {
  it("does NOT throw when the insert fails", async () => {
    // Deliberate asymmetry. Changing this globally would alter behaviour for
    // every caller in the product, which no brief has asked for; the strict
    // variant exists precisely so one endpoint can opt in.
    h.mode = "throw";
    await expect(recordAuditEvent(input)).resolves.toBeUndefined();
  });

  it("and still buffers the event in process", async () => {
    h.mode = "throw";
    await recordAuditEvent({ ...input, entityId: "loose-buffered" });
    const events = await buffered("iar_test");
    expect(events.some((e) => e.entityId === "loose-buffered")).toBe(true);
  });
});
