/**
 * PHASE 99.7 — deployed-baseline → target migration rehearsal (real pg16).
 *
 * The Phase 98 rehearsal proves the migration MECHANISM (gate, additive
 * compatibility, restore-based rollback) and CI's per-phase jobs prove a FRESH
 * `migrate deploy` on an empty database. Neither proves the thing this cutover
 * actually does: taking a database that stopped at the Phase 94 baseline
 * (49 migrations) and carrying it forward to the reconciled Phase 99.6 target
 * (69 migrations) WITHOUT losing the rows that were already in it.
 *
 * This rehearsal does exactly that, against a disposable `pgvector/pg16`
 * container that can never be the Production stack:
 *
 *   1. build a baseline-compatible database by applying ONLY the 49 baseline
 *      migrations (materialised straight from the baseline commit's git blobs);
 *   2. seed clearly-labelled SYNTHETIC rows — this rehearsal never needs, reads
 *      or copies Production data;
 *   3. apply the target migration set — exactly the 20 new migrations must run;
 *   4. verify the resulting schema is IDENTICAL to a fresh target deploy, so the
 *      upgrade path and the from-scratch path cannot silently diverge;
 *   5. verify no pre-existing row was lost (per-table row counts + a digest over
 *      the seeded rows);
 *   6. verify a SECOND `migrate deploy` is idempotent and `migrate status`
 *      reports no pending migration;
 *   7. drop the rehearsal databases and remove the container.
 *
 * Migration SQL is read from git blobs on BOTH sides so the byte content — and
 * therefore Prisma's own migration checksums — is identical regardless of the
 * checkout's line-ending policy.
 *
 * BOTH ENDS ARE PINNED COMMITS — never HEAD (changed — read this)
 * ---------------------------------------------------------------
 * This rehearsal is HISTORICAL EVIDENCE for one specific production transition:
 * 911a2d7 (49 migrations) → cbfa292 (69 migrations). It used to materialise
 * `HEAD` as the target, which silently made the evidence a property of whatever
 * the branch currently held: the moment a later release appended migration #70,
 * the rehearsal materialised 70 and failed its own 69-migration contract — not
 * because the historical transition had changed (it cannot; it already
 * happened), but because the target had drifted. A later phase proves its own
 * migration delta under its own contract (see
 * scripts/ci/phase102-migration-integrity.mjs); it must never rewrite this one.
 *
 * So the target is {@link TARGET_SHA}, imported from the Phase 99.7 integrity
 * contract, which is also what the immutable ledger records. There is no
 * environment override: an override that can repoint the historical target is
 * not a convenience, it is a way to make this evidence say something it did not
 * observe. Tests drive {@link materializeMigrationSet} with an explicit ref
 * instead.
 *
 * No Production contact, no Production data, no OpenBao, no network beyond the
 * local Docker daemon. Row payloads and credentials are never printed.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withDisposablePg } from "./lib/disposable-pg.mjs";
import { BASELINE_SHA, TARGET_SHA, EXPECTED_BASELINE_COUNT, EXPECTED_DELTA, EXPECTED_TARGET_COUNT } from "./phase997-migration-integrity.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRISMA_CLI = join(REPO, "node_modules", "prisma", "build", "index.js");

/**
 * The commit whose migration set is rehearsed as the release target.
 *
 * PINNED to the Phase 99.7 target, never `HEAD` and never an environment
 * override — see the note at the top of this file. Declared once, here, by
 * re-using the canonical constant rather than restating the SHA, so the
 * rehearsal and the integrity gate cannot describe two different releases.
 */
