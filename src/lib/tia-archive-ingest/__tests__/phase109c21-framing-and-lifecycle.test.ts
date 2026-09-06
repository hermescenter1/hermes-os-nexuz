/**
 * PHASE 109-C2.1 — R2 corrections: framing, deadlines, finalization, sizing.
 *
 * Each block here exists because R1 shipped a defect that no other test could
 * see. The framing tests split real Persian text at EVERY byte boundary, which
 * is the only way to catch a decoder that is right for most offsets; the
 * lifecycle tests drive the timers with fake time, because the property under
 * test is *when* a clock starts, not what it eventually does.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INGEST_LIMITS,
  INGRESS_LIMITS,
  WORST_CASE_DONE_JSON_BYTES,
  WORST_CASE_ENTRY_JSON_BYTES,
} from "../limits";
import { LineFramer } from "../line-framer";
import { ParseLifecycle, type CleanupStep, type ExpiryReason, type LifecycleHooks } from "../parse-lifecycle";
import { parseTerminal } from "../protocol";

/* ── correction 1: framing ─────────────────────────────────────────────── */

/**
 * Real Persian, plus the two joiners the C2.0 contract deliberately preserves.
 * `ک` and `ب` are 2-byte sequences; ZWNJ (U+200C) is 3 bytes; the emoji is a
 * 4-byte astral pair. Every UTF-8 sequence length is represented.
 */
const PERSIAN = "بلوک‌های اصلی مهندسی — کد ۱۲۳ ✅ 𝄞";

