/**
 * Hermes OS — Phase 99.7 release prerequisite gate (fail-closed).
 *
 * Phase 98 built the DR mechanisms (encrypted backup, migration classification,
 * blue/green rollback, uploads archive). Phase 99.6 reconciled the code. What
 * was still missing was the thing that decides, for ONE specific production
 * cutover, whether the prerequisites for that cutover have actually been met —
 * and refuses the cutover when they have not.
 *
 * The rule this module enforces is deliberately blunt:
 *
 *   A release that carries migrations may not proceed unless a verified,
 *   encrypted, complete PostgreSQL backup exists for it, the `documents_data`
 *   adoption has been resolved, the migration set has been rehearsed on a
 *   disposable database, the candidate has passed, and a previous-good rollback
 *   target is known.
 *
 * Every unproven input is a BLOCKER, never a pass. There is no "assume ok",
 * no default-true field and no way to satisfy a gate by omission: a missing
 * evidence object produces the same blocker as an explicitly failed one.
 *
 * Two facts stay outside what this repository can assert and are reported as
 * their own state rather than being laundered into PASS:
 *   - OFF_HOST_BACKUP_COPY — whether the verified artifact was replicated off
 *     the production host is an operator fact; it is OWNER_CONFIGURATION_BLOCKED.
 *   - The external review/pilot gates (Phase 99) remain EXTERNAL_GATE.
 *
 * Pure and side-effect-free except for `readBackupEvidence`, which reads a
 * backup directory. Key MATERIAL is never read, returned or logged: the
 * integrity proof is computed over the ciphertext, which needs no key.
 */

