/**
 * PHASE 109-C2.1 — R3 corrections: the real wire bound, and reap-gated release.
 *
 * Both of these were WRONG in R2 in ways that looked right:
 *
 *   - the size bound assumed 3 bytes per path code unit, which is only true if
 *     the characters that cost 6 are refused. They were not. Measured:
 *     U+0001, U+001F and a lone surrogate each cost 6 bytes per code unit, and
 *     the C2.0 classifier admitted all three.
 *
 *   - the slot was released after `child.kill("SIGKILL")`, which delivers a
 *     signal and returns. It is not evidence the process is gone, so a second
 *     parse could spawn a second child while the first was still dying.
 *
 * The tests below build REAL serialised messages and measure them, rather than
 * asserting the formula against itself.
 */

import { describe, expect, it, vi } from "vitest";

import { pathSerializationProblem } from "../entry-policy";
import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import {
  INGEST_LIMITS,
  INGRESS_LIMITS,
  MAX_CHILD_STDOUT_BYTES,
  WORST_CASE_DONE_JSON_BYTES,
  WORST_CASE_ENTRY_JSON_BYTES,
  WORST_CASE_READY_JSON_BYTES,
} from "../limits";
import { LineFramer } from "../line-framer";
import { ParseLifecycle, type LifecycleHooks } from "../parse-lifecycle";
import { parseTerminal } from "../protocol";

/* ── finding 1: the serialisation bound is real ────────────────────────── */

/** A 3-byte BMP character — the most expensive code unit the policy admits. */
const WORST_ADMITTED_CHAR = "࿿";

function maximalEntry() {
  return {
    path: WORST_ADMITTED_CHAR.repeat(INGEST_LIMITS.maxEntryPathLength),
    observedBytes: INGEST_LIMITS.maxObservedEntryBytes,
    sha256: "f".repeat(64),
    crc32: 0xffffffff,
  };
}

describe("109-C2.1 · path characters that break the bound are refused", () => {
  it("refuses every C0 control, which JSON escapes to six bytes", () => {
    for (const code of [0x00, 0x01, 0x09, 0x0a, 0x1f]) {
      const path = `blocks/${String.fromCharCode(code)}.scl`;
      const problem = pathSerializationProblem(path);
      expect(problem, `U+${code.toString(16)}`).not.toBeNull();
      expect(problem).toContain("C0 control");
    }
  });

  it("refuses lone surrogates, high and low", () => {
    expect(pathSerializationProblem(`a${String.fromCharCode(0xd800)}b`)).toContain("high surrogate");
    expect(pathSerializationProblem(`a${String.fromCharCode(0xdc00)}b`)).toContain("low surrogate");
  });

  it("admits everything legitimate — Persian, ZWNJ, astral pairs, quotes", () => {
    for (const path of [
      "blocks/بلوک‌های اصلی.scl",
      `blocks/${String.fromCharCode(0x200c)}x.scl`,
      `blocks/${String.fromCodePoint(0x1d11e)}.scl`,
      'blocks/a"b.scl',
      `blocks/${WORST_ADMITTED_CHAR}.scl`,
      "blocks/main.scl",
    ]) {
      expect(pathSerializationProblem(path), path).toBeNull();
    }
  });

  it("every admitted character costs at most the assumed bytes per code unit", () => {
    // Measured against real JSON.stringify, one character at a time. This is the
    // assertion that makes the whole calculation honest.
    const admitted = [
      "࿿",
      String.fromCharCode(0x200c),
      String.fromCodePoint(0x1d11e),
      '"',
      "",
      "ب",
      "a",
    ];
    for (const ch of admitted) {
      expect(pathSerializationProblem(ch)).toBeNull();
      const bytes = Buffer.byteLength(JSON.stringify(ch), "utf8") - 2;
      const perUnit = bytes / ch.length;
      expect(perUnit, JSON.stringify(ch)).toBeLessThanOrEqual(3);
    }
  });

  it("the refused characters really would have cost six", () => {
    // Not decoration: it proves the refusal is load-bearing rather than cosmetic.
    for (const ch of [String.fromCharCode(0x01), String.fromCharCode(0xd800)]) {
      expect(pathSerializationProblem(ch)).not.toBeNull();
      expect(Buffer.byteLength(JSON.stringify(ch), "utf8") - 2).toBe(6);
    }
  });
});

describe("109-C2.1 · the entry bound holds against a REAL serialised entry", () => {
  it("a genuinely maximal entry fits the per-entry figure", () => {
    const entry = maximalEntry();
    expect(pathSerializationProblem(entry.path)).toBeNull();
    // +1 for the comma that separates it from the next entry.
    const measured = Buffer.byteLength(JSON.stringify(entry), "utf8") + 1;
    expect(measured).toBeLessThanOrEqual(WORST_CASE_ENTRY_JSON_BYTES);
  });

  it("the figure is tight, not merely large", () => {
    const measured = Buffer.byteLength(JSON.stringify(maximalEntry()), "utf8") + 1;
    expect(WORST_CASE_ENTRY_JSON_BYTES - measured).toBeLessThanOrEqual(4);
  });
});

