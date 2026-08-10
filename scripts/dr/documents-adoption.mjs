/**
 * Hermes OS — Phase 99.7 `documents_data` adoption (legacy writable layer → named volume).
 *
 * Phase 98 added the additive `documents_data` volume mounted at
 * `/app/.data/documents`. Before that change the same path lived on the
 * `hermes-web` container's WRITABLE LAYER, so every rebuild silently discarded
 * uploaded documents, extracted text and compliance export packages. Mounting
 * the volume does not move that data — it HIDES it: the fresh (empty) volume is
 * mounted over the path, and the legacy bytes stay on the old writable layer
 * until that container is removed.
 *
 * This module is the one-time, fail-closed adoption mechanism that closes the
 * gap. It is deliberately COPY-ONLY and NON-DESTRUCTIVE:
 *
 *   - the source is proven to exist, be a real directory, and contain only
 *     regular files before a single byte is written;
 *   - the destination is proven to exist and be a real directory;
 *   - a NON-EMPTY destination fails closed unless the caller passes an explicit
 *     safe classification (an unclassified non-empty destination is exactly the
 *     "second stack / wrong volume" mistake this gate exists to catch);
 *   - an existing destination path is NEVER overwritten — a collision aborts
 *     the adoption before any further write;
 *   - the source is NEVER deleted, moved or mutated, so the legacy container /
 *     rollback image remains a complete fallback;
 *   - symlinks, path traversal, absolute/UNC paths and non-regular entries are
 *     refused rather than followed;
 *   - a count + total-bytes + per-file SHA-256 manifest is produced BEFORE and
 *     re-verified AFTER the copy, so "it copied" is proven, not assumed;
 *   - a source with zero documents is a legal, explicitly-reported outcome
 *     (ZERO_DOCUMENTS), never a silent pass.
 *
 * Read/write only under the two directories it is given. No network, no Docker,
 * no database, no Production contact. Never logs file contents.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";

import { canonicalSha256 } from "./canonical-json.mjs";
import { assertSafeRelPath, ArchiveError } from "./uploads-archive.mjs";

/** Explicit classifications a caller may assert about a non-empty destination. */
export const DESTINATION_CLASSIFICATIONS = Object.freeze([
  // The destination is expected to be empty (a freshly created named volume).
  // This is the only classification that is safe by construction.
  "EXPECTED_EMPTY",
  // The operator has inspected the destination and accepts adopting INTO it.
  // Collisions are still refused; this only waives the "must be empty" rule.
  "OWNER_CLASSIFIED_SAFE_NON_EMPTY",
]);

export class AdoptionError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "AdoptionError";
    this.code = code;
  }
}

/**
 * @typedef {Object} AdoptionEntry
 * @property {string} path   POSIX-relative path under the root
 * @property {number} size   bytes
 * @property {string} sha256 lowercase hex digest of the file contents
 */

/**
 * @typedef {Object} AdoptionSurvey
 * @property {boolean} exists
 * @property {boolean} isDirectory
 * @property {number} fileCount
 * @property {number} totalBytes
 * @property {string} manifestSha256
 * @property {AdoptionEntry[]} entries
 */

/**
 * @typedef {Object} AdoptionPlan
 * @property {boolean} ok               true only when the copy may proceed
 * @property {string} outcome           READY | ZERO_DOCUMENTS | BLOCKED
 * @property {string[]} blockers        machine-readable fail-closed codes
 * @property {AdoptionSurvey} source
 * @property {AdoptionSurvey} destination
 * @property {string[]} collisions      destination paths that already exist
 * @property {string|null} destinationClassification
 * @property {boolean} sourceRetained   always true — this mechanism never deletes
 */

/**
 * Walk a directory into a deterministic, integrity-bearing survey.
 *
 * Unlike a best-effort copy, every refusal is explicit: a symlink, a socket, a
 * FIFO, a device node or an unsafe relative path aborts the survey instead of
 * being silently skipped, because "silently skipped" is indistinguishable from
 * "was not there" once the legacy container is gone.
 *
 * @param {string} rootDir
 * @returns {AdoptionSurvey}
 */
