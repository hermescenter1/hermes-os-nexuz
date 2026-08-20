#!/usr/bin/env node
/**
 * Phase 107 visual-evidence harness — verifier.
 *
 * Decides whether an evidence pack may be shown to a reviewer at all. It exists
 * because a pack once passed inspection by eye while being worthless: 189 PNGs
 * that were the same error page repeated, and later 764 images backed by 146
 * measurements. Both looked fine in a file listing.
 *
 * Every planned cell is reconciled against three independent sources — the
 * plan, the PNG on disk (SHA-256 and real pixel dimensions), and the record
 * written during the same page load. It exits non-zero unless the pack is
 * complete and internally consistent.
 *
 * Usage:
 *   node tools/audit/visual-evidence/verify.mjs <cells.json> <outDir> [--json out.json]
 */
import fs from "node:fs";
import path from "node:path";
import { RecordStore, sha256 } from "./record-store.mjs";
import { explainDuplicateGroup, ACCESS } from "./contracts.mjs";

const [, , cellsFile, outDir, ...rest] = process.argv;
if (!cellsFile || !outDir) {
  console.error("usage: verify.mjs <cells.json> <outDir> [--json out.json]");
  process.exit(2);
}

const cells = JSON.parse(fs.readFileSync(cellsFile, "utf8"));
const store = new RecordStore(outDir);
const byFile = new Map(store.readAll().filter((r) => r.status === "COMPLETE").map((r) => [r.screenshotFile, r]));

/** Real pixel dimensions, straight from the PNG IHDR chunk. */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const counters = {
  PLANNED: cells.length, CAPTURED: 0, MISSING: 0, EXTRA: 0,
  MEASUREMENT_WITHOUT_SCREEN: 0, SCREEN_WITHOUT_MEASUREMENT: 0,
  HASH_MISMATCH: 0, DUPLICATE_CELL_RECORD: 0, WRONG_DIMENSIONS: 0,
  SESSION_LOST: 0, UNEXPLAINED_DUPLICATES: 0,
};
const manifest = [];
const planned = new Set(cells.map((c) => c.file));

for (const c of cells) {
  const abs = path.join(outDir, c.file);
  const rec = byFile.get(c.file);
  const cell = {
    cellId: c.cellId ?? c.file, route: c.route, locale: c.locale,
    viewport: `${c.width}x${c.height}`, file: c.file,
    requestedUrl: c.url, finalUrl: rec?.finalUrl ?? null,
    httpState: rec?.httpState ?? null, accessState: rec?.accessState ?? null,
    sha256: null, dimensions: null, result: "PASS", anomalies: [],
  };

  if (!fs.existsSync(abs)) {
    counters.MISSING++;
    if (rec) counters.MEASUREMENT_WITHOUT_SCREEN++;
    cell.result = "MISSING";
    manifest.push(cell); continue;
  }
  counters.CAPTURED++;

  const buf = fs.readFileSync(abs);
  cell.sha256 = sha256(buf);
  const dim = pngSize(buf);
  cell.dimensions = dim ? `${dim.width}x${dim.height}` : "UNREADABLE";

  if (!rec) {
    counters.SCREEN_WITHOUT_MEASUREMENT++;
    cell.result = "FAIL";
    cell.anomalies.push("screenshot has no measurement — cannot be verified");
    manifest.push(cell); continue;
  }
  if (cell.sha256 !== rec.screenshotSha256) {
    counters.HASH_MISMATCH++; cell.result = "FAIL";
    cell.anomalies.push("screenshot does not match the hash recorded with it");
  }
  if (!dim || dim.width !== c.width) {
    counters.WRONG_DIMENSIONS++; cell.result = "FAIL";
    cell.anomalies.push(`width ${dim?.width} != planned ${c.width}`);
  }
  if (rec.accessState === ACCESS.SESSION_LOST) {
    counters.SESSION_LOST++; cell.result = "FAIL";
    cell.anomalies.push(`landed on ${rec.finalUrl} — not authenticated evidence`);
  }
  manifest.push(cell);
}

/* Files on disk that nothing planned. */
const onDisk = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name.startsWith("_")) continue; walk(p); }
    else if (e.name.endsWith(".png")) onDisk.push(path.relative(outDir, p).split(path.sep).join("/"));
  }
})(outDir);
counters.EXTRA = onDisk.filter((f) => !planned.has(f)).length;
counters.DUPLICATE_CELL_RECORD = store.completed().duplicates;

/* Duplicate groups, each needing a machine-readable reason. */
const byHash = new Map();
for (const c of manifest) {
  if (!c.sha256) continue;
  if (!byHash.has(c.sha256)) byHash.set(c.sha256, []);
  byHash.get(c.sha256).push(c);
}
const duplicates = [];
for (const [sha, members] of [...byHash.entries()].filter(([, v]) => v.length > 1)) {
  const { explained, reason } = explainDuplicateGroup(members);
  duplicates.push({ sha256: sha.slice(0, 16), count: members.length, explained, reason, members: members.map((m) => m.file) });
  if (!explained) {
    counters.UNEXPLAINED_DUPLICATES += members.length;
    for (const m of members) { m.result = "FAIL"; m.anomalies.push(reason); }
  }
}

const pass = counters.CAPTURED === counters.PLANNED &&
  counters.MISSING === 0 && counters.EXTRA === 0 &&
  counters.MEASUREMENT_WITHOUT_SCREEN === 0 && counters.SCREEN_WITHOUT_MEASUREMENT === 0 &&
  counters.HASH_MISMATCH === 0 && counters.DUPLICATE_CELL_RECORD === 0 &&
  counters.WRONG_DIMENSIONS === 0 && counters.SESSION_LOST === 0 &&
  counters.UNEXPLAINED_DUPLICATES === 0;

console.log("=== duplicate groups ===");
if (!duplicates.length) console.log("(none)");
for (const d of duplicates.slice(0, 20)) console.log(`  ${String(d.count).padStart(3)} × ${d.sha256}  ${d.reason}`);
console.log("");
for (const [k, v] of Object.entries(counters)) console.log(`${k}=${v}`);
console.log(`EVIDENCE_VERIFICATION=${pass ? "PASS" : "FAIL"}`);

const ji = rest.indexOf("--json");
if (ji >= 0) fs.writeFileSync(rest[ji + 1], JSON.stringify({ counters, duplicates, manifest }, null, 2));
process.exit(pass ? 0 : 1);
