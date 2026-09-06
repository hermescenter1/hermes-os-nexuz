/**
 * PHASE 109-C2.1 — bounded NDJSON framing for child output.
 *
 * WHY StringDecoder. R1 accumulated the child's stdout with
 * `buffer += chunk.toString("utf8")`. That is wrong whenever a chunk boundary
 * lands inside a multibyte UTF-8 sequence: `Buffer.toString` decodes each chunk
 * independently, so the trailing partial sequence becomes U+FFFD and the leading
 * bytes of the next chunk become more U+FFFD. The bytes are gone — no later
 * concatenation can recover them.
 *
 * A pipe splits wherever it likes. Persian paths are two to three bytes per code
 * point, so a project with Persian block names would corrupt its own entry paths
 * intermittently, depending on chunk sizes — the worst class of bug: rare,
 * data-dependent, and silently producing a digest for a path that was never in
 * the archive. `StringDecoder` holds an incomplete sequence back until its
 * continuation bytes arrive, which is exactly the guarantee needed.
 *
 * WHY A LINE LIMIT, AND NOT JUST A BYTE LIMIT.
 *
 * A byte cap does not bound memory. One newline is one byte and produces one
 * array element, so a flood of newlines converts a byte budget into an object
 * count multiplied by the per-string overhead. Measured against the previous
 * version of this file, feeding exactly `maxChildStdoutBytes` (8 340 138) bytes
 * of newlines in realistic 64 KiB pipe chunks:
 *
 *     overflow reported ... false
 *     lines returned ...... 8 340 138
 *     peak RSS, lines discarded as the supervisor does ... 113 MB
 *     peak RSS, lines retained as the host client did .... 305 MB
 *     container memory.max ............................... 128 MiB
 *
 * The retaining case is 2.3x the cgroup limit — an OOM reachable with 8 MB of
 * the cheapest possible input. So the count of PHYSICAL FRAMES is capped too,
 * and the cap is enforced inside the scan loop, before an oversized array can
 * be built. Every physical newline counts, blank lines included: a blank line
 * costs exactly as much array as a full one, so treating it as free is what
 * made the amplification possible.
 *
 * The byte cap still counts RAW BYTES, because a hostile child could otherwise
 * send 4-byte code points to get four times the budget.
 *
 * WHY BOTH ENDS OF THE STREAM RETURN THE SAME SHAPE.
 *
 * A cap is only real if the caller is told it fired. `push` reported overflow;
 * the old `end(): string` did not, and returned `""` for both "no trailing
 * frame" and "a trailing frame that broke the cap". Every frame — mid-stream or
 * trailing — now arrives through one `FramerResult`, so there is no second,
 * quieter path a consumer can read instead. See `finish()`.
 */

import { StringDecoder } from "node:string_decoder";

/** Why a framer stopped. `null` while it is still healthy. */
export type FramerOverflowReason = "bytes" | "lines" | null;

export interface FramerResult {
  /** Complete lines, in order, with the newline removed. Never partial. */
  readonly lines: readonly string[];
  /** True once either cap has been exceeded; the framer is then spent. */
  readonly overflow: boolean;
  /** Which cap was exceeded, for a diagnostic that names the real cause. */
  readonly reason: FramerOverflowReason;
}

const SPENT: FramerResult = Object.freeze({
  lines: Object.freeze([]) as readonly string[],
  overflow: true,
  reason: "lines" as FramerOverflowReason,
});

export class LineFramer {
  private readonly decoder = new StringDecoder("utf8");
  private readonly maxBytes: number;
  private readonly maxLines: number;
  private pending = "";
  private bytes = 0;
  private linesEmitted = 0;
  private overflowed = false;
  private finished = false;
  private overflowReason: FramerOverflowReason = null;

  /**
   * @param maxBytes  raw bytes accepted across the whole stream
   * @param maxLines  physical frames accepted across the whole stream, blank
   *                  lines included. The protocol decides this, not the
   *                  transport: two for the supervisor (READY plus one terminal
   *                  message), one for the host client (one response body).
   */
  constructor(maxBytes: number, maxLines: number) {
    this.maxBytes = maxBytes;
    this.maxLines = maxLines;
  }

