#!/usr/bin/env node
/**
 * F-2 FU-F2-R4-1 — the document storage-cleanup runner.
 *
 * A TRIGGER, not the worker (same reasoning as
 * scripts/industrial/metering-outbox-worker.mjs and
 * scripts/ats/ai-review-worker.mjs): the cleanup logic is TypeScript in
 * src/lib/documents/storage-cleanup.ts and runs inside the app runtime, where
 * the database and object storage are configured and the same code the tests
 * exercise executes. This process is only the schedule: a bounded poll that
 * POSTs to /api/documents/storage-cleanup with its own worker token and
 * reports the counts.
 *
 * It holds no state and no credential but its token. If it dies, every
 * pending removal is still a PENDING row in DocumentStorageCleanup and the
 * next process — or the next document delete of that organization — picks it
 * up. Safe to run as several replicas: every row is claimed atomically.
 *
 *   node scripts/documents/storage-cleanup-worker.mjs            # poll forever
 *   node scripts/documents/storage-cleanup-worker.mjs --once     # one pass, exit
 *   node scripts/documents/storage-cleanup-worker.mjs --interval 120000
 *
 * Environment:
 *   HERMES_WORKER_BASE_URL               default http://127.0.0.1:3000
 *   DOCUMENT_CLEANUP_WORKER_TOKEN        bearer token (required; its own secret)
 *   DOCUMENT_CLEANUP_WORKER_INTERVAL_MS  default 60000 (min 1000)
 *   DOCUMENT_CLEANUP_WORKER_BATCH        default 50 (1..200)
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
};

const TAG = "[document-cleanup-worker]";
const BASE = (process.env.HERMES_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = process.env.DOCUMENT_CLEANUP_WORKER_TOKEN ?? "";
const INTERVAL = Number(value("interval", process.env.DOCUMENT_CLEANUP_WORKER_INTERVAL_MS ?? "60000"));
const BATCH = Number(value("batch", process.env.DOCUMENT_CLEANUP_WORKER_BATCH ?? "50"));
const ONCE = flag("once");

if (!TOKEN) {
  // Fail loudly at startup rather than logging a 401 every interval forever.
  console.error(`${TAG} DOCUMENT_CLEANUP_WORKER_TOKEN is not set; refusing to start.`);
  process.exit(2);
}
if (!Number.isInteger(INTERVAL) || INTERVAL < 1000 || !Number.isInteger(BATCH) || BATCH < 1 || BATCH > 200) {
  console.error(`${TAG} invalid --interval or --batch`);
  process.exit(2);
}

let stopping = false;
// The pending wait between passes, so a signal can end it at once instead of
// letting `docker stop` run into its timeout and SIGKILL during a back-off.
let wake = null;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    stopping = true;
    console.log(`${TAG} ${sig} received; finishing the in-flight pass`);
    wake?.();
  });
}

const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wake = null;
      resolve();
    }
    wake = done;
  });

async function pass() {
  const res = await fetch(`${BASE}/api/documents/storage-cleanup?limit=${BATCH}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON: reported below as text */
  }
  return { status: res.status, body: body ?? text };
}

async function main() {
  let failures = 0;
  do {
    try {
      const r = await pass();
      if (r.status === 200 && r.body && typeof r.body === "object") {
        failures = 0;
        // COUNTS ONLY. The endpoint returns no id, key or organization, and this
        // line names none.
        console.log(`${TAG} claimed=${r.body.claimed} done=${r.body.done} retrying=${r.body.retrying}`);
      } else {
        failures++;
        // Bounded: whatever answers an error (a proxy page included) cannot be
        // copied into the log whole.
        const detail = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
        console.error(`${TAG} HTTP ${r.status}: ${String(detail).slice(0, 200)}`);
      }
    } catch (err) {
      failures++;
      console.error(`${TAG} transport failure: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
    }
    if (ONCE || stopping) break;
    // Exponential backoff with jitter on failure, capped at 10x the interval.
    const backoff = failures === 0 ? INTERVAL : Math.min(INTERVAL * 2 ** Math.min(failures, 4), INTERVAL * 10);
    await sleep(backoff + Math.floor(Math.random() * 1000));
  } while (!stopping);
  // SET the exit code instead of calling process.exit(): on Windows/Node an exit
  // on top of closing fetch handles can abort the runtime (see the metering
  // runner). A one-shot run that failed exits 1 so a cron notices.
  process.exitCode = ONCE && failures > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(`${TAG} fatal: ${String(e?.message ?? e).slice(0, 200)}`);
  process.exitCode = 1;
});
