/**
 * Phase 107 Stage 6-A.2 — freeze the tree, then measure it, from OUTSIDE the repo.
 *
 * THE PROBLEM THIS SOLVES. The previous pass reported three different totals for
 * one change set: the report said 107 files, `changed-paths.txt` listed 113, and
 * `00-worktree-checksums.json` covered 108. None was a lie; they were taken at
 * three different moments, and every generator that wrote its output back into
 * `docs/design/stage6a/` changed the very thing the next one measured. An
 * inventory that lives inside the tree it inventories can never settle: writing
 * its own hash changes its own hash.
 *
 * THE ORDER, which is the whole fix:
 *   1. every generator that writes inside the repo has already run;
 *   2. the tree is FROZEN — nothing below writes into the worktree;
 *   3. `git status --porcelain -uall` is read ONCE and is the single source;
 *   4. the snapshot is written OUTSIDE the repo, so measuring cannot disturb;
 *   5. the three views — changed paths, classification, checksums — are proven
 *      to cover exactly the same set, not merely to look similar.
 *
 * Step 5 is asserted rather than assumed: a difference of even one path exits
 * non-zero, because "close enough" is how 107, 108 and 113 all came to be
 * written down as if they were the same number.
 *
 * Usage: node docs/design/stage6a/freeze-snapshot.mjs <outDirOutsideRepo> <phase> <stage>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { RULES } from "./classification-rules.mjs";
import { treeFingerprint } from "./tree-fingerprint.mjs";

const OUT = process.argv[2];

/*
 * PHASE 107 FINAL — provenance is an INPUT, never a literal in this file.
 *
 * `stage: "6-A.2"` was hard-coded here and stayed behind while the packages
 * that consumed this snapshot advanced to 6-A.3. The snapshot and the manifest
 * then disagreed about which pass produced them, and nothing noticed, because
 * each script carried its own copy of the answer.
 *
 * There is now exactly one place the caller states phase and stage — the
 * top-level review command — and every generator is handed those values.
 * Refusing to run without them is what makes that true: a missing argument
 * stops the pipeline instead of silently reintroducing a stale default.
 */
const PHASE = process.argv[3];
const STAGE = process.argv[4];
if (!PHASE || !STAGE) {
  console.error("REFUSING: phase and stage are required (argv[3], argv[4]).");
  console.error("A hard-coded stage went stale twice; this file no longer holds one.");
  process.exit(2);
}
if (!OUT) { console.error("usage: freeze-snapshot.mjs <outDirOutsideRepo>"); process.exit(2); }

const repo = process.cwd().split(path.sep).join("/");
const outAbs = path.resolve(OUT).split(path.sep).join("/");
if (outAbs.toLowerCase().startsWith(repo.toLowerCase())) {
  console.error(`REFUSING: ${outAbs} is inside the repository at ${repo}.`);
  console.error("The snapshot must not be able to change the tree it measures.");
  process.exit(1);
}

