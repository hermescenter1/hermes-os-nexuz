/**
 * PHASE 103 review fix — `listening` may only mean "the data channel is open".
 *
 * THE RACE THIS CLOSES
 * `await peer.setRemoteDescription(...)` resolving says the SDP answer was
 * accepted. It says nothing about ICE or DTLS, which finish afterwards, and
 * `RTCDataChannel.readyState` is `connecting` until they do. The panel used to
 * announce `listening` on the strength of the SDP alone, which enabled the Stop
 * control against a channel that could not carry
 * `input_audio_buffer.commit`: `sendInputAudioBufferCommit` returned false, the
 * handler fell through to teardown, and everything the operator had said was
 * discarded with no error on screen.
 *
 * The fix is a bounded, cancellable waiter that resolves `open` ONLY on a real
 * `open` event backed by a `readyState` re-read, and denies on close, error and
 * timeout. This file tests it against fake channels — no DOM, no WebRTC — and
 * the panel-side ordering is pinned in `phase103-voice-panel-contract.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  awaitDataChannelOpen,
  DATA_CHANNEL_OPEN_TIMEOUT_MS,
  sendInputAudioBufferCommit,
  type DataChannelOpenOutcome,
} from "../transcript";

/* ═══════════════════════════ a fake data channel ════════════════════════════ */

/**
 * The smallest thing that behaves like an `RTCDataChannel` for this purpose:
 * a mutable `readyState` and real listener bookkeeping, so the test can prove
 * the waiter detaches what it attached.
 */
class FakeChannel {
  readyState: string;
  readonly listeners = new Map<string, Set<() => void>>();
  readonly sent: string[] = [];

  constructor(readyState = "connecting") {
    this.readyState = readyState;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    if (this.readyState !== "open") throw new Error("channel is not open");
    this.sent.push(data);
  }

  /** Fire an event without changing state — the provider's claim, unbacked. */
  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  /** Move to a state AND announce it, the way a real channel does. */
  transitionTo(readyState: string, event: string): void {
    this.readyState = readyState;
    this.emit(event);
  }

