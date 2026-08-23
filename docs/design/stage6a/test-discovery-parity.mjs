/**
 * Phase 107 Stage 6-A.1 — test-discovery parity between the two Vitest pools.
 *
 * A green run is not proof that the suite ran. Vitest can drop files silently:
 * a file whose environment fails to start, or whose worker dies, can leave the
 * totals looking healthy while the assertions inside it were never executed.
 * The earlier runs in this stage reported 437 collected files once and 427
 * passed later, and the difference was never reconciled — so the file the
 * reviewer cares about might simply not have run.
 *
 * This compares the DISCOVERY MANIFESTS of two runs rather than their totals:
 * every file either pool collected must appear in the other, and every suite
 * this stage depends on must appear in both. A file present in one and missing
 * from the other is named, not averaged away.
 *
 * Usage:
 *   node docs/design/stage6a/test-discovery-parity.mjs <a.json> <b.json> [labelA] [labelB]
 */
import fs from "node:fs";
import path from "node:path";

const [fileA, fileB, labelA = "run A", labelB = "run B"] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error("usage: test-discovery-parity.mjs <a.json> <b.json> [labelA] [labelB]");
  process.exit(2);
}

/** The suites this stage's claims rest on. Absence from either pool is a FAIL. */
const REQUIRED = [
  "context-refusal-semantics.test.ts",
  "ot-context-semantics.test.ts",
  "ot-context-states.test.tsx",
  "stage6a-resource-failure-surfaces.test.tsx",
  "use-resource.test.tsx",
  "async-state.test.ts",
  "resource-request.test.ts",
  "media-assets-collection.test.ts",
  "phase103-voice-guard-chain.test.ts",
  "phase103-voice-security-contract.test.ts",
  "visual-evidence-harness.test.ts",
  // Stage 6-A.2
  "stage6a2-malformed-success.test.tsx",
  "phase103-voice-guard-recognition.test.ts",
];

const norm = (p) => p.split(path.sep).join("/").replace(/^.*?\/(src|tools|scripts|prisma|docs)\//, "$1/");

function read(file, label) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const files = (j.testResults ?? []).map((r) => ({
    name: norm(r.name),
    status: r.status,
    tests: (r.assertionResults ?? []).length,
    passed: (r.assertionResults ?? []).filter((a) => a.status === "passed").length,
    failed: (r.assertionResults ?? []).filter((a) => a.status === "failed").length,
    skipped: (r.assertionResults ?? []).filter((a) => a.status === "pending" || a.status === "skipped").length,
    todo: (r.assertionResults ?? []).filter((a) => a.status === "todo").length,
  }));
  const sum = (k) => files.reduce((a, f) => a + f[k], 0);
  return {
    label,
    collectedFiles: files.length,
    passedFiles: files.filter((f) => f.status === "passed").length,
    failedFiles: files.filter((f) => f.status === "failed").length,
    totalTests: sum("tests"),
    passed: sum("passed"),
    failed: sum("failed"),
    skipped: sum("skipped"),
    todo: sum("todo"),
    // Vitest's own totals, kept separate so a disagreement with the per-file
    // sum is visible rather than hidden by recomputing.
    reported: {
      total: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests,
      pending: j.numPendingTests, todo: j.numTodoTests,
    },
    files,
    names: new Set(files.map((f) => f.name)),
  };
}

const A = read(fileA, labelA);
const B = read(fileB, labelB);

for (const r of [A, B]) {
  console.log(`## ${r.label}`);
  console.log(`   collected files : ${r.collectedFiles}`);
  console.log(`   passed files    : ${r.passedFiles}`);
  console.log(`   failed files    : ${r.failedFiles}`);
  console.log(`   total tests     : ${r.totalTests}   (vitest reported ${r.reported.total})`);
  console.log(`   passed          : ${r.passed}   (vitest reported ${r.reported.passed})`);
  console.log(`   failed          : ${r.failed}   (vitest reported ${r.reported.failed})`);
  console.log(`   skipped         : ${r.skipped}   (vitest reported ${r.reported.pending})`);
  console.log(`   todo            : ${r.todo}   (vitest reported ${r.reported.todo})`);
  console.log("");
}

const onlyA = [...A.names].filter((n) => !B.names.has(n)).sort();
const onlyB = [...B.names].filter((n) => !A.names.has(n)).sort();

console.log(`## discovery difference`);
console.log(`   only in ${A.label}: ${onlyA.length}`);
for (const n of onlyA) console.log(`      ${n}`);
console.log(`   only in ${B.label}: ${onlyB.length}`);
for (const n of onlyB) console.log(`      ${n}`);
console.log("");

const missingRequired = [];
for (const need of REQUIRED) {
  const inA = [...A.names].some((n) => n.endsWith(need));
  const inB = [...B.names].some((n) => n.endsWith(need));
  if (!inA || !inB) missingRequired.push({ need, inA, inB });
}
console.log(`## required suites (${REQUIRED.length})`);
if (missingRequired.length === 0) {
  console.log("   all present in BOTH manifests");
} else {
  for (const m of missingRequired) console.log(`   MISSING  ${m.need}  ${A.label}=${m.inA} ${B.label}=${m.inB}`);
}
console.log("");

/* Per-file test-count differences: a file present in both but running fewer
 * tests in one pool is the same class of silent loss, one level down. */
const countDiffs = [];
for (const f of A.files) {
  const g = B.files.find((x) => x.name === f.name);
  if (g && g.tests !== f.tests) countDiffs.push({ name: f.name, a: f.tests, b: g.tests });
}
console.log(`## per-file test-count differences: ${countDiffs.length}`);
for (const d of countDiffs) console.log(`   ${d.name}  ${A.label}=${d.a}  ${B.label}=${d.b}`);
console.log("");

const parity = onlyA.length === 0 && onlyB.length === 0
  && missingRequired.length === 0 && countDiffs.length === 0;

console.log(`DISCOVERY_ONLY_IN_${A.label.toUpperCase().replace(/\W+/g, "_")}=${onlyA.length}`);
console.log(`DISCOVERY_ONLY_IN_${B.label.toUpperCase().replace(/\W+/g, "_")}=${onlyB.length}`);
console.log(`REQUIRED_SUITES_MISSING=${missingRequired.length}`);
console.log(`PER_FILE_COUNT_DIFFERENCES=${countDiffs.length}`);
console.log(`TEST_DISCOVERY_PARITY=${parity ? "PASS" : "FAIL"}`);

/*
 * PHASE 107 FINAL R4 - a validation OUTPUT must not land inside the tree the
 * validation is measuring.
 *
 * Writing this artifact into docs/design/stage6a/ changed the worktree DURING
 * the validation epoch. The old tree hash (git status + git diff) never noticed,
 * because for an UNTRACKED file it bound only the NAME. The content-bound
 * fingerprint saw it immediately and refused the run: PRE_POST_TREE_SHA_MATCH=NO.
 *
 * The closure passes --artifact-dir pointing at its log directory, outside the
 * repository. The in-repo default survives only for a standalone invocation, and
 * it is not a loophole: if the closure ever stops passing the flag, the PRE/POST
 * binding fails closed exactly as it did here.
 */
const ARTIFACT_DIR = (() => {
  const i = process.argv.indexOf("--artifact-dir");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "docs/design/stage6a";
})();
fs.writeFileSync(
  path.join(ARTIFACT_DIR, "test-discovery-parity.json"),
  JSON.stringify({
    runs: [A, B].map(({ names, ...r }) => r),
    onlyA, onlyB, missingRequired, countDiffs, parity,
  }, null, 2),
);
process.exit(parity ? 0 : 1);
