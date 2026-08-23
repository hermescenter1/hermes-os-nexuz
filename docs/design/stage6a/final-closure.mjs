/**
 * Phase 107 FINAL R3 — the fail-closed closure pipeline.
 *
 * WHY THIS EXISTS. `build-final-review.mjs` froze the tree, assembled a package
 * and checked provenance. It did not look at whether the evidence it was
 * packaging was GREEN. So a package could be — and was — assembled around a red
 * `PACKAGE_VERIFIER_CONTROLS=FAIL` and a TypeScript log older than the test
 * source it described. Nothing in the pipeline could say no.
 *
 * This runs every required gate itself, against the final tree, and refuses to
 * continue when a required one fails. Two policies, stated per step rather than
 * inferred:
 *
 *   requiredZero    the command must exit 0. No interpretation, no keyword
 *                   sniffing, no "well it printed something reassuring".
 *
 *   policyNonZero   a known, independently proven non-zero. There are exactly
 *                   two: focused ESLint (pre-existing warnings under
 *                   --max-warnings=0) and the Vitest process (`success=false`
 *                   caused by the pre-existing Phase 102 parse failure). Each
 *                   carries the assertion that makes it acceptable, and that
 *                   assertion is checked — a NEW failure in either does not slip
 *                   through under the same banner.
 *
 * EPOCH BINDING. Every log this run produces is stamped with one validation
 * epoch and the frozen tree digest. The final report refuses a log from a
 * different epoch, which is what makes "old TSC log beside new test source"
 * impossible rather than merely unlikely.
 *
 * Usage:
 *   node docs/design/stage6a/final-closure.mjs --out <dirOutsideRepo> --logs <dir>
 *        --evidence <a,b,c> [--skip-sweeps]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { treeFingerprint } from "./tree-fingerprint.mjs";

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg("--out");
const LOGS = arg("--logs");
const EVIDENCE = (arg("--evidence", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!OUT || !LOGS || EVIDENCE.length !== 3) {
  console.error("usage: final-closure.mjs --out <dir> --logs <dir> --evidence <a,b,c>");
  process.exit(2);
}

fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const sh = (c) => execSync(c, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const EPOCH = crypto.randomUUID();
/*
 * PHASE 107 FINAL R4 — the epoch is bound to CONTENT, including untracked files.
 *
 * This hashed `git status` plus `git diff`. `git status` prints only `?? path`
 * for an untracked file and `git diff` ignores untracked files entirely, so the
 * digest covered the NAMES of 82 new paths and none of their bytes. Every proof
 * script, every new test and the new product module could be rewritten after
 * validation while the epoch went on naming the same tree — demonstrated, not
 * theorised. `tree-fingerprint.mjs` hashes each path's bytes instead.
 */
const PRE = treeFingerprint();
const TREE_SHA = PRE.treeContentSha256;

console.log(`VALIDATION_EPOCH=${EPOCH}`);
console.log(`PRE_VALIDATION_TREE_SHA=${TREE_SHA}`);
console.log(`TREE_FILES=${PRE.fileCount}  MOD=${PRE.modified}  NEW=${PRE.added}`);
console.log("");

const D = "docs/design/stage6a";
const results = [];

