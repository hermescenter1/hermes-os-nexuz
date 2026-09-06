/**
 * PHASE 109-C2.1 — the web side of the boundary.
 *
 * This module runs INSIDE the Hermes web process, and everything it is allowed
 * to do is here: open a Unix domain socket, stream bytes to the parser sidecar,
 * and read back one bounded terminal message. It never parses an archive, never
 * spawns anything, and never sees a decompressed byte.
 *
 * Nothing is published unless a schema-valid `DONE` arrives. Every other
 * outcome — unavailable, busy, timeout, malformed, oversized, disconnected —
 * discards the whole response and returns a stable code.
 */

import { request as httpRequest } from "node:http";
import type { Readable } from "node:stream";

import { ingestAvailability } from "./availability";
import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";
import { INGEST_LIMITS, INGRESS_LIMITS } from "./limits";
import { LineFramer } from "./line-framer";
import { parseTerminal, type DoneMessage } from "./protocol";

export type IngestOutcome =
  | { readonly ok: true; readonly done: DoneMessage }
  | { readonly ok: false; readonly code: IngestDiagnosticCode; readonly detail: string };

export interface IngestRequest {
  /** The container bytes. Bounded before anything is sent. */
  readonly container: Uint8Array;
  /** Overridden only by tests; production always uses the compose socket path. */
  readonly socketPath?: string;
  /** Overridden only by tests. */
  readonly platform?: string;
  /** Overridden only by tests. */
  readonly timeoutMs?: number;
}

function refuse(code: IngestDiagnosticCode, detail: string): IngestOutcome {
  return { ok: false, code, detail };
}

/**
 * Read ONE bounded terminal message from a response stream.
 *
 * Extracted from `ingestArchive` so the framing rules can be exercised against
 * a plain `Readable` rather than only through a real socket. That is not
 * convenience: this repository is developed on a host that cannot listen on a
 * Unix socket OR a named pipe (both return EACCES), so a socket-only test of
 * this logic would never actually run here.
 *
 * Framed with `StringDecoder`, never `chunk.toString("utf8")` per chunk: a
 * chunk boundary inside a multibyte sequence would otherwise become U+FFFD on
 * both sides of the split, silently corrupting a Persian entry path in a way no
 * later concatenation can recover.
 *
 * ONE SLOT, NOT AN ARRAY. A response is exactly one terminal message. Retaining
 * a list of lines is what let a newline flood turn an 8 MB response into 305 MB
 * of resident memory inside a 128 MiB cgroup — measured. The framer now refuses
 * past the first physical line, and there is nowhere to accumulate even if it
 * did not.
 */
export function readTerminalResponse(
  stream: Readable,
  statusCode: number | undefined,
): Promise<IngestOutcome> {
  const C = INGEST_DIAGNOSTIC_CODES;

  return new Promise<IngestOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: IngestOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const framer = new LineFramer(
      INGRESS_LIMITS.maxResponseBytes,
      INGRESS_LIMITS.maxResponseLines,
    );
    let terminal: string | null = null;

    stream.on("data", (chunk: Buffer) => {
      const framed = framer.push(chunk);
      if (framed.overflow) {
        stream.destroy();
        finish(
          refuse(
            C.PARSER_PROTOCOL_VIOLATION,
            framed.reason === "lines"
              ? `response exceeded ${INGRESS_LIMITS.maxResponseLines} physical line`
              : "response exceeded the size cap",
          ),
        );
        return;
      }
      for (const line of framed.lines) terminal = line;
    });

    stream.on("end", () => {
      // THE FINAL FRAMING CHECK RUNS FIRST, AND UNCONDITIONALLY.
      //
      // It used to sit after the status branches, so a 429 or any non-200
      // returned before the stream was ever closed properly — and on the 200
      // path the old `end(): string` returned "" for both "clean end" and "one
      // frame over the cap", so `DONE\nEXTRA` was accepted as a plain DONE.
      // Closing here means no status can route around the check.
      const final = framer.finish();
      if (final.overflow) {
        finish(
          refuse(
            C.PARSER_PROTOCOL_VIOLATION,
            final.reason === "lines"
              ? `response exceeded ${INGRESS_LIMITS.maxResponseLines} physical line`
              : "response exceeded the size cap",
          ),
        );
        return;
      }
      for (const line of final.lines) {
        if (line.trim().length === 0) continue;
        if (terminal !== null) {
          finish(refuse(C.PARSER_PROTOCOL_VIOLATION, "more than one terminal line"));
          return;
        }
        terminal = line;
      }

      if (statusCode === 429) {
        finish(refuse(C.PARSER_BUSY, "a parse is already running"));
        return;
      }
      if (statusCode !== 200) {
        finish(refuse(C.PARSER_PROTOCOL_VIOLATION, `status ${String(statusCode)}`));
        return;
      }

      if (terminal === null || terminal.trim().length === 0) {
        finish(refuse(C.PARSER_PROTOCOL_VIOLATION, "no terminal line in the response"));
        return;
      }

      const parsed = parseTerminal(terminal.trim());
      if (!parsed) {
        finish(refuse(C.PARSER_PROTOCOL_VIOLATION, "terminal message failed schema validation"));
        return;
      }
      if (parsed.kind === "REFUSED") {
        finish(refuse(parsed.code as IngestDiagnosticCode, parsed.detail ?? ""));
        return;
      }
      finish({ ok: true, done: parsed });
    });

    stream.on("error", () => finish(refuse(C.PARSER_PROTOCOL_VIOLATION, "response stream error")));
  });
}

/**
 * Send one container to the parser sidecar and await its single verdict.
 *
 * The container is bounded here as well as inside the sidecar. Two checks of
 * the same limit is not redundancy: the sidecar's check is what protects the
 * parser, and this one is what stops the web process from spending 32 MiB of
 * socket traffic on a request that cannot possibly be admitted.
 */
export function ingestArchive(req: IngestRequest): Promise<IngestOutcome> {
  const C = INGEST_DIAGNOSTIC_CODES;

  const availability = ingestAvailability(req.platform);
  if (!availability.available) {
    return Promise.resolve(refuse(availability.code, availability.reason));
  }
  if (req.container.byteLength > INGEST_LIMITS.maxContainerBytes) {
    return Promise.resolve(
      refuse(
        C.CONTAINER_TOO_LARGE,
        `${req.container.byteLength} bytes exceeds ${INGEST_LIMITS.maxContainerBytes}`,
      ),
    );
  }

  const socketPath = req.socketPath ?? availability.socketPath;
  const timeoutMs = req.timeoutMs ?? INGEST_LIMITS.maxProcessingMs;

  return new Promise<IngestOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: IngestOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const clientRequest = httpRequest(
      {
        socketPath,
        path: "/ingest",
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(req.container.byteLength),
        },
      },
      (res) => {
        void readTerminalResponse(res, res.statusCode).then(finish);
      },
    );

    const timer = setTimeout(() => {
      clientRequest.destroy();
      finish(refuse(C.PARSE_TIMEOUT, `no verdict within ${timeoutMs} ms`));
    }, timeoutMs);

    clientRequest.on("error", (err: NodeJS.ErrnoException) => {
      const code =
        err.code === "ENOENT" || err.code === "ECONNREFUSED" || err.code === "EACCES"
          ? C.PARSER_UNAVAILABLE
          : C.PARSER_PROTOCOL_VIOLATION;
      finish(refuse(code, `socket error ${err.code ?? "unknown"}`));
    });

    clientRequest.end(Buffer.from(req.container));
  });
}
