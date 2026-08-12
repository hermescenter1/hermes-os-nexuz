/**
 * PHASE 103 — the browser-side transcription event reducer.
 *
 * WHY THIS IS A MODULE AND NOT A CLOSURE IN THE PANEL
 * The realtime transcription contract is the one part of the voice path with
 * real state: several conversation items can be in flight at once, each one
 * streams an unknown number of partial deltas, and each one is later replaced by
 * a single authoritative `completed` transcript. Getting that wrong duplicates
 * the operator's words in the box they are about to confirm — the transcript is
 * the input to the deterministic engine, so a duplicated sentence is a wrong
 * question, not a cosmetic defect. Keeping the rule here makes it a pure
 * function of (state, event) that a test can drive directly.
 *
 * THE THREE RULES
 *   1. A `delta` only ever grows the PROVISIONAL text of its own item.
 *   2. A `completed` REPLACES that item's provisional text with the final
 *      transcript. It is never appended to the deltas it supersedes.
 *   3. Items are keyed by `item_id` and rendered in first-seen order, so two
 *      items completing out of order still read in the order they were spoken.
 *
 * Event types are compared for EXACT equality. A substring test would let
 * `…transcription.delta` and a hypothetical `…transcription.delta.something`
 * collapse into the same branch, and would also match event families this panel
 * has never been shown to understand.
 *
 * Nothing here touches the DOM, the network or React: it is a reducer, a
 * renderer, a one-line message builder and a bounded waiter.
 */

/* ════════════════════════ the wire vocabulary ═══════════════════════════════ */

/** A partial transcription for one conversation item. */
export const TRANSCRIPT_DELTA_EVENT = "conversation.item.input_audio_transcription.delta";

/** The authoritative transcription for one conversation item. */
export const TRANSCRIPT_COMPLETED_EVENT = "conversation.item.input_audio_transcription.completed";

/** The provider gave up on one item. It contributes no text, but it does settle. */
export const TRANSCRIPT_FAILED_EVENT = "conversation.item.input_audio_transcription.failed";

/**
 * The client-to-provider event that closes the input buffer.
 *
 * The session is created with `turn_detection: null`, which means the provider
 * performs NO voice-activity detection and will therefore never decide on its
 * own that the operator has stopped speaking. Without this event the audio the
 * operator just dictated is never transcribed at all: no `completed` is ever
 * emitted and the transcript keeps whatever partial deltas happened to arrive.
 */
export const INPUT_AUDIO_BUFFER_COMMIT_EVENT = "input_audio_buffer.commit";

/* ═══════════════════════════════ the state ══════════════════════════════════ */

export interface TranscriptItem {
  /** The provider's `item_id`. The only thing that correlates delta to final. */
  readonly itemId: string;
  /** Deltas accumulated so far. Discarded the moment `final` arrives. */
  readonly provisional: string;
  /** The authoritative transcript, or null while the item is still open. */
  readonly final: string | null;
  /** True when the provider reported a transcription failure for this item. */
  readonly failed: boolean;
}

export interface TranscriptState {
  /** Item ids in FIRST-SEEN order — the order they were spoken in. */
  readonly order: readonly string[];
  readonly items: Readonly<Record<string, TranscriptItem>>;
}

export const EMPTY_TRANSCRIPT_STATE: TranscriptState = Object.freeze({
  order: Object.freeze([]) as readonly string[],
  items: Object.freeze({}) as Readonly<Record<string, TranscriptItem>>,
});

/* ═══════════════════════════════ the reducer ════════════════════════════════ */

interface ParsedTranscriptEvent {
  readonly type: string;
  readonly itemId: string;
  readonly delta: string | null;
  readonly transcript: string | null;
}

/**
 * Read one channel message into the fields this module understands.
 *
 * Total and defensive: anything that is not a JSON object carrying a recognised
 * `type` AND a non-empty `item_id` yields null and changes nothing. Refusing an
 * event without an `item_id` is deliberate — an unkeyed event cannot be
 * attributed to a conversation item, and guessing (for instance by folding it
 * into the most recent item) is exactly the correlation bug this module exists
 * to prevent.
 */
function parseTranscriptEvent(raw: unknown): ParsedTranscriptEvent | null {
  if (typeof raw !== "string") return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof decoded !== "object" || decoded === null) return null;

  const record = decoded as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (
    type !== TRANSCRIPT_DELTA_EVENT &&
    type !== TRANSCRIPT_COMPLETED_EVENT &&
    type !== TRANSCRIPT_FAILED_EVENT
  ) {
    return null;
  }

  const itemId = typeof record.item_id === "string" ? record.item_id : "";
  if (itemId.length === 0) return null;

  return {
    type,
    itemId,
    delta: typeof record.delta === "string" ? record.delta : null,
    transcript: typeof record.transcript === "string" ? record.transcript : null,
  };
}