export const TARGET_REF = TARGET_SHA;

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${String(detail).slice(0, 400)}`);
  if (!cond) failed = true;
};

const git = (args, cwd = REPO) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Materialise a commit's Prisma schema + migration set into a temp directory so
 * the CLI can be pointed at it with `--schema`. Contents come from git blobs, so
 * they are byte-identical to what a Linux production checkout would contain.
 *
 * `repoRoot` defaults to THIS repository, which is the only value the rehearsal
 * itself ever passes — the production path is unchanged. It exists so the
 * contract tests can exercise this function against a synthetic repository they
 * build themselves, instead of depending on the enclosing checkout having deep
 * history. That dependency is what broke four unrelated CI jobs: the generic
 * `npm test` runs under a default (shallow) checkout in workflows that have no
 * reason to fetch history, so a unit test must never reach for a historical
 * commit. Real-history proof belongs to `gate:phase997:migrations` and to this
 * rehearsal, both of which run only under `fetch-depth: 0`.
 *
 * @param {string} ref
 * @param {string} destRoot
 * @param {{ repoRoot?: string }} [options]
 * @returns {{ schemaPath: string, migrationNames: string[] }}
 */
export function materializeMigrationSet(ref, destRoot, { repoRoot = REPO } = {}) {
  const prismaDir = join(destRoot, "prisma");
  const migrationsDir = join(prismaDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  writeFileSync(join(prismaDir, "schema.prisma"), git(["show", `${ref}:prisma/schema.prisma`], repoRoot), "utf8");
  writeFileSync(join(migrationsDir, "migration_lock.toml"), git(["show", `${ref}:prisma/migrations/migration_lock.toml`], repoRoot), "utf8");

  const names = [];
  for (const line of git(["ls-tree", "-r", "--name-only", ref, "prisma/migrations/"], repoRoot).split("\n")) {
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(line.trim());
    if (!m) continue;
    const name = m[1];
    mkdirSync(join(migrationsDir, name), { recursive: true });
    writeFileSync(join(migrationsDir, name, "migration.sql"), git(["show", `${ref}:prisma/migrations/${name}/migration.sql`], repoRoot), "utf8");
    names.push(name);
  }
  names.sort();
  return { schemaPath: join(prismaDir, "schema.prisma"), migrationNames: names };
}

/** Run the Prisma CLI against a specific schema + database URL. */
function prisma(args, { schemaPath, dbUrl, allowFailure = false }) {
  try {
    return execFileSync(process.execPath, [PRISMA_CLI, ...args, "--schema", schemaPath], {
      cwd: REPO,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (err) {
    if (allowFailure) return `${String(err.stdout ?? "")}\n${String(err.stderr ?? "")}`;
    throw new Error(`prisma ${args.join(" ")} failed: ${String(err.stderr ?? err.message).slice(0, 400)}`);
  }
}

/** Column-level fingerprint of the public schema (excluding Prisma's own table). */
const SCHEMA_FINGERPRINT_SQL = `
SELECT coalesce(md5(string_agg(sig, '|' ORDER BY sig)), 'EMPTY') FROM (
  SELECT table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS sig
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
) s`;

/** Per-table row counts of the public schema, as a stable "table=count,..." string. */
const ROW_COUNTS_SQL = `
SELECT coalesce(string_agg(t || '=' || cnt, ',' ORDER BY t), 'EMPTY') FROM (
  SELECT c.relname AS t,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS cnt
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND n.nspname = 'public' AND c.relname <> '_prisma_migrations'
) s`;

/** Digest over the SYNTHETIC seed rows, so "still there" means "byte-identical". */
const SEED_DIGEST_SQL = `
SELECT coalesce(md5(string_agg(h, '' ORDER BY h)), 'EMPTY')
FROM (SELECT md5(row_to_json(x)::text) h FROM "AuditLog" x WHERE x.id LIKE 'SYNTHETIC_p997_%') s`;

/**
 * Materialise a PINNED commit, or report the failure as a named check.
 *
 * A rehearsal whose ends cannot be read has proven nothing, and "could not
 * check" must never render as "passed". The overwhelmingly likely cause is a
 * shallow clone, so the failure detail says so instead of surfacing a raw git
 * error.
 *
 * @param {string} label the RESULT label to report under
 * @param {string} sha
 * @param {string} destRoot
 * @returns {{ schemaPath: string, migrationNames: string[] }|null}
 */
function materializeOrFail(label, sha, destRoot) {
  try {
    const set = materializeMigrationSet(sha, destRoot);
    check(label, true);
    return set;
  } catch (err) {
    check(
      label,
      false,
      `cannot materialise ${sha.slice(0, 12)} — fetch full history (fetch-depth: 0): ${String(err?.message ?? err)}`,
    );
    return null;
  }
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), "hermes-p997-mig-"));
  const baselineRoot = join(work, "baseline");
  const targetRoot = join(work, "target");

  try {
    // The historical contract is only meaningful if BOTH ends are immutable
    // commits. A ref that is not a pinned 40-hex SHA (`HEAD`, a branch name, an
    // environment override) makes this evidence a property of the checkout.
    check(
      "REHEARSAL_TARGET_REF_PINNED",
      TARGET_REF === TARGET_SHA && /^[0-9a-f]{40}$/.test(TARGET_REF),
      `the historical target must be the pinned ${TARGET_SHA.slice(0, 12)}, got "${TARGET_REF}"`,
    );

    const baseline = materializeOrFail("REHEARSAL_BASELINE_REACHABLE", BASELINE_SHA, baselineRoot);
    if (baseline === null) return;
    const target = materializeOrFail("REHEARSAL_TARGET_REACHABLE", TARGET_REF, targetRoot);
    if (target === null) return;

    check(
      "REHEARSAL_BASELINE_SET",
      baseline.migrationNames.length === EXPECTED_BASELINE_COUNT,
      `expected ${EXPECTED_BASELINE_COUNT} baseline migrations, materialised ${baseline.migrationNames.length}`,
    );
    check(
      "REHEARSAL_TARGET_SET",
      target.migrationNames.length === EXPECTED_TARGET_COUNT,
      `expected ${EXPECTED_TARGET_COUNT} target migrations at ${TARGET_REF.slice(0, 12)}, materialised ${target.migrationNames.length}`,
    );

    await withDisposablePg("p997mig", async (ctx) => {
      const UPGRADE_DB = "hermes_p997_upgrade";
      const FRESH_DB = "hermes_p997_fresh";
      for (const db of [UPGRADE_DB, FRESH_DB]) {
        ctx.psql(`DROP DATABASE IF EXISTS ${db}`);
        ctx.psql(`CREATE DATABASE ${db}`);
      }

      // ── 1. Baseline-compatible state ────────────────────────────────────────
      prisma(["migrate", "deploy"], { schemaPath: baseline.schemaPath, dbUrl: ctx.urlForDb(UPGRADE_DB) });
      const appliedAfterBaseline = Number(
        ctx.psql(`SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`, UPGRADE_DB).trim(),
      );
      check(
        "REHEARSAL_BASELINE_APPLIED",
        appliedAfterBaseline === EXPECTED_BASELINE_COUNT,
        `expected ${EXPECTED_BASELINE_COUNT} applied migrations, database reports ${appliedAfterBaseline}`,
      );

      // ── 2. SYNTHETIC seed (never Production data) ───────────────────────────
      for (let i = 0; i < 5; i += 1) {
        ctx.psql(
          `INSERT INTO "AuditLog" (id, action, "entityType", metadata, "createdAt") VALUES ('SYNTHETIC_p997_${i}','case.updated','case','{"synthetic":true}'::jsonb, now())`,
          UPGRADE_DB,
        );
      }
      const seedDigestBefore = ctx.psql(SEED_DIGEST_SQL, UPGRADE_DB).trim();
      const rowCountsBefore = parseRowCounts(ctx.psql(ROW_COUNTS_SQL, UPGRADE_DB).trim());
      check("REHEARSAL_SEEDED", seedDigestBefore !== "EMPTY" && (rowCountsBefore.AuditLog ?? 0) >= 5, "synthetic seed did not land");

      // ── 3. Forward migration to the release target ──────────────────────────
      prisma(["migrate", "deploy"], { schemaPath: target.schemaPath, dbUrl: ctx.urlForDb(UPGRADE_DB) });
      const appliedAfterTarget = Number(
        ctx.psql(`SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`, UPGRADE_DB).trim(),
      );
      check(
        "REHEARSAL_TARGET_APPLIED",
        appliedAfterTarget === EXPECTED_TARGET_COUNT,
        `expected ${EXPECTED_TARGET_COUNT} applied migrations, database reports ${appliedAfterTarget}`,
      );
      check(
        "REHEARSAL_DELTA_EXACTLY_20",
        appliedAfterTarget - appliedAfterBaseline === EXPECTED_DELTA,
        `expected ${EXPECTED_DELTA} newly applied migrations, observed ${appliedAfterTarget - appliedAfterBaseline}`,
      );
      const failedMigrations = Number(
        ctx.psql(`SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`, UPGRADE_DB).trim(),
      );
      check("REHEARSAL_NO_FAILED_MIGRATION", failedMigrations === 0, `${failedMigrations} migration row(s) unfinished or rolled back`);

      // ── 4. Schema verification: upgraded === fresh ──────────────────────────
      prisma(["migrate", "deploy"], { schemaPath: target.schemaPath, dbUrl: ctx.urlForDb(FRESH_DB) });
      const upgradedFingerprint = ctx.psql(SCHEMA_FINGERPRINT_SQL, UPGRADE_DB).trim();
      const freshFingerprint = ctx.psql(SCHEMA_FINGERPRINT_SQL, FRESH_DB).trim();
      check(
        "REHEARSAL_SCHEMA_MATCHES_FRESH_DEPLOY",
        upgradedFingerprint === freshFingerprint && upgradedFingerprint !== "EMPTY",
        `upgraded=${upgradedFingerprint} fresh=${freshFingerprint}`,
      );

      // ── 5. Row-count / integrity verification ───────────────────────────────
      const rowCountsAfter = parseRowCounts(ctx.psql(ROW_COUNTS_SQL, UPGRADE_DB).trim());
      const lost = Object.entries(rowCountsBefore)
        .filter(([table, before]) => (rowCountsAfter[table] ?? 0) < before)
        .map(([table, before]) => `${table}: ${before} -> ${rowCountsAfter[table] ?? 0}`);
      check("REHEARSAL_NO_ROWS_LOST", lost.length === 0, lost.join(", "));

      const seedDigestAfter = ctx.psql(SEED_DIGEST_SQL, UPGRADE_DB).trim();
      check(
        "REHEARSAL_SEED_INTEGRITY",
        seedDigestAfter === seedDigestBefore,
        "the synthetic pre-migration rows did not survive the upgrade byte-identically",
      );

      // ── 6. Idempotency ──────────────────────────────────────────────────────
      prisma(["migrate", "deploy"], { schemaPath: target.schemaPath, dbUrl: ctx.urlForDb(UPGRADE_DB) });
      const appliedAfterSecond = Number(
        ctx.psql(`SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`, UPGRADE_DB).trim(),
      );
      check(
        "REHEARSAL_SECOND_DEPLOY_IDEMPOTENT",
        appliedAfterSecond === EXPECTED_TARGET_COUNT,
        `a second deploy changed the applied count to ${appliedAfterSecond}`,
      );
      const status = prisma(["migrate", "status"], { schemaPath: target.schemaPath, dbUrl: ctx.urlForDb(UPGRADE_DB), allowFailure: true });
      check(
        "REHEARSAL_NO_PENDING_MIGRATIONS",
        /database schema is up to date/i.test(status) && !/following migrations? have not yet been applied/i.test(status),
        status.split("\n").filter(Boolean).slice(-3).join(" / "),
      );

      // ── 7. Cleanup of the rehearsal databases ───────────────────────────────
      for (const db of [UPGRADE_DB, FRESH_DB]) ctx.psql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
      const leftovers = ctx.psql(`SELECT count(*)::int FROM pg_database WHERE datname LIKE 'hermes_p997_%'`).trim();
      check("REHEARSAL_TEMPORARY_DB_CLEANED", leftovers === "0", `${leftovers} rehearsal database(s) still present`);
    });
  } catch (err) {
    check("REHEARSAL_COMPLETED", false, String(err?.message ?? err));
  } finally {
    // Reached on EVERY path — normal completion, a thrown error, and the early
    // returns above when a pinned commit could not be materialised — so the
    // temp tree is always removed and the verdict is always printed exactly
    // once. An unreachable baseline or target therefore exits non-zero rather
    // than silently reporting nothing.
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      // A temp directory that will not delete (Windows keeps handles open a
      // moment longer) is housekeeping, not a verdict. It must never be able
      // to swallow the RESULT lines below.
    }
    finish();
  }
}

function finish() {
  console.log(`RESULT phase997_migration_rehearsal=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase997_migration_rehearsal_production_contacted=False");
  console.log("RESULT phase997_migration_rehearsal_data=SYNTHETIC_ONLY");
  process.exit(failed ? 1 : 0);
}

/** @param {string} raw "table=count,table=count" @returns {Record<string, number>} */
function parseRowCounts(raw) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!raw || raw === "EMPTY") return out;
  for (const pair of raw.split(",")) {
    const idx = pair.lastIndexOf("=");
    if (idx < 0) continue;
    out[pair.slice(0, idx)] = Number(pair.slice(idx + 1));
  }
  return out;
}

// Only run when this file is the process entry point: the contract tests import
// `TARGET_REF` and `materializeMigrationSet` to prove the historical target is
// pinned, and importing must not start a Docker container (or exit the runner).
const invokedDirectly =
  typeof process.argv[1] === "string" && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`RESULT phase997_migration_rehearsal=FAIL (${String(err?.message ?? err).slice(0, 200)})`);
    process.exit(1);
  });
}
