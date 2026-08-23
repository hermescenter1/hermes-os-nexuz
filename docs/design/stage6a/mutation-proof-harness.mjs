/**
 * Phase 107 Stage 6-A — prove the AUDIT side catches its own failures.
 *
 * `mutation-proof.mjs` covers the product: reintroduce a swallowed error, a
 * frozen spinner, a conflated status, and the tests go red. This covers the
 * other half — the tooling that decides whether the product is telling the
 * truth. A detector that cannot fail is not a detector.
 *
 * Every mutation here restates something that actually went wrong: the `hide()`
 * script that suppressed the dev overlay and crashed on every page, the English
 * word-search that reported 27 healthy OT cells as defects, the route whitelist
 * that would have hidden them instead, and the evidence-integrity rules whose
 * absence once left 764 images backed by 146 records.
 *
 * Every mutation is reverted from bytes captured beforehand and the SHA-256 is
 * compared, so a failed run cannot leave a change behind.
 *
 * Usage: node docs/design/stage6a/mutation-proof-harness.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const CONTRACTS = "tools/audit/visual-evidence/contracts.mjs";
const PROBE = "tools/audit/visual-evidence/probe-expression.js";
const SWEEP = "tools/audit/visual-evidence/sweep.mjs";
const VERIFIER = "docs/design/stage6a/verify-stage6a-evidence.mjs";
const NOTICE = "src/components/ui/ResourceFailureNotice.tsx";
const ASYNC = "src/lib/client/async-state.ts";
const OT = "src/components/ot-edge-operations/OtStates.tsx";

const RESOURCE_HOOK = "src/lib/client/use-resource.ts";
const RECORD_STORE = "tools/audit/visual-evidence/record-store.mjs";

/**
 * Every file a mutation touches. A file missing from this list would be
 * restored but never hash-checked, and the run would abort claiming it was not
 * reverted — which is exactly what happened the first time this script ran.
 */
const TRACKED = [CONTRACTS, PROBE, SWEEP, VERIFIER, NOTICE, ASYNC, OT, RESOURCE_HOOK, RECORD_STORE];

const HARNESS_SUITE = ["tools/audit/visual-evidence/__tests__/visual-evidence-harness.test.ts"];
const STATE_SUITE = ["src/lib/client/__tests__/async-state.test.ts"];

/** A check that runs a command and reports whether it PASSED. */
const runs = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: "pipe", shell: process.platform === "win32" });
    return true;
  } catch { return false; }
};
const vitest = (files) => runs("npx", ["vitest", "run", ...files, "--pool=threads"]);
const fixture = (env = {}) => {
  try {
    execFileSync("node", ["tools/audit/visual-evidence/fixture-noncontamination.mjs"], {
      stdio: "pipe", shell: process.platform === "win32", env: { ...process.env, ...env },
    });
    return true;
  } catch { return false; }
};

