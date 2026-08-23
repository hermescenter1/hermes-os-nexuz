/**
 * Phase 107 Stage 6-A — verify the three sweeps without regenerating them.
 *
 * Re-running would produce new evidence, not verify the old. This checks the
 * packs that already exist, against the failure modes this phase actually hit:
 *
 *   - a directory that quietly mixed TWO runs, because a name was reused;
 *   - records without their screenshot, or screenshots without their record;
 *   - a hash that no longer matches the bytes on disk;
 *   - a capture of the wrong page;
 *   - the audit tool's own exception counted as a product defect;
 *   - a credential anywhere in the pack.
 *
 * It also compares the three runs cell by cell: three runs that disagree are not
 * three confirmations, and the first attempt at this comparison is what exposed
 * the mixed-provenance directories.
 *
 * Usage: node docs/design/stage6a/evidence-integrity.mjs <dir> <dir> <dir>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { attributeConsoleError } from "../../../tools/audit/visual-evidence/contracts.mjs";

const DIRS = process.argv.slice(2);
if (DIRS.length < 2) { console.error("give at least two evidence directories"); process.exit(2); }

const CREDENTIAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@local\.invalid/;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const summaries = [];
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  pass  ${msg}`);

for (const dir of DIRS) {
  console.log(`\n## ${dir}`);
  const recordDir = path.join(dir, "_records");
  const records = fs.readdirSync(recordDir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(recordDir, f), "utf8")));

  // 1. exactly one run
  const runIds = new Set(records.map((r) => r.runId));
  runIds.size === 1
    ? pass(`one runId (${[...runIds][0]})`)
    : fail(`${runIds.size} runIds — this directory mixes runs: ${[...runIds].join(", ")}`);

  // 2. records = screenshots = matching hashes
  const pngs = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "_records") walk(p); }
      else if (p.endsWith(".png")) pngs.push(p);
    }
  })(dir);

  records.length === pngs.length
    ? pass(`${records.length} records = ${pngs.length} screenshots`)
    : fail(`${records.length} records but ${pngs.length} screenshots`);

  let mismatched = 0, missing = 0;
  for (const r of records) {
    const png = path.join(dir, r.screenshotFile);
    if (!fs.existsSync(png)) { missing++; continue; }
    if (sha(fs.readFileSync(png)) !== r.screenshotSha256) mismatched++;
  }
  missing === 0 ? pass("every record has its screenshot") : fail(`${missing} record(s) with no screenshot`);
  mismatched === 0 ? pass("every SHA-256 matches the bytes on disk") : fail(`${mismatched} hash mismatch(es)`);

  // 3. no partial or temporary artefacts
  const temps = fs.readdirSync(recordDir).filter((f) => /\.tmp$|\.part$/.test(f));
  temps.length === 0 ? pass("no temp or partial records") : fail(`${temps.length} temp record(s)`);

  // 4. the final-location contract
  const wrongPlace = records.filter((r) => r.finalLocationCheck && !/^EXACT|^OK|^REDIRECT_ALLOWED/i.test(r.finalLocationCheck));
  wrongPlace.length === 0 ? pass("every capture landed on its planned route") : fail(`${wrongPlace.length} wrong final location(s)`);

  // 5. contamination and credentials
  const harness = records.reduce((a, r) =>
    a + (r.consoleErrors || []).filter((e) => attributeConsoleError(e) === "AUDIT_HARNESS").length, 0);
  harness === 0 ? pass("no console error authored by the audit tool") : fail(`${harness} harness console error(s)`);

  const product = records.reduce((a, r) =>
    a + (r.consoleErrors || []).filter((e) => attributeConsoleError(e) === "PRODUCT").length, 0);
  product === 0 ? pass("no product console error") : fail(`${product} product console error(s)`);

  let leaks = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!fs.statSync(p).isFile()) continue;
    if (CREDENTIAL.test(fs.readFileSync(p, "utf8"))) leaks++;
  }
  for (const r of records) if (CREDENTIAL.test(JSON.stringify(r))) leaks++;
  leaks === 0 ? pass("no credential anywhere in the pack") : fail(`${leaks} credential occurrence(s)`);

  summaries.push({
    dir,
    cells: records.length,
    classification: Object.fromEntries(
      records.reduce((m, r) => {
        const declared = (r.domSignals?.asyncStates || []);
        const key = declared.length ? declared.join("+") : (r.httpState === 404 ? "not-found" : "ready");
        return m.set(key, (m.get(key) ?? 0) + 1);
      }, new Map()),
    ),
    perCell: new Map(records.map((r) => [
      `${r.route}|${r.locale}|${r.viewport}`,
      (r.domSignals?.asyncStates || []).join("+") || (r.httpState === 404 ? "not-found" : "ready"),
    ])),
  });
}

/* ── the three runs must agree, cell by cell ──────────────────────────────── */
console.log("\n## cross-run agreement");
const [first, ...rest] = summaries;
let disagreements = 0;
for (const other of rest) {
  for (const [cell, state] of first.perCell) {
    const theirs = other.perCell.get(cell);
    if (theirs !== state) {
      disagreements++;
      if (disagreements <= 8) console.log(`  DIFFERS  ${cell}: ${state} vs ${theirs}`);
    }
  }
}
disagreements === 0
  ? pass(`all ${first.perCell.size} cells classify identically across ${summaries.length} runs`)
  : fail(`${disagreements} cell(s) classify differently between runs`);
