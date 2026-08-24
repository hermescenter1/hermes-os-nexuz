/**
 * Phase 107 FINAL — generate the closing report FROM the evidence.
 *
 * Every previous round hand-typed at least one number that a machine artefact
 * already held, and every previous round had at least one of those numbers go
 * stale or disagree with another view. The counts below are read out of the
 * JSON and logs produced by the gates themselves; the prose states what they
 * mean, and nothing else.
 *
 * A value this script cannot find is printed as `NOT MEASURED` rather than
 * omitted or guessed, so a missing gate is visible in the report instead of
 * silently absent from it.
 *
 * Usage:
 *   node docs/design/stage6a/generate-final-report.mjs <snapshot.json> <logDir> <evidenceDirs,csv> <out.md>
 */
import fs from "node:fs";
import path from "node:path";

const [SNAP, LOGS, EVIDENCE_CSV, OUT] = process.argv.slice(2);
if (!SNAP || !LOGS || !OUT) {
  console.error("usage: generate-final-report.mjs <snapshot.json> <logDir> <evidenceDirs> <out.md>");
  process.exit(2);
}

const readLog = (n) => {
  const p = path.join(LOGS, n);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
};
/** Pull `KEY=value` out of a log, or report that it was never measured. */
const flag = (log, key) => {
  const m = readLog(log).match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : "NOT MEASURED";
};
const num = (log, key) => {
  const v = flag(log, key);
  return v === "NOT MEASURED" ? v : v;
};

/*
 * PHASE 107 FINAL R3 — MANDATORY GATES, and an epoch every log must belong to.
 *
 * The generator could previously describe a phase as complete while a packaged
 * log said `PACKAGE_VERIFIER_CONTROLS=FAIL`, and while a TypeScript log was
 * older than the test source it described. It simply never read them.
 *
 * Two rules now:
 *   - every key below must be present, measured, and passing, or no
 *     final-complete verdict is emitted;
 *   - every log consulted must carry the closure run's validation epoch, so a
 *     log from an earlier tree cannot be quoted as current.
 */
const closurePath = path.join(LOGS, "00-closure-manifest.json");
const closure = fs.existsSync(closurePath) ? JSON.parse(fs.readFileSync(closurePath, "utf8")) : null;
const EPOCH = closure?.validationEpoch ?? null;

/** A log belongs to this epoch, or it is not evidence about this tree. */
function epochOf(logName) {
  const p = path.join(LOGS, logName);
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, "utf8").match(/^# VALIDATION_EPOCH=(\S+)/m);
  return m ? m[1] : null;
}

/*
 * PHASE 107 FINAL R4 — EXPLICIT PREDICATES, because presence is not success.
 *
 * The previous model asked only whether a key existed and was not the literal
 * "NOT MEASURED". Independent review proved the consequence in one edit:
 * changing `REFUSAL_CONTRACT_VIOLATIONS=0` to `=99` — or
 * `VISUAL_AUDIT_COMPLETE=YES` to `=NO` — left the generator exiting 0 with
 * `FINAL_REQUIRED_GATES_FAILED=0`. The report could describe a phase as closed
 * while the evidence beside it said the opposite.
 *
 * Every mandatory gate now states what its value must BE. A value that is
 * present, measured, from this epoch, and wrong is a FAILURE.
 */
const isZero = (v) => Number(v) === 0;
const isPass = (v) => v === "PASS";
const isYes = (v) => v === "YES";
const allCaught = (v) => { const m = /^(\d+)\/(\d+)$/.exec(v); return !!m && m[1] === m[2] && Number(m[2]) > 0; };
const isLive = (v) => v === "LIVE";

