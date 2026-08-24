/**
 * Phase 107 Stage 6-A.1 — the full classification breakdown for a final sweep.
 *
 * `verify-stage6a-evidence.mjs` answers the two questions Stage 6-A was opened
 * on (UNHANDLED_FETCH_FAILURE, STUCK_LOADING) and stays the authority for them.
 * This adds the rest of the requested breakdown — what each of the 168 cells
 * actually rendered — WITHOUT restating those two counters from a second,
 * possibly disagreeing definition. It reads them back from the verifier's own
 * output and prints both, so a divergence would be visible rather than averaged.
 *
 * Classification comes from the product's machine-readable `data-async-state`
 * and the session record, never from matching words in page text. A cell with
 * no declared state and HTTP 200 is READY; a cell with no declared state and
 * HTTP 404 is NOT_FOUND, which is a contract answer, not a failure.
 *
 * Usage: node docs/design/stage6a/final-sweep-report.mjs <evidenceDir> [verifierLog]
 */
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2];
const VERIFIER_LOG = process.argv[3];
if (!DIR) { console.error("usage: final-sweep-report.mjs <evidenceDir> [verifierLog]"); process.exit(2); }

const RECORDS = path.join(DIR, "_records");
const recs = fs.readdirSync(RECORDS)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS, f), "utf8")));

const has = (r, s) => (r.domSignals?.asyncStates || []).includes(s);
const anyOf = (r, list) => list.some((s) => has(r, s));

/*
 * One bucket per cell, decided in order. The order matters: a cell that declares
 * a refusal state is classified by that refusal even when it also answered 404,
 * because the refusal is the thing the reader sees.
 */
function classify(r) {
  if (has(r, "org-context-required")) return "ORG_CONTEXT_REQUIRED";
  if (has(r, "site-context-required")) return "SITE_CONTEXT_REQUIRED";
  if (anyOf(r, ["unauthenticated", "auth-required"])) return "AUTH_REQUIRED";
  if (anyOf(r, ["server-error", "connection-failed", "upstream-error"])) return "UPSTREAM_FAILURE_HANDLED";
  if (anyOf(r, ["degraded", "partial"])) return "DEGRADED_HANDLED";
  if (has(r, "not-found") || r.httpState === 404) return "NOT_FOUND";
  if (anyOf(r, ["loading"]) || r.domSignals?.looksLoading || r.domSignals?.ariaBusy) return "STUCK_LOADING";
  if (has(r, "empty")) return "EMPTY_DECLARED";
  return "READY";
}

const buckets = {};
for (const r of recs) {
  const b = classify(r);
  buckets[b] = (buckets[b] || 0) + 1;
}

/*
 * UNEXPLAINED_AUTH_REQUIRED — the defect this stage closed, measured the way
 * that made it visible in the first place: the SESSION decides, not the answer.
 * A cell holding a live admin session that is nonetheless told to authenticate
 * is unexplained. Letting the response decide would be circular, since a 401 to
 * a valid session IS the defect.
 */
const unexplainedAuth = recs.filter((r) =>
  r.sessionRole && (anyOf(r, ["unauthenticated", "auth-required"]) || /\/auth\/login/.test(r.finalUrl || "")));

