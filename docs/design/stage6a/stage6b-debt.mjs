/**
 * Phase 107 Stage 6-A — what Stage 6-A did NOT fix.
 *
 * Stage 6-A closed the routes the Stage 5 sweep actually flagged. The same
 * data-fetching idiom exists elsewhere in the product, in surfaces that were
 * never observed failing and are therefore out of this stage's scope.
 *
 * The count is DERIVED, never hand-written, so nobody can mistake this stage for
 * a repository-wide fetch fix and nobody has to guess how much is left.
 *
 * Usage: node docs/design/stage6a/stage6b-debt.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src/components", "src/app"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const rows = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (file.includes("__tests__")) continue;
    const src = fs.readFileSync(file, "utf8");
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

    // The body parsed before the status is checked.
    const rawParse = /\.then\(\s*\(?\s*r\w*\s*\)?\s*=>\s*r\w*\.json\(\)/.test(code);
    // The rejection discarded, so no failure can ever reach the screen.
    const emptyCatch = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(code);
    if (!rawParse && !emptyCatch) continue;

    rows.push({
      file: file.split(path.sep).join("/"),
      rawParse,
      emptyCatch,
      // Already migrated surfaces would show neither; this is belt and braces.
      usesAuditedLoader: /@\/lib\/client\/(resource-request|use-resource)/.test(src),
    });
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync("docs/design/stage6a/stage6b-debt.json", JSON.stringify(rows, null, 2));

console.log("STAGE6A_IS_NOT_A_REPO_WIDE_FETCH_FIX");
console.log(`STAGE6B_REMAINING_IDIOM_FILES=${rows.length}`);
console.log("");
for (const r of rows) {
  const why = [r.rawParse && "parses before checking status", r.emptyCatch && "discards the rejection"]
    .filter(Boolean).join("; ");
  console.log(`   ${r.file}\n      ${why}`);
}
