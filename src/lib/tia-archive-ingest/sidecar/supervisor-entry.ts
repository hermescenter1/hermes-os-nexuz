/**
 * PHASE 109-C2.1 — parser supervisor. Runs ONLY inside the sidecar container.
 *
 * It owns three things and nothing else: the single global parse slot, the
 * lifetime of each child, and the deadlines. It never parses an archive.
 *
 * THE SLOT IS TAKEN BEFORE THE BODY IS TOUCHED. That ordering is the defence: a
 * burst of concurrent 32 MiB uploads must cost immediate refusals and one
 * stream, not many buffered bodies. Nothing is queued — a queue would turn a
 * refusal into unbounded memory.
 *
 * THE 429 IS FLUSHED BEFORE THE SOCKET CLOSES. A refusal the caller cannot read
 * is indistinguishable from a crash, so the socket is torn down on the
 * response's `finish` event, never before.
 *
 * FRAMING AND DEADLINES LIVE IN THEIR OWN MODULES. `LineFramer` decodes child
 * output with `StringDecoder` so a chunk boundary inside a multibyte sequence
 * cannot corrupt a path, and `ParseLifecycle` owns the timers and the single
 * idempotent finalization path. Both are unit-tested; this file wires them.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

import { decideChildOutcome } from "../child-outcome";
import { cleanupComplete, nextCleanupStep, shouldArmCleanup } from "../cleanup-plan";
import { INGEST_DIAGNOSTIC_CODES } from "../diagnostics";
import {
  INGEST_LIMITS,
  INGRESS_LIMITS,
  REQUIRED_CHILD_OOM_SCORE_ADJ,
  REQUIRED_MEMORY_OOM_GROUP,
} from "../limits";
import { LineFramer } from "../line-framer";
import { ParseLifecycle, type ExpiryReason, type ParseOutcome } from "../parse-lifecycle";
import { parseReady } from "../protocol";
import { VerdictGate } from "../verdict-gate";

/**
 * The child lives beside the supervisor in the compiled artifact.
 *
 * Derived from `__dirname` rather than hard-coded to an absolute image path, so
 * the two cannot drift apart if the artifact is ever mounted elsewhere.
 */
const CHILD_MODULE = join(__dirname, "child-entry.js");
const SOCKET_PATH = "/ipc/parser.sock";
const CGROUP_ROOT = "/sys/fs/cgroup";

const startedAt = Date.now();
let busy = false;
let admitted = 0;
let refusedBusy = 0;
let activeChildren = 0;
let maxObservedChildren = 0;

function readCgroup(file: string): string {
  try {
    return readFileSync(`${CGROUP_ROOT}/${file}`, "utf8").trim();
  } catch {
    return "unavailable";
  }
}