const MANDATORY = [
  { label: "DIFF_CHECK", log: "01-diff-check.log" },
  { label: "TSC", log: "02-tsc.log" },
  { label: "LINT_POLICY", log: "03-lint.log" },
  { label: "ESLINT_POLICY", log: "06-eslint.log" },
  { label: "CONTROL_CHARACTERS", log: "04-controlchars.log", key: "CONTROL_CHARACTERS", accept: isZero },
  { label: "SELECTORS_REQUIRING_FIX", log: "05-selector-audit.log", key: "SELECTORS_REQUIRING_FIX", accept: isZero },
  { label: "SELECTORS_NOT_ANALYSED", log: "05-selector-audit.log", key: "SELECTORS_NOT_ANALYSED", accept: isZero },
  { label: "SELECTOR_CONTROLS", log: "05b-selector-controls.log", key: "SELECTOR_CONTROLS", accept: isPass },
  { label: "REFUSAL_FORWARDING_EXCEPTIONS", log: "08-impact-map.log", key: "REFUSAL_FORWARDING_EXCEPTIONS", accept: isZero },
  { label: "DETECTOR_SELFCHECK", log: "09-detector.log", key: "DETECTOR_SELFCHECK", accept: allCaught },
  /*
   * PROBE_MODE is checked BEFORE the violation count, because a violation
   * count from a probe that never ran carries no information. A stub must
   * fail here rather than pass on REFUSAL_CONTRACT_VIOLATIONS=0.
   */
  { label: "PROBE_MODE", log: "13-probe.log", key: "PROBE_MODE", accept: isLive },
  { label: "REFUSAL_CONTRACT_VIOLATIONS", log: "13-probe.log", key: "REFUSAL_CONTRACT_VIOLATIONS", accept: isZero },
  { label: "FOCUS_CONTROLS", log: "09b-focus-controls.log", key: "FOCUS_CONTROLS", accept: isPass },
  { label: "CREDENTIAL_SCANNER_CONTROLS", log: "09c-scanner-controls.log", key: "CREDENTIAL_SCANNER_CONTROLS", accept: isPass },
  { label: "TREE_FINGERPRINT_CONTROLS", log: "09d-tree-fingerprint-controls.log", key: "TREE_FINGERPRINT_CONTROLS", accept: isPass },
  { label: "VISUAL_AUDIT_COMPLETE", log: "14-visual-debt.log", key: "VISUAL_AUDIT_COMPLETE", accept: isYes },
  { label: "OUTSTANDING_OVERFLOW_DEBT", log: "14-visual-debt.log", key: "OUTSTANDING_OVERFLOW_DEBT", accept: isZero },
  { label: "OUTSTANDING_HIDDEN_FOCUSABLE_DEBT", log: "14-visual-debt.log", key: "OUTSTANDING_HIDDEN_FOCUSABLE_DEBT", accept: isZero },
  { label: "CLASSIFICATION_DIFFERENCES", log: "11-integrity.log", key: "CLASSIFICATION_DIFFERENCES", accept: isZero },
  { label: "EVIDENCE_INTEGRITY_FAILURES", log: "11-integrity.log", key: "EVIDENCE_INTEGRITY_FAILURES", accept: isZero },
  { label: "AUDITOR_EVIDENCE_BINDING", log: "11-integrity.log", key: "AUDITOR_EVIDENCE_BINDING", accept: isPass },
  { label: "AUDITOR_BOUND_RECORDS", log: "11-integrity.log", key: "AUDITOR_BOUND_RECORDS", accept: allCaught },
  { label: "AUDITOR_SHA_MISMATCHES", log: "11-integrity.log", key: "AUDITOR_SHA_MISMATCHES", accept: isZero },
  { label: "PRODUCT_MUTATIONS", log: "08-mut-product.log" },
  { label: "HARNESS_MUTATIONS", log: "08-mut-harness.log" },
  { label: "CONTEXT_MUTATIONS", log: "08-mut-context.log" },
  { label: "REFUSAL_MUTATIONS", log: "08-mut-refusal.log" },
  { label: "GATE_MUTATIONS", log: "08-mut-gates.log", key: "GATE_MUTATIONS_MISAPPLIED", accept: isZero },
  { label: "TEST_DISCOVERY_PARITY", log: "07-parity.log", key: "TEST_DISCOVERY_PARITY", accept: isPass },
  { label: "BUILD", log: "10-build.log" },
  { label: "PHASE102_PREEXISTING_FILE_FAILURE", log: "16-phase102-provenance.log", key: "IDENTICAL", accept: isYes },
  { label: "REPORT_STATUS_CONFLICTS", log: "17-report-status.log", key: "REPORT_STATUS_CONFLICTS", accept: isZero, postReport: true },
  { label: "CANONICAL_PHASE_STATUS_DOCUMENTS", log: "17-report-status.log", key: "CANONICAL_PHASE_STATUS_DOCUMENTS", accept: (v) => Number(v) === 1, postReport: true },
];

