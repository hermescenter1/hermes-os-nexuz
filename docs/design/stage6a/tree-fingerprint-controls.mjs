/**
 * Phase 107 FINAL R4 — prove the tree fingerprint is bound to CONTENT.
 *
 * The fingerprint this phase relied on for three rounds was
 * `sha256(git status --porcelain + git diff)`. For a MODIFIED file that is
 * content-bound, because the diff carries the bytes. For an UNTRACKED file it
 * is not: `git status` prints the NAME and `git diff` says nothing at all. Any
 * amount of editing inside a new file left the "frozen tree SHA" identical.
 *
 * Every artefact this phase produces is an untracked file. So the one class of
 * change the old hash could not see was exactly the class this phase creates.
 *
 * `tree-fingerprint.mjs` replaced it with state\0path\0bytes\0sha256 per row.
 * These two controls demonstrate that the replacement actually closes the hole,
 * by changing bytes WITHOUT changing any path or status — the mutation the old
 * algorithm was blind to — and requiring the fingerprint to move.
 *
 * The original bytes are captured before each mutation and restored after, and
 * the restoration is verified by SHA-256 rather than assumed.
 *
 * Usage: node docs/design/stage6a/tree-fingerprint-controls.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { treeFingerprint } from "./tree-fingerprint.mjs";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/* The legacy algorithm, kept ONLY so the controls can show what it missed. */
const legacyFingerprint = () => {
  const status = execSync("git status --porcelain", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const diff = execSync("git diff", { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  return sha(Buffer.from(status + diff, "utf8"));
};

const base = treeFingerprint();
const legacyBase = legacyFingerprint();

console.log(`BASE_TREE_CONTENT_SHA256=${base.treeContentSha256}`);
console.log(`BASE_TREE_FILES=${base.fileCount} MOD=${base.modified} NEW=${base.added}`);
console.log("");

/* Pick one NEW (untracked) row and one MOD row, deterministically. */
const newRow = base.rows.find((r) => r.state === "NEW" && r.bytes > 0);
const modRow = base.rows.find((r) => r.state === "MOD" && r.bytes > 0);

const CASES = [
  {
    id: "A",
    label: "NEW/untracked bytes",
    key: "TREE_FINGERPRINT_NEW_CONTENT_MUTATION_CAUGHT",
    row: newRow,
    why: "the exact blind spot of the old hash: an untracked file's NAME is unchanged, only its bytes move",
  },
  {
    id: "B",
    label: "MOD bytes",
    key: "TREE_FINGERPRINT_MOD_CONTENT_MUTATION_CAUGHT",
    row: modRow,
    why: "a tracked file edited after the freeze must not be presentable as the frozen tree",
  },
];

let caught = 0;
let misapplied = 0;
let restoredAll = true;

for (const c of CASES) {
  console.log(`== mutation ${c.id} — ${c.label}`);
  if (!c.row) {
    console.error(`  MISAPPLIED: no ${c.id === "A" ? "NEW" : "MOD"} row available to mutate`);
    misapplied++;
    continue;
  }

  const p = c.row.path;
  const original = fs.readFileSync(p);
  const originalSha = sha(original);
  console.log(`  target : ${p}`);
  console.log(`  why    : ${c.why}`);

  /*
   * Append a comment-shaped byte sequence. It changes content and nothing else:
   * the path is identical, the git state is identical, and for the untracked
   * case `git diff` still emits nothing whatsoever.
   */
  const marker = Buffer.from(`\n/* phase107 tree-fingerprint control ${c.id} */\n`, "utf8");
  fs.writeFileSync(p, Buffer.concat([original, marker]));

  /* assertApplied — the bytes on disk must really differ. */
  const mutatedSha = sha(fs.readFileSync(p));
  if (mutatedSha === originalSha) {
    console.error("  MISAPPLIED: the file's bytes did not change");
    misapplied++;
    fs.writeFileSync(p, original);
    continue;
  }
  console.log(`  applied: file sha ${originalSha.slice(0, 16)}… -> ${mutatedSha.slice(0, 16)}…`);

  const after = treeFingerprint();
  const legacyAfter = legacyFingerprint();

  const pathsUnchanged = after.fileCount === base.fileCount
    && after.modified === base.modified && after.added === base.added;
  const fingerprintMoved = after.treeContentSha256 !== base.treeContentSha256;
  const legacyMoved = legacyAfter !== legacyBase;

  console.log(`  path set unchanged      : ${pathsUnchanged ? "YES" : "NO"}`);
  console.log(`  OLD (status+diff) hash  : ${legacyMoved ? "moved" : "BLIND — did not move"}`);
  console.log(`  NEW content fingerprint : ${fingerprintMoved ? "moved" : "BLIND — did not move"}`);

  /* restore, then prove the restoration byte-for-byte. */
  fs.writeFileSync(p, original);
  const restoredSha = sha(fs.readFileSync(p));
  const restored = restoredSha === originalSha;
  if (!restored) restoredAll = false;
  console.log(`  restored               : ${restored ? "YES (sha match)" : "NO"}`);

  const ok = fingerprintMoved && pathsUnchanged;
  if (ok) caught++;
  console.log(`  ${c.key}=${ok ? "YES" : "NO"}`);
  console.log("");
}

/* The tree must end exactly where it started. */
const final = treeFingerprint();
const treeRestored = final.treeContentSha256 === base.treeContentSha256;
if (!treeRestored) restoredAll = false;

console.log(`FINAL_TREE_CONTENT_SHA256=${final.treeContentSha256}`);
console.log("");
console.log(`TREE_FINGERPRINT_MUTATIONS_TOTAL=${CASES.length}`);
console.log(`TREE_FINGERPRINT_MUTATIONS_CAUGHT=${caught}`);
console.log(`TREE_FINGERPRINT_MISAPPLIED=${misapplied}`);
console.log(`POST_MUTATION_TREE_RESTORED=${restoredAll && treeRestored ? "YES" : "NO"}`);
console.log(`TREE_FINGERPRINT_CONTROLS=${caught === CASES.length && misapplied === 0 && treeRestored ? "PASS" : "FAIL"}`);

process.exit(caught === CASES.length && misapplied === 0 && treeRestored && restoredAll ? 0 : 1);
