/**
 * PHASE 109-C2.1 — R7: an abnormal stdout termination is not an end of output.
 *
 * R6 sent all three stream events through one handler:
 *
 *     child.stdout.on("end",   markStdoutFinished);
 *     child.stdout.on("close", markStdoutFinished);
 *     child.stdout.on("error", markStdoutFinished);
 *
 * so a transport that failed mid-stream established exactly the same fact as a
 * writer that had finished. Measured against R6 with a real child, destroying
 * the parent read side after the DONE arrived but before the queued EXTRA:
 *
 *      62ms  stdout data    READY
 *      63ms  stdout data    a schema-valid DONE
 *      64ms  stdout error   injected transport failure
 *      64ms  stdout close   without end
 *      76ms  child exit     code=0
 *      79ms  VERDICT        PUBLISH DONE   framer.finish().overflow=false
 *
 * The EXTRA that would have disqualified that DONE never arrived, and the
 * supervisor could not tell. `close` with no preceding `end` did the same on its
 * own, with no error event at all. The honest control — a real EOF — refuses
 * with AES-C2-053, so the reproduction is not vacuous.
 *
 * Only `end` now means CLEAN_END. `error` records STREAM_ERROR, `close` without
 * `end` records PREMATURE_CLOSE, and neither may publish. None of the three
 * decides anything on its own: the exit-code precedence still runs first, so a
 * stream broken by a child on its way to being SIGKILLed is still AES-C2-047.
 */

import { describe, expect, it } from "vitest";

import { decideChildOutcome } from "../child-outcome";
import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { INGRESS_LIMITS } from "../limits";
import { LineFramer } from "../line-framer";
import { cleanupComplete, nextCleanupStep } from "../cleanup-plan";
import { VerdictGate, type StreamCompletion } from "../verdict-gate";

const READY_LINE = `${JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 })}\n`;
const DONE_BODY = JSON.stringify({
  kind: "DONE",
  result: {
    entryCount: 1,
    entries: [{ path: "blocks/SMUGGLED.scl", observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],
    observedTotalBytes: 3,
  },
});

/* ── the gate classifies how the stream ended ───────────────────────────── */

describe("109-C2.1 R7 · the gate distinguishes three endings", () => {
  it("end alone is CLEAN_END", () => {
    const gate = new VerdictGate();
    gate.recordStdoutEnd();
    expect(gate.streamCompletion).toBe("CLEAN_END");
  });

  it("close AFTER end stays CLEAN_END", () => {
    const gate = new VerdictGate();
    gate.recordStdoutEnd();
    gate.recordStdoutClose();
    expect(gate.streamCompletion).toBe("CLEAN_END");
  });

  it("close WITHOUT end is PREMATURE_CLOSE", () => {
    const gate = new VerdictGate();
    gate.recordStdoutClose();
    expect(gate.streamCompletion).toBe("PREMATURE_CLOSE");
  });

  it("error is STREAM_ERROR", () => {
    const gate = new VerdictGate();
    gate.recordStdoutError();
    expect(gate.streamCompletion).toBe("STREAM_ERROR");
  });

  it("a close following an error does not downgrade it", () => {
    const gate = new VerdictGate();
    gate.recordStdoutError();
    gate.recordStdoutClose();
    expect(gate.streamCompletion).toBe("STREAM_ERROR");
  });

  it("an end arriving AFTER an error cannot launder the transport", () => {
    // Abnormal is sticky. Otherwise a late `end` would turn a broken stream
    // into a publishable one, which is the whole defect restated.
    const gate = new VerdictGate();
    gate.recordStdoutError();
    gate.recordStdoutEnd();
    expect(gate.streamCompletion).toBe("STREAM_ERROR");
  });

  it("the completion travels with the exit result", () => {
    const gate = new VerdictGate();
    gate.recordStdoutClose();
    gate.recordExit(0, null);
    expect(gate.take()).toEqual({ code: 0, signal: null, completion: "PREMATURE_CLOSE" });
  });

  it("an open stream still yields nothing, whatever the exit was", () => {
    const gate = new VerdictGate();
    gate.recordExit(0, null);
    expect(gate.take()).toBeNull();
  });
});

/* ── A–D · the verdict, with a real DONE already in hand ────────────────── */

describe("109-C2.1 R7 · a DONE off a broken transport is never published", () => {
  /** Replays READY + a valid DONE, then ends the stream the given way. */
  function verdictFor(
    completion: StreamCompletion,
    code: number | null = 0,
    signal: NodeJS.Signals | null = null,
  ) {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    let ready = false;
    let terminalLine: string | null = null;
    let extraTerminals = 0;

    const pushed = framer.push(Buffer.from(`${READY_LINE}${DONE_BODY}\n`, "utf8"));
    for (const line of pushed.lines) {
      if (line.trim().length === 0) continue;
      if (!ready) {
        ready = true;
        continue;
      }
      if (terminalLine === null) terminalLine = line;
      else extraTerminals += 1;
    }

    const gate = new VerdictGate();
    if (completion === "CLEAN_END") gate.recordStdoutEnd();
    else if (completion === "STREAM_ERROR") gate.recordStdoutError();
    else gate.recordStdoutClose();
    gate.recordExit(code, signal);

    const exit = gate.take();
    if (!exit) throw new Error("gate withheld a verdict with both facts recorded");
    expect(exit.completion).toBe(completion);

    return decideChildOutcome({
      code: exit.code,
      signal: exit.signal,
      completion: exit.completion,
      final: framer.finish(),
      terminalLine,
      extraTerminals,
    });
  }

  it("A · STREAM_ERROR with exit 0 is AES-C2-053, and the DONE is withheld", () => {
    const outcome = verdictFor("STREAM_ERROR");
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("failed before end of stream");
    expect(JSON.stringify(outcome)).not.toContain("SMUGGLED");
  });

  it("B · PREMATURE_CLOSE with exit 0 is AES-C2-053, and the DONE is withheld", () => {
    const outcome = verdictFor("PREMATURE_CLOSE");
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("without reaching end of stream");
    expect(JSON.stringify(outcome)).not.toContain("SMUGGLED");
  });

  it("C · CLEAN_END with exit 0 still publishes", () => {
    const outcome = verdictFor("CLEAN_END");
    expect(outcome.kind).toBe("PUBLISH");
    if (outcome.kind !== "PUBLISH") return;
    expect(outcome.terminal.kind).toBe("DONE");
  });

  it("D · an abnormal stream plus SIGKILL is still AES-C2-047", () => {
    // Precedence. A killed child usually breaks its own pipe on the way out;
    // reporting that as a framing complaint would bury the real cause.
    for (const completion of ["STREAM_ERROR", "PREMATURE_CLOSE"] as const) {
      const outcome = verdictFor(completion, null, "SIGKILL");
      expect(outcome.kind).toBe("REFUSE");
      if (outcome.kind !== "REFUSE") continue;
      expect(outcome.code).toBe(C.PARSER_TERMINATED);
      expect(outcome.detail).toContain("SIGKILL");
    }
  });

  it("D · an abnormal stream plus a non-zero exit is also AES-C2-047", () => {
    const outcome = verdictFor("STREAM_ERROR", 3, null);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_TERMINATED);
  });

  it("the abnormal check does not mask a framing overflow's own path", () => {
    // A clean end that overflowed is still a framing violation, unchanged.
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    framer.push(Buffer.from(`${READY_LINE}${DONE_BODY}\nEXTRA`, "utf8"));
    const outcome = decideChildOutcome({
      code: 0,
      signal: null,
      completion: "CLEAN_END",
      final: framer.finish(),
      terminalLine: DONE_BODY,
      extraTerminals: 0,
    });
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.detail).toContain("physical lines");
  });
});