export function surveyDirectory(rootDir) {
  /** @type {AdoptionSurvey} */
  const empty = { exists: false, isDirectory: false, fileCount: 0, totalBytes: 0, manifestSha256: canonicalSha256([]), entries: [] };
  if (!rootDir || typeof rootDir !== "string") return empty;

  let st;
  try {
    st = lstatSync(rootDir);
  } catch {
    return empty;
  }
  if (st.isSymbolicLink()) {
    throw new AdoptionError("ROOT_IS_SYMLINK", "adoption root must be a real directory, not a symlink");
  }
  if (!st.isDirectory()) {
    return { ...empty, exists: true, isDirectory: false };
  }

  /** @type {AdoptionEntry[]} */
  const entries = [];
  /** @param {string} dir @param {string} rel */
  function walk(dir, rel) {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const est = lstatSync(abs);
      if (est.isSymbolicLink()) {
        throw new AdoptionError("UNSAFE_SYMLINK", `symlink refused during adoption: ${relPath}`);
      }
      if (est.isDirectory()) {
        walk(abs, relPath);
        continue;
      }
      if (!est.isFile()) {
        throw new AdoptionError("UNSUPPORTED_ENTRY", `non-regular file refused during adoption: ${relPath}`);
      }
      let safe;
      try {
        safe = assertSafeRelPath(relPath);
      } catch (err) {
        // Re-code the shared archive error into the adoption vocabulary so a
        // caller never has to know which module refused the path.
        throw new AdoptionError("UNSAFE_PATH", err instanceof ArchiveError ? err.message : String(err));
      }
      const data = readFileSync(abs);
      entries.push({ path: safe, size: data.length, sha256: createHash("sha256").update(data).digest("hex") });
    }
  }
  walk(rootDir, "");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    exists: true,
    isDirectory: true,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, e) => sum + e.size, 0),
    manifestSha256: canonicalSha256(entries),
    entries,
  };
}

/**
 * Decide whether a `documents_data` adoption may run, WITHOUT writing anything.
 *
 * @param {Object} opts
 * @param {string} opts.sourceDir  legacy path (container writable layer / staged copy)
 * @param {string} opts.destDir    the mounted `documents_data` destination
 * @param {string} [opts.destinationClassification] required when the destination is non-empty
 * @returns {AdoptionPlan}
 */
export function planDocumentAdoption({ sourceDir, destDir, destinationClassification }) {
  /** @type {string[]} */
  const blockers = [];

  /** @type {AdoptionSurvey} */
  let source;
  /** @type {AdoptionSurvey} */
  let destination;

  try {
    source = surveyDirectory(sourceDir);
  } catch (err) {
    return failedPlan(blockers.concat(codeOf(err, "SOURCE_UNREADABLE")), destinationClassification ?? null);
  }
  try {
    destination = surveyDirectory(destDir);
  } catch (err) {
    return failedPlan(blockers.concat(codeOf(err, "DESTINATION_UNREADABLE")), destinationClassification ?? null, source);
  }

  if (!source.exists) blockers.push("SOURCE_MISSING");
  else if (!source.isDirectory) blockers.push("SOURCE_NOT_A_DIRECTORY");

  if (!destination.exists) blockers.push("DESTINATION_MISSING");
  else if (!destination.isDirectory) blockers.push("DESTINATION_NOT_A_DIRECTORY");

  if (destinationClassification !== undefined && destinationClassification !== null) {
    if (!DESTINATION_CLASSIFICATIONS.includes(destinationClassification)) {
      blockers.push("UNKNOWN_DESTINATION_CLASSIFICATION");
    }
  }

  // A non-empty destination is the dangerous case: it means the volume is not
  // the fresh one this adoption assumes, so it must be classified explicitly.
  if (destination.isDirectory && destination.fileCount > 0 && destinationClassification !== "OWNER_CLASSIFIED_SAFE_NON_EMPTY") {
    blockers.push("DESTINATION_NOT_EMPTY_AND_UNCLASSIFIED");
  }
  // Conversely, asserting EXPECTED_EMPTY about a populated destination is a
  // false assertion and must not be honoured.
  if (destinationClassification === "EXPECTED_EMPTY" && destination.fileCount > 0) {
    blockers.push("EXPECTED_EMPTY_ASSERTION_FALSE");
  }

  // Overwrite refusal is evaluated up front so the adoption never begins a copy
  // it would have to abort halfway through.
  const destSet = new Set(destination.entries.map((e) => e.path));
  const collisions = source.entries.filter((e) => destSet.has(e.path)).map((e) => e.path).sort();
  if (collisions.length > 0) blockers.push("DESTINATION_PATH_COLLISION");

  if (blockers.length > 0) {
    return {
      ok: false,
      outcome: "BLOCKED",
      blockers,
      source,
      destination,
      collisions,
      destinationClassification: destinationClassification ?? null,
      sourceRetained: true,
    };
  }

  return {
    ok: true,
    // Zero documents is a legitimate state (nothing was ever uploaded, or the
    // owner already adopted). It is reported distinctly so an operator can tell
    // "nothing to do" apart from "copied everything".
    outcome: source.fileCount === 0 ? "ZERO_DOCUMENTS" : "READY",
    blockers,
    source,
    destination,
    collisions,
    destinationClassification: destinationClassification ?? null,
    sourceRetained: true,
  };
}