/** Run one gate, capture its log, and apply its policy. */
function step(spec) {
  const { name, cmd, args, log, policy, accept } = spec;
  let code = 0;
  let out = "";
  try {
    out = execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: process.platform === "win32" });
  } catch (e) {
    code = e.status ?? 1;
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }

  // The epoch header makes a stale log detectable by the report generator.
  const header = `# VALIDATION_EPOCH=${EPOCH}\n# FROZEN_TREE_SHA=${TREE_SHA}\n# COMMAND=${cmd} ${args.join(" ")}\n# EXIT=${code}\n`;
  fs.writeFileSync(path.join(LOGS, log), header + out);

  let ok;
  let note = "";
  if (policy === "requiredZero") {
    ok = code === 0;
  } else {
    // A known non-zero is acceptable ONLY while its stated condition still holds.
    const verdict = accept(out, code);
    ok = verdict.ok;
    note = verdict.why;
  }

  results.push({ name, command: `${cmd} ${args.join(" ")}`, exit: code, policy, ok, note, log });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} exit=${code}  ${policy}${note ? "  — " + note : ""}`);
  return { code, out, ok };
}

/* ── STEP A — the final tree, gate by gate ────────────────────────────────── */
console.log("== STEP A: final tree validation");

step({ name: "git diff --check", cmd: "git", args: ["diff", "--check"], log: "01-diff-check.log", policy: "requiredZero" });
step({ name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit"], log: "02-tsc.log", policy: "requiredZero" });
step({ name: "lint", cmd: "npm", args: ["run", "lint"], log: "03-lint.log", policy: "requiredZero" });
step({ name: "control-character gate", cmd: "node", args: [`${D}/control-char-gate.mjs`], log: "04-controlchars.log", policy: "requiredZero" });
step({ name: "selector audit", cmd: "node", args: [`${D}/selector-audit.mjs`, "--artifact-dir", LOGS], log: "05-selector-audit.log", policy: "requiredZero" });
step({ name: "selector controls", cmd: "node", args: [`${D}/selector-controls.mjs`], log: "05b-selector-controls.log", policy: "requiredZero" });
step({ name: "refusal detector", cmd: "node", args: [`${D}/impact-map.mjs`], log: "08-impact-map.log", policy: "requiredZero" });
step({ name: "refusal detector controls", cmd: "node", args: [`${D}/detector-selfcheck.mjs`], log: "09-detector.log", policy: "requiredZero" });
step({ name: "focus controls", cmd: "node", args: [`${D}/focus-controls.mjs`], log: "09b-focus-controls.log", policy: "requiredZero" });
step({ name: "credential scanner controls", cmd: "node", args: [`${D}/scanner-controls.mjs`], log: "09c-scanner-controls.log", policy: "requiredZero" });
/*
 * The fingerprint controls temporarily change bytes on disk and restore them.
 * Running them INSIDE the epoch is deliberate: if their restoration were ever
 * imperfect, the PRE/POST binding at the end of this run would catch it.
 */
step({ name: "tree fingerprint controls", cmd: "node", args: [`${D}/tree-fingerprint-controls.mjs`], log: "09d-tree-fingerprint-controls.log", policy: "requiredZero" });
step({ name: "visual debt gate", cmd: "node", args: [`${D}/visual-debt-gate.mjs`, ...EVIDENCE], log: "14-visual-debt.log", policy: "requiredZero" });
step({ name: "evidence integrity", cmd: "node", args: [`${D}/evidence-integrity.mjs`, ...EVIDENCE], log: "11-integrity.log", policy: "requiredZero" });
step({ name: "screenshot stability", cmd: "node", args: [`${D}/screenshot-stability.mjs`, ...EVIDENCE], log: "12-stability.log", policy: "requiredZero" });
step({ name: "instability evidence", cmd: "node", args: [`${D}/instability-evidence.mjs`, path.join(OUT, "instability"), ...EVIDENCE], log: "15-instability.log", policy: "requiredZero" });

for (const m of ["", "-harness", "-context", "-refusal", "-gates"]) {
  const file = m ? `mutation-proof${m}.mjs` : "mutation-proof.mjs";
  step({ name: `mutations${m || " (product)"}`, cmd: "node", args: [`${D}/${file}`], log: `08-mut${m || "-product"}.log`, policy: "requiredZero" });
}

/*
 * The two documented non-zero exits. Each is accepted only while the specific
 * condition that explains it still holds.
 */
const changed = sh("git status --porcelain --untracked-files=all")
  .split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim())
  .filter((p) => /\.(ts|tsx|mjs|js)$/.test(p) && /^(src|tools)\//.test(p));

step({
  name: "focused ESLint", cmd: "npx", args: ["eslint", ...changed, "--max-warnings=0"],
  log: "06-eslint.log", policy: "policyNonZero",
  accept: (out) => {
    const m = out.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    if (!m) return { ok: out.trim() === "", why: "no problems reported" };
    const errors = Number(m[2]);
    return { ok: errors === 0, why: `${m[2]} error(s), ${m[3]} warning(s) — warnings are pre-existing; errors are not tolerated` };
  },
});

for (const [label, cmd, args, log] of [
  ["Vitest (default pool)", "npm", ["test", "--", "--reporter=json", `--outputFile=${path.join(LOGS, "t1-forks.json")}`], "t1-forks.log"],
  ["Vitest (threads pool)", "npx", ["vitest", "run", "--pool=threads", "--reporter=json", `--outputFile=${path.join(LOGS, "t2-threads.json")}`], "t2-threads.log"],
]) {
  step({
    name: label, cmd, args, log, policy: "policyNonZero",
    accept: () => {
      const jsonPath = path.join(LOGS, log.replace(".log", ".json"));
      if (!fs.existsSync(jsonPath)) return { ok: false, why: "reporter JSON missing" };
      const r = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      const failedFiles = (r.testResults ?? []).filter((f) => f.status !== "passed");
      const onlyPhase102 = failedFiles.every((f) => f.name.includes("phase102-media-processing"));
      const noCases = r.numFailedTests === 0;
      return {
        ok: noCases && onlyPhase102,
        why: `${r.numFailedTests} failed test case(s); ${failedFiles.length} failed FILE(s), Phase102-only=${onlyPhase102}`,
      };
    },
  });
}

/*
 * PHASE 107 FINAL R4 — the LIVE PROBE runs inside the epoch.
 *
 * It was executed by hand beside the sweeps, its log carried no epoch header,
 * and the report generator then EXEMPTED `13-*` from epoch enforcement — three
 * separate reasons a stale probe result could have been quoted as current. It
 * is a runtime gate on the same product tree, so it belongs here.
 *
 * THE LAUNCHER IS NOW IN THE REPOSITORY, and that is a correction, not a
 * convenience. Keeping it outside was justified as "it mints a disposable
 * identity and must never be committed" — but the identity is minted at
 * runtime and never persisted, so there was never anything secret in the file.
 * What being outside DID buy was an unreviewable dependency: the phase’s most
 * important runtime gate pointed at a path no reviewer could inspect, and
 * during this session that path was silently overwritten with a placeholder
 * that returned success without a server ever starting.
 *
 * The gate no longer rests on the launcher being honest. `PROBE_MODE` is
 * DERIVED by the probe from the responses it collected, and
 * `probe-mode-control.mjs` proves a stub result is rejected.
 */
const LAUNCHER = arg("--launcher", `${D}/live-probe-launcher.mjs`);
if (!fs.existsSync(LAUNCHER)) {
  console.error(`REFUSING: launcher not found at ${LAUNCHER}; the live refusal probe is a mandatory gate.`);
  process.exit(2);
}

step({ name: "test discovery parity", cmd: "node", args: [`${D}/test-discovery-parity.mjs`, path.join(LOGS, "t1-forks.json"), path.join(LOGS, "t2-threads.json"), "forks", "threads", "--artifact-dir", LOGS], log: "07-parity.log", policy: "requiredZero" });
step({ name: "production build", cmd: "npm", args: ["run", "build"], log: "10-build.log", policy: "requiredZero" });

/*
 * THE PROBE RUNS AFTER THE BUILD, deliberately.
 *
 * `next start` serves whatever is in .next. Probing before the build meant
 * the runtime gate measured an artefact left over from some earlier tree,
 * while the report presented the result as evidence about THIS one. Building
 * first makes the thing being measured the thing being packaged.
 */
step({
  name: "live refusal probe", cmd: "node",
  args: [LAUNCHER, "--port", "3391", "--out", path.join(OUT, "REFUSAL-CONTRACT.json")],
  log: "13-probe.log", policy: "requiredZero",
});

/* Phase 102 provenance, recorded as its own artefact. */
const P102 = "scripts/__tests__/phase102-media-processing.test.ts";
const headSha = crypto.createHash("sha256").update(sh(`git show HEAD:${P102}`).replace(/\r/g, "")).digest("hex");
const treeSha = crypto.createHash("sha256").update(fs.readFileSync(P102, "utf8").replace(/\r/g, "")).digest("hex");
fs.writeFileSync(path.join(LOGS, "16-phase102-provenance.log"),
  `# VALIDATION_EPOCH=${EPOCH}\n# FROZEN_TREE_SHA=${TREE_SHA}\n`
  + `git status: '${sh(`git status --porcelain -- ${P102}`).trim()}'\n`
  + `HEAD LF-sha : ${headSha}\nTREE LF-sha : ${treeSha}\n`
  + `IDENTICAL=${headSha === treeSha ? "YES" : "NO"}\n`);