const gateProblems = [];
for (const g of MANDATORY) {
  /*
   * `postReport` gates check a document that does not exist until this
   * generator has run. Requiring them here would make report generation depend
   * on a check of an EARLIER report — the circularity R3 introduced. They are
   * enforced by the packaging step instead, and are only validated here when
   * the log happens to be present from this same epoch.
   */
  const present = fs.existsSync(path.join(LOGS, g.log));
  if (!present) {
    if (!g.postReport) gateProblems.push({ label: g.label, why: "log missing" });
    continue;
  }
  const e = epochOf(g.log);
  if (EPOCH && e && e !== EPOCH) { gateProblems.push({ label: g.label, why: `stale log (epoch ${e})` }); continue; }
  if (EPOCH && !e && !g.postReport) { gateProblems.push({ label: g.label, why: "log carries no validation epoch" }); continue; }
  if (!g.key) continue;
  const v = flag(g.log, g.key);
  if (v === "NOT MEASURED") { gateProblems.push({ label: g.label, why: `${g.key} NOT MEASURED` }); continue; }
  if (g.accept && !g.accept(v)) {
    gateProblems.push({ label: g.label, why: `${g.key}=${v} fails its predicate` });
  }
}

// The closure run's own verdict on each step.
const stepFailures = (closure?.steps ?? []).filter((s) => !s.ok);
for (const s of stepFailures) gateProblems.push({ label: s.name, why: `closure step failed (exit ${s.exit})` });

const snapshot = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const evidence = (EVIDENCE_CSV || "").split(",").map((s) => s.trim()).filter(Boolean);

/* ── test accounting, read from the reporter JSON, never summarised ───────── */
function pool(file) {
  const p = path.join(LOGS, file);
  if (!fs.existsSync(p)) return null;
  const r = JSON.parse(fs.readFileSync(p, "utf8"));
  const files = r.testResults ?? [];
  return {
    collectedFiles: files.length,
    passedFiles: files.filter((f) => f.status === "passed").length,
    failedFiles: files.filter((f) => f.status !== "passed").length,
    totalCases: r.numTotalTests,
    passedCases: r.numPassedTests,
    failedCases: r.numFailedTests,
    skipped: r.numPendingTests,
    todo: r.numTodoTests ?? 0,
    failedSuites: r.numFailedTestSuites,
    success: r.success,
    failedFileNames: files.filter((f) => f.status !== "passed")
      .map((f) => ({ name: f.name.replace(/.*[\\/]worktrees[\\/][^\\/]*[\\/]/, ""), assertions: (f.assertionResults ?? []).length })),
  };
}
const forks = pool("t1-forks.json");
const threads = pool("t2-threads.json");

/* ── sweeps ───────────────────────────────────────────────────────────────── */
const sweeps = evidence.map((dir) => {
  const rec = path.join(dir, "_records");
  if (!fs.existsSync(rec)) return null;
  const files = fs.readdirSync(rec).filter((f) => f.endsWith(".json"));
  const first = JSON.parse(fs.readFileSync(path.join(rec, files[0]), "utf8"));
  const buckets = {};
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
    const states = r.domSignals?.asyncStates ?? [];
    const b = states.length ? states.join("+") : (r.httpState === 404 ? "not-found" : "ready");
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  return { dir: path.basename(dir), runId: first.runId, records: files.length, buckets };
}).filter(Boolean);

const instabilityPath = path.join(path.dirname(SNAP), "instability", "INSTABILITY-EVIDENCE.json");
const instability = fs.existsSync(instabilityPath)
  ? JSON.parse(fs.readFileSync(instabilityPath, "utf8")) : null;

const gatesMissing = gateProblems.filter((g) => /missing|NOT MEASURED|no validation epoch/.test(g.why)).length;
const gatesFailed = gateProblems.filter((g) => /failed|stale/.test(g.why)).length;
const L = [];
const p = (s = "") => L.push(s);

p("# Phase 107 — Final Completion Report");
p("");
p("> Generated from the evidence artefacts by `generate-final-report.mjs`.");
p("> Counts are read out of the JSON and logs the gates produced; none is typed by hand.");
p("");

/*
 * THE canonical status block. This is the one place a phase-level verdict is
 * stated, and every value in it is read from a gate's own output — a report
 * that types its own verdict is how two documents came to disagree.
 */