if (disagreements) failures++;

console.log("\nclassification (run 1):", JSON.stringify(first.classification));
/* -- the auditor binding ------------------------------------------------- */
/*
 * PHASE 107 FINAL R4 — evidence is only evidence about a RULE.
 *
 * Every record now carries the SHA-256 of the probe that measured it. Without
 * that, "these sweeps used the current auditor" rested on file mtimes — and
 * mtimes are rewritten by the very mutation proofs that restore the file
 * byte-for-byte, so the argument was never sound. This recomputes the digest of
 * the probe on disk and requires EVERY record to name exactly it, so a run
 * captured under an older rule, or three runs that disagree with each other,
 * cannot be presented as measuring this tree.
 */
const AUDITOR_PATH = "tools/audit/visual-evidence/probe-expression.js";
const auditorSha = crypto.createHash("sha256").update(fs.readFileSync(AUDITOR_PATH)).digest("hex");

let recordsSeen = 0;
let recordsBound = 0;
let auditorMismatches = 0;
const distinctAuditors = new Set();

for (const dir of DIRS) {
  const rec = path.join(dir, "_records");
  for (const f of fs.readdirSync(rec).filter((n) => n.endsWith(".json"))) {
    const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
    recordsSeen++;
    if (typeof r.auditorSha256 !== "string" || !r.auditorSha256) continue;
    recordsBound++;
    distinctAuditors.add(r.auditorSha256);
    if (r.auditorSha256 !== auditorSha) auditorMismatches++;
  }
}

const bindingOk = recordsSeen > 0 && recordsBound === recordsSeen
  && auditorMismatches === 0 && distinctAuditors.size === 1;
if (!bindingOk) failures++;

console.log(`\nAUDITOR_SHA256=${auditorSha}`);
console.log(`AUDITOR_BOUND_RECORDS=${recordsBound}/${recordsSeen}`);
console.log(`AUDITOR_SHA_MISMATCHES=${auditorMismatches}`);
console.log(`AUDITOR_DISTINCT_DIGESTS=${distinctAuditors.size}`);
console.log(`AUDITOR_EVIDENCE_BINDING=${bindingOk ? "PASS" : "FAIL"}`);

console.log(`\nCLASSIFICATION_DIFFERENCES=${disagreements}`);
console.log(`EVIDENCE_INTEGRITY_FAILURES=${failures}`);
process.exit(failures ? 1 : 0);