/* ── FINDING 2 · the sweep has a postcondition, and it is bounded ───────── */

describe("109-C2.1 R7 · one sweep attempt is not a fact about the world", () => {
  const MAX = INGRESS_LIMITS.orphanSweepAttempts;
  const state = (stdoutFinished: boolean, childReaped: boolean, attempt = 0) => ({
    stdoutFinished,
    childReaped,
    attempt,
    maxAttempts: MAX,
  });

  it("cleanup is complete only when BOTH facts hold", () => {
    expect(cleanupComplete(state(true, true))).toBe(true);
    // A reaped child says nothing about a descendant holding the pipe.
    expect(cleanupComplete(state(false, true))).toBe(false);
    // A closed pipe says nothing about a process not yet accounted for.
    expect(cleanupComplete(state(true, false))).toBe(false);
    expect(cleanupComplete(state(false, false))).toBe(false);
  });

  it("a satisfied postcondition stops the loop", () => {
    expect(nextCleanupStep(state(true, true))).toEqual({ action: "DONE" });
  });

  it("an unsatisfied postcondition sweeps again — this is the R6 gap", () => {
    // R6 stopped here. A process forked after the snapshot survived, and the
    // slot was held for the life of the container.
    expect(nextCleanupStep(state(false, false, 0))).toEqual({
      action: "SWEEP_AGAIN",
      attempt: 1,
    });
  });

  it("every intermediate attempt retries", () => {
    for (let attempt = 0; attempt + 1 < MAX; attempt++) {
      expect(nextCleanupStep(state(false, false, attempt))).toEqual({
        action: "SWEEP_AGAIN",
        attempt: attempt + 1,
      });
    }
  });

  it("the retry budget is bounded — it ends in controlled termination", () => {
    // An attacker who can fork faster than the supervisor can scan must not be
    // able to hold it in a sweep loop for ever.
    expect(nextCleanupStep(state(false, false, MAX - 1))).toEqual({
      action: "TERMINATE_SELF",
    });
  });

  it("termination is reached from either half-satisfied state too", () => {
    expect(nextCleanupStep(state(true, false, MAX - 1))).toEqual({ action: "TERMINATE_SELF" });
    expect(nextCleanupStep(state(false, true, MAX - 1))).toEqual({ action: "TERMINATE_SELF" });
  });

  it("a late success on the final attempt still stops cleanly", () => {
    expect(nextCleanupStep(state(true, true, MAX - 1))).toEqual({ action: "DONE" });
  });

  it("the bounds are real numbers, not placeholders", () => {
    expect(INGRESS_LIMITS.orphanSweepAttempts).toBeGreaterThanOrEqual(2);
    expect(INGRESS_LIMITS.sweepPostconditionMs).toBeGreaterThan(0);
    // The caller's refusal must be able to leave before the process does.
    expect(INGRESS_LIMITS.recoveryFlushMs).toBeGreaterThan(0);
    expect(INGRESS_LIMITS.recoveryFlushMs).toBeLessThan(INGRESS_LIMITS.sweepPostconditionMs);
    // Total bounded recovery, worst case, must stay well inside a parse budget.
    const worstCase =
      INGRESS_LIMITS.orphanSweepGraceMs +
      INGRESS_LIMITS.orphanSweepAttempts * INGRESS_LIMITS.sweepPostconditionMs +
      INGRESS_LIMITS.recoveryFlushMs;
    expect(worstCase).toBeLessThan(30_000);
  });
});