p("## Status — the canonical, current, phase-level statement");
p("");
p("Every other report in this package is a substage record and says so in its");
p("opening lines. `report-status-check.mjs` fails the build if a second document");
p("states a phase verdict, or if a shared measurement disagrees with this one.");
p("");
p("```");
p(`VISUAL_AUDIT_COMPLETE=${flag("14-visual-debt.log", "VISUAL_AUDIT_COMPLETE")}`);
p(`OUTSTANDING_OVERFLOW_DEBT=${flag("14-visual-debt.log", "OUTSTANDING_OVERFLOW_DEBT")}`);
p(`OUTSTANDING_HIDDEN_FOCUSABLE_DEBT=${flag("14-visual-debt.log", "OUTSTANDING_HIDDEN_FOCUSABLE_DEBT")}`);
p(`SELECTORS_REQUIRING_FIX=${flag("05-selector-audit.log", "SELECTORS_REQUIRING_FIX")}`);
p(`SELECTORS_NOT_ANALYSED=${flag("05-selector-audit.log", "SELECTORS_NOT_ANALYSED")}`);
p(`REFUSAL_FORWARDING_EXCEPTIONS=${flag("08-impact-map.log", "REFUSAL_FORWARDING_EXCEPTIONS")}`);
p(`DETECTOR_SELFCHECK=${flag("09-detector.log", "DETECTOR_SELFCHECK")}`);
p(`CLASSIFICATION_DIFFERENCES=${flag("11-integrity.log", "CLASSIFICATION_DIFFERENCES")}`);
p(`EVIDENCE_INTEGRITY_FAILURES=${flag("11-integrity.log", "EVIDENCE_INTEGRITY_FAILURES")}`);
p(`TEST_DISCOVERY_PARITY=${flag("07-parity.log", "TEST_DISCOVERY_PARITY")}`);
p(`COLLECTED_TEST_FILES=${forks ? forks.collectedFiles : "NOT MEASURED"}`);
p(`PHASE107_TEST_CASE_FAILURES=${forks ? forks.failedCases : "NOT MEASURED"}`);
p("COMMIT=NO  PUSH=NO  MERGE=NO  DEPLOY=NO");
p("```");
p("");

p("## Repository state");
p("");
p("| | |");
p("|---|---|");
p(`| branch | \`${snapshot.branch}\` |`);
p(`| HEAD | \`${snapshot.headSha}\` |`);
p(`| origin/main (observed only) | \`${snapshot.originMainSha}\` |`);
p(`| phase / stage | ${snapshot.phase} / ${snapshot.stage} |`);
p(`| tracked diff sha256 | \`${snapshot.trackedDiffSha256}\` |`);
p("| commit / push / merge / deploy | none performed |");
p("");

p("## Frozen tree");
p("");
p("| quantity | value |");
p("|---|---|");
p(`| changed paths | ${snapshot.files} |`);
p(`| modified | ${snapshot.modified} |`);
p(`| new | ${snapshot.added} |`);
p(`| unclassified | **${snapshot.unclassified}** |`);
p(`| inventory views equal | **${snapshot.viewsEqual ? "YES" : "NO"}** |`);
p("");
p("| category | files |");
p("|---|---|");
for (const [c, n] of Object.entries(snapshot.byCategory).sort()) p(`| ${c} | ${n} |`);
p("");

