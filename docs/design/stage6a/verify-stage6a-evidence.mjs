/**
 * Phase 107 Stage 6-A — the verifier for the decontaminated authenticated run.
 *
 * Reads the per-cell records the sweep wrote and derives the Stage 6-A counters
 * from them. Nothing here is judged by the presence of an error WORD: console
 * messages are attributed to their author, and page state is read from
 * accessibility roles, `aria-busy` and the product's own `data-async-state`.
 *
 * A cell is counted as UNHANDLED_FETCH_FAILURE only when the product's own
 * request failed AND the page exposes no state saying so. A cell is counted as
 * STUCK_LOADING only when the page is still structurally in a loading state
 * after the settle window.
 *
 * Usage: node docs/design/stage6a/verify-stage6a-evidence.mjs [evidenceDir]
 */
import fs from "node:fs";
import path from "node:path";
import { attributeConsoleError } from "../../../tools/audit/visual-evidence/contracts.mjs";

const DIR = process.argv[2] || "E:/hermes-os-phase107-stage6a-evidence";
const RECORDS = path.join(DIR, "_records");

const recs = fs.readdirSync(RECORDS)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(RECORDS, f), "utf8")));

const counters = {
  cells: recs.length,
  sessionLoss: 0,
  wrongFinalLocation: 0,
  harnessConsoleErrors: 0,
  captureInfrastructureFailures: 0,
  unhandledFetchFailure: 0,
  stuckLoading: 0,
  unattributed: 0,
};

const byOrigin = { AUDIT_HARNESS: 0, NETWORK: 0, BROWSER_INFRASTRUCTURE: 0, PRODUCT: 0 };
const detail = [];

for (const r of recs) {
  const d = r.domSignals || {};
  const origins = (r.consoleErrors || []).map((e) => ({ origin: attributeConsoleError(e), text: e }));
  for (const o of origins) byOrigin[o.origin]++;

  const harness = origins.filter((o) => o.origin === "AUDIT_HARNESS");
  const infra = origins.filter((o) => o.origin === "BROWSER_INFRASTRUCTURE");
  const failedRequests = origins.filter(
    (o) => o.origin === "NETWORK" && /status of (4\d\d|5\d\d)/.test(o.text),
  );

  counters.harnessConsoleErrors += harness.length;
  if (infra.length) counters.captureInfrastructureFailures++;
  if (r.accessState === "SESSION_LOST") counters.sessionLoss++;
  if (r.finalLocationCheck && !/^EXACT|^OK|^REDIRECT_ALLOWED/i.test(r.finalLocationCheck)) {
    counters.wrongFinalLocation++;
  }

  /* ── structural state, never words ─────────────────────────────────────── */
  const declared = d.asyncStates || [];          // data-async-state values on the page
  const loadingStructural = Boolean(d.ariaBusy) || Number(d.progressbars || 0) > 0
    || declared.includes("loading");
  /*
   * A document that itself returned 404 IS the not-found state. Next renders
   * its not-found page, and any request the browser made on the way there
   * failed for the same reason. Counting that as "a failure the page does not
   * show" would report the not-found page for failing to say it is a not-found
   * page.
   */
  const documentNotFound = r.httpState === 404;

  const failureStructural = documentNotFound
    || Number(d.alerts || 0) > 0
    || declared.some((s) => ["auth-required", "forbidden", "not-found", "server-error", "network-error"].includes(s));

  if (loadingStructural) {
    counters.stuckLoading++;
    detail.push({ kind: "STUCK_LOADING", route: r.route, locale: r.locale, viewport: r.viewport,
      evidence: `aria-busy=${Boolean(d.ariaBusy)} progressbar=${d.progressbars} data-async-state=${JSON.stringify(declared)}` });
  }

  if (failedRequests.length && !failureStructural) {
    counters.unhandledFetchFailure++;
    detail.push({ kind: "UNHANDLED_FETCH_FAILURE", route: r.route, locale: r.locale, viewport: r.viewport,
      evidence: `${failedRequests.length} failed request(s); alerts=${d.alerts} data-async-state=${JSON.stringify(declared)}` });
  }

  // A cell whose signals cannot decide anything at all.
  if (d.alerts === undefined && d.asyncStates === undefined) counters.unattributed++;
}

console.log(`evidence: ${DIR}`);
console.log(`cells:    ${counters.cells}\n`);
console.log("console errors by origin");
for (const [k, v] of Object.entries(byOrigin)) console.log(`  ${k.padEnd(24)} ${v}`);
console.log("");
if (detail.length) {
  console.log("cells needing a verdict:");
  for (const x of detail.slice(0, 40)) console.log(`  ${x.kind}  ${x.route}  ${x.locale}  ${x.viewport}\n      ${x.evidence}`);
  if (detail.length > 40) console.log(`  … and ${detail.length - 40} more`);
  console.log("");
}
console.log(`AUDIT_HARNESS_CONSOLE_ERRORS=${counters.harnessConsoleErrors}`);
console.log(`CAPTURE_INFRASTRUCTURE_FAILURES=${counters.captureInfrastructureFailures}`);
console.log(`SESSION_LOSS=${counters.sessionLoss}`);
console.log(`WRONG_FINAL_LOCATION=${counters.wrongFinalLocation}`);
console.log(`UNHANDLED_FETCH_FAILURE=${counters.unhandledFetchFailure}`);
console.log(`STUCK_LOADING=${counters.stuckLoading}`);
console.log(`UNATTRIBUTED_CELLS=${counters.unattributed}`);

fs.writeFileSync(
  path.join(DIR, "STAGE6A-VERIFIER-OUTPUT.txt"),
  JSON.stringify({ counters, byOrigin, detail }, null, 2),
);