function readOomScoreAdj(pid: number | "self"): string {
  try {
    return readFileSync(`/proc/${pid}/oom_score_adj`, "utf8").trim();
  } catch {
    return "unavailable";
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  closeConnection = false,
): void {
  if (res.writableEnded) return;
  const payload = `${JSON.stringify(body)}\n`;
  const headers: Record<string, string | number> = {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  };
  if (closeConnection) headers.connection = "close";
  res.writeHead(status, headers);
  res.end(payload);
}

function refusal(code: string, detail: string): Record<string, unknown> {
  return { kind: "REFUSED", code, detail: detail.slice(0, INGEST_LIMITS.maxUntrustedTextLength) };
}

const EXPIRY_CODES: Record<ExpiryReason, string> = {
  READY_TIMEOUT: INGEST_DIAGNOSTIC_CODES.HANDSHAKE_FAILED,
  FIRST_BYTE_TIMEOUT: INGEST_DIAGNOSTIC_CODES.FIRST_BYTE_TIMEOUT,
  INGRESS_TIMEOUT: INGEST_DIAGNOSTIC_CODES.INGRESS_TIMEOUT,
  PARSE_TIMEOUT: INGEST_DIAGNOSTIC_CODES.PARSE_TIMEOUT,
};

/* ── one parse ─────────────────────────────────────────────────────────── */

function runParse(req: IncomingMessage, res: ServerResponse, releaseSlot: () => void): void {
  const C = INGEST_DIAGNOSTIC_CODES;

  // `detached` makes the child a PROCESS GROUP LEADER, which is the only way to
  // reach a descendant it spawned: `child.kill()` signals one pid, while
  // `process.kill(-pid)` signals the whole group. A child that hands its stdout
  // to a descendant and exits is exactly the case R6 found, and killing only
  // the direct child would leave that descendant writing into a pipe nobody
  // will ever close. It is NOT unref'd: the supervisor keeps the handle.
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CHILD_MODULE], {
    shell: false,
    detached: true,
    env: { NODE_ENV: "production" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeChildren += 1;
  if (activeChildren > maxObservedChildren) maxObservedChildren = activeChildren;
  let childReaped = false;

  // Declared here, ahead of every helper that reads it, so no helper can be
  // reached before it exists. The timing rule itself lives in `VerdictGate`,
  // where a unit test can reach it — inside this socket-bound entry point it
  // was two `if`s nothing could exercise, which is how the R5 race survived.
  const gate = new VerdictGate();

  /**
   * Remove every writer that can still reach this parse's stdout.
   *
   * WHY THIS EXISTS. A hostile child can spawn a DETACHED descendant, hand it
   * fd 1, and exit 0. The descendant is then in its own process group, so
   * neither `child.kill()` nor a group kill reaches it, and it holds the read
   * end of the pipe open. `stdout` never reaches EOF, `close` never fires, the
   * slot is never released — one request would take the sidecar offline for
   * good. A bounded refusal for the caller is not enough on its own; the writer
   * has to go.
   *
   * WHY SWEEPING EVERY OTHER PID IS EXACT HERE, AND ONLY HERE. The parser
   * container runs one process tree: PID 1 is the init, this supervisor is the
   * process it started, and at most one parse exists (`maxConcurrentParses` is
   * 1). Anything else in the namespace was spawned by that parse.
   *
   * The guard is `pid === 1 || ppid === 1`: with `init: true` the supervisor is
   * started directly by PID 1, and without it the supervisor IS PID 1. Both are
   * properties of being the first process in a fresh PID namespace, and neither
   * holds for a Node process on a development machine, where the parent is a
   * shell or npm. The guard fails closed, so nothing is ever signalled there.
   *
   * PID 1 is never touched: it is the reaper, and killing it would end the
   * container.
   */
  const sweepExecutionTree = (): number => {
    if (process.pid !== 1 && process.ppid !== 1) return 0;
    let killed = 0;
    let entries: string[];
    try {
      entries = readdirSync("/proc");
    } catch {
      return 0;
    }
    for (const name of entries) {
      if (!/^\d+$/.test(name)) continue;
      const pid = Number(name);
      if (pid === 1 || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGKILL");
        killed += 1;
      } catch {
        /* already gone, or not ours */
      }
    }
    return killed;
  };

  let cleanupArmed = false;

  /**
   * THE POSTCONDITION. Attempting a sweep is not the same fact as "every writer
   * is gone", and R6 conflated the two: it took one `/proc` snapshot, signalled
   * what it saw, and stopped. A process forked after that snapshot survives it,
   * and so does one a failed scan never observed — leaving a live writer on the
   * pipe and the single global slot held for the lifetime of the container.
   *
   * What actually proves cleanup succeeded is observable: stdout reached end of
   * output AND the child handle closed. Nothing else is evidence.
   */
  const cleanupState = (attempt: number) => ({
    stdoutFinished: gate.sawStdoutEnd,
    childReaped,
    attempt,
    maxAttempts: INGRESS_LIMITS.orphanSweepAttempts,
  });

  /**
   * Bounded cleanup, then fail closed.
   *
   * Each attempt re-reads `/proc`, so a fork that raced one snapshot is caught
   * by the next. After `orphanSweepAttempts` the supervisor stops trying to win
   * a race it may not be able to win and takes the one action that is
   * guaranteed to end every writer: it terminates itself. `restart: always`
   * brings the sidecar back, and the container's cgroup takes the whole
   * remaining process tree with it.
   *
   * THE REFUSAL LEAVES FIRST. The caller already has a bounded verdict by this
   * point — the deadline produced it — and `recoveryFlushMs` is the grace the
   * socket is given to drain before the process goes, so recovery never turns a
   * readable refusal into a reset.
   */
  const runCleanup = (attempt: number): void => {
    if (cleanupComplete(cleanupState(attempt))) return;

    sweepExecutionTree();

    const check = setTimeout(() => {
      const step = nextCleanupStep(cleanupState(attempt));
      if (step.action === "DONE") return;
      if (step.action === "SWEEP_AGAIN") {
        runCleanup(step.attempt);
        return;
      }
      // TERMINATE_SELF. Bounded, deterministic, and it cannot strand the slot,
      // because the slot does not survive the process that holds it.
      const bail = setTimeout(() => {
        process.exit(1);
      }, INGRESS_LIMITS.recoveryFlushMs);
      bail.unref();
    }, INGRESS_LIMITS.sweepPostconditionMs);
    check.unref();
  };

  /**
   * Escalate whenever the cleanup postcondition is NOT yet satisfied.
   *
   * THE GUARD MUST BE THE NEGATION OF THE POSTCONDITION, NOT HALF OF IT. R7
   * armed on `gate.sawStdoutEnd` while `cleanupComplete` required
   * `stdoutFinished && childReaped`, so one incomplete state was silently
   * excluded: stdout finished, child NOT reaped.
   *
   * That state is reachable, and it was measured with a real process tree. A
   * child can hand a DETACHED grandchild fd 2 alone — `stdio: ["ignore",
   * "ignore", 2]` — write a valid READY and DONE, and exit 0. stdout then
   * reaches a clean EOF while stderr stays open, and ChildProcess `close`
   * waits for EVERY stdio stream, so it never fires:
   *
   *     3733ms  stdout end
   *     3749ms  child exit  code=0
   *     3753ms  VERDICT     PUBLISH DONE
   *     3754ms  armOrphanSweep  NOT ARMED        <- cleanupComplete() = false
   *             childReaped false ... for ever
   *
   * No sweep was ever scheduled, the grandchild kept stderr open, `close` never
   * came, and the slot was held for the life of the container by one request.
   *
   * On every healthy path both halves are already true when the child is
   * killed, so this still arms nothing.
   */
  const armCleanupIfIncomplete = (): void => {
    if (cleanupArmed || !shouldArmCleanup(cleanupState(0))) return;
    cleanupArmed = true;
    const first = setTimeout(() => {
      runCleanup(0);
    }, INGRESS_LIMITS.orphanSweepGraceMs);
    first.unref();
  };

  // The framer sees READY *and* the terminal message and counts cumulatively,
  // so it is given the combined byte bound, not the terminal-only one — and a
  // PHYSICAL FRAME bound, because a byte cap does not bound memory: a newline
  // flood turns a byte budget into an array of that many elements.
  const framer = new LineFramer(
    INGRESS_LIMITS.maxChildStdoutBytes,
    INGRESS_LIMITS.maxChildStdoutLines,
  );
  let ready = false;
  let bytesIn = 0;
  let terminalLine: string | null = null;
  let extraTerminals = 0;
  let bodyComplete = false;

  // Named so finalization can detach exactly these, and nothing else.
  const onData = (piece: Buffer): void => {
    lifecycle.onFirstByte();
    bytesIn += piece.length;
    if (bytesIn > INGEST_LIMITS.maxContainerBytes) {
      lifecycle.finalize({ status: 200, body: refusal(C.CONTAINER_TOO_LARGE, `${bytesIn} bytes`) });
      return;
    }
    if (!child.stdin.destroyed) child.stdin.write(piece);
  };
  const onEnd = (): void => {
    bodyComplete = true;
    lifecycle.onBodyComplete();
    const declared = req.headers["content-length"];
    if (typeof declared === "string" && Number(declared) !== bytesIn) {
      lifecycle.finalize({
        status: 200,
        body: refusal(C.CONTENT_LENGTH_UNACCEPTABLE, `declared ${declared} but received ${bytesIn}`),
      });
      return;
    }
    if (!child.stdin.destroyed) child.stdin.end();
  };
  const onAborted = (): void => {
    lifecycle.finalize({ status: 200, body: refusal(C.CALLER_DISCONNECTED, "caller went away") });
  };
  const onReqError = (): void => {
    lifecycle.finalize({ status: 200, body: refusal(C.CALLER_DISCONNECTED, "request stream error") });
  };

  const lifecycle = new ParseLifecycle(
    {
      detachRequestListeners: () => {
        req.off("data", onData);
        req.off("end", onEnd);
        req.off("aborted", onAborted);
        req.off("error", onReqError);
      },
      stopBodyConsumption: () => {
        // PAUSE, never destroy. Destroying the request tears down the socket,
        // and the response has not been written yet — the caller would receive
        // a reset instead of its verdict. That is the same defect the 429 path
        // was fixed for, and the real Docker gate caught it here too: both
        // deadline refusals arrived as status:null with an empty body. The
        // socket is torn down in `respond`, after the response has flushed.
        req.pause();
      },
      closeChildStdin: () => {
        if (!child.stdin.destroyed) child.stdin.end();
      },
      killChild: () => {
        try {
          if (!childReaped) child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
        // The group, not just the pid. A descendant that stayed in the child's
        // process group dies here; one that made its own group does not, which
        // is what the sweep below exists for.
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {
          /* no such group, or already gone */
        }
        armCleanupIfIncomplete();
      },
      respond: (outcome: ParseOutcome) => {
        // Close the connection ONLY when the request body was never finished.
        //
        // A refusal on a deadline or a disconnect leaves unread bytes in flight
        // and the connection cannot be reused with a half-read body, so it is
        // closed — gracefully, with a FIN, after the response has flushed.
        //
        // A COMPLETED parse must not close it. Closing unconditionally broke the
        // caller's connection reuse: the socket was ended immediately after a
        // 200, the caller's next request landed on a dying socket and errored,
        // and the rest of that sweep then raced through a legitimately busy
        // slot. The real UDS fixture sweep is what exposed it.
        if (!bodyComplete) {
          // Registered BEFORE writing: `finish` can fire soon enough that a
          // handler attached afterwards would never run.
          res.on("finish", () => {
            const socket = req.socket;
            if (socket && !socket.destroyed) socket.end();
          });
        }
        sendJson(res, outcome.status, outcome.body, !bodyComplete);
      },
      releaseSlot,
    },
    {
      readyHandshakeMs: INGRESS_LIMITS.readyHandshakeMs,
      firstByteMs: INGRESS_LIMITS.firstByteMs,
      totalIngressMs: INGRESS_LIMITS.totalIngressMs,
      maxProcessingMs: INGEST_LIMITS.maxProcessingMs,
    },
    (reason: ExpiryReason) => {
      lifecycle.finalize({ status: 200, body: refusal(EXPIRY_CODES[reason], `deadline ${reason}`) });
    },
  );

  lifecycle.start();

  child.stdout.on("data", (chunk: Buffer) => {
    const { lines, overflow, reason } = framer.push(chunk);
    if (overflow) {
      // Name the cap that was actually exceeded. R3 cited maxResponseBytes here
      // even though this framer is bounded by maxChildStdoutBytes, which would
      // have sent an operator looking at the wrong number.
      const detail =
        reason === "lines"
          ? `child emitted more than ${INGRESS_LIMITS.maxChildStdoutLines} physical lines`
          : `child stdout exceeded ${INGRESS_LIMITS.maxChildStdoutBytes} bytes`;
      lifecycle.finalize({
        status: 200,
        body: refusal(C.PARSER_PROTOCOL_VIOLATION, detail),
      });
      return;
    }

    for (const line of lines) {
      if (line.trim().length === 0) continue;

      if (!ready) {
        const handshake = parseReady(line);
        if (!handshake) {
          lifecycle.finalize({
            status: 200,
            body: refusal(C.HANDSHAKE_FAILED, "first message was not a valid READY"),
          });
          return;
        }
        if (handshake.oomGroup !== REQUIRED_MEMORY_OOM_GROUP) {
          lifecycle.finalize({
            status: 200,
            body: refusal(C.OOM_GROUP_UNACCEPTABLE, "memory.oom.group is not 0"),
          });
          return;
        }
        // The child's self-report is not evidence. Read the real value.
        const observed = child.pid ? readOomScoreAdj(child.pid) : "unavailable";
        if (observed !== String(REQUIRED_CHILD_OOM_SCORE_ADJ)) {
          lifecycle.finalize({
            status: 200,
            body: refusal(C.OOM_BIAS_UNVERIFIED, `/proc reports oom_score_adj=${observed}`),
          });
          return;
        }

        ready = true;
        // ONLY NOW does the caller's clock start, and only now may bytes flow.
        lifecycle.onReadyVerified();
        req.on("data", onData);
        req.on("end", onEnd);
        req.on("aborted", onAborted);
        req.on("error", onReqError);
        req.resume();
        continue;
      }

      if (terminalLine === null) terminalLine = line;
      else extraTerminals += 1;
    }
  });

  child.stdin.on("error", () => {
    /* the child died mid-write; its exit handler decides the verdict */
  });
  child.stderr.on("data", () => {
    /* deliberately discarded: child stderr is never echoed to a caller */
  });

  /**
   * The single place the child is accounted as gone.
   *
   * Idempotent, so `close`, `exit` and `error` can all call it without the
   * active-child count going negative or being decremented twice. Releasing the
   * slot is gated on this having happened: `child.kill("SIGKILL")` only delivers
   * a signal, so it is not evidence the process is finished.
   */
  const reapChild = (): void => {
    if (childReaped) return;
    childReaped = true;
    activeChildren -= 1;
    lifecycle.onChildReaped();
  };

  child.on("error", () => {
    lifecycle.finalize({ status: 200, body: refusal(C.PARSER_TERMINATED, "child failed to start") });
    reapChild();
  });

  // `close` fires after `exit` and after every stdio stream has closed, so it
  // is the stronger of the two signals and it is what REAPS. It decides no
  // verdict: R5 let `exit` decide, and a descendant writing after the direct
  // child had exited proved that wrong.
  child.on("close", () => reapChild());

  /**
   * Decide the terminal verdict — never before `VerdictGate` says both the exit
   * result and end-of-output are in hand. The measured timeline that makes this
   * necessary, and the ordering proof behind it, are in `verdict-gate.ts`.
   */
  const decideVerdict = (): void => {
    if (lifecycle.isFinalized) return;
    const exit = gate.take();
    if (!exit) return;

    // Close the framer through the SAME result path as every mid-stream chunk.
    // R4's `end(): string` returned "" whether the stream ended cleanly or one
    // frame OVER the cap, so an unterminated EXTRA was discarded in silence.
    const final = framer.finish();

    // The verdict itself is pure and lives in a module a unit test can reach.
    // Keeping it inline is what left every branch of it provable only inside a
    // Linux container — see the header of `child-outcome.ts`.
    const outcome = decideChildOutcome({
      code: exit.code,
      signal: exit.signal,
      completion: exit.completion,
      final,
      terminalLine,
      extraTerminals,
    });

    lifecycle.finalize({
      status: 200,
      body:
        outcome.kind === "PUBLISH"
          ? outcome.terminal
          : refusal(outcome.code, outcome.detail),
    });
  };

  // THREE EVENTS, THREE MEANINGS. R6 sent all of them through one handler, so a
  // transport that failed mid-stream established the same "output is finished"
  // fact as a clean EOF — and a DONE received before the break was published as
  // a verdict. Only `end` means the writer finished and every byte arrived.
  //
  // None of these decides anything on its own: each records, and the verdict
  // still applies the exit-code precedence, so a stream broken by a child that
  // was about to be SIGKILLed is still reported as AES-C2-047.
  child.stdout.on("end", () => {
    gate.recordStdoutEnd();
    decideVerdict();
  });
  child.stdout.on("close", () => {
    gate.recordStdoutClose();
    decideVerdict();
  });
  child.stdout.on("error", () => {
    gate.recordStdoutError();
    decideVerdict();
  });

  child.on("exit", (code, signal) => {
    // RECORDED, NOT ACTED ON. Output may still be arriving on an inherited pipe.
    gate.recordExit(code, signal);
    decideVerdict();
  });
}

/* ── request handling ──────────────────────────────────────────────────── */

function handler(req: IncomingMessage, res: ServerResponse): void {
  const C = INGEST_DIAGNOSTIC_CODES;
  const url = req.url ?? "/";

  // The healthcheck parses no caller input and needs no slot, so it keeps
  // answering while a parse is running. A probe that blocked on the slot would
  // report the sidecar as down every time it was doing its job.
  if (url === "/health") {
    sendJson(res, 200, {
      ok: true,
      uptimeMs: Date.now() - startedAt,
      busy,
      admitted,
      refusedBusy,
      activeChildren,
      maxObservedChildren,
      supervisorPid: process.pid,
      supervisorOomScoreAdj: readOomScoreAdj("self"),
      maxResponseBytes: INGRESS_LIMITS.maxResponseBytes,
      maxEntries: INGEST_LIMITS.maxEntries,
      memoryCurrent: readCgroup("memory.current"),
      memoryMax: readCgroup("memory.max"),
      memoryEvents: readCgroup("memory.events").replace(/\n/g, ","),
      memoryOomGroup: readCgroup("memory.oom.group"),
    });
    return;
  }

  if (busy) {
    refusedBusy += 1;
    const payload = `${JSON.stringify(refusal(C.PARSER_BUSY, "a parse is already running"))}\n`;
    res.writeHead(429, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      connection: "close",
    });
    // Close GRACEFULLY once the refusal has flushed, and never with destroy().
    //
    // `req.destroy()` sends an RST, which discards whatever the peer has not yet
    // read — including the 429 that was just written. Measured across three
    // identical 25-client bursts: 0, 22 and 24 of the refusals were readable.
    // The R2 run that reported 24/24 was luck, not a guarantee.
    //
    // A FIN leaves the peer's receive buffer intact, so the refusal stays
    // readable even while the caller is still pushing a body it will never get
    // to finish. The body is still never read, so a refused 32 MiB upload costs
    // no memory here.
    res.on("finish", () => {
      const socket = req.socket;
      if (socket && !socket.destroyed) socket.end();
    });
    res.end(payload);
    return;
  }

  // Reject an impossible declared length before a single byte is accepted.
  const declared = req.headers["content-length"];
  if (typeof declared === "string") {
    const value = Number(declared);
    if (!Number.isInteger(value) || value < 0) {
      res.on("finish", () => {
        const socket = req.socket;
        if (socket && !socket.destroyed) socket.end();
      });
      sendJson(res, 400, refusal(C.CONTENT_LENGTH_UNACCEPTABLE, "malformed content-length"));
      return;
    }
    if (value > INGEST_LIMITS.maxContainerBytes) {
      res.on("finish", () => {
        const socket = req.socket;
        if (socket && !socket.destroyed) socket.end();
      });
      sendJson(
        res,
        413,
        refusal(C.CONTAINER_TOO_LARGE, `declared ${value} exceeds ${INGEST_LIMITS.maxContainerBytes}`),
      );
      return;
    }
  }

  busy = true;
  admitted += 1;
  // Nothing may be consumed until the child has proven its OOM bias.
  req.pause();

  runParse(req, res, () => {
    busy = false;
  });
}

/* ── listeners ─────────────────────────────────────────────────────────── */

if (existsSync("/ipc")) {
  try {
    unlinkSync(SOCKET_PATH);
  } catch {
    /* first start, nothing to remove */
  }
  createServer(handler).listen(SOCKET_PATH, () => {
    try {
      chmodSync(SOCKET_PATH, 0o660);
    } catch {
      /* the init service owns the directory; mode is best effort here */
    }
    process.stdout.write(`parser sidecar listening on ${SOCKET_PATH} pid=${process.pid}\n`);
  });
} else {
  process.stderr.write("FATAL: /ipc is not mounted; the parser has no transport\n");
  process.exitCode = 1;
}
