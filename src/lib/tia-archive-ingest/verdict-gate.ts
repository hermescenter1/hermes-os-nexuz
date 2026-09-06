/**
 * PHASE 109-C2.1 — when a child's verdict may be decided.
 *
 * THE RULE THIS EXISTS TO ENFORCE: a terminal verdict needs TWO independent
 * facts, and process exit is only one of them.
 *
 * `child.on("exit")` says the process is gone. It says nothing about the pipe.
 * A child can hand fd 1 to a descendant, exit 0, and let the descendant keep
 * writing. Measured against R5, with a real process tree:
 *
 *      67ms  stdout data   READY
 *      69ms  stdout data   DONE
 *      89ms  child exit    code=0             <- R5 decided HERE and answered
 *     346ms  stdout data   "EXTRA"            <- 257 ms too late to matter
 *     351ms  stdout end
 *     352ms  child close
 *
 * R5 published the DONE at 89 ms. Nothing arriving afterwards could retract it,
 * so refusing `push` after `finish` would have been no defence at all — the
 * response was already on the wire.
 *
 * ORDERING, MEASURED RATHER THAN ASSUMED. Over 60 randomised runs in the
 * supervisor's exact spawn shape (`stdio: ["pipe","pipe","pipe"]`):
 *
 *     data … -> exit -> data(late) -> stdout.end -> proc.close -> stdout.close
 *
 *     data after stdout end ......................... 0 / 60
 *     stdout end not before proc close .............. 0 / 60
 *     late bytes missing at end ..................... 0 / 60
 *
 * So end-of-output — `end`, or `close` for a stream that was destroyed and will
 * never emit `end` — is the second fact, and it always arrives after every
 * `data` event.
 *
 * This class is deliberately tiny and pure. The rule it holds was previously a
 * pair of `if`s inside a socket-bound entry point that no unit could reach,
 * which is how the race survived R5 review.
 */

/**
 * HOW THE OUTPUT STREAM ENDED. Not every end of stream is a clean one.
 *
 * R6 sent `end`, `close` and `error` through one handler, so a transport that
 * failed mid-stream was indistinguishable from a child that finished talking.
 * Measured against R6:
 *
 *      62ms  stdout data    READY
 *      63ms  stdout data    a schema-valid DONE
 *      64ms  stdout error   injected transport failure
 *      64ms  stdout close   without end
 *      76ms  child exit     code=0
 *      79ms  VERDICT        PUBLISH DONE      <- off a broken transport
 *
 * The EXTRA the child had queued was never consumed, and a DONE read from a
 * truncated stream was published as a verdict. `close` with no preceding `end`
 * did the same on its own, with no error event at all.
 *
 * Only `end` means "the writer is finished and every byte arrived".
 */
export type StreamCompletion = "CLEAN_END" | "STREAM_ERROR" | "PREMATURE_CLOSE";

export interface ExitResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** How the output stream ended. Only CLEAN_END may lead to a publish. */
  readonly completion: StreamCompletion;
}

export class VerdictGate {
  private exitCode: number | null = null;
  private exitSignal: NodeJS.Signals | null = null;
  private exitRecorded = false;
  private completion: StreamCompletion | null = null;
  private sawEnd = false;
  private taken = false;

  /** Record the exit result. First call wins; later ones are ignored. */
  recordExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitRecorded) return;
    this.exitRecorded = true;
    this.exitCode = code;
    this.exitSignal = signal;
  }

  /**
   * Clean EOF: the writer finished and every byte was delivered.
   *
   * This is the ONLY call that can establish `CLEAN_END`, and it cannot undo an
   * abnormal state that was already recorded — an `end` arriving after an
   * `error` would otherwise launder a broken transport into a clean one.
   */
  recordStdoutEnd(): void {
    this.sawEnd = true;
    if (this.completion === null) this.completion = "CLEAN_END";
  }

  /** The transport failed. Sticky: nothing later may downgrade it. */
  recordStdoutError(): void {
    this.completion = "STREAM_ERROR";
  }

  /**
   * The stream closed. Clean only if `end` came first; otherwise the stream was
   * torn down with bytes possibly still unsent, which is not an end of output.
   */
  recordStdoutClose(): void {
    if (this.completion !== null) return;
    this.completion = this.sawEnd ? "CLEAN_END" : "PREMATURE_CLOSE";
  }

  /** True once the process exit has been observed. */
  get sawExit(): boolean {
    return this.exitRecorded;
  }

  /** True once no further stdout data can arrive, cleanly or otherwise. */
  get sawStdoutEnd(): boolean {
    return this.completion !== null;
  }

  /** How the stream ended, or null while it is still open. */
  get streamCompletion(): StreamCompletion | null {
    return this.completion;
  }

  /** True once a verdict has been handed out. */
  get isTaken(): boolean {
    return this.taken;
  }

  /**
   * The exit result — but ONLY when both facts are in hand, and only once.
   *
   * Returning `null` is the whole contract: a caller that asks too early is
   * told to wait, rather than being handed a verdict it cannot take back.
   */
  take(): ExitResult | null {
    if (this.taken) return null;
    if (!this.exitRecorded || this.completion === null) return null;
    this.taken = true;
    return { code: this.exitCode, signal: this.exitSignal, completion: this.completion };
  }
}
