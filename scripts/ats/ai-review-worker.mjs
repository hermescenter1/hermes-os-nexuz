#!/usr/bin/env node
/**
 * ATS-S1 — the AI review worker runner.
 *
 * A TRIGGER, not the worker (same reasoning as
 * scripts/industrial/metering-outbox-worker.mjs): the delivery logic is
 * TypeScript in src/lib/ats/review/worker.ts and runs inside the app runtime,
 * where Prisma is configured and the same code the tests exercise executes.
 * This process is only the schedule: a bounded poll that POSTs to
 * /api/ats/review/deliver with the worker token and reports the counts.
 *
 * It holds no state. If it dies, every review is still PENDING or RETRYING in
 * the outbox, every application is still AI_REVIEW_PENDING, and the next
 * process picks them up.
 *
 *   node scripts/ats/ai-review-worker.mjs             # poll forever
 *   node scripts/ats/ai-review-worker.mjs --once      # one pass, exit
 *   node scripts/ats/ai-review-worker.mjs --interval 15000
 *
 * Environment:
 *   HERMES_WORKER_BASE_URL      default http://127.0.0.1:3000
 *   ATS_REVIEW_WORKER_TOKEN     bearer token (required)
 *   ATS_REVIEW_WORKER_INTERVAL_MS  default 30000
 *   ATS_REVIEW_WORKER_BATCH     default 20 (max 100)
 */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
};

const BASE = (process.env.HERMES_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = process.env.ATS_REVIEW_WORKER_TOKEN ?? "";
const INTERVAL = Number(value("interval", process.env.ATS_REVIEW_WORKER_INTERVAL_MS ?? "30000"));
const BATCH = Number(value("batch", process.env.ATS_REVIEW_WORKER_BATCH ?? "20"));
const ONCE = flag("once");

if (!TOKEN) {
  console.error("[ats-review-worker] ATS_REVIEW_WORKER_TOKEN is not set; refusing to start.");
  process.exit(2);
}
if (!Number.isInteger(INTERVAL) || INTERVAL < 1000 || !Number.isInteger(BATCH) || BATCH < 1 || BATCH > 100) {
  console.error("[ats-review-worker] invalid --interval or --batch");
  process.exit(2);
}

let stopping = false;
let inFlight = null;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    stopping = true;
    console.log(`[ats-review-worker] ${sig} received; finishing the in-flight pass`);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pass() {
  const res = await fetch(`${BASE}/api/ats/review/deliver?limit=${BATCH}`, {
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
      inFlight = pass();
      const r = await inFlight;
      inFlight = null;
      if (r.status === 200) {
        failures = 0;
        const b = r.body;
        // COUNTS ONLY. The endpoint returns no candidate field, and this line
        // names none — a log shipped off the host carries nothing personal.
        if (b && b.acquired === false) {
          console.log("[ats-review-worker] another replica holds the lease");
        } else {
          console.log(
            `[ats-review-worker] claimed=${b.claimed} delivered=${b.delivered} retrying=${b.retrying} deadLettered=${b.deadLettered} skipped=${b.skipped}`,
          );
        }
      } else {
        failures++;
        // Bounded, like the metering runner: whatever answers an error (an
        // upstream proxy page included) cannot be copied into the log whole.
        const detail = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
        console.error(`[ats-review-worker] HTTP ${r.status}: ${String(detail).slice(0, 200)}`);
      }
    } catch (err) {
      inFlight = null;
      failures++;
      console.error(`[ats-review-worker] transport failure: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ONCE || stopping) break;
    // Exponential backoff with jitter on failure, capped at 10× the interval.
    const backoff = failures === 0 ? INTERVAL : Math.min(INTERVAL * 2 ** Math.min(failures, 4), INTERVAL * 10);
    await sleep(backoff + Math.floor(Math.random() * 1000));
  } while (!stopping);
  process.exit(failures > 0 && ONCE ? 1 : 0);
}

main();
