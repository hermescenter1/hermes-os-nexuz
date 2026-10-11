/**
 * Digital Twin Slice 1 repair (RV-04) — a rolled-back mutation must leave no
 * observable audit event, in the database OR in the in-process buffer.
 *
 * Runs the REAL audit-service and the REAL `runTwinTransaction` / `auditInTx`
 * against a fake Prisma whose `$transaction` can be told to fail in each of the
 * ways a real one can. The real-PostgreSQL counterpart is in `pg/`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaState = vi.hoisted(() => ({
  client: null as null | { $transaction: (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => Promise<unknown> },
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => prismaState.client }));

const loggerState = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), fatal: vi.fn(), error: loggerState.error },
}));

import { persistAuditEventInTx, publishAuditEvent } from "@/lib/audit/audit-service";
import { POST_COMMIT_PUBLISH_FAILED_CODE, auditInTx, runTwinTransaction, type TwinTx } from "../tx";

type BufferEvent = { entityId: string | null; outcome: string | null; action: string };
const g = globalThis as unknown as { __hermesAudit?: BufferEvent[] };
const buffer = () => g.__hermesAudit ?? [];

interface FakeTxOptions { auditCreate?: () => Promise<unknown>; withAuditModel?: boolean }
function fakeTx(opts: FakeTxOptions = {}) {
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    ...(opts.withAuditModel === false
      ? {}
      : {
          auditLog: {
            create: vi.fn(async (a: { data: Record<string, unknown> }) => {
              if (opts.auditCreate) await opts.auditCreate();
              created.push(a.data);
              return a.data;
            }),
          },
        }),
  };
  return { tx, created };
}

/** A fake `$transaction`: runs the callback, then optionally fails the COMMIT. */
function installTransaction(behaviour: { failCommit?: boolean; txOptions?: FakeTxOptions } = {}) {
  const calls: Array<{ created: Array<Record<string, unknown>> }> = [];
  prismaState.client = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const { tx, created } = fakeTx(behaviour.txOptions);
      calls.push({ created });
      const out = await fn(tx);
      if (behaviour.failCommit) throw new Error("commit failed: could not serialize access");
      return out;
    }),
  };
  return calls;
}

const input = (entityId: string) => ({
  organizationId: "org-1",
  userId: "user-1",
  action: "digital_twin.node.created",
  entityId,
  siteId: "site-1",
  details: { nodeType: "AREA" },
});

let savedMode: string | undefined;
beforeEach(() => {
  loggerState.error.mockReset();
  g.__hermesAudit = [];
  savedMode = process.env.HERMES_STORAGE_MODE;
  process.env.HERMES_STORAGE_MODE = "database";
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.HERMES_STORAGE_MODE;
  else process.env.HERMES_STORAGE_MODE = savedMode;
  prismaState.client = null;
});

describe("persistAuditEventInTx / publishAuditEvent — the two halves", () => {
  it("persist writes the canonical row on the supplied client and does NOT touch the buffer", async () => {
    const { tx, created } = fakeTx();
    const event = await persistAuditEventInTx(
      { userId: "u1", action: "a.b", entityType: "digital_twin", entityId: "e1", organizationId: "org-1", outcome: "success", metadata: { k: 1 }, correlationId: "c1" },
      tx,
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      userId: "u1", action: "a.b", entityType: "digital_twin", entityId: "e1",
      metadata: { k: 1 }, organizationId: "org-1", outcome: "success", correlationId: "c1",
    });
    expect(event).toMatchObject({ entityId: "e1", outcome: "success", organizationId: "org-1" });
    expect(buffer()).toHaveLength(0);
  });

  it("a failing insert rejects and leaves the buffer untouched", async () => {
    const { tx } = fakeTx({ auditCreate: async () => { throw new Error("insert failed"); } });
    await expect(persistAuditEventInTx({ action: "a", entityType: "t", entityId: "e" }, tx)).rejects.toThrow("insert failed");
    expect(buffer()).toHaveLength(0);
  });

  it("no audit model on the client in database mode → AUDIT_MODEL_UNAVAILABLE, buffer untouched", async () => {
    const { tx } = fakeTx({ withAuditModel: false });
    await expect(persistAuditEventInTx({ action: "a", entityType: "t", entityId: "e" }, tx)).rejects.toThrow("AUDIT_MODEL_UNAVAILABLE");
    await expect(persistAuditEventInTx({ action: "a", entityType: "t", entityId: "e" }, null)).rejects.toThrow("AUDIT_MODEL_UNAVAILABLE");
    expect(buffer()).toHaveLength(0);
  });

  it("session mode has nothing durable to write: no insert, event returned, buffer untouched", async () => {
    process.env.HERMES_STORAGE_MODE = "session";
    const { tx, created } = fakeTx();
    const event = await persistAuditEventInTx({ action: "a", entityType: "t", entityId: "e" }, tx);
    expect(created).toHaveLength(0);
    expect(event.entityId).toBe("e");
    expect(buffer()).toHaveLength(0);
  });

  it("publish appends newest-first and keeps the buffer capped at 500", () => {
    for (let i = 0; i < 505; i++) {
      publishAuditEvent({ id: `i${i}`, userId: null, action: "a", entityType: "t", entityId: `e${i}`, metadata: {}, createdAt: "x", organizationId: null, outcome: null, correlationId: null });
    }
    expect(buffer()).toHaveLength(500);
    expect(buffer()[0].entityId).toBe("e504");
  });
});

