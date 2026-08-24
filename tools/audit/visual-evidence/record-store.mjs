/**
 * Phase 107 visual-evidence harness — lock lifecycle and atomic per-cell store.
 *
 * This module exists because of a specific failure. The first version of the
 * sweep kept every measurement in one in-memory array and rewrote a single JSON
 * file after each cell. Two sweeps then ran concurrently (a `pgrep` guard does
 * not see these processes on Windows), each starting from a stale base, and the
 * last writer erased the other's records. The result was 764 screenshots backed
 * by 146 measurements — a pack that looked complete in a file listing and could
 * not be verified at all.
 *
 * Two properties prevent a repeat, and both are enforced here rather than by
 * convention:
 *
 *   1. ONE WRITER. An O_EXCL lock makes a second writer impossible, not
 *      unlikely. It fails closed with a distinct exit code, and it records
 *      enough identity that a supervisor can tell a live owner from a corpse.
 *
 *   2. ONE FILE PER CELL, written temp-then-rename. A crash can leave a `.tmp`
 *      behind but never a half-written record that resume would mistake for
 *      COMPLETE, and no cell's write can touch another cell's record.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Stable, filesystem-safe name for a cell's record. */
export const recordName = (cellId) => String(cellId).replace(/[^A-Za-z0-9._-]+/g, "_");

/* ── lock ──────────────────────────────────────────────────────────────────── */

export class LockHeldError extends Error {
  constructor(owner) {
    super(`another sweep holds the lock (${owner})`);
    this.name = "LockHeldError";
    this.owner = owner;
  }
}

/**
 * Acquire the single-writer lock.
 *
 * @param dir       directory the lock lives in
 * @param runId     identity written into the lock
 * @param isAlive   predicate used ONLY to describe an existing owner; this
 *                  function never removes a lock it did not create
 */
export function acquireLock(dir, runId, { pid = process.pid } = {}) {
  const lockFile = path.join(dir, ".visual-sweep.lock");
  fs.mkdirSync(dir, { recursive: true });
  try {
    const fd = fs.openSync(lockFile, "wx");
    fs.writeSync(fd, JSON.stringify({ runId, pid, createdAt: new Date().toISOString(), worktree: process.cwd() }, null, 2));
    fs.closeSync(fd);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    let owner = "unparseable lock";
    try {
      const o = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      owner = `pid ${o.pid}, run ${o.runId}, held since ${o.createdAt}`;
    } catch { /* keep the fallback */ }
    throw new LockHeldError(owner);
  }
  return {
    lockFile,
    release() { try { fs.unlinkSync(lockFile); } catch { /* already gone */ } },
  };
}

export function readLock(dir) {
  const lockFile = path.join(dir, ".visual-sweep.lock");
  if (!fs.existsSync(lockFile)) return null;
  try { return JSON.parse(fs.readFileSync(lockFile, "utf8")); } catch { return { unparseable: true }; }
}

/**
 * Reclaim a lock ONLY when its owner is provably gone.
 *
 * A supervisor that deletes a lock it cannot attribute is exactly how two
 * writers get started, so the caller must supply positive evidence of death:
 * `isOwnerDead(lock)` returning true. An unparseable lock is NOT treated as
 * dead — it is treated as unknown, which is the safe reading.
 *
 * @returns {"reclaimed"|"owner-alive"|"no-lock"|"unknown-owner"}
 */
export function reclaimStaleLock(dir, isOwnerDead) {
  const lock = readLock(dir);
  if (!lock) return "no-lock";
  if (lock.unparseable || typeof lock.pid !== "number") return "unknown-owner";
  if (!isOwnerDead(lock)) return "owner-alive";
  fs.unlinkSync(path.join(dir, ".visual-sweep.lock"));
  return "reclaimed";
}

/* ── per-cell store ────────────────────────────────────────────────────────── */

export class RecordStore {
  /**
   * @param outDir      where screenshots and records live (outside the repo)
   * @param recordsDir  defaults to `<outDir>/_records`
   */
  constructor(outDir, recordsDir = path.join(outDir, "_records")) {
    this.outDir = outDir;
    this.recordsDir = recordsDir;
    fs.mkdirSync(this.recordsDir, { recursive: true });
  }

  recordPath(cellId) { return path.join(this.recordsDir, `${recordName(cellId)}.json`); }

  /**
   * Write one cell atomically.
   *
   * Order is deliberate: the PNG lands first, the record second. A crash
   * between them leaves an image with no record, which resume treats as
   * INCOMPLETE and re-captures. The reverse order could leave a COMPLETE record
   * pointing at a file that does not exist — evidence claiming something that
   * was never captured.
   */
  writeCell(record, pngBuffer) {
    const pngPath = path.join(this.outDir, record.screenshotFile);
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });

    const digest = sha256(pngBuffer);
    const pngTmp = `${pngPath}.tmp`;
    fs.writeFileSync(pngTmp, pngBuffer);
    fs.renameSync(pngTmp, pngPath);

    const full = { ...record, screenshotSha256: digest, bytes: pngBuffer.length, status: "COMPLETE" };
    const recPath = this.recordPath(record.cellId);
    const recTmp = `${recPath}.tmp`;
    fs.writeFileSync(recTmp, JSON.stringify(full, null, 2));
    fs.renameSync(recTmp, recPath);
    return full;
  }

  /** Every record on disk that parses, ignoring `.tmp` leftovers. */
  readAll() {
    const out = [];
    if (!fs.existsSync(this.recordsDir)) return out;
    for (const f of fs.readdirSync(this.recordsDir)) {
      if (!f.endsWith(".json")) continue;      // a *.tmp is never COMPLETE
      try { out.push(JSON.parse(fs.readFileSync(path.join(this.recordsDir, f), "utf8"))); } catch { /* skip */ }
    }
    return out;
  }

  /**
   * The completion rule, used by BOTH resume and verification so the two can
   * never disagree. A cell counts only with record + screenshot + matching hash,
   * and a duplicate cellId is reported rather than silently double-counted.
   */
  completed() {
    const done = new Set();
    const seen = new Set();
    let duplicates = 0, hashMismatch = 0, missingPng = 0;

    for (const rec of this.readAll()) {
      if (rec.status !== "COMPLETE" || !rec.screenshotFile || !rec.screenshotSha256) continue;
      if (seen.has(rec.cellId)) { duplicates++; continue; }
      seen.add(rec.cellId);

      const pngPath = path.join(this.outDir, rec.screenshotFile);
      if (!fs.existsSync(pngPath)) { missingPng++; continue; }
      if (sha256(fs.readFileSync(pngPath)) !== rec.screenshotSha256) { hashMismatch++; continue; }
      done.add(rec.screenshotFile);
    }
    return { done, duplicates, hashMismatch, missingPng };
  }
}

/* ── output-location safety ────────────────────────────────────────────────── */

/**
 * Refuse to write evidence into the repository.
 *
 * Screenshots and manifests are large, numerous and worthless once stale; a
 * single `git add -A` would sweep tens of thousands of files into history. The
 * harness therefore declines an output directory inside the source tree unless
 * the caller opts in explicitly.
 */
export function assertOutputOutsideRepo(outDir, repoRoot, { allowInsideRepo = false } = {}) {
  const abs = path.resolve(outDir);
  const root = path.resolve(repoRoot);
  const inside = abs === root || abs.startsWith(root + path.sep);
  if (inside && !allowInsideRepo) {
    throw new Error(
      `refusing to write evidence inside the source tree (${abs}).\n` +
      "Pass an output directory outside the repository, or --allow-inside-repo if you truly mean it.",
    );
  }
  return abs;
}
