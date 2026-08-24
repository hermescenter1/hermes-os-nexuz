/**
 * Phase 107 FINAL R4 — attack the FINAL REPORT GENERATOR's gate enforcement.
 *
 * The generator claimed every mandatory gate had to be "present, measured and
 * passing". Its implementation checked only the first two. Independent review
 * demonstrated the consequence with a single edit: changing
 * `REFUSAL_CONTRACT_VIOLATIONS=0` to `=99` in a validation log left the
 * generator exiting 0 and printing `FINAL_REQUIRED_GATES_FAILED=0`. Same for
 * `VISUAL_AUDIT_COMPLETE=NO`. A report that cannot notice its own evidence
 * saying FAIL is not a gate.
 *
 * Each case below corrupts ONE value in a COPY of the validation logs and
 * requires the generator to exit non-zero. The originals are never touched: the
 * whole log directory is copied into a temporary location first, and the
 * generator is pointed at the copy.
 *
 * Usage: node docs/design/stage6a/report-gate-mutations.mjs <snapshot.json> <logDir> <evidenceCsv>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [SNAP, LOGS, EVIDENCE] = process.argv.slice(2);
if (!SNAP || !LOGS || !EVIDENCE) {
  console.error("usage: report-gate-mutations.mjs <snapshot.json> <logDir> <evidenceCsv>");
  process.exit(2);
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "phase107-reportmut-"));

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
};

/** Run the generator against a log directory; return its exit code. */
function generate(logDir, out) {
  try {
    execFileSync("node", [path.join(HERE, "generate-final-report.mjs"), SNAP, logDir, EVIDENCE, out],
      { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
    return 0;
  } catch (e) { return e.status ?? 1; }
}

const CASES = [
  { name: "1. VISUAL_AUDIT_COMPLETE=YES -> NO", log: "14-visual-debt.log",
    from: "VISUAL_AUDIT_COMPLETE=YES", to: "VISUAL_AUDIT_COMPLETE=NO",
    why: "the phase verdict itself; the old model accepted any non-empty value" },

  { name: "2. REFUSAL_CONTRACT_VIOLATIONS=0 -> 1", log: "13-probe.log",
    from: "REFUSAL_CONTRACT_VIOLATIONS=0", to: "REFUSAL_CONTRACT_VIOLATIONS=1",
    why: "the exact false-pass independent review demonstrated" },

  { name: "3. SELECTORS_REQUIRING_FIX=0 -> 1", log: "05-selector-audit.log",
    from: "SELECTORS_REQUIRING_FIX=0", to: "SELECTORS_REQUIRING_FIX=1",
    why: "an unfixed malformed-2xx selector must stop the report" },

  { name: "4. EVIDENCE_INTEGRITY_FAILURES=0 -> 1", log: "11-integrity.log",
    from: "EVIDENCE_INTEGRITY_FAILURES=0", to: "EVIDENCE_INTEGRITY_FAILURES=1",
    why: "corrupted or disagreeing evidence must not be reported as closed" },

  { name: "5. SELECTOR_CONTROLS=PASS -> FAIL", log: "05b-selector-controls.log",
    from: "SELECTOR_CONTROLS=PASS", to: "SELECTOR_CONTROLS=FAIL",
    why: "a detector whose own controls fail proves nothing about the tree" },

  { name: "6. AUDITOR_EVIDENCE_BINDING=PASS -> FAIL", log: "11-integrity.log",
    from: "AUDITOR_EVIDENCE_BINDING=PASS", to: "AUDITOR_EVIDENCE_BINDING=FAIL",
    why: "visual evidence not bound to the shipped auditor cannot certify it" },
];

/* Baseline: the untouched logs must produce a report, or nothing below means anything. */
const baseDir = path.join(ROOT, "baseline-logs");
copyDir(LOGS, baseDir);
const baseline = generate(baseDir, path.join(ROOT, "baseline.md"));
console.log(`baseline generator exit: ${baseline}`);
if (baseline !== 0) {
  console.error("the generator does not succeed on the real logs — fix that before attacking it");
  fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(1);
}

let caught = 0;
let misapplied = 0;
for (const c of CASES) {
  const key = c.name.split(".")[0];
  const dir = path.join(ROOT, `m${key}`);
  copyDir(LOGS, dir);

  const target = path.join(dir, c.log);
  const before = fs.readFileSync(target, "utf8");
  if (!before.includes(c.from)) {
    console.error(`  MISAPPLIED ${c.name}: "${c.from}" not present in ${c.log}`);
    misapplied++;
    continue;
  }
  const after = before.split(c.from).join(c.to);
  fs.writeFileSync(target, after);

  // Prove the corruption is really in the bytes the generator will read.
  if (!fs.readFileSync(target, "utf8").includes(c.to)) {
    console.error(`  MISAPPLIED ${c.name}: the mutated value is not in the staged log`);
    misapplied++;
    continue;
  }

  const code = generate(dir, path.join(ROOT, `m${key}.md`));
  const ok = code !== 0;
  if (ok) caught++;
  console.log(`  ${ok ? "CAUGHT " : "MISSED "} ${c.name}`);
  console.log(`           ${c.why}`);
  console.log(`           generator exit: ${code}`);
}

fs.rmSync(ROOT, { recursive: true, force: true });

console.log("");
console.log(`FINAL_REPORT_GATE_MUTATIONS_TOTAL=${CASES.length}`);
console.log(`FINAL_REPORT_GATE_MUTATIONS_CAUGHT=${caught}`);
console.log(`FINAL_REPORT_GATE_MUTATIONS_MISAPPLIED=${misapplied}`);
console.log(`FINAL_REPORT_GATE_CONTROLS=${caught === CASES.length && misapplied === 0 ? "PASS" : "FAIL"}`);
process.exit(caught === CASES.length && misapplied === 0 ? 0 : 1);
