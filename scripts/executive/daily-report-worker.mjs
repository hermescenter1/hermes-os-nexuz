#!/usr/bin/env node
/**
 * The nightly executive-report runner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A TRIGGER AND NOT THE WORKER
 * ─────────────────────────────────────────────────────────────────────────────
 * The generation rules — the finished-day window, the unique-key idempotency,
 * the version-on-correction, the notify-once claim — are TypeScript in
 * `src/lib/executive/report/`, and that is the code the test suite exercises.
 * A `.mjs` script cannot import it, and `tsx` is not a dependency of this
 * project. The only way to run those rules from here would be to REWRITE them
 * in JavaScript, which is a second implementation of the thing under test.
 *
 * So the rules stay in one place, run inside the app runtime that already has
 * Prisma configured, and this process is nothing but the schedule. It is the
 * same shape as `scripts/industrial/metering-outbox-worker.mjs`, deliberately.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT GUARANTEES
 * ─────────────────────────────────────────────────────────────────────────────
 *   * Bounded polling: one request per interval, one bounded pass per request.
 *   * Exponential backoff with jitter on TRANSPORT failure, so a web tier that
 *     is down is not hammered by every replica in lockstep.
 *   * Graceful shutdown: SIGTERM/SIGINT stop the loop after the in-flight
 *     request finishes; a pass is never abandoned mid-call by this process.
 *   * Safe in many replicas: the lease and the per-row unique key both live
 *     server-side, so this process needs no coordination of its own.
 *
 * It holds no lease, writes no row, and knows nothing about any tenant. If it
 * dies, nothing is lost: an unreported night is still unreported and the next
 * process picks it up.
 *
 *   node scripts/executive/daily-report-worker.mjs            # poll forever
 *   node scripts/executive/daily-report-worker.mjs --once     # one pass, exit
 *   node scripts/executive/daily-report-worker.mjs --interval 900000
 *
 * Environment:
 *   HERMES_WORKER_BASE_URL          default http://127.0.0.1:3000
 *   EXECUTIVE_REPORT_WORKER_TOKEN   bearer token; falls back to
 *                                   METERING_WORKER_TOKEN, then METRICS_TOKEN
 *   EXECUTIVE_REPORT_INTERVAL_MS    default 900000 (15 minutes)
 *   EXECUTIVE_REPORT_BATCH          default 50
 *
 * POLLING RATHER THAN CRON IS DELIBERATE. Every tenant's day ends at its own
 * cutoff, and a report may only cover a day that has FINISHED, so a single
 * fixed wall-clock time cannot serve them all. A cheap poll asks "is any night
 * now complete and unreported?" — which is correct for every zone at once, and
 * self-healing after an outage, because a night missed at 00:15 is simply
 * picked up at 00:30.
 */

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
};

const BASE = (process.env.HERMES_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN =
  process.env.EXECUTIVE_REPORT_WORKER_TOKEN ??
  process.env.METERING_WORKER_TOKEN ??
  process.env.METRICS_TOKEN ??
  "";
const INTERVAL = Number(value("interval", process.env.EXECUTIVE_REPORT_INTERVAL_MS ?? 900_000));
const BATCH = Number(value("batch", process.env.EXECUTIVE_REPORT_BATCH ?? 50));
const ONCE = flag("once");

const MAX_BACKOFF_MS = 5 * 60_000;
let backoff = 0;
let stopping = false;

const log = (level, msg, extra = {}) =>
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      svc: "executive-report-worker",
      msg,
      ...extra,
    }),
  );

async function onePass() {
  const url = `${BASE}/api/executive/reports/run?max=${encodeURIComponent(String(BATCH))}`;
  const res = await fetch(url, {
    method: "POST",
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  });

  if (!res.ok) {
    // A 401/403 is a configuration fault, not a transient one. Say so loudly
    // rather than backing off forever against a door that will never open.
    const fatal = res.status === 401 || res.status === 403;
    log(fatal ? "ERROR" : "WARN", "pass refused", { status: res.status, fatal });
    if (fatal) throw Object.assign(new Error("not authorised"), { fatal: true });
    throw new Error(`http ${res.status}`);
  }

  const body = await res.json();
  log("INFO", "pass complete", {
    businessDate: body.businessDate,
    leaseHeld: body.leaseHeld,
    considered: body.considered,
    created: body.created,
    alreadyReported: body.alreadyReported,
    skippedNotFinished: body.skippedNotFinished,
    failed: body.failed,
    notified: body.notified,
  });
  // A failure inside the pass is reported per organization, so an operator can
  // see WHICH tenant could not be reported rather than only that something was.
  for (const f of body.failures ?? []) {
    log("WARN", "organization not reported", f);
  }
  return body;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loop() {
  while (!stopping) {
    try {
      await onePass();
      backoff = 0;
    } catch (err) {
      if (err?.fatal) {
        log("ERROR", "stopping: the worker credential is not accepted");
        process.exitCode = 1;
        return;
      }
      // Exponential with jitter, so replicas do not retry in lockstep.
      backoff = Math.min(backoff === 0 ? 5_000 : backoff * 2, MAX_BACKOFF_MS);
      const jitter = Math.floor(Math.random() * 1_000);
      log("WARN", "pass failed; backing off", { error: String(err?.message ?? err), retryInMs: backoff + jitter });
      await sleep(backoff + jitter);
      continue;
    }
    if (ONCE) return;
    await sleep(INTERVAL);
  }
}

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log("INFO", "shutdown requested; finishing the in-flight pass");
    stopping = true;
  });
}

if (ONCE) {
  onePass()
    .then(() => process.exit(0))
    .catch(err => {
      log("ERROR", "single pass failed", { error: String(err?.message ?? err) });
      process.exit(1);
    });
} else {
  log("INFO", "starting", { base: BASE, intervalMs: INTERVAL, batch: BATCH, tokenConfigured: Boolean(TOKEN) });
  loop();
}
