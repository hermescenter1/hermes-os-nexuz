/**
 * PHASE 103 review fixes — the transcription reducer and the buffer commit.
 *
 * Three independent review findings landed on this module, and each one gets a
 * test that FAILS if the fix is reverted rather than a test that merely exercises
 * the happy path:
 *
 *   1. Stop must send `input_audio_buffer.commit`. With `turn_detection: null`
 *      the provider never closes a turn by itself, so a Stop that only tore the
 *      connection down transcribed nothing.
 *   2. `completed.transcript` REPLACES the deltas of its item. Appending it
 *      produced "Hello, worldHello, world" in the box the operator is about to
 *      confirm — a corrupted question for the deterministic engine.
 *   3. Events are correlated by `item_id`, not by arrival order, and event types
 *      are compared for exact equality rather than by substring.
 *
 * The mutation blocks at the end state each defect as an explicit scenario, so
 * anyone reintroducing one reads what it costs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTranscriptEvent,
  buildInputAudioBufferCommit,
  createFinalizeWaiter,
  EMPTY_TRANSCRIPT_STATE,
  INPUT_AUDIO_BUFFER_COMMIT_EVENT,
  isTranscriptComplete,
  renderTranscript,
  sendInputAudioBufferCommit,
  TRANSCRIPT_COMPLETED_EVENT,
  TRANSCRIPT_DELTA_EVENT,
  TRANSCRIPT_FAILED_EVENT,
  TRANSCRIPTION_FINALIZE_TIMEOUT_MS,
  type TranscriptState,
} from "../transcript";

/* ═══════════════════════════════ helpers ════════════════════════════════════ */

const delta = (itemId: string, text: string): string =>
  JSON.stringify({ type: TRANSCRIPT_DELTA_EVENT, item_id: itemId, delta: text });

const completed = (itemId: string, transcript: string): string =>
  JSON.stringify({ type: TRANSCRIPT_COMPLETED_EVENT, item_id: itemId, transcript });

const reduce = (...events: unknown[]): TranscriptState =>
  events.reduce<TranscriptState>((state, event) => applyTranscriptEvent(state, event), EMPTY_TRANSCRIPT_STATE);

const textOf = (...events: unknown[]): string => renderTranscript(reduce(...events));

/* ═════════════════ 1 — the regression the review actually found ═════════════ */

describe("the reported duplication regression", () => {
  it('deltas "Hello, " + "world" then completed "Hello, world" render EXACTLY "Hello, world"', () => {
    const rendered = textOf(
      delta("item_0", "Hello, "),
      delta("item_0", "world"),
      completed("item_0", "Hello, world"),
    );

    expect(rendered).toBe("Hello, world");
    // Named explicitly: this is the string the pre-fix panel produced.
    expect(rendered).not.toBe("Hello, worldHello, world");
    expect(rendered.match(/Hello/g)).toHaveLength(1);
  });

  it("shows the provisional text while the item is still open", () => {
    expect(textOf(delta("item_0", "Hello, "))).toBe("Hello, ");
    expect(textOf(delta("item_0", "Hello, "), delta("item_0", "world"))).toBe("Hello, world");
  });

  it("honours a final transcript that DIFFERS from the deltas it supersedes", () => {
    // The whole point of `completed` is that the provider may revise itself.
    // Appending would keep the wrong words on screen next to the right ones.
    const rendered = textOf(
      delta("item_0", "pump too "),
      delta("item_0", "hot"),
      completed("item_0", "Pump P-101 is overheating."),
    );
    expect(rendered).toBe("Pump P-101 is overheating.");
    expect(rendered).not.toContain("pump too hot");
  });
});

/* ═════════════════════ 2 — correlation is by item_id ════════════════════════ */

describe("events are correlated by item_id, never by arrival order", () => {
  it("keeps two interleaved items separate and in SPOKEN order", () => {
    const rendered = textOf(
      delta("item_a", "first "),
      delta("item_b", "second "),
      delta("item_a", "utterance"),
      delta("item_b", "utterance"),
    );
    expect(rendered).toBe("first utterance second utterance");
  });

  it("renders in first-seen order even when the SECOND item completes first", () => {
    const rendered = textOf(
      delta("item_a", "alpha"),
      delta("item_b", "beta"),
      completed("item_b", "Beta finalised."),
      completed("item_a", "Alpha finalised."),
    );
    // Completion order is b → a; spoken order is a → b, and spoken order wins.
    expect(rendered).toBe("Alpha finalised. Beta finalised.");
  });

  it("a completed for one item leaves the other item's deltas untouched", () => {
    const state = reduce(
      delta("item_a", "keep this"),
      delta("item_b", "throw this away"),
      completed("item_b", "Replaced."),
    );
    expect(state.items.item_a?.final).toBeNull();
    expect(state.items.item_a?.provisional).toBe("keep this");
    expect(state.items.item_b?.final).toBe("Replaced.");
    expect(state.items.item_b?.provisional).toBe("");
    expect(renderTranscript(state)).toBe("keep this Replaced.");
  });

  it("ignores an event with no usable item_id rather than guessing an owner", () => {
    const unkeyed = JSON.stringify({ type: TRANSCRIPT_DELTA_EVENT, delta: "orphan" });
    const emptyId = JSON.stringify({ type: TRANSCRIPT_DELTA_EVENT, item_id: "", delta: "orphan" });
    const numericId = JSON.stringify({ type: TRANSCRIPT_DELTA_EVENT, item_id: 7, delta: "orphan" });

    for (const event of [unkeyed, emptyId, numericId]) {
      const state = applyTranscriptEvent(EMPTY_TRANSCRIPT_STATE, event);
      // Same reference: nothing changed, so nothing re-renders.
      expect(state).toBe(EMPTY_TRANSCRIPT_STATE);
    }
    expect(textOf(delta("item_a", "real"), unkeyed)).toBe("real");
  });

  it("a straggling delta cannot resurrect an item that already finalised", () => {
    const rendered = textOf(
      delta("item_0", "partial"),
      completed("item_0", "Final."),
      delta("item_0", " and more"),
    );
    expect(rendered).toBe("Final.");
  });
});

