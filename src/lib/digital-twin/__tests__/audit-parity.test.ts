/**
 * FR-03 — parity between the two audit construction paths.
 *
 * `recordAuditEventOrThrow` (legacy, Phase 109 — buffer first) and
 * `persistAuditEventInTx` (Digital Twin, written inside the caller's transaction)
 * build the audit event and the persisted row independently. They are intentionally
 * separate, so this test is what stops them drifting apart: for identical input both
 * must produce the same event and the same persisted columns.
 *
 * `id` and `createdAt` are generated per call, so they are compared by SHAPE, not by value.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  persistAuditEventInTx,
  recordAuditEventOrThrow,
  type AuditEvent,
  type AuditInput,
} from "@/lib/audit/audit-service";

type Row = Record<string, unknown>;
const g = globalThis as unknown as { __hermesAudit?: AuditEvent[] };

function fakeClient() {
  const created: Row[] = [];
  return { created, client: { auditLog: { create: async (a: { data: Row }) => { created.push(a.data); return a.data; } } } };
}

/** The event + persisted row the LEGACY path produces. */
async function viaLegacy(input: AuditInput) {
  g.__hermesAudit = [];
  const { client, created } = fakeClient();
  await recordAuditEventOrThrow(input, client);
  return { event: (g.__hermesAudit ?? [])[0], rows: created };
}

/** The event + persisted row the NEW (in-transaction) path produces. */
async function viaTx(input: AuditInput) {
  g.__hermesAudit = [];
  const { client, created } = fakeClient();
  const event = await persistAuditEventInTx(input, client);
  return { event, rows: created, bufferAfter: (g.__hermesAudit ?? []).length };
}

/** The event minus its two generated fields (`id`, `createdAt`), which are compared by shape instead. */
function withoutVolatile(event: AuditEvent): Partial<AuditEvent> {
  const copy: Partial<AuditEvent> = { ...event };
  delete copy.id;
  delete copy.createdAt;
  return copy;
}

const CASES: Array<[string, AuditInput]> = [
  ["every field populated", {
    userId: "user-1", action: "digital_twin.node.created", entityType: "digital_twin", entityId: "node-1",
    metadata: { organizationId: "org-1", siteId: "site-1", nested: { a: [1, 2, { b: null }] } },
    organizationId: "org-1", outcome: "success", correlationId: "corr-1",
  }],
  ["only the required fields (every optional one omitted)", { action: "a.b", entityType: "t" }],
  ["optional fields explicitly null", {
    userId: null, action: "a.b", entityType: "t", entityId: null, organizationId: null, outcome: null, correlationId: null,
  }],
  ["optional fields explicitly undefined", {
    userId: undefined, action: "a.b", entityType: "t", entityId: undefined, metadata: undefined,
    organizationId: undefined, outcome: undefined, correlationId: undefined,
  }],
  ["empty metadata object", { action: "a.b", entityType: "t", metadata: {} }],
  ["empty strings are kept, not coerced to null", { userId: "", action: "a.b", entityType: "t", entityId: "", organizationId: "", outcome: "", correlationId: "" }],
  ["a non-success outcome", { action: "site.access.denied", entityType: "site", entityId: "s1", outcome: "denied", organizationId: "org-9" }],
];

let savedMode: string | undefined;
beforeEach(() => {
  savedMode = process.env.HERMES_STORAGE_MODE;
  process.env.HERMES_STORAGE_MODE = "database";
});
afterEach(() => {
  if (savedMode === undefined) delete process.env.HERMES_STORAGE_MODE;
  else process.env.HERMES_STORAGE_MODE = savedMode;
  g.__hermesAudit = [];
});