describe("109-C2.1 · child output is framed, not decoded per chunk", () => {
  it("recovers the exact text when split at EVERY byte boundary", () => {
    const payload = Buffer.from(`${PERSIAN}\n`, "utf8");
    expect(payload.length).toBeGreaterThan(40);

    for (let cut = 1; cut < payload.length; cut++) {
      const framer = new LineFramer(1024, 16);
      const first = framer.push(payload.subarray(0, cut));
      const second = framer.push(payload.subarray(cut));
      const lines = [...first.lines, ...second.lines];
      expect(lines, `split at byte ${cut}`).toEqual([PERSIAN]);
      expect(lines[0], `split at byte ${cut}`).not.toContain("�");
    }
  });

  it("survives being fed one byte at a time", () => {
    const payload = Buffer.from(`${PERSIAN}\n`, "utf8");
    const framer = new LineFramer(1024, 16);
    const lines: string[] = [];
    for (const byte of payload) lines.push(...framer.push(Buffer.from([byte])).lines);
    expect(lines).toEqual([PERSIAN]);
  });

  it("shows the naive approach actually corrupts the same input", () => {
    // Not decoration: this is the R1 behaviour, and it proves the test above is
    // measuring something real rather than passing trivially.
    const payload = Buffer.from(PERSIAN, "utf8");
    let corrupted = 0;
    for (let cut = 1; cut < payload.length; cut++) {
      const naive = payload.subarray(0, cut).toString("utf8") + payload.subarray(cut).toString("utf8");
      if (naive !== PERSIAN) corrupted += 1;
    }
    expect(corrupted).toBeGreaterThan(0);
  });

  it("splits multiple lines correctly across an awkward boundary", () => {
    const payload = Buffer.from(`${PERSIAN}\nsecond\n${PERSIAN}\n`, "utf8");
    for (let cut = 1; cut < payload.length; cut++) {
      const framer = new LineFramer(4096, 16);
      const lines = [
        ...framer.push(payload.subarray(0, cut)).lines,
        ...framer.push(payload.subarray(cut)).lines,
      ];
      expect(lines, `split at byte ${cut}`).toEqual([PERSIAN, "second", PERSIAN]);
    }
  });

  it("counts RAW BYTES against the cap, not decoded characters", () => {
    // A hostile child using 4-byte code points must not get four times the
    // budget by spending it in characters instead of bytes.
    const framer = new LineFramer(8, 16);
    const nine = Buffer.from("𝄞𝄞𝄞", "utf8"); // 12 bytes, 6 UTF-16 code units
    expect(nine.length).toBe(12);
    expect(framer.push(nine).overflow).toBe(true);
    expect(framer.bytesSeen).toBe(12);
  });

  it("retains nothing once it has overflowed", () => {
    const framer = new LineFramer(4, 16);
    framer.push(Buffer.from("aaaaaaaaaa\n", "utf8"));
    expect(framer.hasOverflowed).toBe(true);
    expect(framer.push(Buffer.from("more\n", "utf8")).lines).toEqual([]);
    const final = framer.finish();
    expect(final.lines).toEqual([]);
    expect(final.overflow).toBe(true);
  });

  it("returns a trailing unterminated line only from finish()", () => {
    const framer = new LineFramer(1024, 16);
    expect(framer.push(Buffer.from("no newline yet", "utf8")).lines).toEqual([]);
    const final = framer.finish();
    expect(final.lines).toEqual(["no newline yet"]);
    expect(final.overflow).toBe(false);
    expect(final.reason).toBeNull();
  });

  it("a Persian path survives framing all the way through schema validation", () => {
    const message = {
      kind: "DONE",
      result: {
        entryCount: 1,
        entries: [{ path: `blocks/${PERSIAN}.scl`, observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],
        observedTotalBytes: 3,
      },
    };
    const payload = Buffer.from(`${JSON.stringify(message)}\n`, "utf8");

    for (let cut = 1; cut < payload.length; cut++) {
      const framer = new LineFramer(65536, 16);
      const lines = [
        ...framer.push(payload.subarray(0, cut)).lines,
        ...framer.push(payload.subarray(cut)).lines,
      ];
      expect(lines.length, `split at byte ${cut}`).toBe(1);
      const parsed = parseTerminal(lines[0] as string);
      expect(parsed, `split at byte ${cut}`).not.toBeNull();
      if (!parsed || parsed.kind !== "DONE") continue;
      expect(parsed.result.entries[0]?.path).toBe(`blocks/${PERSIAN}.scl`);
    }
  });
});

/* ── correction 2 and 3: deadlines and finalization ────────────────────── */

interface Recorder {
  readonly hooks: LifecycleHooks;
  readonly calls: string[];
  slotReleased: boolean;
  responded: unknown;
}

function recorder(): Recorder {
  const calls: string[] = [];
  const state = {
    calls,
    slotReleased: false,
    responded: null as unknown,
    hooks: {
      detachRequestListeners: () => calls.push("detachRequestListeners"),
      stopBodyConsumption: () => calls.push("stopBodyConsumption"),
      closeChildStdin: () => calls.push("closeChildStdin"),
      killChild: () => calls.push("killChild"),
      respond: (o: unknown) => {
        calls.push("respond");
        state.responded = o;
      },
      releaseSlot: () => {
        calls.push("releaseSlot");
        state.slotReleased = true;
      },
    } satisfies LifecycleHooks,
  };
  return state as Recorder;
}

const TIMERS = {
  readyHandshakeMs: 5_000,
  firstByteMs: 2_000,
  totalIngressMs: 15_000,
  maxProcessingMs: 30_000,
};

describe("109-C2.1 · the first-byte clock starts only after READY is verified", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not fire while the handshake is still outstanding", () => {
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();

    // Well past firstByteMs, but the caller has not been allowed to send yet.
    vi.advanceTimersByTime(TIMERS.firstByteMs + 500);
    expect(expiries).toEqual([]);
    expect(life.readyWasVerified).toBe(false);
  });

  it("READY slower than firstByteMs but faster than readyHandshakeMs still succeeds", () => {
    // The exact case R1 got wrong: the caller was blamed for a delay that
    // belonged entirely to the parser's own startup.
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();

    vi.advanceTimersByTime(3_000); // > firstByteMs (2 000), < readyHandshakeMs (5 000)
    expect(expiries).toEqual([]);

    life.onReadyVerified();
    life.onFirstByte(); // body supplied immediately, as the test requires
    life.onBodyComplete();

    vi.advanceTimersByTime(10_000);
    expect(expiries).toEqual([]);

    life.finalize({ status: 200, body: { kind: "DONE" } });
    expect(r.calls).toContain("respond");
  });

  it("fires when the caller really is silent after being allowed to send", () => {
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();
    life.onReadyVerified();

    vi.advanceTimersByTime(TIMERS.firstByteMs + 1);
    expect(expiries).toEqual(["FIRST_BYTE_TIMEOUT"]);
  });

  it("the handshake deadline still fires when READY never arrives", () => {
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();

    vi.advanceTimersByTime(TIMERS.readyHandshakeMs + 1);
    expect(expiries).toEqual(["READY_TIMEOUT"]);
  });

  it("the total ingress deadline is independent — a slow handshake buys no extra body time", () => {
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();

    vi.advanceTimersByTime(4_000); // slow handshake
    life.onReadyVerified();
    life.onFirstByte(); // sending, but never finishing

    vi.advanceTimersByTime(TIMERS.totalIngressMs - 4_000 + 1);
    expect(expiries).toEqual(["INGRESS_TIMEOUT"]);
  });
});