  get attachedCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

/* ══════════════════════════════ the waiter ══════════════════════════════════ */

describe("the data-channel open waiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves `open` on a real open event backed by readyState", async () => {
    const channel = new FakeChannel("connecting");
    const waiter = awaitDataChannelOpen(channel, 1_000);
    expect(channel.attachedCount).toBeGreaterThan(0);

    channel.transitionTo("open", "open");
    await expect(waiter.promise).resolves.toBe("open");
    // Everything it attached, it removed.
    expect(channel.attachedCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves `open` immediately for a channel that is ALREADY open", async () => {
    const channel = new FakeChannel("open");
    const waiter = awaitDataChannelOpen(channel, 1_000);
    await expect(waiter.promise).resolves.toBe("open");
    // No listener was ever needed, and no timer was armed.
    expect(channel.attachedCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("REFUSES an open event that readyState does not back", async () => {
    // The event is a claim; the readyState is the evidence. A channel that
    // announced itself and then failed must not be reported as usable.
    const channel = new FakeChannel("connecting");
    const waiter = awaitDataChannelOpen(channel, 1_000);
    channel.emit("open"); // readyState stays "connecting"
    await expect(waiter.promise).resolves.toBe("closed");
    expect(channel.attachedCount).toBe(0);
  });

  it("resolves `closed` on close, closing and error", async () => {
    const outcomes: DataChannelOpenOutcome[] = [];
    for (const [state, event] of [
      ["closed", "close"],
      ["closing", "closing"],
      ["connecting", "error"],
    ] as const) {
      const channel = new FakeChannel("connecting");
      const waiter = awaitDataChannelOpen(channel, 1_000);
      channel.transitionTo(state, event);
      outcomes.push(await waiter.promise);
      expect(channel.attachedCount, event).toBe(0);
    }
    expect(outcomes).toEqual(["closed", "closed", "closed"]);
  });

  it("resolves `closed` for a channel that was already dead, and for none at all", async () => {
    for (const state of ["closing", "closed"]) {
      const channel = new FakeChannel(state);
      await expect(awaitDataChannelOpen(channel, 1_000).promise, state).resolves.toBe("closed");
      expect(channel.attachedCount, state).toBe(0);
    }
    await expect(awaitDataChannelOpen(null, 1_000).promise).resolves.toBe("closed");
    await expect(awaitDataChannelOpen(undefined, 1_000).promise).resolves.toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves `timeout` when the channel never says anything", async () => {
    const channel = new FakeChannel("connecting");
    const waiter = awaitDataChannelOpen(channel, 1_000);

    let settled = false;
    void waiter.promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    await expect(waiter.promise).resolves.toBe("timeout");
    expect(channel.attachedCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves `cancelled` on teardown, clearing the timer and the listeners", async () => {
    const channel = new FakeChannel("connecting");
    const waiter = awaitDataChannelOpen(channel, 1_000);
    waiter.cancel();
    await expect(waiter.promise).resolves.toBe("cancelled");
    expect(channel.attachedCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles exactly once — the first ending wins", async () => {
    const channel = new FakeChannel("connecting");
    const waiter = awaitDataChannelOpen(channel, 1_000);
    channel.transitionTo("open", "open");
    channel.transitionTo("closed", "close");
    waiter.cancel();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(waiter.promise).resolves.toBe("open");
  });

  it("keeps the default bound a bound", () => {
    expect(DATA_CHANNEL_OPEN_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DATA_CHANNEL_OPEN_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

/* ══════════════════ the race, replayed end to end (fake channel) ════════════ */

/**
 * A miniature of the panel's start/stop sequence, parameterised by whether it
 * waits for `open`. Both variants share every other line, so the ONLY difference
 * between the mutant and the fix is the wait — which is what the comparison
 * below is meant to prove.
 */
async function startThenStop(options: { waitForOpen: boolean; channel: FakeChannel }): Promise<{
  reachedListening: boolean;
  committed: boolean;
  failed: boolean;
}> {
  const { channel, waitForOpen } = options;
  let reachedListening = false;
  let failed = false;

  if (waitForOpen) {
    const outcome = await awaitDataChannelOpen(channel, 1_000).promise;
    if (outcome !== "open" || channel.readyState !== "open") {
      failed = true;
      return { reachedListening, committed: false, failed };
    }
  }
  reachedListening = true;

  // Stop: the commit is only possible on an open channel.
  const committed = sendInputAudioBufferCommit(channel);
  return { reachedListening, committed, failed };
}

describe("the race itself", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("MUTANT: no wait ⇒ Stop against a `connecting` channel loses the utterance", async () => {
    const channel = new FakeChannel("connecting");
    const result = await startThenStop({ waitForOpen: false, channel });

    // The pre-fix panel: it believed it was listening…
    expect(result.reachedListening).toBe(true);
    // …the commit was silently refused…
    expect(result.committed).toBe(false);
    // …and nothing ever reached the provider.
    expect(channel.sent).toEqual([]);
    // No error was raised either — the operator sees a transcript and no reason.
    expect(result.failed).toBe(false);
  });

  it("the fix never reaches `listening` while the channel is connecting", async () => {
    const channel = new FakeChannel("connecting");
    const pending = startThenStop({ waitForOpen: true, channel });
    await vi.advanceTimersByTimeAsync(2_000); // the bound expires
    const result = await pending;

    expect(result.reachedListening).toBe(false);
    expect(result.failed).toBe(true);
    expect(channel.sent).toEqual([]);
  });

  it("a genuinely open channel reaches `listening` AND carries the commit", async () => {
    const channel = new FakeChannel("connecting");
    const pending = startThenStop({ waitForOpen: true, channel });
    channel.transitionTo("open", "open");
    const result = await pending;

    expect(result.failed).toBe(false);
    expect(result.reachedListening).toBe(true);
    expect(result.committed).toBe(true);
    expect(channel.sent).toEqual(['{"type":"input_audio_buffer.commit"}']);
  });

  it("a channel that dies before opening fails closed rather than pretending", async () => {
    for (const [state, event] of [
      ["closed", "close"],
      ["connecting", "error"],
    ] as const) {
      const channel = new FakeChannel("connecting");
      const pending = startThenStop({ waitForOpen: true, channel });
      channel.transitionTo(state, event);
      const result = await pending;

      expect(result.reachedListening, event).toBe(false);
      expect(result.failed, event).toBe(true);
      expect(channel.sent, event).toEqual([]);
    }
  });
});