function withItem(state: TranscriptState, item: TranscriptItem): TranscriptState {
  const known = state.order.includes(item.itemId);
  return {
    order: known ? state.order : [...state.order, item.itemId],
    items: { ...state.items, [item.itemId]: item },
  };
}

/**
 * Apply one realtime event.
 *
 * Returns the SAME state reference when the event changes nothing, so a caller
 * can skip a re-render on the unrecognised traffic that shares this channel.
 */
export function applyTranscriptEvent(state: TranscriptState, raw: unknown): TranscriptState {
  const event = parseTranscriptEvent(raw);
  if (event === null) return state;

  const existing: TranscriptItem = state.items[event.itemId] ?? {
    itemId: event.itemId,
    provisional: "",
    final: null,
    failed: false,
  };

  if (event.type === TRANSCRIPT_DELTA_EVENT) {
    // A delta that arrives after the item was finalised is a straggler: the
    // authoritative text already superseded it, so replaying it would corrupt
    // a settled item.
    if (existing.final !== null || event.delta === null || event.delta.length === 0) return state;
    return withItem(state, { ...existing, provisional: `${existing.provisional}${event.delta}` });
  }

  if (event.type === TRANSCRIPT_COMPLETED_EVENT) {
    if (event.transcript === null) return state;
    // REPLACES, never appends: `provisional` is dropped on the floor.
    return withItem(state, { ...existing, provisional: "", final: event.transcript });
  }

  // TRANSCRIPT_FAILED_EVENT — the item settles with no text of its own, so a
  // failure on one item cannot hold the whole finalisation open.
  return withItem(state, { ...existing, provisional: "", final: "", failed: true });
}

/**
 * Render the transcript the operator sees.
 *
 * A finalised item contributes its authoritative text; an open one contributes
 * the deltas received so far. Items are joined with a single space in spoken
 * order, and a lone item is returned byte-for-byte as the provider sent it —
 * the join must not perturb the single-item case, which is the common one.
 */
export function renderTranscript(state: TranscriptState): string {
  const pieces: string[] = [];
  for (const itemId of state.order) {
    const item = state.items[itemId];
    if (item === undefined) continue;
    const text = item.final ?? item.provisional;
    if (text.trim().length === 0) continue;
    pieces.push(text);
  }
  return pieces.join(" ");
}

/**
 * Has every item the provider opened been finalised?
 *
 * An empty state is NOT complete: no item means nothing was transcribed yet, and
 * treating that as done would let the panel tear the connection down in the gap
 * between the commit and the provider's first event.
 */
export function isTranscriptComplete(state: TranscriptState): boolean {
  if (state.order.length === 0) return false;
  return state.order.every((itemId) => (state.items[itemId]?.final ?? null) !== null);
}

/* ═══════════════════════════ committing the buffer ══════════════════════════ */

/** The subset of `RTCDataChannel` this module needs, so a test can stand in. */
export interface TranscriptCommitChannel {
  readonly readyState: string;
  send(data: string): void;
}

export function buildInputAudioBufferCommit(): string {
  return JSON.stringify({ type: INPUT_AUDIO_BUFFER_COMMIT_EVENT });
}

/**
 * Ask the provider to transcribe everything captured so far.
 *
 * Returns false — rather than throwing — when there is no open channel to send
 * on, so the caller can fall straight through to teardown instead of leaving a
 * microphone open while an exception unwinds.
 */
export function sendInputAudioBufferCommit(
  channel: TranscriptCommitChannel | null | undefined,
): boolean {
  if (!channel || channel.readyState !== "open") return false;
  try {
    channel.send(buildInputAudioBufferCommit());
    return true;
  } catch {
    return false;
  }
}

/* ═════════════════════ waiting for the channel to open ═════════════════════ */

/**
 * How long the panel waits for the data channel to reach `open` after the SDP
 * exchange.
 *
 * `setRemoteDescription` resolving does NOT mean the channel is usable: ICE and
 * DTLS still have to complete, and `RTCDataChannel.readyState` is `connecting`
 * until they do. Entering the listening state on the strength of the SDP alone
 * lets the operator press Stop against a channel that cannot carry the commit —
 * the commit is refused, and everything they said is lost with no error shown.
 */