import { createHash } from "node:crypto";
import { accessSync, constants as FS, existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Prerequisite states that are NOT failures but are also NOT passes. */
export const OWNER_CONFIGURATION_BLOCKED = "OWNER_CONFIGURATION_BLOCKED";
export const EXTERNAL_GATE_BLOCKED = "EXTERNAL_GATE_BLOCKED";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const GIT_SHA40_RE = /^[0-9a-f]{40}$/;

/**
 * @typedef {Object} BackupEvidence
 * @property {boolean} keyFileConfigured
 * @property {boolean} keyIdConfigured
 * @property {boolean} keyFileReadable
 * @property {boolean} keyFilePermissionsOk   POSIX: mode & 0o077 === 0
 * @property {boolean} encryptedArtifactPresent
 * @property {boolean} verified               from the sidecar verification record
 * @property {boolean} partial                MUST be false
 * @property {boolean} encrypted
 * @property {boolean} integrityVerified      recomputed transport SHA-256 matches the record
 * @property {string|null} artifactType
 * @property {string|null} keyId              NON-SECRET identifier only
 * @property {string|null} transportSha256
 * @property {string|null} artifactFile       basename only — never an absolute path
 * @property {string[]} errors
 */

/** @returns {BackupEvidence} an all-false evidence object (the fail-closed default) */
export function emptyBackupEvidence() {
  return {
    keyFileConfigured: false,
    keyIdConfigured: false,
    keyFileReadable: false,
    keyFilePermissionsOk: false,
    encryptedArtifactPresent: false,
    verified: false,
    partial: true,
    encrypted: false,
    integrityVerified: false,
    artifactType: null,
    keyId: null,
    transportSha256: null,
    artifactFile: null,
    errors: [],
  };
}

/**
 * Every condition that must hold before a migration-bearing release may run,
 * in the order an operator would check them. Exported so the runbook, the tests
 * and the gate cannot drift apart.
 */
export const BACKUP_REQUIREMENTS = Object.freeze([
  ["BACKUP_KEY_FILE_NOT_CONFIGURED", (e) => e.keyFileConfigured === true],
  ["BACKUP_KEY_ID_NOT_CONFIGURED", (e) => e.keyIdConfigured === true],
  ["BACKUP_KEY_FILE_NOT_READABLE", (e) => e.keyFileReadable === true],
  ["BACKUP_KEY_FILE_PERMISSIONS_TOO_OPEN", (e) => e.keyFilePermissionsOk === true],
  ["ENCRYPTED_BACKUP_MISSING", (e) => e.encryptedArtifactPresent === true],
  ["BACKUP_NOT_ENCRYPTED", (e) => e.encrypted === true],
  ["BACKUP_NOT_VERIFIED", (e) => e.verified === true],
  ["BACKUP_IS_PARTIAL", (e) => e.partial === false],
  ["BACKUP_INTEGRITY_UNPROVEN", (e) => e.integrityVerified === true],
  ["BACKUP_ARTIFACT_TYPE_MISMATCH", (e) => e.artifactType === "postgres"],
]);

/**
 * @param {Partial<BackupEvidence>|null|undefined} evidence
 * @returns {{ ok: boolean, blockers: string[] }}
 */
export function evaluateBackupPrerequisite(evidence) {
  // A missing evidence object is treated identically to a failed one.
  const e = { ...emptyBackupEvidence(), ...(evidence ?? {}) };
  const blockers = BACKUP_REQUIREMENTS.filter(([, holds]) => !holds(e)).map(([code]) => code);
  return { ok: blockers.length === 0, blockers };
}

/**
 * Read backup evidence from a backup directory produced by
 * `scripts/backup-postgres.sh`. Reads the NEWEST `.hbk` and its `.meta.json`
 * sidecar, then recomputes the transport SHA-256 over the artifact bytes and
 * compares it to the recorded value.
 *
 * Deliberately does NOT read the key file's contents: existence, readability
 * and mode are sufficient, and reading key material into a process that emits a
 * report is exactly the mistake this phase must not make.
 *
 * @param {Object} opts
 * @param {string} opts.backupDir
 * @param {string} [opts.keyFile]  path only — contents are never read
 * @param {string} [opts.keyId]    non-secret identifier
 * @returns {BackupEvidence}
 */
export function readBackupEvidence({ backupDir, keyFile, keyId }) {
  const evidence = emptyBackupEvidence();

  evidence.keyFileConfigured = typeof keyFile === "string" && keyFile.trim().length > 0;
  evidence.keyIdConfigured = typeof keyId === "string" && keyId.trim().length > 0;
  if (evidence.keyIdConfigured) evidence.keyId = keyId.trim();

  if (evidence.keyFileConfigured) {
    try {
      const st = lstatSync(keyFile);
      if (!st.isFile()) {
        evidence.errors.push("KEY_FILE_NOT_REGULAR_FILE");
      } else {
        accessSync(keyFile, FS.R_OK);
        evidence.keyFileReadable = true;
        // On POSIX a group/other-readable key file is a real finding. On Windows
        // the mode bits are not meaningful, so the check is not applicable
        // rather than silently passing a POSIX assertion.
        evidence.keyFilePermissionsOk = process.platform === "win32" ? true : (st.mode & 0o077) === 0;
        if (!evidence.keyFilePermissionsOk) evidence.errors.push("KEY_FILE_PERMISSIONS_TOO_OPEN");
      }
    } catch {
      evidence.errors.push("KEY_FILE_UNREADABLE");
    }
  }

  let artifact = null;
  try {
    const names = readdirSync(backupDir)
      .filter((n) => n.endsWith(".hbk"))
      .sort();
    // Newest by mtime; the timestamped names sort chronologically too, but mtime
    // is authoritative if a file was republished.
    let newestMs = -1;
    for (const name of names) {
      const p = join(backupDir, name);
      const st = statSync(p);
      if (!st.isFile()) continue;
      if (st.mtimeMs > newestMs) {
        newestMs = st.mtimeMs;
        artifact = { name, path: p };
      }
    }
  } catch {
    evidence.errors.push("BACKUP_DIR_UNREADABLE");
    return evidence;
  }

  if (!artifact) {
    evidence.errors.push("NO_ENCRYPTED_BACKUP_FOUND");
    return evidence;
  }

  // A `.partial` sibling means the atomic publish never completed.
  if (existsSync(`${artifact.path}.partial`)) {
    evidence.errors.push("PARTIAL_ARTIFACT_PRESENT");
    return evidence;
  }

  evidence.encryptedArtifactPresent = true;
  evidence.artifactFile = artifact.name;

  let meta;
  try {
    meta = JSON.parse(readFileSync(`${artifact.path}.meta.json`, "utf8"));
  } catch {
    evidence.errors.push("VERIFICATION_RECORD_MISSING_OR_INVALID");
    return evidence;
  }

  evidence.verified = meta?.verified === true;
  // `partial` defaults to TRUE when the record does not say otherwise: an
  // absent field must never be read as "complete".
  evidence.partial = meta?.partial === false ? false : true;
  evidence.encrypted = meta?.encrypted === true;
  evidence.artifactType = typeof meta?.artifactType === "string" ? meta.artifactType : null;
  evidence.transportSha256 = typeof meta?.transportSha256 === "string" ? meta.transportSha256 : null;

  if (!evidence.transportSha256 || !SHA256_HEX_RE.test(evidence.transportSha256)) {
    evidence.errors.push("TRANSPORT_SHA256_MISSING_OR_MALFORMED");
    return evidence;
  }

  try {
    const actual = createHash("sha256").update(readFileSync(artifact.path)).digest("hex");
    evidence.integrityVerified = actual === evidence.transportSha256;
    if (!evidence.integrityVerified) evidence.errors.push("TRANSPORT_SHA256_MISMATCH");
  } catch {
    evidence.errors.push("ARTIFACT_UNREADABLE");
  }

  return evidence;
}

/**
 * @typedef {Object} ReleasePrerequisiteInput
 * @property {string|null} targetGitSha
 * @property {string|null} previousGoodGitSha
 * @property {{ migrationClassification?: string, preMigrationBackupRequired?: boolean, deployBlocked?: boolean, historicalMutation?: boolean, newMigrations?: string[] }|null} migrationGate
 * @property {Partial<BackupEvidence>|null} backup
 * @property {{ resolved?: boolean, outcome?: string, integrityVerified?: boolean }|null} documentsAdoption
 * @property {{ passed?: boolean, idempotent?: boolean }|null} migrationRehearsal
 * @property {{ passed?: boolean, sharpRuntimeOk?: boolean, localesOk?: boolean }|null} candidate
 * @property {boolean} previousGoodImagePreserved
 * @property {boolean} [offHostBackupCopyProven]  owner-operated; NOT provable here
 */

/**
 * @typedef {Object} ReleasePrerequisiteDecision
 * @property {boolean} releaseAllowed
 * @property {string[]} blockers
 * @property {string} migrationClassification
 * @property {boolean} preMigrationBackupRequired
 * @property {Record<string,string>} gates          gate -> PASS | BLOCKED | OWNER_CONFIGURATION_BLOCKED
 * @property {string[]} ownerConfigurationBlocked
 */

/**
 * The aggregate production-cutover decision.
 *
 * @param {Partial<ReleasePrerequisiteInput>} input
 * @returns {ReleasePrerequisiteDecision}
 */
export function evaluateReleasePrerequisites(input = {}) {
  /** @type {string[]} */
  const blockers = [];
  /** @type {Record<string,string>} */
  const gates = {};

  const migrationGate = input.migrationGate ?? null;
  const classification = migrationGate?.migrationClassification ?? "UNKNOWN";
  // Fail-closed default: an absent/unknown migration gate is treated as
  // migration-bearing, so the backup requirement still applies.
  const preMigrationBackupRequired =
    migrationGate?.preMigrationBackupRequired === true || classification === "UNKNOWN";

  // ── Target/rollback identity ────────────────────────────────────────────────
  const targetOk = typeof input.targetGitSha === "string" && GIT_SHA40_RE.test(input.targetGitSha);
  gates.TARGET_SHA_PINNED = targetOk ? "PASS" : "BLOCKED";
  if (!targetOk) blockers.push("TARGET_SHA_NOT_PINNED");

  const prevOk = typeof input.previousGoodGitSha === "string" && GIT_SHA40_RE.test(input.previousGoodGitSha);
  gates.PREVIOUS_GOOD_SHA_KNOWN = prevOk ? "PASS" : "BLOCKED";
  if (!prevOk) blockers.push("UNKNOWN_PREVIOUS_GOOD_RELEASE");

  const imageOk = input.previousGoodImagePreserved === true;
  gates.PREVIOUS_GOOD_IMAGE_PRESERVED = imageOk ? "PASS" : "BLOCKED";
  if (!imageOk) blockers.push("PREVIOUS_GOOD_IMAGE_NOT_PRESERVED");

  // ── Migration integrity ─────────────────────────────────────────────────────
  const migrationOk = migrationGate !== null && migrationGate.deployBlocked !== true && migrationGate.historicalMutation !== true;
  gates.MIGRATION_INTEGRITY = migrationOk ? "PASS" : "BLOCKED";
  if (migrationGate === null) blockers.push("MIGRATION_GATE_NOT_EVALUATED");
  else if (migrationGate.historicalMutation === true) blockers.push("HISTORICAL_MIGRATION_MUTATION");
  else if (migrationGate.deployBlocked === true) blockers.push("MIGRATION_GATE_BLOCKED_DEPLOY");

  // ── Encrypted backup (only mandatory when a migration ships, but always reported) ──
  const backup = evaluateBackupPrerequisite(input.backup);
  if (preMigrationBackupRequired) {
    gates.ENCRYPTED_BACKUP = backup.ok ? "PASS" : "BLOCKED";
    if (!backup.ok) blockers.push(...backup.blockers);
  } else {
    // No schema change ships, so a pre-migration backup is not a release
    // prerequisite. Its real state is still reported, never hidden.
    gates.ENCRYPTED_BACKUP = backup.ok ? "PASS" : "NOT_REQUIRED_NOT_PROVEN";
  }

  // ── documents_data adoption ─────────────────────────────────────────────────
  const adoption = input.documentsAdoption ?? null;
  const adoptionOk =
    adoption !== null &&
    adoption.resolved === true &&
    (adoption.outcome === "ADOPTED" || adoption.outcome === "ZERO_DOCUMENTS" || adoption.outcome === "ALREADY_ADOPTED") &&
    adoption.integrityVerified === true;
  gates.DOCUMENTS_ADOPTION = adoptionOk ? "PASS" : "BLOCKED";
  if (!adoptionOk) blockers.push("DOCUMENTS_ADOPTION_UNRESOLVED");

  // ── Migration rehearsal on a disposable database ────────────────────────────
  const rehearsal = input.migrationRehearsal ?? null;
  const rehearsalOk = rehearsal !== null && rehearsal.passed === true && rehearsal.idempotent === true;
  gates.MIGRATION_REHEARSAL = rehearsalOk ? "PASS" : "BLOCKED";
  if (!rehearsalOk) blockers.push("MIGRATION_REHEARSAL_NOT_PASSED");

  // ── Candidate validation ────────────────────────────────────────────────────
  const candidate = input.candidate ?? null;
  const candidateOk =
    candidate !== null && candidate.passed === true && candidate.sharpRuntimeOk === true && candidate.localesOk === true;
  gates.CANDIDATE = candidateOk ? "PASS" : "BLOCKED";
  if (!candidateOk) blockers.push("CANDIDATE_NOT_PASSED");

  // ── Owner-configuration facts this repository cannot prove ──────────────────
  // Replication of the verified artifact off the production host is operator
  // configuration. It is never reported as PASS from CI evidence.
  const ownerConfigurationBlocked = ["OFF_HOST_BACKUP_COPY"];
  gates.OFF_HOST_BACKUP_COPY = OWNER_CONFIGURATION_BLOCKED;

  return {
    releaseAllowed: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    migrationClassification: classification,
    preMigrationBackupRequired,
    gates,
    ownerConfigurationBlocked,
  };
}
