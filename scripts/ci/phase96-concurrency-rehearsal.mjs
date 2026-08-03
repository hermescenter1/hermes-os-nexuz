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

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[phase96-concurrency] DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 20 });
const SERIALIZATION_FAILURE = "40001";

async function reserveOnce(org, ceiling) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const { rows } = await client.query("SELECT count(*)::int AS c FROM phase96_probe WHERE org = $1", [org]);
      const used = rows[0].c;
      if (used + 1 > ceiling) {
        await client.query("ROLLBACK");
        return false; // limit reached
      }
      await client.query("INSERT INTO phase96_probe (org) VALUES ($1)", [org]);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err && err.code === SERIALIZATION_FAILURE) continue; // retry
      throw err;
    } finally {
      client.release();
    }
  }
  return false; // exhausted retries under contention → treated as not reserved
}

async function scenario(org, ceiling, attempts) {
  await pool.query("DELETE FROM phase96_probe WHERE org = $1", [org]);
  const results = await Promise.all(Array.from({ length: attempts }, () => reserveOnce(org, ceiling)));
  const successes = results.filter(Boolean).length;
  const { rows } = await pool.query("SELECT count(*)::int AS c FROM phase96_probe WHERE org = $1", [org]);
  const actual = rows[0].c;
  console.log(`[phase96-concurrency] org=${org} ceiling=${ceiling} attempts=${attempts} successes=${successes} rows=${actual}`);
  if (actual > ceiling) throw new Error(`OVER_LIMIT: ${actual} > ${ceiling}`);
  if (successes !== actual) throw new Error(`MISMATCH successes=${successes} rows=${actual}`);
  if (actual !== Math.min(ceiling, attempts)) throw new Error(`EXPECTED ${Math.min(ceiling, attempts)} got ${actual}`);
}

async function main() {
  await pool.query("CREATE TABLE IF NOT EXISTS phase96_probe (id serial PRIMARY KEY, org text NOT NULL)");
  try {
    await scenario("org-a", 1, 8);
    await scenario("org-b", 3, 10);
    await scenario("org-c", 5, 5);
    await scenario("org-d", 0, 4);
    console.log("[phase96-concurrency] OK — no ceiling was ever exceeded under concurrency");
  } finally {
    await pool.query("DROP TABLE IF EXISTS phase96_probe");
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[phase96-concurrency] FAILED", err);
  process.exit(1);
});
