/**
 * Phase 107 Stage 6-A.3 — make the pixel-diff claim INDEPENDENTLY reproducible.
 *
 * The Stage 6-A.2 pack asserted `0.0022% differing, max channel delta 1/255, in
 * a 6x6 region` for `/articles/following`. It shipped the two differing SHA-256
 * values and excluded every PNG byte, so a reviewer could confirm only that the
 * hashes differ — the measurement itself had to be taken on trust. A number
 * nobody else can recompute is an assertion, not evidence.
 *
 * This collects, for each cell whose screenshot is not byte-identical across the
 * final-tree runs:
 *
 *   - the ORIGINAL PNG bytes, one per DISTINCT hash (identical runs contribute
 *     no new bytes, so the pack carries the minimum needed to recompute);
 *   - an explicit run -> SHA-256 mapping, so which run produced which image is
 *     not left to inference;
 *   - the SHA-256 of every emitted file, computed from the bytes as written;
 *   - the RAW output of `image-diff.mjs` run against exactly those emitted
 *     files, so the reviewer re-runs the same command on the same bytes.
 *
 * Byte-equality across runs is NOT claimed anywhere.
 *
 * Usage: node docs/design/stage6a/instability-evidence.mjs <outDir> <run1> <run2> [run3...]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const [OUT, ...RUNS] = process.argv.slice(2);
if (!OUT || RUNS.length < 2) {
  console.error("usage: instability-evidence.mjs <outDir> <run1> <run2> [run3...]");
  process.exit(2);
}

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Every record of a run, keyed by cell id. */
function recordsOf(dir) {
  const rec = path.join(dir, "_records");
  const map = new Map();
  for (const f of fs.readdirSync(rec).filter((n) => n.endsWith(".json"))) {
    const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
    map.set(r.cellId, r);
  }
  return map;
}

const runs = RUNS.map((d) => ({ dir: d, name: path.basename(d), records: recordsOf(d) }));
const cellIds = [...runs[0].records.keys()];

fs.mkdirSync(OUT, { recursive: true });

const report = { generatedAt: new Date().toISOString(), runs: runs.map((r) => r.name), cells: [] };
let unstable = 0;

for (const cellId of cellIds) {
  const perRun = runs.map((r) => {
    const rec = r.records.get(cellId);
    return { run: r.name, dir: r.dir, rec };
  });
  if (perRun.some((p) => !p.rec)) continue;

  const hashes = perRun.map((p) => p.rec.screenshotSha256);
  if (new Set(hashes).size === 1) continue;         // byte-identical, nothing to explain
  unstable++;

  const slug = cellId.replace(/[^A-Za-z0-9_-]/g, "_");
  const cellDir = path.join(OUT, slug);
  fs.mkdirSync(cellDir, { recursive: true });

  /*
   * One file per DISTINCT hash. Two runs that agree byte-for-byte would add a
   * second identical copy and prove nothing, so the first run exhibiting each
   * hash supplies the bytes and the mapping records the rest.
   */
  const emitted = new Map();
  const mapping = [];
  for (const p of perRun) {
    const src = path.join(p.dir, p.rec.screenshotFile);
    const h = p.rec.screenshotSha256;
    if (!emitted.has(h)) {
      const name = `${slug}__${h.slice(0, 12)}.png`;
      const bytes = fs.readFileSync(src);
      const actual = sha(bytes);
      fs.writeFileSync(path.join(cellDir, name), bytes);
      emitted.set(h, { name, bytes: bytes.length, sha256Recorded: h, sha256Recomputed: actual });
    }
    mapping.push({ run: p.run, recordedSha256: h, file: emitted.get(h).name });
  }

  // The raw tool output, against exactly the files just written.
  const args = [...emitted.values()].map((e) => path.join(cellDir, e.name));
  let raw = "";
  let ok = true;
  try {
    raw = execFileSync("node", ["docs/design/stage6a/image-diff.mjs", ...args],
      { encoding: "utf8", shell: process.platform === "win32" });
  } catch (e) {
    raw = String(e.stdout ?? "") + String(e.stderr ?? "");
    ok = false;
  }
  fs.writeFileSync(path.join(cellDir, "image-diff-raw.txt"), raw);

  const cmd = `node docs/design/stage6a/image-diff.mjs ${[...emitted.values()].map((e) => `${slug}/${e.name}`).join(" ")}`;
  fs.writeFileSync(path.join(cellDir, "REPRODUCE.txt"),
    `Run from the directory containing this cell folder:\n\n  ${cmd}\n\n` +
    `Verify the bytes first:\n` +
    [...emitted.values()].map((e) => `  ${e.sha256Recomputed}  ${slug}/${e.name}`).join("\n") + "\n\n" +
    `Byte-equality across runs is NOT claimed. The claim is the measured\n` +
    `difference printed by the command above, on exactly these bytes.\n`);

  report.cells.push({
    cellId,
    route: perRun[0].rec.route, locale: perRun[0].rec.locale, viewport: perRun[0].rec.viewport,
    distinctHashes: emitted.size,
    runCount: perRun.length,
    runToSha: mapping,
    files: [...emitted.values()],
    reproduceCommand: cmd,
    imageDiffRaw: raw.trimEnd().split(/\r?\n/),
    imageDiffExitedCleanly: ok,
  });

  console.log(`${cellId}`);
  console.log(`  distinct hashes : ${emitted.size} of ${perRun.length} runs`);
  for (const m of mapping) console.log(`    ${m.run}  ${m.recordedSha256.slice(0, 16)}…  -> ${m.file}`);
  for (const line of raw.trimEnd().split(/\r?\n/)) console.log(`    | ${line}`);
}

fs.writeFileSync(path.join(OUT, "INSTABILITY-EVIDENCE.json"), JSON.stringify(report, null, 2));

console.log("");
console.log(`UNSTABLE_CELLS=${unstable}`);
console.log(`EVIDENCE_CELLS_WITH_BYTES=${report.cells.length}`);
console.log(`BYTE_EQUALITY_CLAIMED=NO`);
process.exit(0);