const MUTATIONS = [
  /* ── 1–3: the harness must not touch the page ──────────────────────────── */
  {
    name: "1. restore the hide() script that contaminated Stage 5",
    why: "it suppressed the dev error overlay in all 792 captures and threw on every page",
    file: SWEEP,
    from: "const who = await login();",
    to: 'await S("Page.addScriptToEvaluateOnNewDocument", { source: "const hide=()=>{const s=document.createElement(\'style\');s.textContent=\'nextjs-portal{display:none}\';document.head.appendChild(s)};hide();" });\nconst who = await login();',
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "2. mutate the DOM through CDP during capture",
    why: "an audit tool that edits the page is photographing its own composition",
    file: SWEEP,
    from: "const { data } = await S(\"Page.captureScreenshot\"",
    to: "await S(\"Runtime.evaluate\", { expression: \"document.body.removeChild(document.body.firstChild)\" });\n    const { data } = await S(\"Page.captureScreenshot\"",
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "3. inject CSS before photographing",
    why: "the exact mechanism that hid the overlay, in its most direct form",
    file: SWEEP,
    from: "async function dismissConsent() {",
    to: "async function injectCss() { await S(\"Runtime.evaluate\", { expression: \"document.styleSheets[0].insertRule('*{opacity:1}')\" }); }\nasync function dismissConsent() {",
    check: () => vitest(HARNESS_SUITE),
  },

  /* ── 4: the tool's own noise must never be counted as the product's ────── */
  {
    name: "4. accept a harness console error as the product's",
    why: "35 of 36 unattributed cells carried the tool's own exception; counting it made the tool the defect",
    file: CONTRACTS,
    from: 'if (/<anonymous>|__s5\\b|Runtime\\.evaluate/.test(m)) return "AUDIT_HARNESS";',
    to: 'if (false) return "AUDIT_HARNESS";',
    check: () => vitest(HARNESS_SUITE),
  },

  /* ── 5–7: the detector must not guess from words or route names ────────── */
  {
    name: "5. decide page state from English words again",
    why: "\"Sign-in required\" matches no error word, so 27 correct OT cells were reported as failures",
    file: VERIFIER,
    from: "  const failureStructural = documentNotFound",
    to: "  const failureStructural = /error|failed/i.test(String(d.text || '')) || documentNotFound",
    check: () => detectorRejectsWordSearch(),
  },
  {
    name: "6. whitelist the OT routes instead of proving them",
    why: "hiding a route is not the same as showing it behaves",
    file: VERIFIER,
    from: "  if (failedRequests.length && !failureStructural) {",
    to: "  if (failedRequests.length && !failureStructural && !/^\\/dashboard\\/ot\\//.test(r.route)) {",
    check: () => detectorRejectsRouteWhitelist(),
  },
  {
    name: "7. turn every unknown into explained",
    why: "an unknown recorded as understood is worse than an unknown",
    file: VERIFIER,
    from: "  if (d.alerts === undefined && d.asyncStates === undefined) counters.unattributed++;",
    to: "  void d;",
    check: () => detectorRejectsBlanketExplained(),
  },

  /* ── 8–11: states a reader acts on differently must stay apart ─────────── */
  {
    name: "8. conflate auth-required with a missing site context",
    why: "\"sign in again\" cannot fix a request that needs a site selected",
    file: ASYNC,
    from: '  FORBIDDEN: "forbidden",',
    to: '  FORBIDDEN: "auth-required",',
    check: () => vitest(STATE_SUITE),
  },
  {
    name: "9. report a forbidden request as unauthenticated",
    why: "it sends an authorised user to a login form that will not help them",
    file: NOTICE,
    from: '  FORBIDDEN:       { title: "forbiddenTitle",       hint: "forbiddenHint" },',
    to: '  FORBIDDEN:       { title: "unauthenticatedTitle", hint: "unauthenticatedHint" },',
    check: () => vitest(["src/components/__tests__/stage6a-resource-failure-surfaces.test.tsx"]),
  },
  {
    name: "10. render a server error as empty",
    why: "the original defect: a failure shown as \"you have no records\"",
    file: ASYNC,
    from: '  FAILED: "server-error",',
    to: '  FAILED: "empty",',
    check: () => vitest(STATE_SUITE),
  },
  {
    name: "11. leave the spinner running on failure",
    why: "the 26 STUCK_LOADING cells",
    file: RESOURCE_HOOK,
    from: '        setStatus("ERROR");',
    to: '        setStatus("LOADING");',
    check: () => vitest(["src/lib/client/__tests__/use-resource.test.tsx"]),
  },

  /* ── 12–18: evidence integrity ─────────────────────────────────────────── */
  {
    name: "12. drop the probe's structural signals",
    why: "without them the detector is back to reading words",
    file: PROBE,
    from: "    alerts: qa(\"[role=alert]\").filter(visible).length,",
    to: "    alerts: 0,",
    check: () => probeStillReportsStructure(),
  },
  {
    name: "13. accept a wrong final location",
    why: "four Stage 5 cells photographed the PREVIOUS route",
    file: CONTRACTS,
    from: "export function checkFinalLocation(cell, landed) {",
    to: "export function checkFinalLocation(cell, landed) {\n  if (landed) return { ok: true, reason: 'OK' };",
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "14. accept a record with no screenshot",
    why: "a pack of 764 images backed by 146 records once looked complete",
    file: RECORD_STORE,
    from: "  if (!fs.existsSync(pngPath))",
    to: "  if (false)",
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "15. accept a screenshot whose hash does not match its record",
    why: "an unverified pairing is not evidence",
    file: RECORD_STORE,
    from: "sha256(fs.readFileSync(pngPath)) !== rec.screenshotSha256",
    to: "false",
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "16. exit successfully after a failed capture",
    why: "a green run that captured nothing is the most expensive kind of lie",
    file: CONTRACTS,
    from: "export function captureExitCode(failed) {",
    to: "export function captureExitCode(failed) {\n  return EXIT.OK; // eslint-disable-line",
    check: () => vitest(HARNESS_SUITE),
  },
  {
    name: "17. let the OT failure state stop declaring itself",
    why: "then the detector is blind again to the 27 cells it misreported",
    file: OT,
    from: '    <div data-async-state={asyncStateForFailure(code)} style={{ display: "contents" }}>',
    to: '    <div style={{ display: "contents" }}>',
    check: () => otDeclaresItsState(),
  },
  {
    name: "18. make the async-state attribute leak the failure detail",
    why: "the attribute must say WHICH state, never anything about who or where",
    file: ASYNC,
    from: '  return BY_CODE[code] ?? "server-error";',
    to: '  return (BY_CODE[code] ?? "server-error") + "-" + code.toLowerCase();',
    check: () => vitest(STATE_SUITE),
  },
];