results.push({ name: "Phase102 provenance", command: "sha256 comparison", exit: 0, policy: "requiredZero", ok: headSha === treeSha, note: "unmodified from HEAD", log: "16-phase102-provenance.log" });
console.log(`  ${headSha === treeSha ? "PASS" : "FAIL"}  ${"Phase102 provenance".padEnd(34)} exit=0  requiredZero`);

/* ── the gate ─────────────────────────────────────────────────────────────── */
/*
 * PHASE C — the tree must be exactly what it was before the gates ran.
 *
 * Mutation suites rewrite real files and restore them. Each proves its own
 * restore, but nothing proved the WHOLE tree came back — and with the old
 * name-only digest, nothing could have. Comparing the content fingerprint
 * before and after covers every changed path, tracked or not.
 */
const POST = treeFingerprint();
const treeStable = POST.treeContentSha256 === PRE.treeContentSha256;
if (!treeStable) {
  const before = new Map(PRE.rows.map((r) => [r.path, r.sha256]));
  for (const r of POST.rows) {
    if (before.get(r.path) !== r.sha256) console.log(`   MOVED  ${r.path}`);
  }
}
results.push({
  name: "tree unchanged across validation", command: "tree-fingerprint (pre vs post)",
  exit: treeStable ? 0 : 1, policy: "requiredZero", ok: treeStable,
  note: `${PRE.treeContentSha256.slice(0, 16)}… vs ${POST.treeContentSha256.slice(0, 16)}…`,
  log: "00-closure-manifest.json",
});
console.log(`  ${treeStable ? "PASS" : "FAIL"}  ${"tree unchanged across validation".padEnd(34)} exit=${treeStable ? 0 : 1}  requiredZero`);

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(LOGS, "00-closure-manifest.json"), JSON.stringify({
  validationEpoch: EPOCH,
  treeContentSha256: TREE_SHA,
  preValidationTreeSha: PRE.treeContentSha256,
  postValidationTreeSha: POST.treeContentSha256,
  prePostTreeShaMatch: treeStable,
  frozenTreeSha: TREE_SHA,
  generatedAt: new Date().toISOString(),
  steps: results,
  requiredFailed: failed.length,
}, null, 2));

console.log("");
console.log(`VALIDATION_EPOCH=${EPOCH}`);
console.log(`TREE_CONTENT_SHA256=${TREE_SHA}`);
console.log(`POST_VALIDATION_TREE_SHA=${POST.treeContentSha256}`);
console.log(`PRE_POST_TREE_SHA_MATCH=${treeStable ? "YES" : "NO"}`);
console.log(`CLOSURE_STEPS=${results.length}`);
console.log(`CLOSURE_STEPS_FAILED=${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`   FAILED  ${f.name}  exit=${f.exit}  ${f.note}`);
  console.log("PHASE107_COMPLETION_STATUS=BLOCKED");
  process.exit(1);
}
console.log("PHASE107_COMPLETION_STATUS=STEP_A_GREEN");
process.exit(0);