  /** Raw bytes seen so far, across every chunk. */
  get bytesSeen(): number {
    return this.bytes;
  }

  /** Physical frames emitted so far. */
  get linesSeen(): number {
    return this.linesEmitted;
  }

  /** True once either cap was exceeded. Nothing further is decoded. */
  get hasOverflowed(): boolean {
    return this.overflowed;
  }

  /** Which cap was exceeded, or null. */
  get reason(): FramerOverflowReason {
    return this.overflowReason;
  }

  private spend(reason: Exclude<FramerOverflowReason, null>): FramerResult {
    this.overflowed = true;
    this.overflowReason = reason;
    // Drop every byte still held. An oversized stream must not be paid for in
    // memory while it is being refused.
    this.pending = "";
    return { lines: [], overflow: true, reason };
  }

  /**
   * Feed one chunk and take whatever complete lines it produced.
   *
   * The line cap is checked INSIDE the scan, before each line is appended, so
   * the returned array can never exceed `maxLines` no matter how many newlines
   * a single chunk contains.
   */
  push(chunk: Buffer): FramerResult {
    if (this.overflowed) return { lines: [], overflow: true, reason: this.overflowReason };

    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) return this.spend("bytes");

    this.pending += this.decoder.write(chunk);

    const lines: string[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      if (this.linesEmitted >= this.maxLines) return this.spend("lines");
      lines.push(this.pending.slice(0, newline));
      this.linesEmitted += 1;
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf("\n");
    }
    return { lines, overflow: false, reason: null };
  }

  /**
   * Close the stream and take the trailing frame, if there is one.
   *
   * RETURNS THE SAME RESULT SHAPE AS `push`, AND THAT IS THE WHOLE POINT.
   *
   * The previous API was `end(): string`. It counted a trailing unterminated
   * frame correctly and set the overflow state correctly — and then returned
   * `""`, which is indistinguishable from "there was no trailing frame". Both
   * consumers read only the return value, so:
   *
   *     READY\nDONE\nEXTRA      (maxLines = 2)
   *     push lines ......... ["READY", "DONE"]
   *     push overflow ...... false
   *     end() returned ..... ""            <- looks like a clean end of stream
   *     hasOverflowed ...... true          <- nobody looked
   *
   * The supervisor therefore accepted the DONE and silently discarded EXTRA,
   * and the host client did the same with a second unterminated frame. A cap
   * that is enforced but not reported is not a cap.
   *
   * Making the caller check a separate `hasOverflowed` getter would have left
   * the same hole one forgetful call site away. Returning a `FramerResult`
   * removes the ignorable path entirely: the trailing frame arrives through
   * `lines`, exactly like a newline-terminated one, and `overflow` is in the
   * same field the caller already handles on every `push`. Replacing `end`
   * rather than adding beside it makes every existing call site a compile
   * error, which is how the two-argument constructor is enforced too.
   *
   * A trailing unterminated line is still a physical frame and is still
   * counted, so a child cannot smuggle an extra message past the cap by
   * omitting its newline.
   *
   * An incomplete multibyte sequence still held by the decoder is genuinely
   * truncated input, so `StringDecoder.end()` renders it as U+FFFD here — and
   * that is correct: at end-of-stream those bytes really are unrecoverable, and
   * the resulting line will fail schema validation rather than be trusted.
   *
   * Idempotent: calling it twice reports the same state and never invents a
   * second trailing frame.
   */
  finish(): FramerResult {
    if (this.overflowed) return { lines: [], overflow: true, reason: this.overflowReason };
    if (this.finished) return { lines: [], overflow: false, reason: null };
    this.finished = true;

    this.pending += this.decoder.end();
    const rest = this.pending;
    this.pending = "";
    if (rest.length === 0) return { lines: [], overflow: false, reason: null };
    if (this.linesEmitted >= this.maxLines) return this.spend("lines");
    this.linesEmitted += 1;
    return { lines: [rest], overflow: false, reason: null };
  }
}

/** Exported so a caller can assert the spent shape without constructing one. */
export const SPENT_FRAMER_RESULT: FramerResult = SPENT;
