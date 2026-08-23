/**
 * Phase 107 Stage 6-A — every changed path, classified, with a reason.
 *
 * A review pack is only as trustworthy as its inventory: an unexplained file in
 * the diff is the one that hides a mistake. Each path is placed in exactly one
 * category and carries the reason it was touched, so a reviewer can check the
 * claim rather than the count. Anything that matches no category is reported as
 * UNCLASSIFIED and is a stop condition.
 *
 * Usage: node docs/design/stage6a/diff-inventory.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";
import { RULES } from "./classification-rules.mjs";

const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Working-tree paths, tracked modifications and untracked files alike. */
function changedPaths() {
  return sh("git status --porcelain --untracked-files=all")
    .split(/\r?\n/).filter(Boolean)
    .map((l) => ({ state: l.slice(0, 2).trim(), path: l.slice(3).trim() }));
}

/** Lines added/removed for a tracked file; untracked files count as all-new. */
function diffstat(path, tracked) {
  if (!tracked) {
    const lines = fs.readFileSync(path, "utf8").split(/\r?\n/).length;
    return { added: lines, removed: 0, note: "new file" };
  }
  const out = sh(`git diff --numstat -- "${path}"`).trim();
  if (!out) return { added: 0, removed: 0, note: "no textual change" };
  const [a, r] = out.split(/\s+/);
  return { added: Number(a) || 0, removed: Number(r) || 0, note: "" };
}

/**
 * One category per path, most specific first. The ORDER matters: a test file
 * under src/lib/auth is a test, not product auth code.
 */
/* Shared with freeze-snapshot.mjs; two tables that must agree are one table. */

const rows = [];
for (const { state, path } of changedPaths()) {
  // An untracked directory entry expands to the files inside it.
  const targets = state === "??" && fs.existsSync(path) && fs.statSync(path).isDirectory()
    ? sh(`git status --porcelain --untracked-files=all -- "${path}"`)
        .split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim())
    : [path];

  for (const target of targets) {
    const rule = RULES.find((r) => r.match(target));
    rows.push({
      path: target,
      tracked: state !== "??",
      category: rule?.cat ?? "UNCLASSIFIED",
      reason: rule?.why ?? "no rule matched — REVIEW REQUIRED",
      ...diffstat(target, state !== "??"),
    });
  }
}

rows.sort((a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path));
fs.writeFileSync("docs/design/stage6a/diff-inventory.json", JSON.stringify(rows, null, 2));

const ORDER = ["product auth/context", "API consumers", "UI async states",
  "i18n catalogs", "tests/mutations", "audit harness", "documentation", "UNCLASSIFIED"];

let added = 0, removed = 0;
for (const cat of ORDER) {
  const inCat = rows.filter((r) => r.category === cat);
  if (!inCat.length) continue;
  console.log(`\n## ${cat} — ${inCat.length} file(s)`);
  for (const r of inCat) {
    added += r.added; removed += r.removed;
    const stat = r.note === "new file" ? `+${r.added} (new)` : `+${r.added}/-${r.removed}`;
    console.log(`   ${stat.padEnd(16)} ${r.path}`);
    console.log(`   ${" ".repeat(16)} ${r.reason}`);
  }
}

const unclassified = rows.filter((r) => r.category === "UNCLASSIFIED");
console.log(`\nfiles: ${rows.length}   +${added}/-${removed}`);
console.log(`UNCLASSIFIED=${unclassified.length}`);
if (unclassified.length) {
  console.log("STOP — an unexplained path is in the diff:");
  for (const r of unclassified) console.log(`   ${r.path}`);
}
process.exit(unclassified.length ? 1 : 0);
