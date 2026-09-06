/**
 * PHASE 109-C2.1 — R6: process exit is not end of output.
 *
 * R5 decided the terminal verdict inside `child.on("exit")`. Node fires that
 * when the process is gone, which says nothing about the pipe — a child can
 * hand fd 1 to a descendant, exit 0, and let the descendant write afterwards.
 * Measured against R5 with a real process tree and the product's own compiled
 * framer and verdict:
 *
 *      365ms  stdout data   READY
 *      368ms  stdout data   DONE
 *      398ms  child exit    code=0
 *      424ms  VERDICT       PUBLISH DONE      <- answered, irrevocably
 *      690ms  stdout data   "EXTRA"           <- 266 ms too late
 *      696ms  stdout end
 *      699ms  child close
 *
 * Refusing `push` after `finish` would have been no defence: the response was
 * already on the wire at 424 ms.
 *
 * The rule now lives in `VerdictGate` — two independent facts, exit result and
 * end of output — and these tests hold it in place. The real process trees are
 * exercised in the Docker gate; what is unit-testable is the timing rule
 * itself, which is exactly the part that had no test in R5.
 */

import { describe, expect, it } from "vitest";

import { decideChildOutcome, type ChildOutcome } from "../child-outcome";
import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { INGRESS_LIMITS } from "../limits";
import { LineFramer } from "../line-framer";
import { VerdictGate } from "../verdict-gate";

