#!/usr/bin/env node
/**
 * Hermes OS — Phase 99.7 deploy-time migration classification.
 *
 * Invoked by `.github/workflows/deploy.yml` on the runner, BEFORE any SSH
 * connection is opened. It answers one question from the repository alone:
 * does the release from `DEPLOYED_SHA` to `TARGET_SHA` carry schema migrations,
 * and is that migration set safe to apply automatically?
 *
 * The answer drives the pre-migration evidence gate. A release with no
 * migrations needs no pre-migration backup and is not slowed down; a release
 * with migrations cannot proceed without one.
 *
 * Fail-closed in every direction:
 *   - a historical migration that changed, disappeared or was renamed since the
 *     deployed commit exits non-zero — the deployed database's migration history
 *     no longer matches source, and no deploy may paper over that;
 *   - a migration that cannot be classified as additive or forward-only exits
 *     non-zero — an unknown/breaking change is a human decision;
 *   - if the two commits cannot be read, the gate exits non-zero rather than
 *     assuming there is nothing to migrate.
 *
 * Read-only: `git ls-tree` / `git show` plus the checked-out migration files.
 * No network, no database, no production host contact, no secrets.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyMigrationSql } from "./migration-sql-classify.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(REPO, "prisma", "migrations");

const TARGET_SHA = (process.env.TARGET_SHA ?? "").trim();
const DEPLOYED_SHA = (process.env.DEPLOYED_SHA ?? "").trim();
const SHA40_RE = /^[0-9a-f]{40}$/;

const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * Content identity of a migration, normalised for line endings so a checkout
 * policy can never be mistaken for a mutated migration.
 * @param {string} sql
 */
const identity = (sql) => createHash("sha256").update(sql.split("\r\n").join("\n"), "utf8").digest("hex");

/** @param {string} sha @returns {Record<string,string>} */
function checksumsAt(sha) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of git(["ls-tree", "-r", "--name-only", sha, "prisma/migrations/"]).split("\n")) {
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(line.trim());
    if (!m) continue;
    out[m[1]] = identity(git(["show", `${sha}:${line.trim()}`]));
  }
  return out;
}

/** Migration SQL of the target commit, keyed by migration name. */
function targetSql(sha) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const line of git(["ls-tree", "-r", "--name-only", sha, "prisma/migrations/"]).split("\n")) {
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(line.trim());
    if (!m) continue;
    out[m[1]] = git(["show", `${sha}:${line.trim()}`]);
  }
  return out;
}

function emitOutput(key, value) {
  console.log(`RESULT ${key}=${value}`);
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${key}=${value}\n`, "utf8");
}

function refuse(message) {
  console.error(`[deploy-migration-gate] ${message}`);
  emitOutput("deploy_blocked", "true");
  process.exit(1);
}

function main() {
  if (!SHA40_RE.test(TARGET_SHA)) refuse("TARGET_SHA must be an exact 40-character lowercase hex commit.");
  if (!SHA40_RE.test(DEPLOYED_SHA)) refuse("DEPLOYED_SHA must be an exact 40-character lowercase hex commit.");

  let deployed;
  let target;
  let sqlByName;
  try {
    deployed = checksumsAt(DEPLOYED_SHA);
    target = checksumsAt(TARGET_SHA);
    sqlByName = targetSql(TARGET_SHA);
  } catch (err) {
    refuse(`cannot read the migration sets of both commits (fetch full history): ${String(err?.message ?? err).slice(0, 200)}`);
    return;
  }

  const deployedNames = Object.keys(deployed);
  const targetNames = Object.keys(target);

  const missing = deployedNames.filter((n) => !(n in target)).sort();
  const mutated = deployedNames.filter((n) => n in target && target[n] !== deployed[n]).sort();
  const added = targetNames.filter((n) => !(n in deployed)).sort();

  emitOutput("deployed_migration_count", String(deployedNames.length));
  emitOutput("target_migration_count", String(targetNames.length));
  emitOutput("new_migration_count", String(added.length));

  if (missing.length > 0) refuse(`previously-applied migration(s) missing from the target: ${missing.join(", ")}`);
  if (mutated.length > 0) refuse(`previously-applied migration(s) changed since the deployed commit: ${mutated.join(", ")}`);

  if (added.length === 0) {
    emitOutput("migration_classification", "NO_MIGRATION");
    emitOutput("pre_migration_backup_required", "false");
    emitOutput("deploy_blocked", "false");
    console.log("RESULT deploy_migration_gate=PASS");
    return;
  }

  // Classify every new migration; the release takes the most severe verdict.
  const order = ["ADDITIVE_COMPATIBLE", "FORWARD_ONLY_REQUIRES_BACKUP", "BREAKING_OR_UNKNOWN"];
  let worst = "ADDITIVE_COMPATIBLE";
  for (const name of added) {
    const sql = sqlByName[name];
    if (typeof sql !== "string") {
      worst = "BREAKING_OR_UNKNOWN";
      console.log(`  - new migration "${name}" has no readable SQL — treated as BREAKING_OR_UNKNOWN`);
      continue;
    }
    const { classification } = classifyMigrationSql(sql);
    if (order.indexOf(classification) > order.indexOf(worst)) worst = classification;
    console.log(`  - ${name}: ${classification}`);
  }

  emitOutput("migration_classification", worst);
  // Any schema change at all requires a restorable pre-migration backup.
  emitOutput("pre_migration_backup_required", "true");

  if (worst === "BREAKING_OR_UNKNOWN") {
    refuse("at least one new migration is BREAKING_OR_UNKNOWN — this release must not deploy automatically.");
  }

  emitOutput("deploy_blocked", "false");
  console.log("RESULT deploy_migration_gate=PASS");
}

// Keep the working-tree readers referenced for the local `--self-check` mode,
// which lets an operator classify the checked-out migration set without git.
if (process.argv.includes("--self-check")) {
  const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => {
      try {
        return statSync(join(MIGRATIONS_DIR, n, "migration.sql")).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  for (const n of names) {
    const { classification } = classifyMigrationSql(readFileSync(join(MIGRATIONS_DIR, n, "migration.sql"), "utf8"));
    console.log(`${n}: ${classification}`);
  }
  console.log(`RESULT self_check_migration_count=${names.length}`);
} else {
  main();
}