describe("runTwinTransaction — publication happens only after COMMIT", () => {
  it("a committed transaction publishes its events, once, after it resolves", async () => {
    const calls = installTransaction();
    let bufferInsideCallback = -1;
    const out = await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("node-1"));
      bufferInsideCallback = buffer().length; // still inside the transaction
      return "done";
    });
    expect(out).toBe("done");
    expect(calls[0].created).toHaveLength(1);              // the row was written in the tx
    expect(bufferInsideCallback).toBe(0);                  // …but not published yet
    expect(buffer()).toHaveLength(1);                      // published after commit
    expect(buffer()[0]).toMatchObject({ entityId: "node-1", outcome: "success", action: "digital_twin.node.created" });
  });

  it("several events in one transaction are all published, newest first, only after commit", async () => {
    installTransaction();
    await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("a"));
      await auditInTx(tx, input("b"));
    });
    expect(buffer().map((e) => e.entityId)).toEqual(["b", "a"]);
  });

  it("the callback throwing AFTER the audit was persisted publishes nothing", async () => {
    installTransaction();
    await expect(
      runTwinTransaction(async (tx: TwinTx) => {
        await auditInTx(tx, input("rolled-back"));
        throw new Error("a later statement failed");
      }),
    ).rejects.toThrow("a later statement failed");
    expect(buffer()).toHaveLength(0);
  });

  it("the audit INSERT failing publishes nothing and propagates (the mutation rolls back)", async () => {
    installTransaction({ txOptions: { auditCreate: async () => { throw new Error("audit store down"); } } });
    await expect(runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("x")); })).rejects.toThrow("audit store down");
    expect(buffer()).toHaveLength(0);
  });

  it("a COMMIT failure after the callback returned publishes nothing", async () => {
    installTransaction({ failCommit: true });
    await expect(runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("never-committed")); })).rejects.toThrow("commit failed");
    expect(buffer()).toHaveLength(0);
  });

  it("a failure followed by a successful retry leaves exactly the real event", async () => {
    installTransaction({ failCommit: true });
    await expect(runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("attempt-1")); })).rejects.toThrow();
    installTransaction();
    await runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("attempt-2")); });
    expect(buffer().map((e) => e.entityId)).toEqual(["attempt-2"]);
  });

  it("no database → null, nothing published", async () => {
    prismaState.client = null;
    expect(await runTwinTransaction(async () => "x")).toBeNull();
    expect(buffer()).toHaveLength(0);
  });

  it("concurrent transactions do not leak events into each other", async () => {
    installTransaction();
    const results = await Promise.allSettled([
      runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("ok-1")); }),
      runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("fails")); throw new Error("boom"); }),
      runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("ok-2")); }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(buffer().map((e) => e.entityId).sort()).toEqual(["ok-1", "ok-2"]);
  });
});

/**
 * FR-01 — DATABASE_COMMIT_IS_AUTHORITATIVE. Once the transaction has committed,
 * a failure of the in-process publication (or of the logger reporting it) must
 * never turn the committed mutation into an error.
 */