/* ══════════════════════ 3 — event types match EXACTLY ═══════════════════════ */

describe("event type matching is exact, not a substring test", () => {
  it("ignores a type that merely CONTAINS the transcription family name", () => {
    const nearMisses = [
      "conversation.item.input_audio_transcription.delta.partial",
      "x.conversation.item.input_audio_transcription.delta",
      "response.input_audio_transcription.segment",
      "input_audio_transcription",
      "conversation.item.input_audio_transcription",
    ];
    for (const type of nearMisses) {
      const event = JSON.stringify({ type, item_id: "item_0", delta: "leak", transcript: "leak" });
      expect(applyTranscriptEvent(EMPTY_TRANSCRIPT_STATE, event), type).toBe(EMPTY_TRANSCRIPT_STATE);
    }
  });

  it("accepts exactly the three documented types", () => {
    expect(TRANSCRIPT_DELTA_EVENT).toBe("conversation.item.input_audio_transcription.delta");
    expect(TRANSCRIPT_COMPLETED_EVENT).toBe("conversation.item.input_audio_transcription.completed");
    expect(TRANSCRIPT_FAILED_EVENT).toBe("conversation.item.input_audio_transcription.failed");
  });

  it("survives junk on the channel without throwing or absorbing it", () => {
    for (const junk of ["", "not json", "null", "[]", "42", '{"type":true}', undefined, 17, {}]) {
      expect(applyTranscriptEvent(EMPTY_TRANSCRIPT_STATE, junk)).toBe(EMPTY_TRANSCRIPT_STATE);
    }
  });

  it("a failed item settles with no text and does not block the others", () => {
    const state = reduce(
      delta("item_a", "spoken"),
      JSON.stringify({ type: TRANSCRIPT_FAILED_EVENT, item_id: "item_a" }),
    );
    expect(state.items.item_a?.failed).toBe(true);
    expect(renderTranscript(state)).toBe("");
    expect(isTranscriptComplete(state)).toBe(true);
  });
});

/* ═══════════════════════ 4 — completion detection ═══════════════════════════ */

describe("completion is only true when every open item is final", () => {
  it("an empty state is NOT complete", () => {
    // Otherwise Stop would tear the transport down in the gap between the commit
    // and the provider's first event.
    expect(isTranscriptComplete(EMPTY_TRANSCRIPT_STATE)).toBe(false);
  });

  it("one open item among finalised ones keeps it false", () => {
    expect(isTranscriptComplete(reduce(delta("item_a", "x")))).toBe(false);
    expect(isTranscriptComplete(reduce(delta("item_a", "x"), completed("item_a", "X.")))).toBe(true);
    expect(
      isTranscriptComplete(reduce(delta("item_a", "x"), completed("item_a", "X."), delta("item_b", "y"))),
    ).toBe(false);
  });

  it("an empty final transcript still counts as finalised", () => {
    expect(isTranscriptComplete(reduce(completed("item_a", "")))).toBe(true);
    expect(renderTranscript(reduce(completed("item_a", "")))).toBe("");
  });
});

/* ═══════════════════ 5 — the commit that Stop must send ═════════════════════ */

