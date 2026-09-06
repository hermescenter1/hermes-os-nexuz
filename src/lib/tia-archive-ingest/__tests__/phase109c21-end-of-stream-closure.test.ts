/**
 * PHASE 109-C2.1 — R5: the end-of-stream overflow could be ignored.
 *
 * R4 made the physical-frame cap real, and `end()` counted a trailing
 * unterminated frame against it correctly. What it did NOT do was tell anyone.
 * Measured against the R4 framer, with the supervisor's own limits:
 *
 *     input .................... "READY\nDONE\nEXTRA"   (maxLines = 2)
 *     push lines ............... ["READY", "DONE"]
 *     push overflow ............ false
 *     end() returned ........... ""
 *     hasOverflowed after end .. true
 *     reason after end ......... "lines"
 *
 * `""` is what `end()` also returns for a stream that finished cleanly, so a
 * caller reading only the return value cannot tell the two apart. Both
 * consumers read only the return value. The supervisor therefore published the
 * DONE and discarded the EXTRA in silence, and the host client did the same
 * with a second unterminated frame.
 *
 * The fix is not "remember to check a getter". `end(): string` is gone, and
 * `finish(): FramerResult` puts the trailing frame and the overflow flag in the
 * same shape `push` already returns — so there is no quieter path left to read.
 * Every former call site became a compile error, which is how it was found.
 */

import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { decideChildOutcome } from "../child-outcome";
import { INGEST_DIAGNOSTIC_CODES as C } from "../diagnostics";
import { readTerminalResponse } from "../host-client";
import { INGRESS_LIMITS } from "../limits";
import { LineFramer } from "../line-framer";

const READY_LINE = `${JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 })}\n`;

