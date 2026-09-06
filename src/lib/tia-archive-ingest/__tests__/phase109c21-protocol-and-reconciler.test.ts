/**
 * PHASE 109-C2.1 — the wire protocol, reconciliation, and the Windows verdict.
 *
 * The protocol is where atomicity is actually enforced: a message that fails
 * validation is not repaired, and a `DONE` whose own totals disagree with its
 * entries is rejected rather than trusted. Both are tested by trying to smuggle
 * something past them.
 */

import { describe, expect, it } from "vitest";

import { ingestAvailability, ingestIsAvailable, PARSER_SOCKET_PATH } from "../availability";
import { ALL_REFUSAL_CODES, INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { INGEST_LIMITS } from "../limits";
import { reconcile } from "../manifest-reconciler";
import { doneMessageIsSelfConsistent, parseReady, parseTerminal, ReadyMessageSchema } from "../protocol";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function done(entries: readonly { path: string; observedBytes: number; sha256: string; crc32: number }[]) {
  return {
    kind: "DONE",
    result: {
      entryCount: entries.length,
      entries,
      observedTotalBytes: entries.reduce((n, e) => n + e.observedBytes, 0),
    },
  };
}

describe("109-C2.1 · the READY handshake is exact, not approximate", () => {
  it("accepts only the exact required values", () => {
    expect(parseReady(JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 }))).not.toBeNull();
    expect(parseReady(JSON.stringify({ kind: "READY", oomScoreAdj: 999, oomGroup: 0 }))).toBeNull();
    expect(parseReady(JSON.stringify({ kind: "READY", oomScoreAdj: 1001, oomGroup: 0 }))).toBeNull();
    expect(parseReady(JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 1 }))).toBeNull();
  });

  it("refuses a smuggled extra key rather than silently dropping it", () => {
    // Zod strips unknown keys by default. Stripping is as dangerous as
    // accepting: the message that was validated would not be the message sent.
    const smuggled = JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0, admin: true });
    expect(parseReady(smuggled)).toBeNull();
    expect(ReadyMessageSchema.safeParse(JSON.parse(smuggled)).success).toBe(false);
  });

  it("never throws on malformed input", () => {
    for (const bad of ["", "{", "null", "[]", '"READY"', "{}"]) {
      expect(() => parseReady(bad)).not.toThrow();
      expect(parseReady(bad)).toBeNull();
    }
  });
});

describe("109-C2.1 · exactly one terminal message, and it must be coherent", () => {
  it("accepts a well-formed DONE and REFUSED", () => {
    const entry = { path: "a.scl", observedBytes: 3, sha256: DIGEST_A, crc32: 1 };
    expect(parseTerminal(JSON.stringify(done([entry])))?.kind).toBe("DONE");
    expect(
      parseTerminal(JSON.stringify({ kind: "REFUSED", code: C.CRC_MISMATCH, detail: "x" }))?.kind,
    ).toBe("REFUSED");
  });

  it("rejects a DONE whose entryCount disagrees with its entries", () => {
    const message = done([{ path: "a.scl", observedBytes: 3, sha256: DIGEST_A, crc32: 1 }]);
    message.result.entryCount = 7;
    expect(parseTerminal(JSON.stringify(message))).toBeNull();
  });

  it("rejects a DONE whose byte total disagrees with its entries", () => {
    const message = done([{ path: "a.scl", observedBytes: 3, sha256: DIGEST_A, crc32: 1 }]);
    message.result.observedTotalBytes = 9999;
    expect(parseTerminal(JSON.stringify(message))).toBeNull();
    expect(doneMessageIsSelfConsistent(message as never)).toBe(false);
  });

  it("accepts a REFUSED carrying a C2.0 path code, not just an ingest code", () => {
    // The real UDS gate caught this: entry admission delegates path policy to
    // C2.0, so a traversal refusal legitimately carries AES-C2-006. A schema
    // that accepted only AES-C2-023..058 turned nine real refusals into
    // "protocol violation" — the rule that fired became invisible. In-process
    // tests could not see it because they call the reader directly and never
    // cross the wire.
    for (const code of ["AES-C2-003", "AES-C2-004", "AES-C2-005", "AES-C2-006", "AES-C2-008", "AES-C2-009", "AES-C2-019"]) {
      const parsed = parseTerminal(JSON.stringify({ kind: "REFUSED", code }));
      expect(parsed, code).not.toBeNull();
      if (!parsed || parsed.kind !== "REFUSED") continue;
      expect(parsed.code).toBe(code);
    }
  });

  it("still rejects a code that belongs to neither space", () => {
    expect(parseTerminal(JSON.stringify({ kind: "REFUSED", code: "not-a-code" }))).toBeNull();
    expect(parseTerminal(JSON.stringify({ kind: "REFUSED", code: "AES-C2-999" }))).toBeNull();
    expect(parseTerminal(JSON.stringify({ kind: "REFUSED", code: "AES-C2-015" }))).toBeNull();
  });

  it("every code the entry policy can emit is accepted by the wire schema", () => {
    // Derived rather than listed, so a new policy code cannot be added without
    // the schema learning about it.
    for (const code of ALL_REFUSAL_CODES) {
      expect(parseTerminal(JSON.stringify({ kind: "REFUSED", code })), code).not.toBeNull();
    }
  });

  it("rejects a digest that is not 64 lowercase hex characters", () => {
    for (const sha256 of ["A".repeat(64), "a".repeat(63), "a".repeat(65), "", "z".repeat(64)]) {
      const message = done([{ path: "a.scl", observedBytes: 1, sha256, crc32: 0 }]);
      expect(parseTerminal(JSON.stringify(message)), sha256.slice(0, 8)).toBeNull();
    }
  });

  it("bounds every field a hostile parser could inflate", () => {
    const longPath = done([
      { path: "a".repeat(INGEST_LIMITS.maxEntryPathLength + 1), observedBytes: 1, sha256: DIGEST_A, crc32: 0 },
    ]);
    expect(parseTerminal(JSON.stringify(longPath))).toBeNull();

    const longDetail = { kind: "REFUSED", code: C.CRC_MISMATCH, detail: "x".repeat(INGEST_LIMITS.maxUntrustedTextLength + 1) };
    expect(parseTerminal(JSON.stringify(longDetail))).toBeNull();

    const hugeEntry = done([
      { path: "a.scl", observedBytes: INGEST_LIMITS.maxObservedEntryBytes + 1, sha256: DIGEST_A, crc32: 0 },
    ]);
    expect(parseTerminal(JSON.stringify(hugeEntry))).toBeNull();
  });

  it("rejects a terminal message with a smuggled key", () => {
    const message = done([{ path: "a.scl", observedBytes: 1, sha256: DIGEST_A, crc32: 0 }]) as Record<string, unknown>;
    message.trusted = true;
    expect(parseTerminal(JSON.stringify(message))).toBeNull();
  });
});