describe("109-C2.1 · one idempotent finalization path for every outcome", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const EXPECTED_ORDER: readonly CleanupStep[] = [
    "timers",
    "detachRequestListeners",
    "stopBodyConsumption",
    "closeChildStdin",
    "killChild",
    "respond",
    "releaseSlot",
  ];

  it("runs the same cleanup, in the same order, for every outcome", () => {
    const outcomes = [
      { status: 200, body: { kind: "DONE" } },
      { status: 200, body: { kind: "REFUSED", code: "AES-C2-038" } },
      { status: 200, body: { kind: "REFUSED", code: "AES-C2-048" } },
      { status: 200, body: { kind: "REFUSED", code: "AES-C2-047" } },
      { status: 200, body: { kind: "REFUSED", code: "AES-C2-052" } },
      { status: 200, body: { kind: "REFUSED", code: "AES-C2-053" } },
    ];
    for (const outcome of outcomes) {
      const r = recorder();
      const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
      life.start();
      life.finalize(outcome);
      // R3: the slot is not released by finalize alone, because
      // child.kill("SIGKILL") only delivers a signal. The reap completes it.
      expect(life.isSlotReleased, JSON.stringify(outcome.body)).toBe(false);
      life.onChildReaped();
      expect(life.cleanupOrder, JSON.stringify(outcome.body)).toEqual(EXPECTED_ORDER);
      expect(r.calls).toEqual([...EXPECTED_ORDER].filter((s) => s !== "timers"));
    }
  });

  it("is idempotent — a late timeout cannot double-respond or double-release", () => {
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();

    life.finalize({ status: 200, body: { kind: "DONE" } });
    life.finalize({ status: 200, body: { kind: "REFUSED", code: "AES-C2-048" } });
    life.finalize({ status: 200, body: { kind: "REFUSED", code: "AES-C2-047" } });
    life.onChildReaped();
    life.onChildReaped();

    expect(r.calls.filter((c) => c === "respond")).toHaveLength(1);
    expect(r.calls.filter((c) => c === "releaseSlot")).toHaveLength(1);
    expect((r.responded as { body: { kind: string } }).body.kind).toBe("DONE");
  });

  it("releases the slot ONLY after the body is detached and stopped", () => {
    // The property that matters: an aborted request cannot still be streaming
    // when the next parse is admitted.
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => undefined);
    life.start();
    life.onReadyVerified();
    life.onFirstByte();

    life.finalize({ status: 200, body: { kind: "REFUSED", code: "AES-C2-052" } });
    life.onChildReaped();

    const detach = r.calls.indexOf("detachRequestListeners");
    const stop = r.calls.indexOf("stopBodyConsumption");
    const kill = r.calls.indexOf("killChild");
    const release = r.calls.indexOf("releaseSlot");
    expect(detach).toBeGreaterThanOrEqual(0);
    expect(detach).toBeLessThan(release);
    expect(stop).toBeLessThan(release);
    expect(kill).toBeLessThan(release);
    expect(release).toBe(r.calls.length - 1);
  });

  it("clears every timer, so nothing fires after finalization", () => {
    const expiries: ExpiryReason[] = [];
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, (reason) => expiries.push(reason));
    life.start();
    life.onReadyVerified();

    life.finalize({ status: 200, body: { kind: "DONE" } });
    vi.advanceTimersByTime(TIMERS.maxProcessingMs * 2);

    expect(expiries).toEqual([]);
    expect(r.calls.filter((c) => c === "respond")).toHaveLength(1);
  });

  it("an expiry after finalization is swallowed rather than re-entering", () => {
    let expiries = 0;
    const r = recorder();
    const life = new ParseLifecycle(r.hooks, TIMERS, () => {
      expiries += 1;
    });
    life.start();
    life.finalize({ status: 200, body: { kind: "DONE" } });
    vi.advanceTimersByTime(TIMERS.maxProcessingMs + 1);
    expect(expiries).toBe(0);
    expect(life.isSlotReleased).toBe(false); // R3: still waiting for the reap
    life.onChildReaped();
    expect(life.isSlotReleased).toBe(true);
  });
});