const DONE_MESSAGE = {
  kind: "DONE",
  result: {
    entryCount: 1,
    entries: [{ path: "blocks/main.scl", observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],
    observedTotalBytes: 3,
  },
};
const DONE_BODY = JSON.stringify(DONE_MESSAGE);
const REFUSED_BODY = JSON.stringify({ kind: "REFUSED", code: C.CRC_MISMATCH });

function streamOf(payload: string, chunkSize = 65_536): Readable {
  const buffer = Buffer.from(payload, "utf8");
  let offset = 0;
  return new Readable({
    read() {
      if (offset >= buffer.length) {
        this.push(null);
        return;
      }
      this.push(buffer.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

/* ── A · the framer reports the end-of-stream overflow in its RESULT ────── */

describe("109-C2.1 R5 · finish() reports an over-cap trailing frame", () => {
  it('"a\\nb\\nextra" with maxLines=2 overflows with reason "lines"', () => {
    const framer = new LineFramer(1_000_000, 2);

    const pushed = framer.push(Buffer.from("a\nb\nextra", "utf8"));
    expect(pushed.lines).toEqual(["a", "b"]);
    expect(pushed.overflow).toBe(false);

    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("lines");
    expect(final.lines).toEqual([]);
  });

  it("the exact reported input, at the supervisor's own line cap", () => {
    const framer = new LineFramer(1_000_000, INGRESS_LIMITS.maxChildStdoutLines);
    expect(framer.push(Buffer.from("READY\nDONE\nEXTRA", "utf8")).overflow).toBe(false);

    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("lines");
  });

  it("a trailing frame WITHIN the cap comes back as a line, not an overflow", () => {
    const framer = new LineFramer(1_000_000, 2);
    expect(framer.push(Buffer.from("READY\nDONE", "utf8")).lines).toEqual(["READY"]);

    const final = framer.finish();
    expect(final.overflow).toBe(false);
    expect(final.reason).toBeNull();
    expect(final.lines).toEqual(["DONE"]);
  });

  it("a byte overflow is reported through the same field", () => {
    const framer = new LineFramer(4, 16);
    framer.push(Buffer.from("aaaaaaaaaa", "utf8"));

    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("bytes");
  });

  it("is idempotent: a second finish() invents no second trailing frame", () => {
    const framer = new LineFramer(1_000_000, 4);
    framer.push(Buffer.from("only-frame", "utf8"));

    expect(framer.finish().lines).toEqual(["only-frame"]);
    const again = framer.finish();
    expect(again.lines).toEqual([]);
    expect(again.overflow).toBe(false);
    expect(framer.linesSeen).toBe(1);
  });

  it("a spent framer stays spent through finish()", () => {
    const framer = new LineFramer(1_000_000, 1);
    framer.push(Buffer.from("\n\n", "utf8"));
    expect(framer.hasOverflowed).toBe(true);

    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("lines");
  });
});

/* ── B · the host client refuses a trailing unterminated frame ──────────── */

describe("109-C2.1 R5 · the host client cannot accept a terminal it should refuse", () => {
  it("a valid DONE followed by an unterminated EXTRA is AES-C2-053", async () => {
    const outcome = await readTerminalResponse(streamOf(`${DONE_BODY}\nEXTRA`), 200);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("physical line");
  });

  it("a valid REFUSED followed by an unterminated EXTRA is AES-C2-053", async () => {
    const outcome = await readTerminalResponse(streamOf(`${REFUSED_BODY}\nEXTRA`), 200);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // NOT the CRC_MISMATCH the first frame carried: a refusal read off an
    // over-cap stream is not a verdict, it is a protocol violation.
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("physical line");
  });

  it("the earlier DONE is never published on that path", async () => {
    const outcome = await readTerminalResponse(streamOf(`${DONE_BODY}\nEXTRA`), 200);
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toContain("blocks/main.scl");
  });

  it("a status branch cannot route around the final framing check", async () => {
    // The check used to sit AFTER the status branches, so any non-200 returned
    // before the stream was closed. A 429 body that breaks the cap is still a
    // protocol violation, not a readable busy signal.
    const outcome = await readTerminalResponse(streamOf(`${REFUSED_BODY}\nEXTRA`), 429);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("a well-formed 429 is still a readable PARSER_BUSY", async () => {
    // The gate that must not regress: readable429 = 24 depends on this.
    const busy = JSON.stringify({ kind: "REFUSED", code: C.PARSER_BUSY });
    const outcome = await readTerminalResponse(streamOf(`${busy}\n`), 429);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(C.PARSER_BUSY);
  });
});

/* ── D · everything legitimate still passes ─────────────────────────────── */

describe("109-C2.1 R5 · the legitimate shapes are unchanged", () => {
  it("host: DONE with a final newline is accepted", async () => {
    const outcome = await readTerminalResponse(streamOf(`${DONE_BODY}\n`), 200);
    expect(outcome.ok).toBe(true);
  });

  it("host: DONE with NO final newline is accepted", async () => {
    const outcome = await readTerminalResponse(streamOf(DONE_BODY), 200);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.done.result.entryCount).toBe(1);
  });

  it("supervisor shape: READY + terminal, both newline-terminated", () => {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    const pushed = framer.push(Buffer.from(`${READY_LINE}${DONE_BODY}\n`, "utf8"));
    expect(pushed.overflow).toBe(false);
    expect(pushed.lines).toHaveLength(2);

    const final = framer.finish();
    expect(final.overflow).toBe(false);
    expect(final.lines).toEqual([]);
  });

  it("supervisor shape: READY + an UNTERMINATED terminal as the final frame", () => {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    expect(framer.push(Buffer.from(`${READY_LINE}${DONE_BODY}`, "utf8")).lines).toEqual([
      READY_LINE.trimEnd(),
    ]);

    const final = framer.finish();
    expect(final.overflow).toBe(false);
    expect(final.lines).toEqual([DONE_BODY]);
    expect(framer.linesSeen).toBe(2);
  });

  it("Persian, ZWNJ and astral text survive a chunk split and finish()", () => {
    const path = "بلوک‌ها/نمودار\u{1D11E}.scl";
    const payload = Buffer.from(`${path}`, "utf8");

    for (let cut = 1; cut < payload.length; cut++) {
      const framer = new LineFramer(1_000_000, 4);
      framer.push(payload.subarray(0, cut));
      framer.push(payload.subarray(cut));
      const final = framer.finish();
      expect(final.overflow).toBe(false);
      expect(final.lines).toEqual([path]);
    }
  });

  it("the byte cap still fires through finish() when nothing is newline-terminated", () => {
    const framer = new LineFramer(8, 16);
    framer.push(Buffer.from("aaaaaaaaa", "utf8"));
    const final = framer.finish();
    expect(final.overflow).toBe(true);
    expect(final.reason).toBe("bytes");
  });
});

/* ── C · the supervisor's verdict, every branch, in process ─────────────── */

describe("109-C2.1 R5 · the supervisor never publishes a DONE off an over-cap stream", () => {
  /** Drives a whole child stdout stream through the supervisor's own limits. */
  function verdict(stdout: string, code: number | null = 0, signal: NodeJS.Signals | null = null) {
    const framer = new LineFramer(
      INGRESS_LIMITS.maxChildStdoutBytes,
      INGRESS_LIMITS.maxChildStdoutLines,
    );
    let terminalLine: string | null = null;
    let extraTerminals = 0;
    let ready = false;

    // Same fold the supervisor performs on each stdout chunk.
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

    return decideChildOutcome({
      code,
      signal,
      completion: "CLEAN_END",
      final: framer.finish(),
      terminalLine,
      extraTerminals,
    });
  }

  it("READY + DONE + unterminated EXTRA, exit 0 => AES-C2-053, never the DONE", () => {
    const outcome = verdict(`${READY_LINE}${DONE_BODY}\nEXTRA`);

    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
    expect(outcome.detail).toContain("physical lines");
    expect(JSON.stringify(outcome)).not.toContain("blocks/main.scl");
  });

  it("READY + DONE + newline-terminated EXTRA is refused by the push-side cap", () => {
    const outcome = verdict(`${READY_LINE}${DONE_BODY}\nEXTRA\n`);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_PROTOCOL_VIOLATION);
  });

  it("READY + DONE, both newline-terminated => PUBLISH", () => {
    const outcome = verdict(`${READY_LINE}${DONE_BODY}\n`);
    expect(outcome.kind).toBe("PUBLISH");
    if (outcome.kind !== "PUBLISH") return;
    expect(outcome.terminal.kind).toBe("DONE");
  });

  it("READY + an UNTERMINATED DONE as the final frame => PUBLISH", () => {
    // The legitimate shape a child that never writes a trailing newline emits.
    const outcome = verdict(`${READY_LINE}${DONE_BODY}`);
    expect(outcome.kind).toBe("PUBLISH");
    if (outcome.kind !== "PUBLISH") return;
    expect(outcome.terminal.kind).toBe("DONE");
  });

  it("a non-zero exit is still diagnosed as a dead child, not as framing", () => {
    // Order matters: a SIGKILLed child usually leaves a partial line, and
    // AES-C2-047 is what the Docker balloon gate reads.
    const outcome = verdict(`${READY_LINE}partial-line`, null, "SIGKILL");
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.code).toBe(C.PARSER_TERMINATED);
    expect(outcome.detail).toContain("SIGKILL");
  });

  it("a child that exits 0 with no terminal message is refused", () => {
    const outcome = verdict(READY_LINE);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.detail).toContain("without a terminal message");
  });

  it("a terminal line that fails schema validation is refused, not published", () => {
    const outcome = verdict(`${READY_LINE}{"kind":"DONE"}\n`);
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.detail).toContain("schema validation");
  });

  it("a byte overflow at end of stream is named as bytes, not as lines", () => {
    const framer = new LineFramer(8, 4);
    framer.push(Buffer.from("aaaaaaaaaaaa", "utf8"));
    const outcome = decideChildOutcome({
      code: 0,
      signal: null,
      completion: "CLEAN_END",
      final: framer.finish(),
      terminalLine: null,
      extraTerminals: 0,
    });
    expect(outcome.kind).toBe("REFUSE");
    if (outcome.kind !== "REFUSE") return;
    expect(outcome.detail).toContain("bytes");
  });
});