/* ── checks that assert a property directly rather than via a test file ───── */

async function detectorRejectsWordSearch() {
  const src = fs.readFileSync(VERIFIER, "utf8");
  // The verifier must not decide state from page text.
  return !/\/error\|failed\/i\.test\(String\(d\.text/.test(src);
}
async function detectorRejectsRouteWhitelist() {
  const src = fs.readFileSync(VERIFIER, "utf8");
  return !/dashboard\\\/ot/.test(src);
}
async function detectorRejectsBlanketExplained() {
  const src = fs.readFileSync(VERIFIER, "utf8");
  return /counters\.unattributed\+\+/.test(src);
}
async function probeStillReportsStructure() {
  const src = fs.readFileSync(PROBE, "utf8");
  return /alerts: qa\("\[role=alert\]"\)/.test(src);
}
async function otDeclaresItsState() {
  const src = fs.readFileSync(OT, "utf8");
  return /data-async-state=\{asyncStateForFailure\(code\)\}/.test(src);
}

/* ── runner ───────────────────────────────────────────────────────────────── */
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

console.log("baseline");
const baseline = Object.fromEntries(TRACKED.map((f) => [f, sha(f)]));
if (!vitest([...HARNESS_SUITE, ...STATE_SUITE])) {
  console.error("  the harness/state suites are RED before any mutation — fix that first");
  process.exit(1);
}
if (!fixture()) { console.error("  the non-contamination fixture is RED before any mutation"); process.exit(1); }
console.log("  suites GREEN and the page is untouched, nothing mutated\n");

let holes = 0;
for (const m of MUTATIONS) {
  const before = fs.readFileSync(m.file);
  const src = before.toString("utf8");
  const occurrences = src.split(m.from).length - 1;
  if (occurrences !== 1) {
    console.error(`MISAPPLIED  ${m.name} — anchor matched ${occurrences}× in ${m.file}`);
    holes++;
    continue;
  }

  fs.writeFileSync(m.file, src.replace(m.from, m.to));
  let caught;
  try { caught = !(await m.check()); }
  finally { fs.writeFileSync(m.file, before); }

  if (sha(m.file) !== baseline[m.file]) {
    console.error(`NOT REVERTED  ${m.file} — refusing to continue`);
    process.exit(1);
  }

  console.log(`${caught ? "CAUGHT     " : "NOT CAUGHT "} ${m.name}`);
  console.log(`             ${m.why}`);
  if (!caught) holes++;
}

console.log("");
let identical = 0;
for (const f of TRACKED) {
  const same = sha(f) === baseline[f];
  if (same) identical++;
  console.log(`  ${same ? "IDENTICAL" : "CHANGED  "}  ${f}`);
}
console.log(`\nfiles restored byte-identical: ${identical}/${TRACKED.length}`);
console.log(`${MUTATIONS.length - holes}/${MUTATIONS.length} mutations caught`);

// The baseline must still be green once everything is back.
const finalGreen = vitest([...HARNESS_SUITE, ...STATE_SUITE]) && fixture();
console.log(`baseline after all mutations: ${finalGreen ? "GREEN" : "RED"}`);
process.exit(holes === 0 && identical === TRACKED.length && finalGreen ? 0 : 1);