const overflow = recs.filter((r) => (r.domSignals?.hOverflow || 0) > 0);
const hiddenFocusable = recs.filter((r) => (r.domSignals?.hiddenFocusable || 0) > 0);
const hiddenTotal = recs.reduce((a, r) => a + (r.domSignals?.hiddenFocusable || 0), 0);
const wrongLocation = recs.filter((r) => r.finalLocationCheck !== "EXACT_MATCH");
const withConsoleErrors = recs.filter((r) => (r.consoleErrors || []).length > 0);
const consoleTotal = recs.reduce((a, r) => a + (r.consoleErrors || []).length, 0);
const hydration = recs.filter((r) =>
  (r.consoleErrors || []).some((e) => /hydrat|#418|#423|#425/i.test(typeof e === "string" ? e : JSON.stringify(e))));
const incomplete = recs.filter((r) => r.status !== "COMPLETE");
const noShot = recs.filter((r) => !r.screenshotSha256);

console.log(`evidence: ${DIR}`);
console.log(`runId:    ${[...new Set(recs.map((r) => r.runId))].join(", ")}`);
console.log(`cells:    ${recs.length}`);
console.log("");
console.log("## classification (one bucket per cell)");
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(v).padStart(4)}  ${k}`);
}
console.log(`   ${String(Object.values(buckets).reduce((a, b) => a + b, 0)).padStart(4)}  TOTAL`);
console.log("");
console.log("## signals");
console.log(`   UNEXPLAINED_AUTH_REQUIRED = ${unexplainedAuth.length}`);
console.log(`   WRONG_FINAL_LOCATION      = ${wrongLocation.length}`);
console.log(`   OVERFLOW cells            = ${overflow.length}`);
for (const r of overflow) {
  console.log(`      ${r.route}  ${r.locale}  ${r.viewport}  ${r.domSignals.hOverflow}px`);
}
console.log(`   HIDDEN_FOCUSABLE cells    = ${hiddenFocusable.length}   (elements: ${hiddenTotal})`);
const byViewport = {};
for (const r of recs) {
  const v = r.viewport;
  byViewport[v] = (byViewport[v] || 0) + (r.domSignals?.hiddenFocusable || 0);
}
for (const [v, n] of Object.entries(byViewport)) console.log(`      ${v}: ${n}`);
console.log(`   cells with console errors = ${withConsoleErrors.length}   (messages: ${consoleTotal})`);
console.log(`   hydration errors          = ${hydration.length}`);
console.log(`   records not COMPLETE      = ${incomplete.length}`);
console.log(`   records without a hash    = ${noShot.length}`);

if (VERIFIER_LOG && fs.existsSync(VERIFIER_LOG)) {
  const log = fs.readFileSync(VERIFIER_LOG, "utf8");
  console.log("");
  console.log("## from verify-stage6a-evidence.mjs (the authority for these two)");
  for (const key of ["UNHANDLED_FETCH_FAILURE", "STUCK_LOADING", "UNATTRIBUTED_CELLS",
    "AUDIT_HARNESS_CONSOLE_ERRORS", "CAPTURE_INFRASTRUCTURE_FAILURES", "SESSION_LOSS", "WRONG_FINAL_LOCATION"]) {
    const m = log.match(new RegExp(`^${key}=(\\S+)`, "m"));
    console.log(`   ${key.padEnd(32)} ${m ? m[1] : "(not reported)"}`);
  }
  const wfl = log.match(/^WRONG_FINAL_LOCATION=(\d+)/m);
  if (wfl && Number(wfl[1]) !== wrongLocation.length) {
    console.log(`   DISAGREEMENT: verifier ${wfl[1]} vs this report ${wrongLocation.length}`);
    process.exitCode = 1;
  }
}

fs.writeFileSync(
  path.join(DIR, "STAGE6A1-CLASSIFICATION.json"),
  JSON.stringify({
    dir: DIR,
    runIds: [...new Set(recs.map((r) => r.runId))],
    cells: recs.length,
    buckets,
    unexplainedAuthRequired: unexplainedAuth.length,
    wrongFinalLocation: wrongLocation.length,
    overflow: overflow.map((r) => ({ route: r.route, locale: r.locale, viewport: r.viewport, px: r.domSignals.hOverflow })),
    hiddenFocusableCells: hiddenFocusable.length,
    hiddenFocusableElements: hiddenTotal,
    hiddenFocusableByViewport: byViewport,
    consoleErrorCells: withConsoleErrors.length,
    consoleErrorMessages: consoleTotal,
    hydrationErrors: hydration.length,
    perCell: Object.fromEntries(recs.map((r) => [r.cellId, classify(r)])),
  }, null, 2),
);
