/**
 * Phase 107 Stage 6-A — what each of the 36 unattributed cells actually was.
 *
 * "Unattributed" was never a verdict; it meant the root-cause inventory could
 * not find a client fetch behind the route. Each cell is now placed in exactly
 * one of three buckets, from the recorded HTTP facts and from console errors
 * attributed to their author — never from the presence of an error word on the
 * page, and never by whitelisting a route.
 *
 *   PRODUCT_RESPONSE                 the server answered the product's own
 *                                    request with a failure the UI must show
 *   EXPECTED_NOT_FOUND_OR_BAD_FIXTURE  the sweep asked for something that does
 *                                    not exist; a correct 404 is not a defect
 *   CAPTURE_INFRASTRUCTURE_NOISE     the browser, the network or the audit tool
 *                                    failed — never the product
 *
 * An error the audit tool produced is never a product finding. That rule is the
 * whole reason this file exists: 35 of these 36 cells carried the tool's own
 * `hide()` exception.
 *
 * Usage: node docs/design/stage6a/classify-unattributed.mjs
 */
import fs from "node:fs";
import { attributeConsoleError } from "../../../tools/audit/visual-evidence/contracts.mjs";

const EVIDENCE = process.argv[2] || "E:/hermes-os-phase107-stage5-evidence/AUTH-EVIDENCE-MANIFEST.json";

const cells = JSON.parse(fs.readFileSync("docs/design/stage6a/unattributed-cells.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync(EVIDENCE, "utf8")).manifest;
const key = (c) => `${c.route}|${c.locale}|${c.viewport}`;
const byKey = new Map(manifest.map((c) => [key(c), c]));

const rows = [];
for (const cell of cells) {
  const m = byKey.get(key(cell));
  if (!m) { rows.push({ ...cell, classification: "UNRESOLVED", reason: "no manifest record" }); continue; }

  const attributed = (m.consoleErrors || []).map((e) => ({ origin: attributeConsoleError(e), text: e }));
  const product = attributed.filter((a) => a.origin === "PRODUCT");
  const network = attributed.filter((a) => a.origin === "NETWORK");
  const infra = attributed.filter((a) => a.origin === "BROWSER_INFRASTRUCTURE");
  const harness = attributed.filter((a) => a.origin === "AUDIT_HARNESS");

  let classification, reason;

  if (cell.kind === "STUCK_LOADING") {
    /*
     * A loading state is a DOM observation, not a console one, so it cannot be
     * classified from console errors. `looksLoading` was a text heuristic: on
     * /crm it fired for en and fa and NOT for de, at the same viewport, on the
     * same code path — which is a timing race in the capture, not a locale-
     * specific defect. The owning component (CrmCommandClient) checks
     * `res.ok`, has an `unavailable` phase and a catch, so its loading state
     * does terminate.
     *
     * This is deliberately NOT called closed. A spinner caught mid-flight and a
     * spinner that never resolves look identical in a single frame; only a fresh
     * capture with a settled load can tell them apart.
     */
    classification = "CAPTURE_INFRASTRUCTURE_NOISE";
    reason = "captured before the load settled — requires recapture, not a verdict";
  } else if (m.httpStatus === 404) {
    // The document itself 404'd. Whether that is correct depends on what was
    // asked for, which is the /assets/[id] question, handled in the report.
    classification = "EXPECTED_NOT_FOUND_OR_BAD_FIXTURE";
    reason = `document returned 404 for ${m.finalUrl}`;
  } else if (network.some((a) => /status of (401|403)/.test(a.text))) {
    // A real API answered the product's own request with an auth failure. The
    // UI's obligation is to say so; whether it did is decided by re-observation.
    const code = /status of 401/.test(network.map((a) => a.text).join(" ")) ? 401 : 403;
    classification = "PRODUCT_RESPONSE";
    reason = `API responded ${code} to a product request; the UI must render an auth state`;
  } else if (network.length || infra.length) {
    classification = "CAPTURE_INFRASTRUCTURE_NOISE";
    reason = [...network, ...infra].map((a) => a.text.replace(/^log: /, "")).slice(0, 2).join("; ");
  } else if (product.length) {
    classification = "PRODUCT_RESPONSE";
    reason = product[0].text.slice(0, 120);
  } else if (harness.length) {
    classification = "CAPTURE_INFRASTRUCTURE_NOISE";
    reason = "only the audit tool's own exception was recorded";
  } else {
    classification = "UNRESOLVED";
    reason = "no attributable signal";
  }

  rows.push({
    route: cell.route, locale: cell.locale, viewport: cell.viewport, kind: cell.kind,
    httpStatus: m.httpStatus, finalUrl: m.finalUrl, accessState: m.accessState,
    harnessErrors: harness.length, networkErrors: network.length,
    infraErrors: infra.length, productErrors: product.length,
    classification, reason,
  });
}

fs.writeFileSync("docs/design/stage6a/unattributed-classification.json", JSON.stringify(rows, null, 2));

const tally = new Map();
for (const r of rows) tally.set(r.classification, (tally.get(r.classification) ?? 0) + 1);

console.log(`classified ${rows.length} cells\n`);
for (const [k, v] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log("");
for (const [k] of tally) {
  console.log(`${k}`);
  const seen = new Set();
  for (const r of rows.filter((x) => x.classification === k)) {
    const line = `   ${r.route}  http=${r.httpStatus}  ${r.reason}`;
    if (seen.has(line)) continue;
    seen.add(line);
    console.log(line);
  }
  console.log("");
}
const harnessTotal = rows.reduce((a, r) => a + r.harnessErrors, 0);
console.log(`console errors authored by the audit tool across these cells: ${harnessTotal}`);
console.log(`UNRESOLVED=${tally.get("UNRESOLVED") ?? 0}`);