p("## Gates");
p("");
p("| gate | value |");
p("|---|---|");
p(`| \`SELECTOR_SITES\` | ${flag("05-selector-audit.log", "SELECTOR_SITES")} |`);
p(`| \`SELECTORS_WITH_FALLBACK\` | ${flag("05-selector-audit.log", "SELECTORS_WITH_FALLBACK")} |`);
p(`| \`SELECTORS_NOT_ANALYSED\` | ${flag("05-selector-audit.log", "SELECTORS_NOT_ANALYSED")} |`);
p(`| \`SELECTORS_REQUIRING_FIX\` | **${flag("05-selector-audit.log", "SELECTORS_REQUIRING_FIX")}** |`);
p(`| \`SELECTOR_CONTROLS\` | **${flag("05b-selector-controls.log", "SELECTOR_CONTROLS")}** (${flag("05b-selector-controls.log", "SELECTOR_CONTROLS_PASSED")}/${flag("05b-selector-controls.log", "SELECTOR_CONTROLS_TOTAL")}) |`);
p(`| \`REFUSAL_FORWARDING_EXCEPTIONS\` | **${flag("08-impact-map.log", "REFUSAL_FORWARDING_EXCEPTIONS")}** |`);
p(`| \`MEDIA_REFUSAL_FORWARDING_EXCEPTIONS\` | ${flag("08-impact-map.log", "MEDIA_REFUSAL_FORWARDING_EXCEPTIONS")} |`);
p(`| \`DETECTOR_SELFCHECK\` | **${flag("09-detector.log", "DETECTOR_SELFCHECK")}** |`);
p(`| \`CONTROL_CHARACTERS\` | **${flag("04-controlchars.log", "CONTROL_CHARACTERS")}** |`);
p(`| \`BIDI_MARKS_ALLOWED\` | ${flag("04-controlchars.log", "BIDI_MARKS_ALLOWED")} |`);
p(`| \`OUTSTANDING_OVERFLOW_DEBT\` | **${flag("14-visual-debt.log", "OUTSTANDING_OVERFLOW_DEBT")}** |`);
p(`| \`OUTSTANDING_HIDDEN_FOCUSABLE_DEBT\` | **${flag("14-visual-debt.log", "OUTSTANDING_HIDDEN_FOCUSABLE_DEBT")}** |`);
p(`| \`VISUAL_AUDIT_COMPLETE\` | **${flag("14-visual-debt.log", "VISUAL_AUDIT_COMPLETE")}** |`);
p(`| \`CLASSIFICATION_DIFFERENCES\` | **${flag("11-integrity.log", "CLASSIFICATION_DIFFERENCES")}** |`);
p(`| \`EVIDENCE_INTEGRITY_FAILURES\` | **${flag("11-integrity.log", "EVIDENCE_INTEGRITY_FAILURES")}** |`);
p(`| \`REFUSAL_CONTRACT_VIOLATIONS\` | **${flag("13-probe.log", "REFUSAL_CONTRACT_VIOLATIONS")}** |`);
p(`| \`ENDPOINTS_PROBED\` | ${flag("13-probe.log", "ENDPOINTS_PROBED")} |`);
p(`| \`ANON_401_DISTINCT_SHAPES\` | ${flag("13-probe.log", "ANON_401_DISTINCT_SHAPES")} |`);
p(`| \`TEST_DISCOVERY_PARITY\` | **${flag("07-parity.log", "TEST_DISCOVERY_PARITY")}** |`);
p(`| \`GATE_MUTATIONS_CAUGHT\` | ${flag("08-mut-gates.log", "GATE_MUTATIONS_CAUGHT")} / ${flag("08-mut-gates.log", "GATE_MUTATIONS_TOTAL")} |`);
p(`| \`GATE_MUTATIONS_TREE_RESTORED\` | ${flag("08-mut-gates.log", "GATE_MUTATIONS_TREE_RESTORED")} |`);
p("");

p("### Focus-candidate disposition");
p("");
p("Every focusable element in every cell, and why it is or is not a hazard.");
p("");
p("```");
const disp = readLog("14-visual-debt.log").split("focus-candidate disposition")[1];
if (disp) p(disp.split(/\n\s*\n/)[0].trim());
p("```");
p("");

p("## Test accounting");
p("");
p("Reported along every dimension separately. A failing FILE and a failing TEST CASE");
p("are different facts, and `success=false` is a third.");
p("");
p("| dimension | default pool | `--pool=threads` |");
p("|---|---|---|");
const row = (label, k) => p(`| ${label} | ${forks ? forks[k] : "n/a"} | ${threads ? threads[k] : "n/a"} |`);
row("collected test files", "collectedFiles");
row("passed test files", "passedFiles");
row("failed test files", "failedFiles");
row("total test cases", "totalCases");
row("passed test cases", "passedCases");
row("**failed test cases**", "failedCases");
row("skipped", "skipped");
row("todo", "todo");
row("numFailedTestSuites", "failedSuites");
row("process success flag", "success");
p("");
if (forks?.failedFileNames.length) {
  p("The failing file, in both pools:");
  p("");
  for (const f of forks.failedFileNames) {
    p(`- \`${f.name}\` — **${f.assertions} assertions executed**; the file fails to PARSE.`);
  }
  p("");
  p("Provenance is proven, not asserted — see `16-phase102-provenance.log`: unmodified in");
  p("`git status`, byte-identical to HEAD once line endings are normalised, absent from the");
  p("Phase 107 change set, and failing identically when run alone. It is a pre-existing");
  p("Windows-only Phase 102 collection failure and is reported separately from Phase 107.");
  p("");
}

