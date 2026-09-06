/**
 * PHASE 109-C2.1 — R4: physical-line amplification.
 *
 * A byte cap does not bound memory. One newline is one byte and produces one
 * array element, so a flood of newlines converts a byte budget into an object
 * count. Measured against the R3 framer, feeding exactly `maxChildStdoutBytes`
 * (8 340 138) bytes of newlines in realistic 64 KiB pipe chunks:
 *
 *     overflow reported ....................................... false
 *     lines returned .......................................... 8 340 138
 *     peak RSS, lines discarded as the supervisor does ......... 113 MB
 *     peak RSS, lines retained as the host client did .......... 305 MB
 *     container memory.max .................................... 128 MiB
 *
 * 2.3x the cgroup limit, reachable with 8 MB of the cheapest possible input.
 * These tests hold the fix in place.
 */

import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { readTerminalResponse } from "../host-client";
import { INGEST_LIMITS, INGRESS_LIMITS, WORST_CASE_DONE_JSON_BYTES } from "../limits";
import { LineFramer } from "../line-framer";
import { parseTerminal } from "../protocol";

const READY_LINE = `${JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 })}\n`;
const TERMINAL_LINE = `${JSON.stringify({ kind: "REFUSED", code: C.CRC_MISMATCH })}\n`;
const PIPE_CHUNK = 65_536;

/* ── A · the flood is stopped, and the array never grows past the cap ───── */

describe("109-C2.1 · a newline flood cannot amplify into an unbounded array", () => {
  it("fails after the permitted physical-line count, in realistic pipe chunks", () => {
    const cap = INGRESS_LIMITS.maxChildStdoutBytes;
    const framer = new LineFramer(cap, INGRESS_LIMITS.maxChildStdoutLines);
    const chunk = Buffer.alloc(PIPE_CHUNK, 0x0a);

    let fed = 0;
    let totalLines = 0;
    let largestSingleReturn = 0;
    let overflow = false;
    let reason: string | null = null;

    while (fed < cap) {
      const size = Math.min(PIPE_CHUNK, cap - fed);
      const result = framer.push(size === PIPE_CHUNK ? chunk : chunk.subarray(0, size));
      fed += size;
      totalLines += result.lines.length;
      largestSingleReturn = Math.max(largestSingleReturn, result.lines.length);
      if (result.overflow) {
        overflow = true;
        reason = result.reason;
        break;
      }
    }

    expect(overflow).toBe(true);
    expect(reason).toBe("lines");
    // Never more than the configured count, across the whole stream and within
    // any single chunk — 65 536 newlines arrive at once and must not become
    // 65 536 array elements.
    expect(totalLines).toBeLessThanOrEqual(INGRESS_LIMITS.maxChildStdoutLines);
    expect(largestSingleReturn).toBeLessThanOrEqual(INGRESS_LIMITS.maxChildStdoutLines);
    // It stopped almost immediately rather than after 8 MB.
    expect(fed).toBeLessThanOrEqual(PIPE_CHUNK);
  });

  it("would have returned millions of lines without the cap — the amplification is real", () => {
    // A framer with a deliberately huge line cap reproduces the R3 behaviour, so
    // the test above is measuring a fix rather than an accident of chunk sizes.
    const bytes = 200_000;
    const uncapped = new LineFramer(bytes, Number.MAX_SAFE_INTEGER);
    const flood = Buffer.alloc(bytes, 0x0a);
    expect(uncapped.push(flood).lines.length).toBe(bytes);
  });

  it("is spent afterwards: pending state cleared, later chunks ignored", () => {
    const framer = new LineFramer(1_000_000, 2);
    framer.push(Buffer.alloc(64, 0x0a));
    expect(framer.hasOverflowed).toBe(true);
    expect(framer.reason).toBe("lines");

    const after = framer.push(Buffer.from(`${READY_LINE}${TERMINAL_LINE}`, "utf8"));
    expect(after.lines).toEqual([]);
    expect(after.overflow).toBe(true);

    const final = framer.finish();
    expect(final.lines).toEqual([]);
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("lines");
  });
});

/* ── B · blank lines are not free ───────────────────────────────────────── */