describe("109-C2.1 · reconciliation compares sets in both directions", () => {
  const observed = [{ path: "blocks/a.scl", observedBytes: 1, sha256: DIGEST_A, crc32: 0 }];

  it("accepts an exact match", () => {
    const result = reconcile(observed, [{ path: "blocks/a.scl", contentSha256: DIGEST_A }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual(["blocks/a.scl"]);
  });

  it("catches a file present in the archive but not declared", () => {
    const result = reconcile(observed, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.detail).toContain("present in archive but not declared");
  });

  it("catches a file declared but absent — the other direction", () => {
    const result = reconcile([], [{ path: "blocks/a.scl", contentSha256: DIGEST_A }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]?.detail).toContain("declared but not present");
  });

  it("catches a digest that differs for a path present on both sides", () => {
    const result = reconcile(observed, [{ path: "blocks/a.scl", contentSha256: DIGEST_B }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.detail.includes("content digest differs"))).toBe(true);
    expect(result.problems[0]?.code).toBe(C.MANIFEST_RECONCILIATION_FAILED);
  });

  it("catches a duplicate path on either side before the set comparison lies", () => {
    const duplicated = [...observed, ...observed];
    const result = reconcile(duplicated, [{ path: "blocks/a.scl", contentSha256: DIGEST_A }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.detail.includes("duplicate path"))).toBe(true);
  });
});

describe("109-C2.1 · Windows is unavailable, explicitly", () => {
  it("refuses on win32 with a stable code rather than attempting a connection", () => {
    const verdict = ingestAvailability("win32");
    expect(verdict.available).toBe(false);
    if (verdict.available) return;
    expect(verdict.code).toBe(C.PARSER_UNAVAILABLE);
    expect(verdict.reason).toContain("unavailable on win32");
    expect(ingestIsAvailable("win32")).toBe(false);
  });

  it("is available on linux and names the compose socket path", () => {
    const verdict = ingestAvailability("linux");
    expect(verdict.available).toBe(true);
    if (!verdict.available) return;
    expect(verdict.socketPath).toBe(PARSER_SOCKET_PATH);
    expect(PARSER_SOCKET_PATH).toBe("/ipc/parser.sock");
  });

  it("treats any other platform as available rather than special-casing a list", () => {
    // Only Windows is structurally incapable. Refusing darwin as well would be
    // a guess, and a guess that disables a capability is not a safe default.
    expect(ingestIsAvailable("darwin")).toBe(true);
  });
});
