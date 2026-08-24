/**
 * Phase 107 FINAL — the one command that produces the review package.
 *
 * WHY THIS EXISTS. Provenance went stale twice, in the same way both times: the
 * phase and stage were written as literals inside individual generators, so
 * every new pass had to remember to edit each one, and a forgotten edit produced
 * an archive that misdescribed itself. `freeze-snapshot.mjs` was still emitting
 * `stage: "6-A.2"` while the package it fed claimed 6-A.3.
 *
 * The identifiers are now stated ONCE — here, on the command line — and handed
 * to every generator. Nothing downstream may invent its own value: both
 * `freeze-snapshot.mjs` and `build-review-pack.mjs` refuse to run without being
 * told, so a missing argument stops the pipeline instead of reviving a default.
 *
 * The build then FAILS, not warns, if any of these disagree:
 *
 *   PHASE_METADATA_MATCH           snapshot.phase   == requested phase
 *   STAGE_METADATA_MATCH           snapshot.stage   == requested stage
 *   SNAPSHOT_MANIFEST_STAGE_MATCH  manifest.stage   == snapshot.stage
 *
 * ORDERING IS THE OTHER HALF. Everything that writes inside the repository has
 * already run before this command starts; this only reads the tree, freezes it,
 * and writes outside it. A generator that measured a tree while writing into it
 * is what produced four different file totals for one change set.
 *
 * Usage:
 *   node docs/design/stage6a/build-final-review.mjs \
 *     --phase 107 --stage FINAL-COMPLETION \
 *     --out <dirOutsideRepo> --logs <validationLogDir> \
 *     --evidence <dir1,dir2,dir3> --instability <dir> --zip <name.zip>
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const PHASE = arg("--phase");
const STAGE = arg("--stage");
const OUT = arg("--out");
const LOGS = arg("--logs", "");
const EVIDENCE = arg("--evidence", "");
const INSTABILITY = arg("--instability", "");
const ZIP_NAME = arg("--zip", "phase107-final-codex-review.zip");

if (!PHASE || !STAGE || !OUT) {
  console.error("usage: build-final-review.mjs --phase <p> --stage <s> --out <dir> [--logs d] [--evidence a,b,c] [--instability d] [--zip name]");
  process.exit(2);
}

const repo = process.cwd().split(path.sep).join("/");
if (path.resolve(OUT).split(path.sep).join("/").startsWith(repo + "/")) {
  console.error(`REFUSING: --out is inside the repository (${repo}). The package is built outside the measured tree.`);
  process.exit(2);
}

const run = (args, label) => {
  process.stdout.write(`\n== ${label}\n`);
  const r = execFileSync("node", args, { encoding: "utf8", shell: process.platform === "win32" });
  process.stdout.write(r.split(/\r?\n/).map((l) => (l ? `   ${l}` : "")).join("\n"));
  return r;
};

/*
 * PHASE 107 FINAL R4 — the report-status check is a PRE-PACKAGE GATE.
 *
 * It is naturally a post-report check: it compares the canonical report against
 * the substage records, so it cannot run before the report exists. R3 resolved
 * that by having the report REQUIRE an existing status log — which made report
 * generation depend on a check of the PREVIOUS report, and needed two passes to
 * converge. The honest order is: generate, then check, then refuse to package
 * if the check failed.
 */
const REPORT_STATUS_LOG = arg("--report-status-log");
if (!REPORT_STATUS_LOG || !fs.existsSync(REPORT_STATUS_LOG)) {
  console.error("REFUSING: --report-status-log is required and must exist.");
  console.error("Generate the canonical report, run report-status-check.mjs against it, then package.");
  process.exit(2);
}
{
  const body = fs.readFileSync(REPORT_STATUS_LOG, "utf8");
  const conflicts = Number((body.match(/^REPORT_STATUS_CONFLICTS=(\d+)$/m) || [])[1]);
  const docs = Number((body.match(/^CANONICAL_PHASE_STATUS_DOCUMENTS=(\d+)$/m) || [])[1]);
  if (!(conflicts === 0 && docs === 1)) {
    console.error(`REFUSING: report-status gate not satisfied (conflicts=${conflicts}, canonical documents=${docs}).`);
    process.exit(1);
  }
  /*
   * The status log must describe THE REPORT BEING PACKAGED, not some earlier
   * one. Recompute the SHA from the file on disk and compare.
   */
  const statedSha = (body.match(/^CANONICAL_REPORT_SHA256=([0-9a-f]{64})$/m) || [])[1];
  const reportPath = arg("--report");
  if (!reportPath || !fs.existsSync(reportPath)) {
    console.error("REFUSING: --report <canonical.md> is required so its bytes can be bound to the status log.");
    process.exit(2);
  }
  const actualSha = crypto.createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex");
  if (!statedSha || statedSha !== actualSha) {
    console.error(`REFUSING: REPORT_STATUS_REPORT_SHA_MATCH=NO (log says ${statedSha ?? "nothing"}, report is ${actualSha}).`);
    process.exit(1);
  }
  const epochMatch = /^REPORT_STATUS_EPOCH_MATCH=YES$/m.test(body);
  if (!epochMatch) {
    console.error("REFUSING: REPORT_STATUS_EPOCH_MATCH=NO.");
    process.exit(1);
  }
  console.log("report-status gate: conflicts=0, canonical documents=1");
  console.log("REPORT_STATUS_REPORT_SHA_MATCH=YES");
  console.log("REPORT_STATUS_EPOCH_MATCH=YES");
}