describe("109-C2.1 · READY and the terminal message share one framer", () => {
  const READY_LINE = `${JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 })}\n`;

  it("the READY constant is the measured byte length of the only valid READY", () => {
    expect(Buffer.byteLength(READY_LINE, "utf8")).toBe(WORST_CASE_READY_JSON_BYTES);
  });

  it("the child bound is strictly larger than the terminal bound", () => {
    expect(MAX_CHILD_STDOUT_BYTES).toBe(WORST_CASE_READY_JSON_BYTES + WORST_CASE_DONE_JSON_BYTES);
    expect(INGRESS_LIMITS.maxChildStdoutBytes).toBeGreaterThan(INGRESS_LIMITS.maxResponseBytes);
  });

  it("a terminal-only cap WOULD have overflowed on READY + maximal DONE", () => {
    // The R2 defect, demonstrated rather than described.
    const framer = new LineFramer(INGRESS_LIMITS.maxResponseBytes, INGRESS_LIMITS.maxResponseLines);
    framer.push(Buffer.from(READY_LINE, "utf8"));
    const rest = Buffer.alloc(WORST_CASE_DONE_JSON_BYTES, 0x61);
    expect(framer.push(rest).overflow).toBe(true);
  });

  it("READY followed by a maximal DONE passes through ONE framer", () => {
    const framer = new LineFramer(INGRESS_LIMITS.maxChildStdoutBytes, INGRESS_LIMITS.maxChildStdoutLines);
    const ready = framer.push(Buffer.from(READY_LINE, "utf8"));
    expect(ready.overflow).toBe(false);
    expect(ready.lines).toHaveLength(1);

    // Exactly fill the remaining budget, then terminate the line.
    const remaining = INGRESS_LIMITS.maxChildStdoutBytes - WORST_CASE_READY_JSON_BYTES;
    const body = Buffer.concat([Buffer.alloc(remaining - 1, 0x61), Buffer.from("\n", "utf8")]);
    const done = framer.push(body);
    expect(done.overflow).toBe(false);
    expect(done.lines).toHaveLength(1);
    expect(framer.bytesSeen).toBe(INGRESS_LIMITS.maxChildStdoutBytes);
  });

  it("one byte beyond the COMPLETE wire limit is refused", () => {
    const framer = new LineFramer(INGRESS_LIMITS.maxChildStdoutBytes, INGRESS_LIMITS.maxChildStdoutLines);
    framer.push(Buffer.from(READY_LINE, "utf8"));
    const remaining = INGRESS_LIMITS.maxChildStdoutBytes - WORST_CASE_READY_JSON_BYTES;
    expect(framer.push(Buffer.alloc(remaining + 1, 0x61)).overflow).toBe(true);
  });

  it("a real, SELF-CONSISTENT maximal DONE fits the terminal bound", () => {
    // Built for real rather than with Buffer.alloc pretending to be JSON, and
    // self-consistent: observedTotalBytes equals the sum of the entries, which
    // is what the schema actually requires. The earlier version of this test
    // gave every entry maxObservedEntryBytes while leaving observedTotalBytes
    // at the global maximum — a message the schema would reject, so it proved
    // nothing about a message that could really arrive.
    //
    // The full 5 000-entry case, and the proof that parseTerminal accepts it,
    // live in phase109c21-line-amplification.test.ts.
    const count = 200;
    const per = Math.floor(INGEST_LIMITS.maxObservedTotalBytes / count);
    const entries = Array.from({ length: count }, () => ({
      ...maximalEntry(),
      observedBytes: per,
    }));
    const message = `${JSON.stringify({
      kind: "DONE",
      result: {
        entryCount: count,
        entries,
        observedTotalBytes: per * count,
      },
    })}
`;
    const measured = Buffer.byteLength(message, "utf8");
    const predicted = 90 + count * WORST_CASE_ENTRY_JSON_BYTES;
    expect(measured).toBeLessThanOrEqual(predicted);
    expect(measured).toBeLessThanOrEqual(INGRESS_LIMITS.maxResponseBytes);
    // And it is genuinely admissible, not merely small enough.
    expect(parseTerminal(message.trim())?.kind).toBe("DONE");
  });

  it("schema bound and calculated bound cannot drift", () => {
    const overLong = {
      kind: "DONE",
      result: {
        entryCount: 1,
        entries: [
          { ...maximalEntry(), path: WORST_ADMITTED_CHAR.repeat(INGEST_LIMITS.maxEntryPathLength + 1) },
        ],
        observedTotalBytes: INGEST_LIMITS.maxObservedEntryBytes,
      },
    };
    // The schema refuses a path one code unit past the length the calculation
    // assumed, so no message can exceed the derived size by growing a path.
    expect(parseTerminal(JSON.stringify(overLong))).toBeNull();
    expect(INGRESS_LIMITS.maxResponseBytes).toBe(WORST_CASE_DONE_JSON_BYTES);
  });
});

