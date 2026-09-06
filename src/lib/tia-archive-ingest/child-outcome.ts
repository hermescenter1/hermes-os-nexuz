/**
 * PHASE 109-C2.1 — the verdict a finished child earns.
 *
 * WHY THIS IS NOT INSIDE `supervisor-entry.ts`.
 *
 * The decision below is pure: given how the child exited, what the framer said
 * at end of stream, and which lines were seen, there is exactly one correct
 * answer. It used to live inside the supervisor's `child.on("exit")` closure,
 * where nothing could reach it — the supervisor is an entry point that binds a
 * Unix socket at module load, and this development host refuses to listen on
 * AF_UNIX *and* on named pipes, so the only proof available was a real Linux
 * container.
 *
 * That is how R5 happened. `end(): string` returned `""` both for a clean end
 * of stream and for a stream that ended one frame OVER the physical-line cap,
 * so `READY\nDONE\nEXTRA` published the DONE and dropped the EXTRA in silence.
 * A container test can show the symptom; only a unit can pin every branch.
 *
 * So the decision moved out to a plain module with no I/O, no process control
 * and no socket. `supervisor-entry.ts` keeps the side effects — spawning,
 * timers, finalization, the reap gate — and calls this for the answer. The
 * static-safety gate still holds: nothing here spawns, and no module imports a
 * sidecar entry point.
 */

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";
import { INGRESS_LIMITS } from "./limits";
import type { FramerResult } from "./line-framer";
import type { StreamCompletion } from "./verdict-gate";
import { parseTerminal } from "./protocol";

export interface ChildOutcomeInput {
  /** Exit code as reported by `child.on("exit")`. `null` when signalled. */
  readonly code: number | null;
  /** Signal name, or null. */
  readonly signal: NodeJS.Signals | null;
  /** The result of `framer.finish()` — never `framer.end()`, which is gone. */
  readonly final: FramerResult;
  /**
   * How the output stream ended. A DONE read off a stream that was torn down
   * is not a verdict: the bytes that would have disqualified it may simply
   * never have arrived.
   */
  readonly completion: StreamCompletion;
  /** The first non-blank terminal line seen before end of stream, if any. */
  readonly terminalLine: string | null;
  /** How many terminal lines beyond the first were seen before end of stream. */
  readonly extraTerminals: number;
}

export type ChildOutcome =
  | { readonly kind: "REFUSE"; readonly code: IngestDiagnosticCode; readonly detail: string }
  | { readonly kind: "PUBLISH"; readonly terminal: Record<string, unknown> };

function refuse(code: IngestDiagnosticCode, detail: string): ChildOutcome {
  return { kind: "REFUSE", code, detail };
}

/**
 * Decide what a finished child earns. Pure: no timers, no I/O, no globals.
 *
 * ORDER IS THE CONTRACT, and each step is here because getting it wrong has a
 * name:
 *
 *  1. A child that DIED is diagnosed as a dead child. This stays ahead of the
 *     overflow branch on purpose — a SIGKILLed child frequently leaves a
 *     partial line behind, and calling that a protocol violation would bury the
 *     real cause under a framing message.
 *  2. ABNORMAL STREAM TERMINATION. Only `CLEAN_END` means the writer finished
 *     and every byte arrived. A `STREAM_ERROR` or a `PREMATURE_CLOSE` means the
 *     transport was torn down, so anything already received is a fragment of an
 *     unknown whole — measured on R6, a valid DONE was published while the
 *     child still had an EXTRA queued that the broken pipe never delivered.
 *     This sits BELOW the exit-code check on purpose: a child that was killed
 *     usually breaks its own pipe on the way out, and AES-C2-047 is the honest
 *     diagnosis of that, not a framing complaint.
 *  3. END-OF-STREAM OVERFLOW, before the trailing frame is folded in and before
 *     any previously received terminal line can be accepted. This is the R5
 *     fix: the overflow arrives in `final.overflow`, in the same field every
 *     `push` already reports, so there is no quieter path to read instead.
 *  4. Only then may the trailing frame become the terminal message.
 *
 * A refusal is returned for every failure. `PUBLISH` is reachable only when the
 * stream was within both caps, the child exited 0, exactly one terminal message
 * arrived, and it passed schema validation.
 */
export function decideChildOutcome(input: ChildOutcomeInput): ChildOutcome {
  const C = INGEST_DIAGNOSTIC_CODES;
  const { code, signal, final } = input;

  if (code !== 0) {
    return refuse(
      C.PARSER_TERMINATED,
      `child exit=${String(code)} signal=${String(signal ?? "none")}`,
    );
  }

  if (input.completion !== "CLEAN_END") {
    return refuse(
      C.PARSER_PROTOCOL_VIOLATION,
      input.completion === "STREAM_ERROR"
        ? "child stdout failed before end of stream"
        : "child stdout closed without reaching end of stream",
    );
  }

  if (final.overflow) {
    return refuse(
      C.PARSER_PROTOCOL_VIOLATION,
      final.reason === "lines"
        ? `child emitted more than ${INGRESS_LIMITS.maxChildStdoutLines} physical lines`
        : `child stdout exceeded ${INGRESS_LIMITS.maxChildStdoutBytes} bytes`,
    );
  }

  let terminalLine = input.terminalLine;
  let extraTerminals = input.extraTerminals;
  for (const line of final.lines) {
    if (line.trim().length === 0) continue;
    if (terminalLine === null) terminalLine = line;
    else extraTerminals += 1;
  }

  if (extraTerminals > 0) {
    return refuse(
      C.PARSER_PROTOCOL_VIOLATION,
      `expected 1 terminal message, saw ${extraTerminals + 1}`,
    );
  }
  if (terminalLine === null) {
    return refuse(C.PARSER_PROTOCOL_VIOLATION, "child exited without a terminal message");
  }

  const terminal = parseTerminal(terminalLine);
  if (!terminal) {
    return refuse(C.PARSER_PROTOCOL_VIOLATION, "terminal message failed schema validation");
  }
  return { kind: "PUBLISH", terminal: terminal as unknown as Record<string, unknown> };
}