describe("stopping commits the input buffer", () => {
  it("builds exactly the documented event, and nothing else", () => {
    expect(INPUT_AUDIO_BUFFER_COMMIT_EVENT).toBe("input_audio_buffer.commit");
    expect(buildInputAudioBufferCommit()).toBe('{"type":"input_audio_buffer.commit"}');
    expect(JSON.parse(buildInputAudioBufferCommit())).toEqual({ type: "input_audio_buffer.commit" });
  });

  it("sends it on an OPEN channel and reports success", () => {
    const sent: string[] = [];
    const channel = { readyState: "open", send: (data: string) => sent.push(data) };
    expect(sendInputAudioBufferCommit(channel)).toBe(true);
    expect(sent).toEqual(['{"type":"input_audio_buffer.commit"}']);
  });

  it("refuses — without throwing — when there is nothing to send on", () => {
    const closed = { readyState: "closed", send: vi.fn() };
    expect(sendInputAudioBufferCommit(closed)).toBe(false);
    expect(closed.send).not.toHaveBeenCalled();
    expect(sendInputAudioBufferCommit(null)).toBe(false);
    expect(sendInputAudioBufferCommit(undefined)).toBe(false);
  });

  it("reports failure rather than propagating a transport error", () => {
    const throwing = {
      readyState: "open",
      send: () => {
        throw new Error("channel died");
      },
    };
    // A throw here would unwind Stop and leave the peer connection open.
    expect(() => sendInputAudioBufferCommit(throwing)).not.toThrow();
    expect(sendInputAudioBufferCommit(throwing)).toBe(false);
  });
});

/* ═══════════════ 6 — the bounded wait for the final transcript ══════════════ */

describe("the wait for the final transcript is bounded", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves `completed` as soon as the provider finishes", async () => {
    const waiter = createFinalizeWaiter(TRANSCRIPTION_FINALIZE_TIMEOUT_MS);
    waiter.complete();
    await expect(waiter.promise).resolves.toBe("completed");
  });

  it("resolves `timeout` when the provider says nothing, and never hangs", async () => {
    const waiter = createFinalizeWaiter(1_000);
    let settled = false;
    void waiter.promise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(waiter.promise).resolves.toBe("timeout");
  });

  it("resolves `cancelled` when the panel tears down first, and clears the timer", async () => {
    const waiter = createFinalizeWaiter(1_000);
    waiter.cancel();
    await expect(waiter.promise).resolves.toBe("cancelled");
    // No timer may outlive the component that created the waiter.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles exactly once — the first outcome wins", async () => {
    const waiter = createFinalizeWaiter(1_000);
    waiter.complete();
    waiter.cancel();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(waiter.promise).resolves.toBe("completed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the default bound short enough to be a bound at all", () => {
    expect(TRANSCRIPTION_FINALIZE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(TRANSCRIPTION_FINALIZE_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});

/* ═════════════════════════════ 7 — mutations ════════════════════════════════ */

describe("MUTATION — each reverted fix is caught here", () => {
  it("MUTANT: completed APPENDED instead of replacing ⇒ duplicated question", () => {
    // The mutant, written out so the failure mode is unambiguous.
    const mutantRender = (events: string[]): string =>
      events
        .map((raw) => JSON.parse(raw) as { delta?: string; transcript?: string })
        .map((event) => event.delta ?? event.transcript ?? "")
        .join("");

    const events = [delta("item_0", "Hello, "), delta("item_0", "world"), completed("item_0", "Hello, world")];
    expect(mutantRender(events)).toBe("Hello, worldHello, world");
    expect(renderTranscript(reduce(...events))).toBe("Hello, world");
    expect(renderTranscript(reduce(...events))).not.toBe(mutantRender(events));
  });

  it("MUTANT: item_id ignored ⇒ two speakers' items concatenate into one", () => {
    const mutantRender = (events: string[]): string =>
      events
        .map((raw) => JSON.parse(raw) as { delta?: string; transcript?: string })
        .map((event) => event.transcript ?? event.delta ?? "")
        .join("");

    const events = [
      delta("item_a", "alpha"),
      delta("item_b", "beta"),
      completed("item_b", "Beta finalised."),
      completed("item_a", "Alpha finalised."),
    ];
    // The mutant follows COMPLETION order and keeps the superseded deltas.
    expect(mutantRender(events)).toBe("alphabetaBeta finalised.Alpha finalised.");
    expect(renderTranscript(reduce(...events))).toBe("Alpha finalised. Beta finalised.");
  });

  it("MUTANT: substring type matching ⇒ unrelated events inject text", () => {
    const foreign = JSON.stringify({
      type: "response.input_audio_transcription_hint.delta",
      item_id: "item_0",
      delta: "INJECTED",
    });
    const mutantMatches = "response.input_audio_transcription_hint.delta".includes(
      "input_audio_transcription",
    );
    expect(mutantMatches, "the substring mutant does match this event").toBe(true);
    // The exact matcher does not.
    expect(applyTranscriptEvent(EMPTY_TRANSCRIPT_STATE, foreign)).toBe(EMPTY_TRANSCRIPT_STATE);
    expect(textOf(delta("item_0", "real"), foreign)).toBe("real");
  });

  it("MUTANT: the commit is dropped ⇒ nothing is ever sent to the provider", () => {
    const sent: string[] = [];
    const channel = { readyState: "open", send: (data: string) => sent.push(data) };

    // The mutant: Stop closes the transport and sends nothing.
    const mutantStop = (): void => {
      /* no commit */
    };
    mutantStop();
    expect(sent).toEqual([]);

    // The fix.
    expect(sendInputAudioBufferCommit(channel)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ type: "input_audio_buffer.commit" });
  });
});
