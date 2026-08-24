/**
 * Phase 107 Stage 6-A — enumerate the unattributed cells, one by one.
 *
 * The Stage 6-A verifier could account for 63 of the 99 flagged cells by walking
 * from the route to the component that owns the request. The remaining 36 had no
 * attributable client fetch, and "unattributed" is not "closed".
 *
 * This lists every one of them with its route, locale and viewport, plus the
 * anomaly text the Stage 5 detector recorded, so each can be investigated on its
 * own rather than as a bucket.
 *
 * Usage: node docs/design/stage6a/extract-unattributed.mjs
 */
import fs from "node:fs";

const EVIDENCE = process.argv[2] || "E:/hermes-os-phase107-stage5-evidence/AUTH-EVIDENCE-MANIFEST.json";
const INVENTORY = "docs/design/stage6a/root-cause-inventory.json";

const KINDS = {
  UNHANDLED_FETCH_FAILURE: /fetch failed but the page shows no error/i,
  STUCK_LOADING: /still presenting a loading state/i,
};

const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const attributable = new Set(inventory.filter((r) => r.sites?.length).map((r) => r.route));

const manifest = JSON.parse(fs.readFileSync(EVIDENCE, "utf8")).manifest;

const rows = [];
for (const cell of manifest) {
  for (const anomaly of cell.anomalies || []) {
    for (const [kind, re] of Object.entries(KINDS)) {
      if (!re.test(anomaly)) continue;
      if (attributable.has(cell.route)) continue;
      rows.push({
        route: cell.route,
        locale: cell.locale,
        viewport: cell.viewport,
        kind,
        anomaly,
        // Whatever the Stage 5 run recorded about the rendered page.
        consoleErrors: cell.consoleErrors ?? cell.console_errors ?? null,
        textLen: cell.textLen ?? null,
      });
    }
  }
}

fs.writeFileSync("docs/design/stage6a/unattributed-cells.json", JSON.stringify(rows, null, 2));

console.log(`unattributed cells: ${rows.length}`);
console.log("");
const byRoute = new Map();
for (const r of rows) {
  if (!byRoute.has(r.route)) byRoute.set(r.route, []);
  byRoute.get(r.route).push(r);
}
for (const [route, cells] of byRoute) {
  console.log(`${route}  (${cells.length} cell(s))`);
  for (const c of cells) console.log(`   ${c.kind.padEnd(24)} ${c.locale}  ${c.viewport}`);
}
console.log("");
console.log("distinct routes:", byRoute.size);
console.log("locales:", [...new Set(rows.map((r) => r.locale))].join(", "));
console.log("viewports:", [...new Set(rows.map((r) => r.viewport))].join(", "));
