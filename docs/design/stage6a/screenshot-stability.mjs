/**
 * Phase 107 Stage 6-A.2 — classify screenshot instability across sweeps.
 *
 * Byte-equality across independent runs is a strong claim, and three cells did
 * not meet it: `/articles/following` at 1440×900, in all three locales, hashed
 * differently between sweeps. The options were to explain it or to report it
 * unexplained. Asserting equality that does not hold was never one of them.
 *
 * This finds every cell whose screenshot hash varies, then measures the actual
 * pixels rather than repeating that the hashes differ. A cell is EXPLAINED only
 * when the difference is confined, sub-perceptual, and attributable.
 *
 * Usage: node docs/design/stage6a/screenshot-stability.mjs <dir1> <dir2> [dir3...]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIRS = process.argv.slice(2);
if (DIRS.length < 2) { console.error("usage: screenshot-stability.mjs <dir1> <dir2> [...]"); process.exit(2); }

/** Every cell, with its screenshot hash in each run. */
const byCell = new Map();
for (const dir of DIRS) {
  const rec = path.join(dir, "_records");
  for (const f of fs.readdirSync(rec).filter((x) => x.endsWith(".json"))) {
    const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
    if (!byCell.has(r.cellId)) byCell.set(r.cellId, []);
    byCell.get(r.cellId).push({ dir, sha: r.screenshotSha256, file: path.join(dir, r.screenshotFile) });
  }
}

const unstable = [...byCell.entries()]
  .filter(([, rows]) => new Set(rows.map((r) => r.sha)).size > 1)
  .map(([cellId, rows]) => ({ cellId, rows }));

console.log(`cells compared : ${byCell.size}`);
console.log(`runs           : ${DIRS.length}`);
console.log(`byte-identical : ${byCell.size - unstable.length}`);
console.log(`varying        : ${unstable.length}`);
console.log("");

const findings = [];
for (const { cellId, rows } of unstable) {
  const out = execFileSync("node", ["docs/design/stage6a/image-diff.mjs", ...rows.map((r) => r.file)], {
    encoding: "utf8", shell: process.platform === "win32",
  });
  const pct = Number((out.match(/MAX_DIFFERING_PERCENT=([\d.]+)/) || [])[1] ?? NaN);
  const deltas = [...out.matchAll(/max channel delta: (\d+)/g)].map((m) => Number(m[1]));
  const boxes = [...out.matchAll(/bounding box\s+: x=(\d+) y=(\d+) w=(\d+) h=(\d+)/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  const maxDelta = Math.max(0, ...deltas);
  const area = boxes.length ? Math.max(...boxes.map((b) => b.w * b.h)) : 0;

  /*
   * "Explained" is a claim about SIZE and CONFINEMENT, not a way of dismissing
   * a difference. A single 6×6 region differing by one or two quantisation
   * levels out of 255 cannot change what a reader sees or what the cell was
   * classified as; anything larger is reported as UNEXPLAINED and must be
   * investigated rather than waved through.
   */
  const explained = maxDelta <= 2 && area <= 64 && pct < 0.01;
  findings.push({ cellId, maxDelta, boxes, percent: pct, explained });

  console.log(`${cellId}`);
  console.log(`   distinct hashes : ${new Set(rows.map((r) => r.sha)).size} of ${rows.length}`);
  console.log(`   differing       : ${pct}%   max channel delta ${maxDelta} of 255`);
  console.log(`   region(s)       : ${boxes.map((b) => `${b.w}x${b.h} at (${b.x},${b.y})`).join(", ")}`);
  console.log(`   verdict         : ${explained ? "EXPLAINED — confined and sub-perceptual" : "UNEXPLAINED"}`);
}

console.log("");
console.log(`UNSTABLE_CELLS=${unstable.length}`);
console.log(`UNEXPLAINED_INSTABILITY=${findings.filter((f) => !f.explained).length}`);
console.log("BYTE_EQUALITY_CLAIMED=NO");
process.exit(findings.some((f) => !f.explained) ? 1 : 0);