export const DATA_CHANNEL_OPEN_TIMEOUT_MS = 10_000;

export type DataChannelOpenOutcome = "open" | "closed" | "timeout" | "cancelled";

/** The subset of `RTCDataChannel` this module needs, so a test can stand in. */
export interface OpenableChannel {
  readonly readyState: string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface DataChannelOpenWaiter {
  readonly promise: Promise<DataChannelOpenOutcome>;
  /** The panel is tearing down for another reason (error, unmount, restart). */
  cancel(): void;
}

/**
 * Resolve once the channel is PROVABLY open — or once it provably never will be.
 *
 * `open` is returned only when the real `open` event fired AND `readyState` says
 * `open` at that moment: the event alone is a claim, the readyState is the
 * evidence, and a channel that announced itself and then immediately failed must
 * not be reported as usable.
 *
 * Every other ending is a denial: `closed` for a channel that went to
 * closing/closed/error, `timeout` for one that never said anything, `cancelled`
 * for a teardown the panel itself started. Listeners are removed and the timer is
 * cleared on every path, so no waiter outlives the connection it watched.
 */
export function awaitDataChannelOpen(
  channel: OpenableChannel | null | undefined,
  timeoutMs: number = DATA_CHANNEL_OPEN_TIMEOUT_MS,
): DataChannelOpenWaiter {
  let settle: ((outcome: DataChannelOpenOutcome) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<DataChannelOpenOutcome>((resolve) => {
    settle = resolve;
  });

  // Mutually recursive by design: `finish` detaches the listeners, the listeners
  // call `finish`. Neither runs before both are initialised.
  function finish(outcome: DataChannelOpenOutcome): void {
    if (settle === null) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (channel) {
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("close", onDead);
      channel.removeEventListener("closing", onDead);
      channel.removeEventListener("error", onDead);
    }
    const resolve = settle;
    settle = null;
    resolve(outcome);
  }

  const onOpen = (): void => finish(channel?.readyState === "open" ? "open" : "closed");
  const onDead = (): void => finish("closed");

  if (!channel) {
    finish("closed");
    return { promise, cancel: () => finish("cancelled") };
  }

  // Already settled before we could listen: read the state rather than waiting
  // for an event that has already been and gone.
  if (channel.readyState === "open") {
    finish("open");
    return { promise, cancel: () => finish("cancelled") };
  }
  if (channel.readyState !== "connecting") {
    finish("closed");
    return { promise, cancel: () => finish("cancelled") };
  }

  channel.addEventListener("open", onOpen);
  channel.addEventListener("close", onDead);
  channel.addEventListener("closing", onDead);
  channel.addEventListener("error", onDead);
  timer = setTimeout(() => finish("timeout"), timeoutMs);

  return { promise, cancel: () => finish("cancelled") };
}

/* ══════════════════════════ the bounded wait ════════════════════════════════ */

/**
 * How long the panel keeps the transport alive waiting for the final
 * transcript after committing.
 *
 * Bounded on purpose. An unbounded wait would hand a silent provider the power
 * to keep a peer connection open indefinitely; the microphone is already dead by
 * this point, so the worst case of the timeout expiring is a transcript that
 * still shows its last deltas.
 */
export const TRANSCRIPTION_FINALIZE_TIMEOUT_MS = 5_000;

export type FinalizeOutcome = "completed" | "timeout" | "cancelled";

export interface FinalizeWaiter {
  readonly promise: Promise<FinalizeOutcome>;
  /** The provider finished every open item. */
  complete(): void;
  /** The panel is tearing down for another reason (error, unmount, restart). */
  cancel(): void;
}

/**
 * A promise that settles exactly once: on completion, on cancellation, or when
 * the bound expires. The timer is always cleared, so no waiter can outlive the
 * component that made it.
 */
export function createFinalizeWaiter(
  timeoutMs: number = TRANSCRIPTION_FINALIZE_TIMEOUT_MS,
): FinalizeWaiter {
  let settle: ((outcome: FinalizeOutcome) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const promise = new Promise<FinalizeOutcome>((resolve) => {
    settle = resolve;
  });

  const finish = (outcome: FinalizeOutcome): void => {
    if (settle === null) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const resolve = settle;
    settle = null;
    resolve(outcome);
  };

  timer = setTimeout(() => finish("timeout"), timeoutMs);

  return {
    promise,
    complete: () => finish("completed"),
    cancel: () => finish("cancelled"),
  };
}