/*
 * PHASE 107 FINAL R4 - the two ADVERSARIAL controls are pre-package gates too.
 *
 * Both of them run the report generator many times, so neither can be a gate
 * INSIDE the generator without making the generator depend on a check of its
 * own earlier output. They are checked here, in the same place and the same
 * way as the report-status gate: generate, check, then refuse to package.
 */
for (const g of [
  { flag: "--report-gate-mutations-log", key: "FINAL_REPORT_GATE_CONTROLS",
    what: "the six report-gate mutations" },
  { flag: "--probe-mode-control-log", key: "STUB_CANNOT_SATISFY_LIVE_PROBE",
    what: "the stub-probe substitution control" },
]) {
  const f = arg(g.flag);
  if (!f || !fs.existsSync(f)) {
    console.error(`REFUSING: ${g.flag} is required and must exist (${g.what}).`);
    process.exit(2);
  }
  const body = fs.readFileSync(f, "utf8");
  const NON_WS = "[^" + String.fromCharCode(92) + "s]";
  const m = new RegExp("^" + g.key + "=(" + NON_WS + "+)$", "m").exec(body);
  if (!m || m[1] !== "PASS") {
    console.error(`REFUSING: ${g.key}=${m ? m[1] : "ABSENT"} - ${g.what} did not pass.`);
    process.exit(1);
  }
  console.log(`${g.key}=PASS`);
}

/* ── 1. freeze, with provenance passed in ─────────────────────────────────── */
run(["docs/design/stage6a/freeze-snapshot.mjs", OUT, PHASE, STAGE], "freeze snapshot");

const snapshotPath = path.join(OUT, "worktree-inventory.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

/* ── 2. build the pack from the frozen snapshot ───────────────────────────── */
run([
  "docs/design/stage6a/build-review-pack.mjs",
  OUT, LOGS, EVIDENCE, snapshotPath, INSTABILITY, STAGE, PHASE,
], "assemble package");

const stageDir = path.join(OUT, "stage6a-codex-review");
const zipPath = path.join(OUT, ZIP_NAME);
run(["docs/design/stage6a/zip-review-pack.mjs", stageDir, zipPath], "write archive");

/* ── 3. provenance gates — failures, never warnings ───────────────────────── */
const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, "MANIFEST.json"), "utf8"));

const gates = [
  { name: "PHASE_METADATA_MATCH", ok: snapshot.phase === PHASE, got: `${snapshot.phase} vs ${PHASE}` },
  { name: "STAGE_METADATA_MATCH", ok: snapshot.stage === STAGE, got: `${snapshot.stage} vs ${STAGE}` },
  { name: "SNAPSHOT_MANIFEST_STAGE_MATCH", ok: manifest.stage === snapshot.stage, got: `${manifest.stage} vs ${snapshot.stage}` },
  { name: "MANIFEST_PHASE_MATCH", ok: manifest.phase === PHASE, got: `${manifest.phase} vs ${PHASE}` },
  { name: "SNAPSHOT_VIEWS_EQUAL", ok: snapshot.viewsEqual !== false, got: String(snapshot.viewsEqual) },
  { name: "UNCLASSIFIED", ok: (snapshot.unclassified ?? 0) === 0, got: String(snapshot.unclassified ?? 0) },
];

console.log("\n== provenance gates");
let failed = 0;
for (const g of gates) {
  console.log(`   ${g.ok ? "PASS" : "FAIL"}  ${g.name}  (${g.got})`);
  if (!g.ok) failed++;
}

const buf = fs.readFileSync(zipPath);
console.log("\n== package");
console.log(`   PACKAGE=${ZIP_NAME}`);
console.log(`   PACKAGE_BYTES=${buf.length}`);
console.log(`   PACKAGE_SHA256=${crypto.createHash("sha256").update(buf).digest("hex")}`);
console.log(`   PACKAGE_ENTRIES=${manifest.files + 1}`);

console.log("");
for (const g of gates) console.log(`${g.name}=${g.ok ? "YES" : "NO"}`);
console.log(`PACKAGE_PROVENANCE_VALID=${failed === 0 ? "YES" : "NO"}`);
process.exit(failed === 0 ? 0 : 1);