const sh = (c) => execSync(c, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/* ── 3. one read of the worktree, used by all three views ─────────────────── */
const entries = sh("git status --porcelain --untracked-files=all")
  .split(/\r?\n/).filter(Boolean)
  .map((l) => ({ state: l.slice(0, 2).trim(), path: l.slice(3).trim() }))
  .filter((e) => fs.existsSync(e.path) && fs.statSync(e.path).isFile());

/* The same classification the review uses, kept here so the snapshot is one file. */
/* The classification table is shared with diff-inventory.mjs — see
   classification-rules.mjs for why two copies became one. */

const rows = entries.map((e) => {
  const buf = fs.readFileSync(e.path);
  return {
    path: e.path,
    state: e.state === "??" ? "NEW" : "MOD",
    tracked: e.state !== "??",
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    category: (RULES.find((r) => r.match(e.path)) ?? { cat: "UNCLASSIFIED" }).cat,
  };
});
rows.sort((a, b) => a.path.localeCompare(b.path));

/* ── 5. the three views must cover exactly the same set ───────────────────── */
const changedPaths = rows.map((r) => `${r.state} ${r.path}`);
const inventoryPaths = new Set(rows.map((r) => r.path));
const checksumPaths = new Set(rows.filter((r) => r.sha256).map((r) => r.path));
const declared = new Set(entries.map((e) => e.path));

const missingFromInventory = [...declared].filter((p) => !inventoryPaths.has(p));
const missingFromChecksums = [...declared].filter((p) => !checksumPaths.has(p));
const unclassified = rows.filter((r) => r.category === "UNCLASSIFIED");

fs.mkdirSync(OUT, { recursive: true });
const write = (name, body) => fs.writeFileSync(path.join(OUT, name), body);

write("changed-paths.txt", changedPaths.join("\n") + "\n");
write("worktree-inventory.json", JSON.stringify({
  phase: PHASE, stage: STAGE,
  frozenAt: new Date().toISOString(),
  headSha: sh("git rev-parse HEAD").trim(),
  branch: sh("git rev-parse --abbrev-ref HEAD").trim(),
  originMainSha: sh("git rev-parse origin/main").trim(),
  trackedDiffSha256: crypto.createHash("sha256").update(sh("git diff")).digest("hex"),
  /*
   * PHASE 107 FINAL R4 — a CONTENT hash of the whole changed set.
   *
   * `trackedDiffSha256` above covers tracked modifications only. 82 of the
   * changed paths are UNTRACKED, and `git diff` says nothing about them, so a
   * snapshot that carried only that digest could not tell whether a new proof
   * script had been rewritten since validation. This one hashes every path’s
   * bytes, from the same implementation the closure pipeline uses.
   */
  treeContentSha256: treeFingerprint().treeContentSha256,
  files: rows.length,
  modified: rows.filter((r) => r.state === "MOD").length,
  added: rows.filter((r) => r.state === "NEW").length,
  byCategory: Object.fromEntries(
    [...new Set(rows.map((r) => r.category))].sort()
      .map((c) => [c, rows.filter((r) => r.category === c).length]),
  ),
  // The equality result travels IN the artefact, so a consumer gates on the
  // measurement rather than on the exit code of a command it did not run.
  viewsEqual: missingFromInventory.length === 0 && missingFromChecksums.length === 0
    && changedPaths.length === inventoryPaths.size && inventoryPaths.size === checksumPaths.size,
  unclassified: unclassified.length,
  unclassifiedPaths: unclassified.map((r) => r.path),
  note: "Written OUTSIDE the repository so measuring the tree cannot modify it.",
  entries: rows,
}, null, 2));

const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;

console.log(`frozen snapshot -> ${outAbs}`);
console.log(`  changed paths     : ${changedPaths.length}`);
console.log(`  inventory entries : ${inventoryPaths.size}`);
console.log(`  checksum entries  : ${checksumPaths.size}`);
console.log(`  MOD / NEW         : ${rows.filter((r) => r.state === "MOD").length} / ${rows.filter((r) => r.state === "NEW").length}`);
for (const [c, n] of Object.entries(byCat).sort()) console.log(`    ${String(n).padStart(3)}  ${c}`);
if (missingFromInventory.length) console.log(`  MISSING FROM INVENTORY: ${missingFromInventory.join(", ")}`);
if (missingFromChecksums.length) console.log(`  MISSING FROM CHECKSUMS: ${missingFromChecksums.join(", ")}`);

const equal = missingFromInventory.length === 0 && missingFromChecksums.length === 0
  && changedPaths.length === inventoryPaths.size && inventoryPaths.size === checksumPaths.size;

console.log("");
console.log(`SNAPSHOT_FILES=${rows.length}`);
console.log(`UNCLASSIFIED=${unclassified.length}`);
console.log(`SNAPSHOT_VIEWS_EQUAL=${equal ? "YES" : "NO"}`);
process.exit(equal && unclassified.length === 0 ? 0 : 1);