describe("109-C2.1 · blank lines consume the physical-line budget", () => {
  it("three blank lines exhaust a budget of two", () => {
    const framer = new LineFramer(1_000_000, 2);
    const first = framer.push(Buffer.from("\n\n", "utf8"));
    expect(first.overflow).toBe(false);
    expect(first.lines).toEqual(["", ""]);
    expect(framer.linesSeen).toBe(2);

    const third = framer.push(Buffer.from("\n", "utf8"));
    expect(third.overflow).toBe(true);
    expect(third.reason).toBe("lines");
  });

  it("a blank line before READY leaves room for only one more frame", () => {
    const framer = new LineFramer(1_000_000, INGRESS_LIMITS.maxChildStdoutLines);
    expect(framer.push(Buffer.from("\n", "utf8")).lines).toEqual([""]);
    expect(framer.push(Buffer.from(READY_LINE, "utf8")).overflow).toBe(false);
    // The terminal message would be the third frame.
    expect(framer.push(Buffer.from(TERMINAL_LINE, "utf8")).overflow).toBe(true);
  });

  it("an unterminated trailing frame is counted too", () => {
    // Otherwise a child could smuggle an extra message past the cap simply by
    // omitting its newline.
    const framer = new LineFramer(1_000_000, 2);
    framer.push(Buffer.from("a\nb\n", "utf8"));
    expect(framer.linesSeen).toBe(2);
    framer.push(Buffer.from("trailing-without-newline", "utf8"));

    // R5: the overflow must arrive in the RETURN VALUE. The old API reported
    // this same state only through `hasOverflowed`, and returned "" — which is
    // what both consumers read, and why an unterminated EXTRA was discarded in
    // silence while the earlier terminal message was published.
    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("lines");
    expect(final.lines).toEqual([]);
    expect(framer.hasOverflowed).toBe(true);
  });
});

/* ── C and D · the supervisor's two-frame protocol ──────────────────────── */

describe("109-C2.1 · the supervisor accepts exactly READY plus one terminal", () => {
  function feed(payload: string): { lines: string[]; overflow: boolean } {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    const buffer = Buffer.from(payload, "utf8");
    const lines: string[] = [];
    let overflow = false;
    for (let offset = 0; offset < buffer.length; offset += PIPE_CHUNK) {
      const result = framer.push(buffer.subarray(offset, offset + PIPE_CHUNK));
      for (const line of result.lines) lines.push(line);
      if (result.overflow) {
        overflow = true;
        break;
      }
    }
    return { lines, overflow };
  }

  it("READY + terminal is accepted", () => {
    const { lines, overflow } = feed(`${READY_LINE}${TERMINAL_LINE}`);
    expect(overflow).toBe(false);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string).kind).toBe("READY");
    expect(parseTerminal(lines[1] as string)?.kind).toBe("REFUSED");
  });

  it("READY + blank + terminal fails closed", () => {
    expect(feed(`${READY_LINE}\n${TERMINAL_LINE}`).overflow).toBe(true);
  });

  it("a blank flood before READY fails closed", () => {
    const flood = "\n".repeat(10_000);
    const { lines, overflow } = feed(`${flood}${READY_LINE}${TERMINAL_LINE}`);
    expect(overflow).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(INGRESS_LIMITS.maxChildStdoutLines);
  });

  it("three terminal messages fail closed rather than the third being ignored", () => {
    expect(feed(`${READY_LINE}${TERMINAL_LINE}${TERMINAL_LINE}`).overflow).toBe(true);
  });
});

/* ── E · the host client, through the real response reader ──────────────── */