/**
 * @typedef {Object} AdoptionRecord
 * @property {boolean} ok
 * @property {string} outcome              ADOPTED | ZERO_DOCUMENTS | BLOCKED
 * @property {string[]} blockers
 * @property {number} plannedFileCount
 * @property {number} plannedTotalBytes
 * @property {number} copiedFileCount
 * @property {number} copiedTotalBytes
 * @property {string} sourceManifestSha256
 * @property {string} adoptedManifestSha256  manifest of exactly the adopted subset at the destination
 * @property {boolean} integrityVerified
 * @property {boolean} sourceRetained
 * @property {AdoptionEntry[]} entries
 */

/**
 * Execute a previously-approved adoption plan. Refuses to run on a plan that is
 * not `ok`, so the decision and the write can never drift apart.
 *
 * @param {AdoptionPlan} plan
 * @param {Object} opts
 * @param {string} opts.sourceDir
 * @param {string} opts.destDir
 * @returns {AdoptionRecord}
 */
export function executeDocumentAdoption(plan, { sourceDir, destDir }) {
  if (!plan || plan.ok !== true) {
    return {
      ok: false,
      outcome: "BLOCKED",
      blockers: plan?.blockers?.length ? plan.blockers : ["PLAN_NOT_APPROVED"],
      plannedFileCount: plan?.source?.fileCount ?? 0,
      plannedTotalBytes: plan?.source?.totalBytes ?? 0,
      copiedFileCount: 0,
      copiedTotalBytes: 0,
      sourceManifestSha256: plan?.source?.manifestSha256 ?? canonicalSha256([]),
      adoptedManifestSha256: canonicalSha256([]),
      integrityVerified: false,
      sourceRetained: true,
      entries: [],
    };
  }

  /** @type {AdoptionEntry[]} */
  const copied = [];
  for (const entry of plan.source.entries) {
    const relNative = entry.path.split("/").join(sep);
    const from = join(sourceDir, relNative);
    const to = join(destDir, relNative);

    // Defence in depth: re-check the collision immediately before the write, so
    // a directory that changed between plan and execute still cannot be
    // overwritten. `copyFileSync` with COPYFILE_EXCL would also refuse, but an
    // explicit check gives a stable, classifiable failure code.
    if (existsSync(to)) {
      throw new AdoptionError("OVERWRITE_REFUSED", `destination already exists: ${entry.path}`);
    }
    mkdirSync(dirname(to), { recursive: true });
    // COPYFILE_EXCL: the kernel itself refuses to clobber an existing target.
    copyFileSync(from, to, 1 /* fs.constants.COPYFILE_EXCL */);

    const data = readFileSync(to);
    const sha256 = createHash("sha256").update(data).digest("hex");
    if (sha256 !== entry.sha256 || data.length !== entry.size) {
      throw new AdoptionError("COPY_INTEGRITY_MISMATCH", `copied bytes do not match the planned digest: ${entry.path}`);
    }
    copied.push({ path: entry.path, size: data.length, sha256 });
  }

  copied.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const adoptedManifestSha256 = canonicalSha256(copied);
  const integrityVerified =
    copied.length === plan.source.fileCount &&
    adoptedManifestSha256 === plan.source.manifestSha256 &&
    copied.reduce((s, e) => s + e.size, 0) === plan.source.totalBytes;

  // The source is deliberately left exactly as it was — the legacy container /
  // rollback image stays a complete fallback until the owner retires it.
  const sourceStillIntact = surveyDirectory(sourceDir).manifestSha256 === plan.source.manifestSha256;

  return {
    ok: integrityVerified && sourceStillIntact,
    outcome: plan.outcome === "ZERO_DOCUMENTS" ? "ZERO_DOCUMENTS" : "ADOPTED",
    blockers: integrityVerified && sourceStillIntact ? [] : ["ADOPTION_INTEGRITY_UNPROVEN"],
    plannedFileCount: plan.source.fileCount,
    plannedTotalBytes: plan.source.totalBytes,
    copiedFileCount: copied.length,
    copiedTotalBytes: copied.reduce((s, e) => s + e.size, 0),
    sourceManifestSha256: plan.source.manifestSha256,
    adoptedManifestSha256,
    integrityVerified,
    sourceRetained: sourceStillIntact,
    entries: copied,
  };
}

/**
 * @param {string[]} blockers
 * @param {string|null} classification
 * @param {AdoptionSurvey} [source]
 * @returns {AdoptionPlan}
 */
function failedPlan(blockers, classification, source) {
  const empty = { exists: false, isDirectory: false, fileCount: 0, totalBytes: 0, manifestSha256: canonicalSha256([]), entries: [] };
  return {
    ok: false,
    outcome: "BLOCKED",
    blockers,
    source: source ?? empty,
    destination: empty,
    collisions: [],
    destinationClassification: classification,
    sourceRetained: true,
  };
}

/** @param {unknown} err @param {string} fallback */
function codeOf(err, fallback) {
  return err instanceof AdoptionError || err instanceof ArchiveError ? String(err.code ?? fallback) : fallback;
}