/* ── correction 4: the response cap matches what the parser can produce ── */

describe("109-C2.1 · maxResponseBytes is reconciled with maxEntries", () => {
  function maximalDone(entryCount: number): string {
    // A path at the exact limit, made of 3-byte BMP characters — the worst case
    // the calculation assumes.
    const path = "࿿".repeat(INGEST_LIMITS.maxEntryPathLength);
    const entry = {
      path,
      observedBytes: INGEST_LIMITS.maxObservedEntryBytes,
      sha256: "f".repeat(64),
      crc32: 0xffffffff,
    };
    return `${JSON.stringify({
      kind: "DONE",
      result: {
        entryCount,
        entries: Array.from({ length: entryCount }, () => entry),
        observedTotalBytes: INGEST_LIMITS.maxObservedTotalBytes,
      },
    })}\n`;
  }

  it("the derived worst case is at least as large as a real maximal message", () => {
    // Built for real and measured, not asserted from the same arithmetic the
    // implementation uses — otherwise the test would only prove the formula
    // equals itself.
    const sample = 50;
    const measured = Buffer.byteLength(maximalDone(sample), "utf8");
    const perEntry = WORST_CASE_ENTRY_JSON_BYTES;
    expect(measured).toBeLessThanOrEqual(perEntry * sample + 200);
    expect(perEntry).toBeGreaterThan(3 * INGEST_LIMITS.maxEntryPathLength);
  });

  it("a maximal DONE fits inside the cap", () => {
    expect(WORST_CASE_DONE_JSON_BYTES).toBeLessThanOrEqual(INGRESS_LIMITS.maxResponseBytes);
    const framer = new LineFramer(INGRESS_LIMITS.maxResponseBytes, INGRESS_LIMITS.maxResponseLines);
    const atCap = Buffer.alloc(INGRESS_LIMITS.maxResponseBytes, 0x61);
    expect(framer.push(atCap).overflow).toBe(false);
  });

  it("one byte beyond the cap is refused", () => {
    const framer = new LineFramer(INGRESS_LIMITS.maxResponseBytes, INGRESS_LIMITS.maxResponseLines);
    const overCap = Buffer.alloc(INGRESS_LIMITS.maxResponseBytes + 1, 0x61);
    expect(framer.push(overCap).overflow).toBe(true);
  });

  it("one entry beyond maxEntries is refused by the schema", () => {
    const tooMany = {
      kind: "DONE",
      result: {
        entryCount: INGEST_LIMITS.maxEntries + 1,
        entries: Array.from({ length: INGEST_LIMITS.maxEntries + 1 }, () => ({
          path: "a.scl",
          observedBytes: 1,
          sha256: "a".repeat(64),
          crc32: 0,
        })),
        observedTotalBytes: INGEST_LIMITS.maxEntries + 1,
      },
    };
    expect(parseTerminal(JSON.stringify(tooMany))).toBeNull();
  });

  it("the cap is DERIVED, so it cannot drift from the entry limit", () => {
    expect(INGRESS_LIMITS.maxResponseBytes).toBe(WORST_CASE_DONE_JSON_BYTES);
    // and the R1 value would not have been enough for even 1 000 entries
    expect(1_000 * WORST_CASE_ENTRY_JSON_BYTES).toBeGreaterThan(1024 * 1024);
  });
});