describe("109-C2.1 · the host client refuses a flooded response", () => {
  function streamOf(payload: Buffer, chunkSize = PIPE_CHUNK): Readable {
    let offset = 0;
    return new Readable({
      read() {
        if (offset >= payload.length) {
          this.push(null);
          return;
        }
        this.push(payload.subarray(offset, offset + chunkSize));
        offset += chunkSize;
      },
    });
  }

  it("a newline flood becomes AES-C2-053 without retaining millions of strings", async () => {
    const before = process.memoryUsage().heapUsed;
    const flood = Buffer.alloc(4 * 1024 * 1024, 0x0a);
    const outcome = await readTerminalResponse(streamOf(flood), 200);
    const after = process.memoryUsage().heapUsed;

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("physical line");
    // 4 MiB of newlines would be 4 194 304 retained strings before the fix.
    // A generous ceiling still fails by orders of magnitude if that returns.
    expect(after - before).toBeLessThan(32 * 1024 * 1024);
  });

  it("a single well-formed terminal line is accepted", async () => {
    const done = {
      kind: "DONE",
      result: {
        entryCount: 1,
        entries: [{ path: "blocks/main.scl", observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],
        observedTotalBytes: 3,
      },
    };
    const outcome = await readTerminalResponse(
      streamOf(Buffer.from(`${JSON.stringify(done)}\n`, "utf8")),
      200,
    );
    expect(outcome.ok).toBe(true);
  });

  it("two response lines fail closed", async () => {
    const payload = Buffer.from(`${TERMINAL_LINE}${TERMINAL_LINE}`, "utf8");
    const outcome = await readTerminalResponse(streamOf(payload), 200);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("a blank line followed by a terminal message fails closed", async () => {
    const payload = Buffer.from(`\n${TERMINAL_LINE}`, "utf8");
    const outcome = await readTerminalResponse(streamOf(payload), 200);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("an empty response body fails closed", async () => {
    const outcome = await readTerminalResponse(streamOf(Buffer.alloc(0)), 200);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("no terminal line");
  });
});

/* ── evidence correction · the formula is an UPPER BOUND, not the maximum ─ */

describe("109-C2.1 · the size formula is a conservative upper bound", () => {
  const PATH = "࿿".repeat(INGEST_LIMITS.maxEntryPathLength);

  it("a FIELDWISE maximal 5000-entry DONE fits, with the slack stated honestly", () => {
    const entries = Array.from({ length: INGEST_LIMITS.maxEntries }, () => ({
      path: PATH,
      observedBytes: INGEST_LIMITS.maxObservedEntryBytes,
      sha256: "f".repeat(64),
      crc32: 0xffffffff,
    }));
    const measured = Buffer.byteLength(
      `${JSON.stringify({
        kind: "DONE",
        result: {
          entryCount: INGEST_LIMITS.maxEntries,
          entries,
          observedTotalBytes: INGEST_LIMITS.maxObservedTotalBytes,
        },
      })}\n`,
      "utf8",
    );
    // Measured 8 340 088 against a derived cap of 8 340 089 — one byte of slack.
    // It fits, but "fills the cap exactly" would have been the wrong claim.
    expect(measured).toBeLessThanOrEqual(WORST_CASE_DONE_JSON_BYTES);
    expect(WORST_CASE_DONE_JSON_BYTES - measured).toBeGreaterThanOrEqual(1);
  });

  it("a SELF-CONSISTENT maximal 5000-entry DONE is accepted by parseTerminal", () => {
    // Self-consistent means observedTotalBytes equals the sum of the entries,
    // which the schema requires. That forces each entry down to a 5-digit size,
    // not the 8 digits the formula budgets for — which is precisely why the
    // formula is an upper bound rather than the exact serialized maximum.
    const count = INGEST_LIMITS.maxEntries;
    const per = Math.floor(INGEST_LIMITS.maxObservedTotalBytes / count);
    const remainder = INGEST_LIMITS.maxObservedTotalBytes - per * count;
    const entries = Array.from({ length: count }, (_unused, index) => ({
      path: PATH,
      observedBytes: per + (index === 0 ? remainder : 0),
      sha256: "f".repeat(64),
      crc32: 0xffffffff,
    }));
    const message = {
      kind: "DONE",
      result: {
        entryCount: count,
        entries,
        observedTotalBytes: entries.reduce((total, entry) => total + entry.observedBytes, 0),
      },
    };
    const serialised = `${JSON.stringify(message)}\n`;
    const measured = Buffer.byteLength(serialised, "utf8");

    expect(measured).toBeLessThanOrEqual(WORST_CASE_DONE_JSON_BYTES);
    expect(measured).toBeLessThanOrEqual(INGRESS_LIMITS.maxResponseBytes);

    const parsed = parseTerminal(serialised.trim());
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("DONE");
    if (!parsed || parsed.kind !== "DONE") return;
    expect(parsed.result.entryCount).toBe(count);
    expect(parsed.result.entries).toHaveLength(count);
  });

  it("that maximal message also passes through the framer within its line budget", () => {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    expect(framer.push(Buffer.from(READY_LINE, "utf8")).overflow).toBe(false);
    const body = Buffer.alloc(WORST_CASE_DONE_JSON_BYTES - 1, 0x61);
    expect(framer.push(body).overflow).toBe(false);
    expect(framer.push(Buffer.from("\n", "utf8")).overflow).toBe(false);
    expect(framer.linesSeen).toBe(2);
  });
});