/* ── finding 2: the slot waits for the reap ────────────────────────────── */

interface Recorder {
  readonly hooks: LifecycleHooks;
  readonly calls: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  return {
    calls,
    hooks: {
      detachRequestListeners: () => calls.push("detach"),
      stopBodyConsumption: () => calls.push("stop"),
      closeChildStdin: () => calls.push("closeStdin"),
      killChild: () => calls.push("kill"),
      respond: () => calls.push("respond"),
      releaseSlot: () => calls.push("releaseSlot"),
    },
  };
}

const TIMERS = {
  readyHandshakeMs: 5_000,
  firstByteMs: 2_000,
  totalIngressMs: 15_000,
  maxProcessingMs: 30_000,
};

describe("109-C2.1 · the slot is held until the child is confirmed reaped", () => {
  it("finalize alone does NOT release — kill() is only a signal", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.finalize({ status: 200, body: { kind: "REFUSED", code: C.PARSE_TIMEOUT } });

    expect(r.calls).toContain("kill");
    expect(r.calls).toContain("respond");
    expect(r.calls).not.toContain("releaseSlot");
    expect(life.isFinalized).toBe(true);
    expect(life.childWasReaped).toBe(false);
    expect(life.isSlotReleased).toBe(false);
  });

  it("the caller is answered immediately even though the slot waits", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.finalize({ status: 200, body: { kind: "REFUSED", code: C.CALLER_DISCONNECTED } });
    expect(r.calls.indexOf("respond")).toBeGreaterThanOrEqual(0);
  });

  it("a delayed exit releases the slot when it finally arrives", () => {
    vi.useFakeTimers();
    try {
      const r = recorder();
      const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
      life.start();
      life.finalize({ status: 200, body: { kind: "REFUSED", code: C.PARSE_TIMEOUT } });

      vi.advanceTimersByTime(60_000);
      expect(life.isSlotReleased).toBe(false);

      life.onChildReaped();
      expect(life.isSlotReleased).toBe(true);
      expect(r.calls[r.calls.length - 1]).toBe("releaseSlot");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a child that exits BEFORE finalization still releases exactly once", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.onChildReaped();
    expect(life.isSlotReleased).toBe(false); // not finalized yet

    life.finalize({ status: 200, body: { kind: "DONE" } });
    expect(life.isSlotReleased).toBe(true);
    expect(r.calls.filter((c) => c === "releaseSlot")).toHaveLength(1);
  });

  it("repeated finalize / reap events release exactly once", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.finalize({ status: 200, body: { kind: "DONE" } });
    life.onChildReaped();
    life.onChildReaped();
    life.finalize({ status: 200, body: { kind: "REFUSED", code: C.PARSER_TERMINATED } });
    life.onChildReaped();

    expect(r.calls.filter((c) => c === "releaseSlot")).toHaveLength(1);
    expect(r.calls.filter((c) => c === "respond")).toHaveLength(1);
    expect(r.calls.filter((c) => c === "kill")).toHaveLength(1);
  });

  it("releaseSlot is still the very last thing that happens", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.finalize({ status: 200, body: { kind: "DONE" } });
    life.onChildReaped();
    expect(r.calls[r.calls.length - 1]).toBe("releaseSlot");
    expect(r.calls.indexOf("stop")).toBeLessThan(r.calls.indexOf("releaseSlot"));
    expect(r.calls.indexOf("detach")).toBeLessThan(r.calls.indexOf("releaseSlot"));
  });

  it("every outcome converges on the same state machine", () => {
    for (const body of [
      { kind: "DONE" },
      { kind: "REFUSED", code: C.PARSE_TIMEOUT },
      { kind: "REFUSED", code: C.FIRST_BYTE_TIMEOUT },
      { kind: "REFUSED", code: C.INGRESS_TIMEOUT },
      { kind: "REFUSED", code: C.CALLER_DISCONNECTED },
      { kind: "REFUSED", code: C.PARSER_TERMINATED },
      { kind: "REFUSED", code: C.PARSER_PROTOCOL_VIOLATION },
    ]) {
      const r = recorder();
      const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
      life.start();
      life.finalize({ status: 200, body });
      expect(life.isSlotReleased, JSON.stringify(body)).toBe(false);
      life.onChildReaped();
      expect(life.isSlotReleased, JSON.stringify(body)).toBe(true);
      expect(r.calls.filter((c) => c === "releaseSlot")).toHaveLength(1);
    }
  });
});
