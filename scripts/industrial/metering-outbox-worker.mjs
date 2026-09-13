#!/usr/bin/env node
/**
 * PHASE 109-C-UI.2-R8 — the metering outbox worker runner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A TRIGGER AND NOT THE WORKER
 * ─────────────────────────────────────────────────────────────────────────────
 * Every other job script in this repository builds its own Prisma client and
 * talks to PostgreSQL directly. This one does not, and the reason is worth
 * stating because it breaks the local convention on purpose.
 *
 * The delivery logic — the conditional claim, the retry budget, the dead-letter
 * transition — is TypeScript in `src/lib/industrial/metering-outbox.ts`, and it
 * is the code the R7 and R8 test suites exercise against real PostgreSQL. A
 * `.mjs` script cannot import it, and `tsx` is not a dependency of this project
 * (checked: absent from both `dependencies` and `devDependencies`). The only way
 * to run it from here would be to REWRITE it in JavaScript — a second
 * implementation of the exact rules under test, which is the failure mode R4 and
 * R5 each cost a full evidence run to learn.
 *
 * So the logic stays in one place and runs inside the app runtime that already
 * has Prisma configured, and this process is the schedule: a bounded poll loop
 * that calls the worker entrypoint and reports what happened.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT GUARANTEES
 * ─────────────────────────────────────────────────────────────────────────────
 *   * Bounded polling. One request per interval, one bounded pass per request.
 *   * Exponential backoff with jitter on TRANSPORT failure, so a web tier that
 *     is down is not hammered by every replica in lockstep.
 *   * Graceful shutdown. SIGTERM/SIGINT stop the loop after the in-flight
 *     request finishes; a pass is never abandoned mid-call by this process.
 *   * Safe to run in many replicas. The lease and the per-row conditional claim
 *     both live server-side; this process needs no coordination of its own.
 *
 * It holds no lease, writes no row, and knows nothing about billing. If it dies,
 * nothing is lost: every event is still PENDING or RETRYING in the outbox and
 * the next process picks it up.
 *
 *   node scripts/industrial/metering-outbox-worker.mjs            # poll forever
 *   node scripts/industrial/metering-outbox-worker.mjs --once     # one pass, exit
 *   node scripts/industrial/metering-outbox-worker.mjs --interval 15000
 *
 * Environment:
 *   HERMES_WORKER_BASE_URL     default http://127.0.0.1:3000
 *   METERING_WORKER_TOKEN      bearer token; falls back to METRICS_TOKEN
 *   METERING_WORKER_INTERVAL_MS  default 30000
 *   METERING_WORKER_BATCH      default 50
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
};

const BASE = (process.env.HERMES_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = process.env.METERING_WORKER_TOKEN ?? process.env.METRICS_TOKEN ?? "";
const INTERVAL_MS = Number(value("interval", process.env.METERING_WORKER_INTERVAL_MS ?? 30_000));
const BATCH = Number(value("batch", process.env.METERING_WORKER_BATCH ?? 50));
const ONCE = flag("once");

/** Bounded, so a permanently unreachable web tier backs off to a slow retry
 *  rather than to silence or to a hot loop. */
const MAX_BACKOFF_MS = 5 * 60_000;

if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 1_000) {
  console.error("METERING_WORKER: --interval must be at least 1000ms");
  process.exit(2);
}
if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 200) {
  console.error("METERING_WORKER: --batch must be an integer in 1..200");
  process.exit(2);
}
if (!TOKEN) {
  // Fail loudly at startup rather than logging a 401 every interval forever.
  console.error(
    "METERING_WORKER: no METERING_WORKER_TOKEN (or METRICS_TOKEN) configured. " +
      "The worker entrypoint never falls open, so every poll would be refused.",
  );
  process.exit(2);
}

let stopping = false;
let inFlight = false;

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    // The in-flight pass is allowed to finish. Killing it here would be safe —
    // the server-side transaction would roll back and the events would stay
    // deliverable — but finishing is cheaper and keeps the logs honest.
    console.log(`METERING_WORKER: ${sig} received, finishing in-flight pass then exiting`);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Full jitter: replicas that all lost the web tier do not return in lockstep. */
function backoffFor(consecutiveFailures) {
  const base = Math.min(MAX_BACKOFF_MS, INTERVAL_MS * 2 ** Math.min(consecutiveFailures, 8));
  return Math.floor(Math.random() * base);
}

async function onePass() {
  const res = await fetch(`${BASE}/api/industrial/metering/deliver?limit=${BATCH}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log(
    `METERING_WORKER: start base=${BASE} interval=${INTERVAL_MS}ms batch=${BATCH} once=${ONCE}`,
  );

  let failures = 0;
  let exitCode = 0;

  do {
    inFlight = true;
    try {
      const r = await onePass();
      failures = 0;
      if (r.acquired) {
        console.log(
          `METERING_WORKER: pass delivered=${r.delivered} retrying=${r.retrying} ` +
            `deadLettered=${r.deadLettered} skipped=${r.skipped}`,
        );
      } else {
        // Normal on a replica that is not the lease holder. Not an error, and
        // deliberately logged at the same level so a silent replica is not
        // mistaken for a dead one.
        console.log("METERING_WORKER: another replica holds the lease");
      }
    } catch (e) {
      failures += 1;
      exitCode = 1;
      console.error(`METERING_WORKER: pass failed (${failures}): ${String(e.message ?? e)}`);
      if (!ONCE && !stopping) {
        const wait = backoffFor(failures);
        console.error(`METERING_WORKER: backing off ${wait}ms`);
        await sleep(wait);
        inFlight = false;
        continue;
      }
    } finally {
      inFlight = false;
    }

    if (ONCE || stopping) break;
    await sleep(INTERVAL_MS);
  } while (!stopping);

  console.log("METERING_WORKER: stopped");
  /*
    SET the exit code, never CALL process.exit() here.

    The first version called it, and on Windows/Node 24 the process died with
      Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c
    and exit code 127 — AFTER a pass that had delivered successfully. `fetch`
    leaves undici handles closing, and exiting on top of them aborts the runtime
    instead of returning. A cron reads 127 as a failed delivery and pages
    someone about work that actually completed.

    Setting `exitCode` lets the loop unwind and Node exit on its own once the
    handles are gone.
  */
  process.exitCode = ONCE ? exitCode : 0;
}

main().catch((e) => {
  console.error(`METERING_WORKER: fatal ${String(e?.stack ?? e)}`);
  process.exitCode = 1;
});
