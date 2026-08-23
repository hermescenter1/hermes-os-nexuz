/**
 * Phase 107 FINAL — break each GATE and prove it notices.
 *
 * The other mutation proofs target product code and the tests that guard it.
 * The gates themselves — provenance, control characters, the selector audit,
 * the vocabulary — had never been attacked, and every one of them has a history
 * of being confidently wrong:
 *
 *   - a provenance literal went stale twice;
 *   - the selector audit certified the shipped defect twice, for two different
 *     reasons;
 *   - a control-character gate would have passed a regex that could never match;
 *   - the audit's own "run as script" guard silently stopped it running while it
 *     still exited 0.
 *
 * A gate nobody has broken is a gate nobody has tested.
 *
 * Each case states what the gate must do BEFORE the mutation and AFTER it, so a
 * gate that is meant to refuse (exit non-zero on a missing argument) is proven
 * the right way round rather than assumed to behave like the others. Every file
 * is restored from captured bytes and compared by SHA-256.
 *
 * Usage: node docs/design/stage6a/mutation-proof-gates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const MUT_OUT = path.join(os.tmpdir(), "phase107-gate-mutation");

/** Run a command; return its exit code. */
function run(cmd, args) {
  try {
    execFileSync(cmd, args, { encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

const node = (...args) => () => run("node", args);
const vitest = (file) => () => run("npx", ["vitest", "run", file, "--pool=threads"]);

const SETTINGS = "src/components/customer-portal/CustomerSettingsClient.tsx";
const VOCAB = "src/lib/auth/refusal-vocabulary.ts";
const FREEZE = "docs/design/stage6a/freeze-snapshot.mjs";
const SURFACES = "src/components/__tests__/stage6a-resource-failure-surfaces.test.tsx";
const PROBE = "tools/audit/visual-evidence/probe-expression.js";

const CASES = [
  {
    name: "1. selector audit — move the presence check AFTER the early return",
    why: "the exact shape that shipped as a false 'No Account Found'",
    file: SETTINGS,
    apply: (src, eol) => {
      const guard = `        if (!("preference" in d)) return undefined;` .split("\n").join(eol);
      const short = `        if (d.noAccount) return null;`.split("\n").join(eol);
      if (!src.includes(guard) || !src.includes(short)) return null;
      return src.replace(guard + eol, "").replace(short, short + eol + guard);
    },
    check: node("docs/design/stage6a/selector-audit.mjs"),
    before: "pass", after: "fail",
  },
  {
    name: "2. selector audit — prove a DIFFERENT field than the one consumed",
    why: "proving `envelope` must not license `d.preference ?? default`",
    file: SETTINGS,
    apply: (src, eol) => {
      const from = `if (!("preference" in d)) return undefined;`.split("\n").join(eol);
      const to = `if (!("envelope" in d)) return undefined;`.split("\n").join(eol);
      return src.includes(from) ? src.replace(from, to) : null;
    },
    check: node("docs/design/stage6a/selector-audit.mjs"),
    before: "pass", after: "fail",
  },
  {
    name: "3. control-character gate — insert a real U+0008 into a test",
    why: "exactly how `/\\bh-8\\b/` became a regex that could never match anything",
    file: SURFACES,
    // A literal backspace, inside a comment so nothing else changes meaning.
    apply: (src, eol) => src + eol + "// " + String.fromCharCode(8) + eol,
    check: node("docs/design/stage6a/control-char-gate.mjs"),
    before: "pass", after: "fail",
  },
  {
    name: "4. vocabulary drift — remove a code the OT routes actually emit",
    why: "the drift that happened: INTERNAL_FAILURE known to one side only",
    file: VOCAB,
    apply: (src, eol) => {
      const from = `  "INTERNAL_FAILURE",` + eol;
      return src.includes(from) ? src.replace(from, "") : null;
    },
    check: vitest("src/lib/auth/__tests__/refusal-vocabulary.test.ts"),
    before: "pass", after: "fail",
  },
  {
    name: "5. vocabulary — admit a human sentence as a machine code",
    why: "prose must never be promoted to something the UI branches on",
    file: VOCAB,
    apply: (src, eol) => {
      const from = `  "UNAUTHENTICATED",` + eol;
      return src.includes(from) ? src.replace(from, from + `  "AUTHENTICATION REQUIRED",` + eol) : null;
    },
    check: vitest("src/lib/auth/__tests__/refusal-vocabulary.test.ts"),
    before: "pass", after: "fail",
  },
  {
    name: "6. provenance — let a generator default its own stage again",
    why: "a hard-coded stage went stale twice; the pipeline must REFUSE, not substitute",
    file: FREEZE,
    apply: (src, eol) => {
      const from = `const STAGE = process.argv[4];`.split("\n").join(eol);
      const to = `const STAGE = process.argv[4] || "6-A.2";`.split("\n").join(eol);
      return src.includes(from) ? src.replace(from, to) : null;
    },
    /*
     * This gate is the RIGHT WAY ROUND from the others: invoked without a stage
     * it must FAIL (refuse). The mutation gives it a default, so it starts
     * succeeding — and a gate that stops refusing is the defect.
     */
    check: node(FREEZE, MUT_OUT, "107"),
    before: "fail", after: "pass",
  },
  {
    name: "7. focusability — restore `checkOpacity: true`",
    why: "an opacity-0 control is fully tabbable and invisible; checkOpacity files it as 'not rendered', which is how a real hazard reported zero",
    file: PROBE,
    apply: (src, eol) => {
      const from = `      ? el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })`;
      const to = `      ? el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })`;
      return src.includes(from) ? src.replace(from, to) : null;
    },
    check: node("docs/design/stage6a/focus-controls.mjs"),
    before: "pass", after: "fail",
  },
  {
    name: "8. focusability — special-case only the literal tabindex \"-1\"",
    why: "tabindex=\"-2\" is equally out of sequential navigation; one literal is not the rule",
    file: PROBE,
    apply: (src, eol) => {
      const from = `    const sequential = (typeof el.tabIndex === "number" && el.tabIndex >= 0) || el.isContentEditable === true;`;
      const to = `    const sequential = el.getAttribute("tabindex") !== "-1";`;
      return src.includes(from) ? src.replace(from, to) : null;
    },
    check: node("docs/design/stage6a/focus-controls.mjs"),
    before: "pass", after: "fail",
  },
  {
    name: "9. focusability — judge visibility on the viewport alone, ignoring clipping",
    why: "a control clipped by a 200px scroll strip is inside the viewport and invisible; ignoring ancestors excused it",
    file: PROBE,
    apply: (src, eol) => {
      const from = `    if (opaque && isVisibleToUser(el)) { focusBreakdown.visible++; continue; }`;
      const to = `    if (opaque && r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw) { focusBreakdown.visible++; continue; }`;
      return src.includes(from) ? src.replace(from, to) : null;
    },
    check: node("docs/design/stage6a/focus-controls.mjs"),
    before: "pass", after: "fail",
  },
];

let caught = 0;
let misapplied = 0;
const restoredAll = [];

for (const c of CASES) {
  const original = fs.readFileSync(c.file);
  const before = sha(c.file);
  const src = original.toString("utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";

  const mutated = c.apply(src, eol);
  if (mutated === null || mutated === src) {
    console.error(`  MISAPPLIED — anchor not found: ${c.name}`);
    misapplied++;
    continue;
  }

  const baseline = c.check();
  fs.writeFileSync(c.file, mutated);
  let after;
  try { after = c.check(); } finally { fs.writeFileSync(c.file, original); }

  const restored = sha(c.file) === before;
  restoredAll.push(restored);

  const baselineOk = c.before === "pass" ? baseline === 0 : baseline !== 0;
  const afterOk = c.after === "pass" ? after === 0 : after !== 0;
  const ok = baselineOk && afterOk;
  if (ok) caught++;

  console.log(`  ${ok ? "CAUGHT " : "MISSED "} ${c.name}`);
  console.log(`           ${c.why}`);
  console.log(`           exit ${baseline} (want ${c.before}) -> ${after} (want ${c.after})   restored=${restored}`);
  if (!restored) { console.error("  RESTORE FAILED — stopping"); process.exit(1); }
}

console.log("");
console.log(`GATE_MUTATIONS_TOTAL=${CASES.length}`);
console.log(`GATE_MUTATIONS_CAUGHT=${caught}`);
console.log(`GATE_MUTATIONS_MISAPPLIED=${misapplied}`);
console.log(`GATE_MUTATIONS_TREE_RESTORED=${restoredAll.every(Boolean) ? "YES" : "NO"}`);
process.exit(caught === CASES.length && misapplied === 0 ? 0 : 1);