describe("FR-03 — recordAuditEventOrThrow vs persistAuditEventInTx", () => {
  it.each(CASES)("%s: same event and same persisted columns", async (_name, input) => {
    const legacy = await viaLegacy(input);
    const tx = await viaTx(input);

    expect(legacy.rows).toHaveLength(1);
    expect(tx.rows).toHaveLength(1);
    // The persisted row: identical columns and values (null/default handling included).
    expect(tx.rows[0]).toEqual(legacy.rows[0]);
    // The event: identical apart from the two generated fields.
    expect(withoutVolatile(tx.event)).toEqual(withoutVolatile(legacy.event));
  });

  it("the persisted row has exactly the eight audit columns, in both paths (drift guard)", async () => {
    const input: AuditInput = { userId: "u", action: "a.b", entityType: "t", entityId: "e", metadata: { k: 1 }, organizationId: "o", outcome: "success", correlationId: "c" };
    const columns = ["action", "correlationId", "entityId", "entityType", "metadata", "organizationId", "outcome", "userId"];
    expect(Object.keys((await viaLegacy(input)).rows[0]).sort()).toEqual(columns);
    expect(Object.keys((await viaTx(input)).rows[0]).sort()).toEqual(columns);
  });

  it("the event has exactly the ten AuditEvent fields, in both paths (drift guard)", async () => {
    const input: AuditInput = { action: "a.b", entityType: "t" };
    const fields = ["action", "correlationId", "createdAt", "entityId", "entityType", "id", "metadata", "organizationId", "outcome", "userId"];
    expect(Object.keys((await viaLegacy(input)).event).sort()).toEqual(fields);
    expect(Object.keys((await viaTx(input)).event).sort()).toEqual(fields);
  });

  it("id and createdAt have the same SHAPE in both paths", async () => {
    const input: AuditInput = { action: "a.b", entityType: "t" };
    const shape = (e: AuditEvent) => {
      expect(e.id).toMatch(/^audit-\d+-[a-z0-9]{1,5}$/);
      expect(typeof e.createdAt).toBe("string");
      expect(new Date(e.createdAt).toISOString()).toBe(e.createdAt); // a valid ISO-8601 instant
    };
    shape((await viaLegacy(input)).event);
    shape((await viaTx(input)).event);
  });

  it("missing optional values become null (never undefined), metadata defaults to {}", async () => {
    const { event, rows } = await viaTx({ action: "a.b", entityType: "t" });
    expect(event).toMatchObject({ userId: null, entityId: null, organizationId: null, outcome: null, correlationId: null, metadata: {} });
    expect(rows[0]).toEqual({ userId: null, action: "a.b", entityType: "t", entityId: null, metadata: {}, organizationId: null, outcome: null, correlationId: null });
  });

  it("session mode: neither path writes a row, both still describe the same event", async () => {
    process.env.HERMES_STORAGE_MODE = "session";
    const input: AuditInput = { userId: "u", action: "a.b", entityType: "t", entityId: "e", organizationId: "o", outcome: "success", correlationId: "c", metadata: { k: 1 } };
    const legacy = await viaLegacy(input);
    const tx = await viaTx(input);
    expect(legacy.rows).toHaveLength(0);
    expect(tx.rows).toHaveLength(0);
    expect(withoutVolatile(tx.event)).toEqual(withoutVolatile(legacy.event));
  });

  it("both paths refuse the same way when the client has no audit model in database mode", async () => {
    const input: AuditInput = { action: "a.b", entityType: "t" };
    await expect(recordAuditEventOrThrow(input, {})).rejects.toThrow("AUDIT_MODEL_UNAVAILABLE");
    await expect(persistAuditEventInTx(input, {})).rejects.toThrow("AUDIT_MODEL_UNAVAILABLE");
  });

  it("both paths propagate an insert failure unchanged", async () => {
    const failing = { auditLog: { create: async () => { throw new Error("insert failed"); } } };
    const input: AuditInput = { action: "a.b", entityType: "t" };
    g.__hermesAudit = [];
    await expect(recordAuditEventOrThrow(input, failing)).rejects.toThrow("insert failed");
    await expect(persistAuditEventInTx(input, failing)).rejects.toThrow("insert failed");
  });

  it("the one INTENDED difference: the legacy path buffers first, the new path never touches the buffer", async () => {
    const input: AuditInput = { action: "a.b", entityType: "t", entityId: "e" };
    g.__hermesAudit = [];
    await recordAuditEventOrThrow(input, fakeClient().client);
    expect(g.__hermesAudit).toHaveLength(1);
    expect((await viaTx(input)).bufferAfter).toBe(0);
  });
});
