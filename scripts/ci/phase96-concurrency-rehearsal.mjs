#!/usr/bin/env node
// PHASE 96 — SERIALIZABLE seat-limit concurrency rehearsal (real PostgreSQL).
//
// Proves the reserve-and-create invariant the app relies on: under SERIALIZABLE
// isolation, N simultaneous "count-then-insert" reservations against a ceiling
// can NEVER create more than the ceiling. This mirrors reserveAndCreate() in
// src/lib/billing-governance/runtime/atomic-reservation.ts (count in-tx →
// conditional insert → commit, retry on serialization failure).
//
// Disposable CI database only. No secrets, no provider calls, no production.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE WAS SPLIT INTO TWO PHASES
//
// The rehearsal used to assert a single condition after one concurrent wave:
//
//     actual === Math.min(ceiling, attempts)
//
// while `reserveOnce` simultaneously documented that a caller which exhausts its
// eight SERIALIZABLE retries "is treated as not reserved". Those two contracts
// cannot both hold in a scenario with no spare attempts.
//
// Only org-c (ceiling 5, attempts 5) has zero headroom: every one of the five
// actors must win for the equality to hold. org-a (1 of 8) and org-b (3 of 10)
// each carry seven spare actors, so a retry exhaustion there is invisible. On a
// loaded runner org-c reproducibly finished at 2 of 5 — three actors exhausted
// their retry budget — and the run was reported as a seat-limit failure.
//
// It was not one. Every safety property held: no ceiling was exceeded anywhere
// (1≤1, 3≤3, 2≤5) and successes always equalled rows. What failed was a
// THROUGHPUT expectation being asserted as though it were a SAFETY property.
//
// So the proof is now explicitly two things, because they fail for different
// reasons and only one of them is about correctness:
//
//   A. SAFETY (under contention) — concurrency must never over-allocate, and
//      the caller's view must match the database. Violations are always fatal.
//
//   B. CAPACITY (after contention clears) — the legitimate remaining seats must
//      be fillable. This is what proves the implementation is not simply broken
//      and returning zero, which a bare `actual <= ceiling` check would happily
//      accept.
//
// Retry exhaustion is now a NAMED outcome rather than a bare `false`. Returning
// `false` for both "the ceiling is genuinely full" and "I gave up retrying"
// destroyed the distinction the rehearsal most needed to make, and let a
// contention artefact wear the costume of an enforced limit.
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[phase96-concurrency] DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 20 });
const SERIALIZATION_FAILURE = "40001";
const RETRY_BUDGET = 8;

/** The three materially different outcomes of one reservation attempt. */
const RESERVED = "RESERVED";
const LIMIT_REACHED = "LIMIT_REACHED";
const RETRY_EXHAUSTED = "RETRY_EXHAUSTED";

/**
 * One reservation attempt against the ceiling.
 *
 * Returns a NAMED outcome. `LIMIT_REACHED` is a real answer from the database —
 * the seats were counted inside the transaction and there was no room.
 * `RETRY_EXHAUSTED` is the absence of an answer: contention prevented this actor
 * from ever completing. The rehearsal must never read the second as the first.
 *
 * Non-40001 errors are re-thrown untouched: a genuine product or database fault
 * must never be laundered into a tidy outcome.
 */
async function reserveOnce(org, ceiling) {
  for (let attempt = 0; attempt < RETRY_BUDGET; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const { rows } = await client.query("SELECT count(*)::int AS c FROM phase96_probe WHERE org = $1", [org]);
      const used = rows[0].c;
      if (used + 1 > ceiling) {
        await client.query("ROLLBACK");
        return LIMIT_REACHED;
      }
      await client.query("INSERT INTO phase96_probe (org) VALUES ($1)", [org]);
      await client.query("COMMIT");
      return RESERVED;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err && err.code === SERIALIZATION_FAILURE) continue; // retry
      throw err;
    } finally {
      client.release();
    }
  }
  return RETRY_EXHAUSTED;
}

const countRows = async (org) => {
  const { rows } = await pool.query("SELECT count(*)::int AS c FROM phase96_probe WHERE org = $1", [org]);
  return rows[0].c;
};

