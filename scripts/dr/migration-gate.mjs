/**
 * Hermes OS — Phase 98 release-level Prisma migration gate.
 *
 * Compares the migration set a release will deploy against the migration set
 * of the currently-deployed release base, and fails closed on the two
 * conditions that must never reach production automatically:
 *
 *   1. HISTORICAL MUTATION — an already-applied migration's SQL changed (or
 *      disappeared) between the release base and the target. Prisma
 *      migrations are append-only; a mutated or missing historical migration
 *      means the deployed database's migration history can no longer be
 *      trusted to match source, which is a class of bug/tamper that must
 *      block deploy unconditionally.
 *   2. An UNKNOWN/BREAKING new migration (drops, renames, truncates, etc.) —
 *      must never auto-deploy without a human explicitly accepting the risk.
 *
 * Read-only over the filesystem; makes no network or database calls.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { classifyMigrationSql } from "./migration-sql-classify.mjs";

/** @typedef {import("./migration-sql-classify.mjs").MigrationClassification} MigrationClassification */

const SEVERITY_ORDER = /** @type {const} */ ([
  "ADDITIVE_COMPATIBLE",
  "FORWARD_ONLY_REQUIRES_BACKUP",
  "BREAKING_OR_UNKNOWN",
]);

/**
 * Compute a sha256 checksum of each migration's `migration.sql` in a Prisma
 * `prisma/migrations/` directory.
 *
 * @param {string} migrationsDir absolute or relative path to `prisma/migrations`
 * @returns {Record<string,string>} migration folder name -> sha256 hex
 */
export function computeMigrationChecksums(migrationsDir) {
  /** @type {Record<string,string>} */
  const checksums = {};
  let entries;
  try {
    entries = readdirSync(migrationsDir, { withFileTypes: true });
  } catch {
    return checksums; // no migrations directory yet — treat as empty
  }

  const names = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const name of names) {
    const sqlPath = join(migrationsDir, name, "migration.sql");
    let stat;
    try {
      stat = statSync(sqlPath);
    } catch {
      continue; // no migration.sql in this folder — not a real migration
    }
    if (!stat.isFile()) continue;
    const sql = readFileSync(sqlPath, "utf8");
    checksums[name] = createHash("sha256").update(sql, "utf8").digest("hex");
  }

  return checksums;
}

/**
 * @param {MigrationClassification} a
 * @param {MigrationClassification} b
 * @returns {MigrationClassification} the more severe of the two
 */
function moreSevere(a, b) {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * @typedef {Object} MigrationGateDecision
 * @property {"NO_MIGRATION"|MigrationClassification} migrationClassification
 * @property {string[]} newMigrations
 * @property {string[]} missingMigrations
 * @property {string[]} mutatedMigrations
 * @property {Record<string,string>} migrationHashes
 * @property {boolean} historicalMutation
 * @property {boolean} preMigrationBackupRequired
 * @property {boolean} deployBlocked
 * @property {string[]} reasons
 */

/**
 * Evaluate the release migration gate.
 *
 * @param {Object} opts
 * @param {string} opts.migrationsDir path to `prisma/migrations`
 * @param {Record<string,string>} opts.releaseBaseChecksums checksum map of the currently-deployed release
 * @param {Record<string,string>} [opts.targetChecksums] checksum map of the release being evaluated; defaults to scanning `migrationsDir`
 * @param {(name: string) => string} [opts.readMigrationSql] reads a new migration's SQL for classification; defaults to the working tree. Callers verifying a PINNED commit pass a `git show` reader so the whole evaluation derives from that commit, not from a checkout.
 * @returns {MigrationGateDecision}
 */
export function evaluateMigrationGate({ migrationsDir, releaseBaseChecksums, targetChecksums, readMigrationSql }) {
  const target = targetChecksums ?? computeMigrationChecksums(migrationsDir);
  const base = releaseBaseChecksums ?? {};

  const baseNames = Object.keys(base);
  const targetNames = Object.keys(target);

  const newMigrations = targetNames.filter((n) => !(n in base)).sort();
  const missingMigrations = baseNames.filter((n) => !(n in target)).sort();
  const mutatedMigrations = baseNames
    .filter((n) => n in target && target[n] !== base[n])
    .sort();

  const historicalMutation = mutatedMigrations.length > 0 || missingMigrations.length > 0;

  /** @type {string[]} */
  const reasons = [];

  if (mutatedMigrations.length > 0) {
    reasons.push(
      `${mutatedMigrations.length} previously-applied migration(s) changed checksum since the release base: ${mutatedMigrations.join(", ")}`,
    );
  }
  if (missingMigrations.length > 0) {
    reasons.push(
      `${missingMigrations.length} previously-applied migration(s) are missing from the target: ${missingMigrations.join(", ")}`,
    );
  }

  /** @type {MigrationClassification|"NO_MIGRATION"} */
  let migrationClassification;

  if (newMigrations.length === 0) {
    migrationClassification = "NO_MIGRATION";
    reasons.push("no new migrations to apply");
  } else {
    migrationClassification = "ADDITIVE_COMPATIBLE";
    for (const name of newMigrations) {
      let sql = "";
      try {
        sql = readMigrationSql
          ? readMigrationSql(name)
          : readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
      } catch {
        // Unreadable new migration SQL cannot be proven safe — treat as unknown/breaking.
        migrationClassification = moreSevere(migrationClassification, "BREAKING_OR_UNKNOWN");
        reasons.push(`new migration "${name}" has no readable migration.sql — treated as BREAKING_OR_UNKNOWN`);
        continue;
      }
      const { classification, hits } = classifyMigrationSql(sql);
      migrationClassification = moreSevere(migrationClassification, classification);
      if (hits.length > 0) {
        reasons.push(
          `new migration "${name}" classified ${classification} (${hits.map((h) => h.pattern).join(", ")})`,
        );
      }
    }
  }

  const preMigrationBackupRequired = migrationClassification !== "NO_MIGRATION";
  const deployBlocked = historicalMutation || migrationClassification === "BREAKING_OR_UNKNOWN";

  if (deployBlocked && !historicalMutation) {
    reasons.push("deploy blocked: at least one new migration is BREAKING_OR_UNKNOWN");
  }
  if (deployBlocked && historicalMutation) {
    reasons.push("deploy blocked: historical migration mutation detected");
  }

  /** @type {Record<string,string>} */
  const migrationHashes = {};
  for (const name of newMigrations) migrationHashes[name] = target[name];

  return {
    migrationClassification,
    newMigrations,
    missingMigrations,
    mutatedMigrations,
    migrationHashes,
    historicalMutation,
    preMigrationBackupRequired,
    deployBlocked,
    reasons,
  };
}