const READY_LINE = `${JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 })}\n`;
const DONE_BODY = JSON.stringify({
  kind: "DONE",
  result: {
    entryCount: 1,
    entries: [{ path: "blocks/SMUGGLED.scl", observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],
    observedTotalBytes: 3,
  },
});

/* ── the gate itself ────────────────────────────────────────────────────── */

describe("109-C2.1 R6 · a verdict needs BOTH facts", () => {
  it("exit alone yields nothing — this is the R5 defect, stated as a rule", () => {
    const gate = new VerdictGate();
    gate.recordExit(0, null);
    expect(gate.sawExit).toBe(true);
    expect(gate.sawStdoutEnd).toBe(false);
    expect(gate.take()).toBeNull();
  });

  it("end of output alone yields nothing either", () => {
    const gate = new VerdictGate();
    gate.recordStdoutEnd();
    expect(gate.take()).toBeNull();
  });

  it("both, in either order, yield the recorded exit result", () => {
    const a = new VerdictGate();
    a.recordExit(0, null);
    a.recordStdoutEnd();
    expect(a.take()).toEqual({ code: 0, signal: null, completion: "CLEAN_END" });

    const b = new VerdictGate();
    b.recordStdoutEnd();
    b.recordExit(null, "SIGKILL");
    expect(b.take()).toEqual({ code: null, signal: "SIGKILL", completion: "CLEAN_END" });
  });

  it("hands the verdict out exactly once", () => {
    const gate = new VerdictGate();
    gate.recordExit(0, null);
    gate.recordStdoutEnd();
    expect(gate.take()).not.toBeNull();
    expect(gate.take()).toBeNull();
    expect(gate.isTaken).toBe(true);
  });

  it("keeps the FIRST exit result — a later event cannot rewrite it", () => {
    const gate = new VerdictGate();
    gate.recordExit(null, "SIGKILL");
    gate.recordExit(0, null);
    gate.recordStdoutEnd();
    expect(gate.take()).toEqual({ code: null, signal: "SIGKILL", completion: "CLEAN_END" });
  });

  it("recordStdoutEnd is idempotent", () => {
    const gate = new VerdictGate();
    gate.recordStdoutEnd();
    gate.recordStdoutEnd();
    gate.recordExit(0, null);
    expect(gate.take()).toEqual({ code: 0, signal: null, completion: "CLEAN_END" });
  });
});

/* ── the whole sequence, replayed in the supervisor's own order ─────────── */

describe("109-C2.1 R6 · replaying the measured timeline", () => {
  /**
   * Replays a supervisor stdout sequence with the verdict taken at a chosen
   * point, so R5 timing and R6 timing can be compared on identical input.
   */
  function replay(
    chunks: readonly string[],
    when: "exit" | "gate",
    exitAfterChunk: number,
  ): ChildOutcome | null {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    const gate = new VerdictGate();
    let ready = false;
    let terminalLine: string | null = null;
    let extraTerminals = 0;
    let verdict: ChildOutcome | null = null;

    const decide = (code: number | null, signal: NodeJS.Signals | null) => {
      if (verdict) return;
      verdict = decideChildOutcome({
        code,
        signal,
        completion: "CLEAN_END",
        final: framer.finish(),
        terminalLine,
        extraTerminals,
      });
    };

    chunks.forEach((chunk, index) => {
      if (!framer.hasOverflowed) {
        const pushed = framer.push(Buffer.from(chunk, "utf8"));
        if (!pushed.overflow) {
          for (const line of pushed.lines) {
            if (line.trim().length === 0) continue;
            if (!ready) {
              ready = true;
              continue;
            }
            if (terminalLine === null) terminalLine = line;
            else extraTerminals += 1;
          }
        }
      }
      if (index === exitAfterChunk) {
        gate.recordExit(0, null);
        // R5 acted here. R6 only records.
        if (when === "exit") decide(0, null);
      }
    });

    gate.recordStdoutEnd();
    const exit = gate.take();
    if (when === "gate" && exit) decide(exit.code, exit.signal);
    return verdict;
  }

  const SEQUENCE = [READY_LINE, `${DONE_BODY}\n`, "EXTRA"]; // EXTRA arrives after exit

  it("R5 timing publishes the DONE — the defect, reproduced as a unit", () => {
    const verdict = replay(SEQUENCE, "exit", 1);
    expect(verdict?.kind).toBe("PUBLISH");
  });

  it("R6 timing refuses the same input with AES-C2-053", () => {
    const verdict = replay(SEQUENCE, "gate", 1);
    expect(verdict?.kind).toBe("REFUSE");
    if (verdict?.kind !== "REFUSE") return;
    expect(verdict.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(verdict.detail).toContain("physical lines");
    expect(JSON.stringify(verdict)).not.toContain("SMUGGLED");
  });

  it("R6 timing refuses a NEWLINE-TERMINATED late EXTRA too", () => {
    const verdict = replay([READY_LINE, `${DONE_BODY}\n`, "EXTRA\n"], "gate", 1);
    expect(verdict?.kind).toBe("REFUSE");
    if (verdict?.kind !== "REFUSE") return;
    expect(verdict.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("a clean READY + DONE is still published under R6 timing", () => {
    const verdict = replay([READY_LINE, `${DONE_BODY}\n`], "gate", 1);
    expect(verdict?.kind).toBe("PUBLISH");
  });

  it("a clean READY + DONE with NO final newline is still published", () => {
    const verdict = replay([READY_LINE, DONE_BODY], "gate", 1);
    expect(verdict?.kind).toBe("PUBLISH");
  });

  it("late output split across several chunks is still caught", () => {
    const verdict = replay([READY_LINE, `${DONE_BODY}\n`, "EX", "TR", "A"], "gate", 1);
    expect(verdict?.kind).toBe("REFUSE");
  });
});

/* ── the deliberate diagnostic ordering survives the new timing ─────────── */

describe("109-C2.1 R6 · diagnostics keep their meaning", () => {
  function verdictFor(code: number | null, signal: NodeJS.Signals | null, stdout: string) {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    const gate = new VerdictGate();
    let ready = false;
    let terminalLine: string | null = null;
    let extraTerminals = 0;

    const pushed = framer.push(Buffer.from(stdout, "utf8"));
    if (!pushed.overflow) {
      for (const line of pushed.lines) {
        if (line.trim().length === 0) continue;
        if (!ready) {
          ready = true;
          continue;
        }
        if (terminalLine === null) terminalLine = line;
        else extraTerminals += 1;
      }
    }

    gate.recordExit(code, signal);
    gate.recordStdoutEnd();
    const exit = gate.take();
    if (!exit) throw new Error("gate refused to yield with both facts recorded");
    return decideChildOutcome({
      code: exit.code,
      signal: exit.signal,
      completion: exit.completion,
      final: framer.finish(),
      terminalLine,
      extraTerminals,
    });
  }

  it("a SIGKILLed child is still AES-C2-047, not a framing error", () => {
    // The balloon case. It usually leaves a partial unterminated line behind,
    // and calling that a protocol violation would bury the real cause.
    const outcome = verdictFor(null, "SIGKILL", `${READY_LINE}partial-line`);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_TERMINATED);
    expect(outcome.detail).toContain("SIGKILL");
  });

  it("an exit-0 child with READY + DONE + late EXTRA is AES-C2-053", () => {
    const outcome = verdictFor(0, null, `${READY_LINE}${DONE_BODY}\nEXTRA`);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("a valid exit-0 READY + DONE remains publishable", () => {
    const outcome = verdictFor(0, null, `${READY_LINE}${DONE_BODY}\n`);
    expect(outcome.kind).toBe("PUBLISH");
  });

  it("a non-zero exit still wins over a framing overflow", () => {
    const outcome = verdictFor(3, null, `${READY_LINE}${DONE_BODY}\nEXTRA\n`);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_TERMINATED);
  });
});
