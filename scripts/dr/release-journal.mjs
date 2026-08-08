/**
 * Hermes OS — Phase 98 append-only local release-state journal.
 *
 * A small, dependency-free operational-recovery log written next to a release
 * rollout: one entry per release attempt, capturing only non-secret metadata
 * (git shas, hashes, refs, timestamps and outcome strings) so an operator can
 * reconstruct what happened during an incident without ever exposing
 * credentials or other secret material in a file that may be attached to a
 * postmortem or shipped to a log aggregator.
 *
 * Writes are append-only and atomic: the whole (small) JSON array is read,
 * the new entry pushed, and the result written to a temp file which is then
 * renamed over the real path. A rename on the same filesystem is atomic on
 * POSIX and on Windows (NTFS), so a reader never observes a half-written
 * journal file.
 *
 * @typedef {Object} ReleaseJournalEntry
 * @property {string|null} releaseId
 * @property {string|null} targetGitSha
 * @property {string|null} previousGoodGitSha
 * @property {string|null} manifestHash
 * @property {string|null} strategy
 * @property {string|null} migrationClassification
 * @property {string|null} backupArtifactRef
 * @property {string|null} startedAt
 * @property {string|null} cutoverAt
 * @property {string|null} result
 * @property {string|null} activeImageRef
 * @property {string|null} rollbackResult
 */

import { readFileSync, writeFileSync, renameSync, chmodSync, existsSync } from "node:fs";
import { canonicalSha256 } from "./canonical-json.mjs";

const JOURNAL_ENTRY_KEYS = [
  "releaseId",
  "targetGitSha",
  "previousGoodGitSha",
  "manifestHash",
  "strategy",
  "migrationClassification",
  "backupArtifactRef",
  "startedAt",
  "cutoverAt",
  "result",
  "activeImageRef",
  "rollbackResult",
];

/**
 * Build a journal entry with exactly the fixed field set. Missing fields
 * default to `null`. Callers must never pass secret values (passwords,
 * tokens, connection strings) — this is operational metadata only.
 *
 * @param {Partial<ReleaseJournalEntry>} fields
 * @returns {ReleaseJournalEntry}
 */
export function buildJournalEntry(fields = {}) {
  /** @type {ReleaseJournalEntry} */
  const entry = /** @type {any} */ ({});
  for (const key of JOURNAL_ENTRY_KEYS) {
    entry[key] = fields[key] ?? null;
  }
  return entry;
}

/**
 * @param {ReleaseJournalEntry} entry
 * @returns {string} lowercase hex SHA-256 of the canonical entry
 */
export function journalEntrySha256(entry) {
  return canonicalSha256(entry);
}

/**
 * Append a journal entry atomically. Reads the existing JSON-array journal
 * file (starting from an empty array if the file does not yet exist), pushes
 * the new entry and atomically replaces the file via write-then-rename.
 * Restricts the file mode to 0o600 (owner read/write only) on filesystems
 * that support POSIX permissions; this is best-effort on Windows.
 *
 * Never logs the entry content — the only side effect is the file write.
 *
 * @param {string} journalPath
 * @param {ReleaseJournalEntry} entry
 * @returns {void}
 */
export function appendJournalAtomic(journalPath, entry) {
  const existing = readJournal(journalPath);
  existing.push(entry);

  const tmpPath = `${journalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(existing), { encoding: "utf8" });
  try {
    chmodSync(tmpPath, 0o600);
  } catch {
    // chmod is not meaningful on all filesystems (e.g. Windows); best-effort only.
  }
  renameSync(tmpPath, journalPath);
}

/**
 * Read all entries from a journal file. Returns an empty array if the file
 * does not exist yet.
 *
 * @param {string} journalPath
 * @returns {ReleaseJournalEntry[]}
 */
export function readJournal(journalPath) {
  if (!existsSync(journalPath)) return [];
  const raw = readFileSync(journalPath, "utf8");
  if (raw.trim() === "") return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("RELEASE_JOURNAL_CORRUPT: expected a JSON array");
  }
  return parsed;
}
