/**
 * Phase 107 FINAL R4 — the ONE content-bound fingerprint of the changed tree.
 *
 * THE DEFECT THIS REPLACES. The closure epoch hashed
 *
 *     git status --porcelain --untracked-files=all   +   git diff
 *
 * `git status` prints only `?? path` for an untracked file, and `git diff` says
 * nothing about untracked files at all. So the digest bound the NAMES of new
 * files and none of their CONTENT. Of the final change set, 81 of 138 paths are
 * untracked — the proof machinery itself, the new tests, the new product module.
 * Every one of them could have been rewritten after validation while the epoch
 * went on claiming the same tree. Independent review demonstrated exactly that:
 * replacing the whole body of an untracked file left the digest unchanged.
 *
 * WHAT THIS DOES INSTEAD. Enumerate the changed-path set once, and for each
 * path record its state, its byte length and the SHA-256 of its bytes. A file
 * that is listed but absent from disk gets an explicit sentinel rather than
 * being skipped, because "the file is gone" and "the file is unchanged" must
 * not produce the same fingerprint.
 *
 * Rows are joined with NUL separators and sorted by path, so the serialization
 * is stable across platforms and orderings. Nothing consults mtime.
 *
 * One implementation, imported by `final-closure.mjs`, `freeze-snapshot.mjs`
 * and the package verifier. A second copy of a hashing rule is a second answer.
 *
 * Usage:  node docs/design/stage6a/tree-fingerprint.mjs        # prints the hash
 *         import { treeFingerprint } from "./tree-fingerprint.mjs";
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NUL = String.fromCharCode(0);

/** The changed-path set, exactly as the inventory sees it. */
export function changedPaths() {
  const out = execSync("git status --porcelain --untracked-files=all",
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return out.split(/\r?\n/).filter(Boolean).map((line) => ({
    state: line.slice(0, 2).trim() === "??" ? "NEW" : "MOD",
    path: line.slice(3).trim().replace(/^"|"$/g, ""),
  }));
}

/**
 * The fingerprint, plus the rows it was computed from.
 *
 * The rows are returned so a caller can show WHICH file moved when two
 * fingerprints disagree — a bare "the tree changed" is not actionable.
 */
export function treeFingerprint() {
  const rows = changedPaths()
    .map(({ state, path: p }) => {
      let bytes = -1;
      let sha = "ABSENT";
      try {
        const buf = fs.readFileSync(p);
        bytes = buf.length;
        sha = crypto.createHash("sha256").update(buf).digest("hex");
      } catch {
        // Listed but not on disk. Recorded explicitly; never silently skipped.
      }
      return { state, path: p, bytes, sha256: sha };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const serialized = rows
    .map((r) => [r.state, r.path, String(r.bytes), r.sha256].join(NUL))
    .join("\n");

  return {
    treeContentSha256: crypto.createHash("sha256").update(serialized).digest("hex"),
    fileCount: rows.length,
    modified: rows.filter((r) => r.state === "MOD").length,
    added: rows.filter((r) => r.state === "NEW").length,
    absent: rows.filter((r) => r.sha256 === "ABSENT").length,
    rows,
  };
}

const isMain = process.argv[1]
  && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).split(path.sep).join("/")}`).href;

if (isMain || (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))) {
  const f = treeFingerprint();
  console.log(`TREE_CONTENT_SHA256=${f.treeContentSha256}`);
  console.log(`TREE_FILES=${f.fileCount}  MOD=${f.modified}  NEW=${f.added}  ABSENT=${f.absent}`);
  if (process.argv.includes("--rows")) {
    for (const r of f.rows) console.log(`  ${r.state} ${r.sha256.slice(0, 12)} ${String(r.bytes).padStart(8)} ${r.path}`);
  }
}
