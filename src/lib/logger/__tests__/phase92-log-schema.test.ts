import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../index";
import { LOG_SCHEMA_VERSION, LOG_FIELDS, OUTCOMES, SEVERITIES, severityAtLeast } from "@/lib/observability/log-schema";

/**
 * PHASE 92 — versioned log schema + hardened redaction.
 *
 * Assertions read the REAL emitted JSON off process.stdout (the logger's actual
 * sink), never a mock's arguments, so they prove what an operator/log-shipper
 * would actually receive.
 */

function captureLogs(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines
    .join("")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("Phase 92 — structured-log schema", () => {
  const originalLevel = process.env.LOG_LEVEL;
  beforeEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = "DEBUG"; });
  afterEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = originalLevel; });

  it("stamps schemaVersion, service and environment on every line", () => {
    const [entry] = captureLogs(() => logger.info("hello", { operation: "test.op" }));
    expect(entry.schemaVersion).toBe(LOG_SCHEMA_VERSION);
    expect(entry.svc).toBe("hermes-os");
    expect(typeof entry.env).toBe("string");
    expect(entry.ts).toBeTypeOf("string");
    expect(entry.msg).toBe("hello");
    expect(entry.operation).toBe("test.op");
  });

  it("keeps the Phase 90 field names unchanged (no breaking rename)", () => {
    const [entry] = captureLogs(() => logger.warn("m", { event: "x", outcome: "denied" }, "req-abcdef12"));
    // The v1 contract: these exact keys must still be present.
    expect(entry[LOG_FIELDS.timestamp]).toBeTypeOf("string"); // "ts"
    expect(entry[LOG_FIELDS.level]).toBe("WARN");
    expect(entry[LOG_FIELDS.service]).toBe("hermes-os"); // "svc"
    expect(entry[LOG_FIELDS.requestId]).toBe("req-abcdef12"); // "reqId"
    expect(entry[LOG_FIELDS.message]).toBe("m"); // "msg"
  });

  it("the vocabularies are closed and ranked", () => {
    expect(OUTCOMES).toContain("success");
    expect(OUTCOMES).toContain("degraded");
    expect(SEVERITIES).toEqual(["info", "warning", "error", "critical"]);
    expect(severityAtLeast("critical", "error")).toBe(true);
    expect(severityAtLeast("info", "error")).toBe(false);
  });
});

describe("Phase 92 — hardened redaction", () => {
  const originalLevel = process.env.LOG_LEVEL;
  beforeEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = "DEBUG"; });
  afterEach(() => { (process.env as Record<string, string | undefined>).LOG_LEVEL = originalLevel; });

  it("unwraps an Error to {name,message} without a stack", () => {
    const err = new TypeError("connect ECONNREFUSED 10.0.0.5:5432");
    const [entry] = captureLogs(() => logger.error("boom", { cause: err }));
    const cause = entry.cause as Record<string, unknown>;
    expect(cause.name).toBe("TypeError");
    expect(cause.message).toContain("ECONNREFUSED");
    // A raw Error would have serialized to {} — losing the class/message.
    expect(Object.keys(cause)).toEqual(["name", "message"]);
    // No stack frames anywhere in the line.
    expect(JSON.stringify(entry)).not.toMatch(/at Object|\.ts:\d+|node_modules|redactError/);
  });

  it("redacts secrets nested arbitrarily deep, including inside arrays and Errors", () => {
    const [entry] = captureLogs(() =>
      logger.info("nested", {
        wrapper: { list: [{ password: "hunter2" }, { detail: { apiKey: "sk-live-xyz" } }] },
        // An Error whose message IS a JWT-shaped token — proves the Error's
        // message runs through value-level redaction (anchored, whole-string).
        boom: new Error("abc123def456.ghijkl.mnopqr"),
      }),
    );
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("sk-live-xyz");
    expect(raw).not.toContain("abc123def456.ghijkl.mnopqr");
    expect(raw).toContain("[REDACTED]");
    expect(raw).toContain("[REDACTED-JWT]");
  });

  it("does not infinite-loop on a circular reference", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", a };
    a.b = b; // cycle
    const entries = captureLogs(() => logger.info("cycle", { root: a }));
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).toContain("[CIRCULAR]");
  });

  it("renders a value shared across siblings (a DAG, not a cycle) rather than flagging it circular", () => {
    const shared = { safe: "value" };
    const [entry] = captureLogs(() => logger.info("dag", { left: shared, right: shared }));
    const meta = entry as Record<string, Record<string, unknown>>;
    expect(meta.left.safe).toBe("value");
    expect(meta.right.safe).toBe("value");
    expect(JSON.stringify(entry)).not.toContain("[CIRCULAR]");
  });

  it("truncates beyond the maximum depth instead of overflowing the stack", () => {
    // Build a chain deeper than MAX_REDACT_DEPTH (8).
    let deep: Record<string, unknown> = { bottom: "reached" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    const entries = captureLogs(() => logger.info("deep", { root: deep }));
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).toContain("[TRUNCATED]");
    // The sentinel value at the very bottom must never surface.
    expect(JSON.stringify(entries[0])).not.toContain("reached");
  });

  it("never throws even when serialization would fail (BigInt)", () => {
    expect(() =>
      captureLogs(() => logger.info("bigint", { n: BigInt(10) as unknown as number })),
    ).not.toThrow();
  });

  it("converts Date metadata to an ISO string instead of {}", () => {
    const [entry] = captureLogs(() => logger.info("dated", { at: new Date("2026-08-01T00:00:00.000Z") }));
    expect(entry.at).toBe("2026-08-01T00:00:00.000Z");
  });

  it("masks a JWT embedded MID-TEXT (e.g. Bearer eyJ…), not only a whole-string token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3IifQ.s1gnatureXYZ_abc";
    const [entry] = captureLogs(() => logger.error("infra", { detail: `Authorization: Bearer ${jwt} failed` }));
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain(jwt);
    expect(raw).toContain("[REDACTED-JWT]");
    expect(raw).toContain("failed"); // surrounding non-secret text preserved
  });

  it("renders a BigInt as a string rather than degrading the whole line", () => {
    const [entry] = captureLogs(() => logger.info("bigint", { n: BigInt(42) as unknown as number, operation: "op" }));
    expect(entry.n).toBe("42");
    expect(entry.operation).toBe("op"); // sibling metadata survives, not [UNSERIALIZABLE]
  });

  it("scrubs credentials embedded in free-text values (connection strings, password=)", () => {
    const [entry] = captureLogs(() =>
      logger.error("infra", {
        detail: "connect failed postgres://hermes:s3cr3tPass@db:5432/hermes and password=supersecret token=abc123",
      }),
    );
    const raw = JSON.stringify(entry);
    expect(raw).not.toContain("s3cr3tPass");
    expect(raw).not.toContain("supersecret");
    expect(raw).not.toContain("abc123");
    expect(raw).toContain("[REDACTED]");
    // Non-secret text around it is preserved.
    expect(raw).toContain("connect failed");
    expect(raw).toContain("db:5432");
  });
});