describe("FR-01 — post-commit publication failure never escapes runTwinTransaction", () => {
  /** A buffer whose `unshift` throws for the listed call numbers (1-based) and otherwise behaves normally. */
  function flakyBuffer(failOnCalls: number[]) {
    const arr: BufferEvent[] = [];
    const attempts: string[] = [];
    const real = arr.unshift.bind(arr) as (...items: BufferEvent[]) => number;
    let n = 0;
    (arr as unknown as { unshift: (...items: BufferEvent[]) => number }).unshift = (...items) => {
      n += 1;
      attempts.push(String(items[0]?.entityId));
      if (failOnCalls.includes(n)) throw new TypeError("buffer unavailable");
      return real(...items);
    };
    g.__hermesAudit = arr;
    return { arr, attempts };
  }

  it("frozen buffer: the committed result is still returned, the row was written once, one fixed-code log", async () => {
    const calls = installTransaction();
    g.__hermesAudit = Object.freeze([]) as unknown as BufferEvent[];
    const out = await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("node-frozen"));
      return "created";
    });
    expect(out).toBe("created");
    expect(calls).toHaveLength(1);                       // one transaction, never re-run
    expect(calls[0].created).toHaveLength(1);            // exactly one audit row
    expect(loggerState.error).toHaveBeenCalledTimes(1);
    expect(loggerState.error).toHaveBeenCalledWith(POST_COMMIT_PUBLISH_FAILED_CODE); // code only: no meta, no reqId
    expect(POST_COMMIT_PUBLISH_FAILED_CODE).toBe("DIGITAL_TWIN_POST_COMMIT_AUDIT_BUFFER_PUBLISH_FAILED");
  });

  it("the log line carries no event data, error text or secret", async () => {
    installTransaction();
    g.__hermesAudit = Object.freeze([]) as unknown as BufferEvent[];
    await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, { ...input("node-secret"), details: { token: "s3cr3t-fr01-value", note: "payload-marker" } });
    });
    const logged = JSON.stringify(loggerState.error.mock.calls);
    expect(logged).not.toContain("s3cr3t-fr01-value");
    expect(logged).not.toContain("payload-marker");
    expect(logged).not.toContain("node-secret");
    expect(logged).not.toContain("buffer unavailable");
    expect(loggerState.error.mock.calls.every((c) => c.length === 1)).toBe(true);
  });

  it("a logger that itself throws is swallowed: the committed result is still returned", async () => {
    const calls = installTransaction();
    g.__hermesAudit = Object.freeze([]) as unknown as BufferEvent[];
    loggerState.error.mockImplementation(() => { throw new Error("logger sink down"); });
    const out = await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("node-logger-down"));
      return "created";
    });
    expect(out).toBe("created");
    expect(calls[0].created).toHaveLength(1);
    expect(loggerState.error).toHaveBeenCalledTimes(1);
  });

  it("multi-event: the first event failing does not stop the later ones; order kept, no duplicates", async () => {
    const calls = installTransaction();
    const { arr, attempts } = flakyBuffer([1]);          // only the FIRST publication fails
    const out = await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("a"));
      await auditInTx(tx, input("b"));
      await auditInTx(tx, input("c"));
      return "ok";
    });
    expect(out).toBe("ok");
    expect(calls[0].created).toHaveLength(3);            // all three rows committed
    expect(attempts).toEqual(["a", "b", "c"]);           // attempted in the order they were produced, once each
    expect(arr.map((e) => e.entityId)).toEqual(["c", "b"]); // b, c published newest-first; a is the failed one
    expect(new Set(arr.map((e) => e.entityId)).size).toBe(arr.length); // no duplicates
    expect(loggerState.error).toHaveBeenCalledTimes(1);
  });

  it("multi-event: a failure in the middle and at the end is isolated per event", async () => {
    installTransaction();
    const { arr, attempts } = flakyBuffer([2, 3]);
    await runTwinTransaction(async (tx: TwinTx) => {
      await auditInTx(tx, input("a"));
      await auditInTx(tx, input("b"));
      await auditInTx(tx, input("c"));
    });
    expect(attempts).toEqual(["a", "b", "c"]);
    expect(arr.map((e) => e.entityId)).toEqual(["a"]);
    expect(loggerState.error).toHaveBeenCalledTimes(2);
  });

  it("a failed publication is never retried or duplicated by the transaction wrapper", async () => {
    const calls = installTransaction();
    const { attempts } = flakyBuffer([1]);
    await runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("only")); });
    expect(calls).toHaveLength(1);
    expect(attempts).toEqual(["only"]);
  });

  it("a re-send by the caller is an independent request (no idempotency is claimed)", async () => {
    const calls = installTransaction();
    g.__hermesAudit = Object.freeze([]) as unknown as BufferEvent[];
    const run = (id: string) => runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input(id)); return id; });
    expect(await run("first")).toBe("first");            // success: the client has no reason to retry
    expect(await run("second")).toBe("second");          // an explicit second request is its own transaction
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.created.length)).toEqual([1, 1]);
  });

  it("commit failure: nothing is published and the publication path is not even attempted", async () => {
    installTransaction({ failCommit: true });
    const { attempts } = flakyBuffer([]);
    await expect(runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("x")); })).rejects.toThrow("commit failed");
    expect(attempts).toEqual([]);
    expect(loggerState.error).not.toHaveBeenCalled();
  });

  it("rollback (callback throws after the audit insert): nothing is published or logged", async () => {
    installTransaction();
    const { attempts } = flakyBuffer([]);
    await expect(
      runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("x")); throw new Error("later statement failed"); }),
    ).rejects.toThrow("later statement failed");
    expect(attempts).toEqual([]);
    expect(loggerState.error).not.toHaveBeenCalled();
  });

  it("audit INSERT failure still propagates (rollback): the publication guard never masks a database failure", async () => {
    installTransaction({ txOptions: { auditCreate: async () => { throw new Error("audit store down"); } } });
    const { attempts } = flakyBuffer([]);
    await expect(runTwinTransaction(async (tx: TwinTx) => { await auditInTx(tx, input("x")); })).rejects.toThrow("audit store down");
    expect(attempts).toEqual([]);
    expect(loggerState.error).not.toHaveBeenCalled();
  });
});