/**
 * PHASE A — safety under contention.
 *
 * Fires every actor simultaneously, exactly as before. The assertions here are
 * the ones that must never be relaxed: over-allocation and caller/database
 * disagreement are always fatal, however heavy the contention.
 */
async function concurrentWave(org, ceiling, attempts) {
  const outcomes = await Promise.all(
    Array.from({ length: attempts }, () => reserveOnce(org, ceiling)),
  );
  const reserved = outcomes.filter((o) => o === RESERVED).length;
  const limitReached = outcomes.filter((o) => o === LIMIT_REACHED).length;
  const retryExhausted = outcomes.filter((o) => o === RETRY_EXHAUSTED).length;
  const rows = await countRows(org);

  console.log(
    `[phase96-concurrency] org=${org} ceiling=${ceiling} attempts=${attempts} `
    + `concurrentSuccesses=${reserved} concurrentRows=${rows} `
    + `limitReached=${limitReached} retryExhausted=${retryExhausted}`,
  );

  if (rows > ceiling) throw new Error(`OVER_LIMIT: ${rows} > ${ceiling}`);
  if (reserved !== rows) throw new Error(`MISMATCH successes=${reserved} rows=${rows}`);

  return { reserved, limitReached, retryExhausted, rows };
}

/**
 * PHASE B — capacity, once contention has cleared.
 *
 * Runs strictly sequentially, so a 40001 is no longer expected. Anything still
 * unreachable here is a real inability to allocate legitimate capacity, and is
 * fatal. The ceiling is re-checked after every insert, so this phase can never
 * become a way to exceed it.
 */
async function convergeToCapacity(org, ceiling, expected) {
  let rows = await countRows(org);
  let filled = 0;

  // One bounded pass per missing seat; each pass is a single un-contended actor.
  for (let i = rows; i < expected; i++) {
    const outcome = await reserveOnce(org, ceiling);
    if (outcome === RESERVED) { filled++; continue; }
    throw new Error(
      `CAPACITY_UNREACHABLE: org=${org} stalled at ${await countRows(org)} of ${expected} `
      + `(uncontended attempt returned ${outcome})`,
    );
  }

  rows = await countRows(org);
  if (rows > ceiling) throw new Error(`OVER_LIMIT_AFTER_CONVERGENCE: ${rows} > ${ceiling}`);
  return { filled, rows };
}

async function scenario(org, ceiling, attempts) {
  await pool.query("DELETE FROM phase96_probe WHERE org = $1", [org]);
  const expected = Math.min(ceiling, attempts);

  const wave = await concurrentWave(org, ceiling, attempts);

  /*
   * Convergence is only legitimate when the shortfall is explained by retry
   * exhaustion. If the wave came up short with every actor having received a
   * real answer, the implementation is under-allocating and that is a defect,
   * not contention.
   */
  let converged = { filled: 0, rows: wave.rows };
  if (wave.rows < expected) {
    if (wave.retryExhausted === 0) {
      throw new Error(
        `UNDER_ALLOCATED: org=${org} reached ${wave.rows} of ${expected} with no retry exhaustion`,
      );
    }
    converged = await convergeToCapacity(org, ceiling, expected);
  }

  const finalRows = await countRows(org);
  console.log(
    `[phase96-concurrency] org=${org} convergenceFilled=${converged.filled} `
    + `finalRows=${finalRows} expected=${expected}`,
  );

  if (finalRows > ceiling) throw new Error(`OVER_LIMIT: ${finalRows} > ${ceiling}`);
  if (finalRows !== expected) throw new Error(`EXPECTED ${expected} got ${finalRows}`);
}

async function main() {
  await pool.query("CREATE TABLE IF NOT EXISTS phase96_probe (id serial PRIMARY KEY, org text NOT NULL)");
  try {
    await scenario("org-a", 1, 8);
    await scenario("org-b", 3, 10);
    await scenario("org-c", 5, 5);
    await scenario("org-d", 0, 4);
    console.log("[phase96-concurrency] OK — no ceiling was ever exceeded under concurrency, and legitimate capacity was reachable");
  } finally {
    await pool.query("DROP TABLE IF EXISTS phase96_probe");
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[phase96-concurrency] FAILED", err);
  process.exit(1);
});