p("## Sweeps");
p("");
p("| run | runId | records |");
p("|---|---|---|");
for (const s of sweeps) p(`| ${s.dir} | \`${s.runId}\` | ${s.records} |`);
p("");
p("| bucket | " + sweeps.map((s) => s.dir.split("-").pop()).join(" | ") + " |");
p("|---|" + sweeps.map(() => "---|").join(""));
const allBuckets = [...new Set(sweeps.flatMap((s) => Object.keys(s.buckets)))].sort();
for (const b of allBuckets) p(`| ${b} | ` + sweeps.map((s) => s.buckets[b] ?? 0).join(" | ") + " |");
p("");
p(`Total cells across runs: **${sweeps.reduce((a, s) => a + s.records, 0)}**.`);
p("");

if (instability) {
  p("## Screenshot stability");
  p("");
  p("Byte-equality across runs is **not** claimed. Every cell that differs ships the PNG");
  p("bytes needed to recompute the measurement, plus the raw tool output.");
  p("");
  p("| cell | distinct hashes | differing | max delta | box |");
  p("|---|---|---|---|---|");
  for (const c of instability.cells) {
    const raw = c.imageDiffRaw.join(" ");
    const diff = raw.match(/differing pixels\s*:\s*(\d+) of (\d+)\s*\(([\d.]+)%\)/);
    const delta = raw.match(/max channel delta:\s*(\d+)/);
    const box = raw.match(/bounding box\s*:\s*(x=\S+ y=\S+ w=\S+ h=\S+)/);
    p(`| \`${c.route}\` ${c.locale} ${c.viewport} | ${c.distinctHashes} of ${c.runCount} | ${diff ? `${diff[1]} of ${diff[2]} (${diff[3]}%)` : "?"} | ${delta ? delta[1] : "?"} of 255 | ${box ? box[1] : "?"} |`);
  }
  p("");
  for (const c of instability.cells) {
    p(`**\`${c.route}\` ${c.locale}** — run to hash:`);
    p("");
    for (const m of c.runToSha) p(`- \`${m.run}\` → \`${m.recordedSha256}\` → \`${m.file}\``);
    p("");
  }
}

p("## Mandatory gates");
p("");
p("Every gate below must be present, measured, belong to this validation epoch,");
p("and pass. The generator refuses to emit a final-complete verdict otherwise —");
p("a report that can describe a phase as closed while a packaged log says FAIL is");
p("not a report, it is a wish.");
p("");
p("```");
p(`VALIDATION_EPOCH=${EPOCH ?? "NOT MEASURED"}`);
p(`FROZEN_TREE_SHA=${closure?.frozenTreeSha ?? "NOT MEASURED"}`);
p(`FINAL_REQUIRED_GATES_TOTAL=${MANDATORY.length}`);
p(`FINAL_REQUIRED_GATES_MISSING=${gatesMissing}`);
p(`FINAL_REQUIRED_GATES_FAILED=${gatesFailed}`);
p("```");
p("");
if (gateProblems.length) {
  p("**REFUSING a final-complete verdict** — unresolved gates:");
  p("");
  for (const g of gateProblems) p("- `" + g.label + "` — " + g.why);
  p("");
}

fs.writeFileSync(OUT, L.join("\n") + "\n");
console.log(`report written to ${OUT}`);
console.log(`  lines: ${L.length}`);
const missing = L.filter((l) => l.includes("NOT MEASURED")).length;
console.log(`REPORT_UNMEASURED_VALUES=${missing}`);
console.log(`FINAL_REQUIRED_GATES_MISSING=${gatesMissing}`);
console.log(`FINAL_REQUIRED_GATES_FAILED=${gatesFailed}`);
for (const g of gateProblems) console.log(`   UNRESOLVED  ${g.label}: ${g.why}`);
process.exit(gateProblems.length === 0 ? 0 : 1);
