/**
 * PHASE 98 — offline DR & release-engineering assurance (npm run eval:phase98).
 *
 * Deterministic, offline, fail-closed. No secrets, no PII, no network, no Docker,
 * no Production contact. Runs the pure invariant logic in-process and asserts the
 * presence + safety of the operator/CI/doc artifacts. Emits RESULT lines (machine
 * readable) and writes phase98-assurance.json (safe fields only). Any UNKNOWN
 * state, missing required artifact or failed group is a hard FAIL (exit 1).
 *
 * The REAL PostgreSQL/Docker rehearsal PASS results are produced by the CI jobs in
 * .github/workflows/phase98-dr-release-assurance.yml; this offline eval proves the
 * logic + wiring + that a destructive Production action can never be the default.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { encrypt, decrypt, parseKeyMaterial, EnvelopeError } from "../dr/backup-envelope.mjs";
import { selectPrunable, selectRestoreArtifact } from "../dr/backup-retention.mjs";
import { packRoots, unpackRoots, assertSafeRelPath } from "../dr/uploads-archive.mjs";
import { classifyRedisInventory, assertRedisLossSecurityFailmode, REDIS_PERSISTENCE_DECISION } from "../dr/redis-recovery-policy.mjs";
import { renderInventory, validateInventory } from "../dr/config-inventory.mjs";
import { classifyMigrationSql } from "../dr/migration-sql-classify.mjs";
import { buildReleaseManifest, validateReleaseManifest } from "../dr/release-manifest.mjs";
import { parseSemVer, validateChangelogHasVersion } from "../dr/version-changelog.mjs";
import { classifyRollback, nextState, requirePreviousGood, isTerminal } from "../dr/release-state.mjs";
import { deriveSystemRpoHours, validateRpoRto } from "../dr/rpo-rto.mjs";
import { validateOwnership } from "../dr/recovery-ownership.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = (p) => join(REPO, p);
const read = (p) => (existsSync(rel(p)) ? readFileSync(rel(p), "utf8") : null);

let failed = false;
const groups = {};
function group(name, fn) {
  const errors = [];
  const check = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  try {
    fn(check);
  } catch (err) {
    errors.push(`threw: ${String(err?.message ?? err).slice(0, 160)}`);
  }
  const ok = errors.length === 0;
  groups[name] = ok ? "PASS" : "FAIL";
  console.log(`RESULT phase98_${name}=${ok ? "PASS" : "FAIL"}`);
  for (const e of errors) console.log(`  - ${e}`);
  if (!ok) failed = true;
}

// ── BACKUP_ENCRYPTION ─────────────────────────────────────────────────────────
group("BACKUP_ENCRYPTION", (check) => {
  const key = randomBytes(32);
  const pt = randomBytes(2048);
  const art = encrypt({ plaintext: pt, key, keyId: "eval", artifactType: "postgres", createdAt: "2026-08-07T00:00:00.000Z" });
  check(decrypt({ buffer: art, key }).plaintext.equals(pt), "round trip failed");
  check(readHeaderCipher(art) === "aes-256-gcm", "cipher not aes-256-gcm");
  // wrong key
  check(rejects(() => decrypt({ buffer: art, key: randomBytes(32) }), "DECRYPTION_FAILED"), "wrong key not rejected");
  // corruption
  const c = Buffer.from(art);
  c[Math.floor(c.length / 2)] ^= 0xff;
  check(rejects(() => decrypt({ buffer: c, key }), "DECRYPTION_FAILED"), "corruption not rejected");
  // all-zero key rejected
  check(rejects(() => parseKeyMaterial(Buffer.alloc(32)), null), "all-zero key not rejected");
});

// ── POSTGRES_RECOVERY (logic + operator wiring) ───────────────────────────────
group("POSTGRES_RECOVERY", (check) => {
  const NOW = Date.now();
  const day = 864e5;
  const arts = [
    { name: "new.hbk", createdAtMs: NOW - day, verified: true, partial: false, encrypted: true },
    { name: "old.hbk", createdAtMs: NOW - 400 * day, verified: true, partial: false, encrypted: true },
    { name: "bad.partial", createdAtMs: NOW, verified: false, partial: true, encrypted: true },
  ];
  const sel = selectPrunable(arts, { retentionDays: 30, minVerifiedCopies: 1, nowMs: NOW });
  check(!sel.prune.some((p) => p.name === "new.hbk"), "newest verified must never be pruned");
  check(selectRestoreArtifact(arts)?.name === "new.hbk", "restore must pick newest verified");
  check(selectRestoreArtifact([arts[2]]) === null, "partial must never be a restore target");
  const bk = read("scripts/backup-postgres.sh") || "";
  const rs = read("scripts/restore-postgres.sh") || "";
  check(/dr\/hbk\.mjs/.test(bk) && /encrypt/.test(bk), "backup script must encrypt via hbk.mjs");
  check(/verify-backup\.sh not found/.test(bk) && /exit 2/.test(bk), "backup must fail closed if verifier missing");
  check(/dr\/hbk\.mjs/.test(rs) && /decrypt/.test(rs), "restore must authenticate+decrypt via hbk.mjs");
  check(/RESTORE_CONFIRM/.test(rs) && /exit 3/.test(rs), "restore must be fail-closed on confirmation");
});

// ── UPLOAD_RECOVERY ───────────────────────────────────────────────────────────
group("UPLOAD_RECOVERY", (check) => {
  check(rejects(() => assertSafeRelPath("../escape"), null), "path traversal not rejected");
  check(rejects(() => assertSafeRelPath("/abs"), null), "absolute path not rejected");
  check(existsSync(rel("scripts/dr/backup-uploads.mjs")), "backup-uploads.mjs missing");
  check(existsSync(rel("scripts/dr/restore-uploads.mjs")), "restore-uploads.mjs missing");
  // in-memory multi-root round trip proof would need fs; the pack/unpack unit tests cover it.
  check(typeof packRoots === "function" && typeof unpackRoots === "function", "multi-root pack/unpack missing");
});

// ── REDIS_RECOVERY_POLICY ─────────────────────────────────────────────────────
group("REDIS_RECOVERY_POLICY", (check) => {
  const r = classifyRedisInventory();
  check(r.ok, "redis inventory not clean");
  check(REDIS_PERSISTENCE_DECISION === "REBUILD_FROM_AUTHORITATIVE_STATE", "unexpected redis decision");
  check(assertRedisLossSecurityFailmode().ok, "redis loss fail-mode unsafe");
});

// ── CONFIGURATION_RECOVERY ────────────────────────────────────────────────────
group("CONFIGURATION_RECOVERY", (check) => {
  const envExample = read(".env.production.example");
  check(!!envExample, ".env.production.example missing");
  const v = validateInventory(renderInventory(), envExample || "");
  for (const e of v.errors) check(false, e);
  check(existsSync(rel("docs/release/phase98-configuration-inventory.json")), "generated inventory JSON missing");
});

// ── FULL_NODE_RECOVERY (rehearsal presence + disposable-project guard) ─────────
group("FULL_NODE_RECOVERY", (check) => {
  const f = read("scripts/ci/phase98-full-node-recovery.mjs");
  check(!!f, "full-node recovery rehearsal missing");
  if (f) {
    check(!/-p\s+hermes(\s|"|')/.test(f), "full-node rehearsal must never use -p hermes");
    check(/DISPOSABLE|hermes98test|disposable/i.test(f), "full-node rehearsal must assert a disposable project guard");
  }
});

// ── MIGRATION_GATE ────────────────────────────────────────────────────────────
group("MIGRATION_GATE", (check) => {
  check(classifyMigrationSql("DROP TABLE x;").classification === "BREAKING_OR_UNKNOWN", "DROP TABLE not breaking");
  check(classifyMigrationSql('CREATE TABLE "X" (id text);').classification === "ADDITIVE_COMPATIBLE", "create table not additive");
  check(classifyMigrationSql('ALTER TABLE "X" ADD COLUMN "y" text NOT NULL;').classification === "FORWARD_ONLY_REQUIRES_BACKUP", "NOT NULL add not forward-only");
  check(classifyMigrationSql("-- DROP TABLE x").classification === "ADDITIVE_COMPATIBLE", "comment must be stripped");
});

// ── MIGRATION_ROLLBACK ────────────────────────────────────────────────────────
group("MIGRATION_ROLLBACK", (check) => {
  check(classifyRollback({ migrationClassification: "NO_MIGRATION" }) === "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA", "no-migration rollback");
  check(classifyRollback({ migrationClassification: "BREAKING_OR_UNKNOWN" }) === "RELEASE_ROLLBACK_BLOCKED", "breaking rollback not blocked");
  check(classifyRollback({ migrationClassification: "ADDITIVE_COMPATIBLE", appRollbackProven: false }) === "APP_ROLLBACK_REQUIRES_DB_RESTORE", "unproven additive rollback");
});

// ── RELEASE_MANIFEST ──────────────────────────────────────────────────────────
group("RELEASE_MANIFEST", (check) => {
  const good = buildReleaseManifest({
    releaseVersion: "v0.9.0",
    targetGitSha: "a".repeat(40),
    previousGoodGitSha: "b".repeat(40),
    createdAt: "2026-08-07T00:00:00.000Z",
    requiredHealthEndpoints: ["/api/health"],
    appRollbackClassification: "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA",
    releaseStrategy: "BLUE_GREEN",
  });
  check(validateReleaseManifest(good).ok, "valid manifest rejected");
  const bad = buildReleaseManifest({ releaseVersion: "v0.9.0", targetGitSha: "a".repeat(40), previousGoodGitSha: null, requiredHealthEndpoints: ["/api/health"], appRollbackClassification: "x" });
  check(!validateReleaseManifest(bad).ok, "null previous-good must block");
});

// ── DEPLOYMENT_SAFETY (static scan of deploy workflow) ────────────────────────
group("DEPLOYMENT_SAFETY", (check) => {
  const dep = read(".github/workflows/deploy.yml") || "";
  check(/workflow_dispatch/.test(dep), "deploy must be workflow_dispatch");
  check(!/^\s*push:/m.test(dep), "deploy must not trigger on push");
  check(!/pull_request:/.test(dep), "deploy must not trigger on PR");
  check(/-p hermes/.test(dep), "deploy must pin -p hermes");
  check(!/down\s+-v|volume\s+rm|system\s+prune/.test(dep), "deploy must not contain destructive volume ops");
});

// ── RELEASE_STRATEGY ──────────────────────────────────────────────────────────
group("RELEASE_STRATEGY", (check) => {
  const adr = read("docs/release/adr-phase98-release-strategy.md");
  check(!!adr, "release-strategy ADR missing");
  check(!!adr && /BLUE_GREEN/.test(adr), "ADR must record BLUE_GREEN");
});

// ── RELEASE_ROLLBACK ──────────────────────────────────────────────────────────
group("RELEASE_ROLLBACK", (check) => {
  check(nextState("CANDIDATE_BUILT", "health_fail") === "ROLLED_BACK", "candidate health-fail must roll back");
  check(isTerminal("ROLLED_BACK") && isTerminal("FAILED"), "terminal states");
  check(rejects(() => requirePreviousGood("short"), null), "missing previous-good must block");
});

// ── VERSION_AND_CHANGELOG ─────────────────────────────────────────────────────
group("VERSION_AND_CHANGELOG", (check) => {
  check(parseSemVer("v1.2.3").valid === true, "valid semver rejected");
  check(parseSemVer("1.2").valid === false, "invalid semver accepted");
  const cl = read("CHANGELOG.md");
  check(!!cl, "CHANGELOG.md missing");
  check(!!cl && /##\s*\[?Unreleased/i.test(cl), "CHANGELOG must have an Unreleased section");
  // Do NOT fake a GA release.
  check(!cl || !/##\s*\[?v?1\.0\.0/.test(cl), "must not declare a fake v1.0.0 GA release in Phase 98");
});

// ── RPO ───────────────────────────────────────────────────────────────────────
group("RPO", (check) => {
  const sys = deriveSystemRpoHours();
  check(sys > 0, "system RPO not derived");
  check(validateRpoRto(sys).ok, "RPO/RTO contract invalid");
});

// ── RTO ───────────────────────────────────────────────────────────────────────
group("RTO", (check) => {
  check(validateRpoRto().ok, "RTO contract invalid");
});

// ── RECOVERY_OWNERSHIP ────────────────────────────────────────────────────────
group("RECOVERY_OWNERSHIP", (check) => {
  const v = validateOwnership();
  for (const e of v.errors) check(false, e);
});

// ── PRODUCTION_ACTIONS_DISABLED ───────────────────────────────────────────────
group("PRODUCTION_ACTIONS_DISABLED", (check) => {
  const wf = read(".github/workflows/phase98-dr-release-assurance.yml");
  check(!!wf, "phase98 assurance workflow missing");
  if (wf) {
    check(!/pull_request_target/.test(wf), "must not use pull_request_target");
    check(!/environment:\s*production/.test(wf), "must not declare environment: production");
    check(!/\bssh\b/.test(wf), "assurance workflow must not SSH");
  }
});

// ── Summary ─────────────────────────────────────────────────────────────────
const summary = {
  phase: "98",
  schemaVersion: "1.0",
  groups,
  systemRpoHours: deriveSystemRpoHours(),
  productionActionsExecuted: {
    rehearsal: false,
    restore: false,
    deploy: false,
    migration: false,
    secretRotated: false,
  },
  result: failed ? "FAIL" : "PASS",
};
try {
  writeFileSync(join(REPO, "phase98-assurance.json"), JSON.stringify(summary, null, 2) + "\n");
} catch {
  /* non-fatal */
}
console.log(`RESULT phase98_eval=${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);

// ── helpers ───────────────────────────────────────────────────────────────────
function rejects(fn, code) {
  try {
    fn();
    return false;
  } catch (e) {
    return code ? e instanceof EnvelopeError && e.code === code : true;
  }
}
function readHeaderCipher(buf) {
  const len = buf.readUInt32BE(4);
  return JSON.parse(buf.subarray(8, 8 + len).toString("utf8")).cipher;
}
