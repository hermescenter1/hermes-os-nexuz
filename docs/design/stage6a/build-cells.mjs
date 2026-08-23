/**
 * Phase 107 Stage 6-A — the 168-cell authenticated matrix.
 *
 * The 28 routes are exactly the routes Stage 5 flagged: the 15 whose failing
 * request could be traced to a component, plus the 13 that could not. They are
 * derived from the recorded evidence, never hand-listed, so a route cannot quietly
 * fall out of the matrix between runs.
 *
 *   28 routes × 3 locales (en, de, fa) × 2 viewports (1440×900, 390×844) = 168
 *
 * Dynamic segments are filled with the placeholder the Stage 5 run used. That
 * placeholder resolves to nothing in a database-free local server, so those
 * cells are marked `expect404: true` and are treated as a not-found contract
 * test rather than as a detail-page screenshot — see §7 of the Stage 6-A report.
 *
 * Usage: node docs/design/stage6a/build-cells.mjs <outFile>
 */
import fs from "node:fs";

const OUT = process.argv[2] || "docs/design/stage6a/stage6a-cells.json";

const inventory = JSON.parse(fs.readFileSync("docs/design/stage6a/root-cause-inventory.json", "utf8"));
const unattributed = JSON.parse(fs.readFileSync("docs/design/stage6a/unattributed-cells.json", "utf8"));

const routes = [...new Set([
  ...inventory.filter((r) => r.sites?.length).map((r) => r.route),
  ...unattributed.map((r) => r.route),
])].sort();

const LOCALES = ["en", "de", "fa"];
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

/**
 * PHASE 107 STAGE 6-A — `sample-audit-id` is gone.
 *
 * That value was a placeholder the Stage 5 run invented, and a screenshot of a
 * page fetched with it was never a picture of a detail page — it was a picture
 * of a 404. Calling it a fixture made a not-found page look like coverage of a
 * populated one.
 *
 * A real fixture cannot be created in this environment: `/api/assets` and
 * `/api/automation/executions` expose GET only, both stores are Prisma-backed
 * with no session-mode fallback, there is no fixture factory in the repository,
 * and no disposable database is available. Inventing a record anyway is exactly
 * what the rules forbid, so these cells are honestly labelled as what they are —
 * the NOT-FOUND contract — and the populated detail page stays uncovered.
 */
const NOT_FOUND_PROBE = "stage6a-nonexistent-id";

const cells = [];
for (const route of routes) {
  const dynamic = /\[[^\]]+\]/.test(route);
  const concrete = route.replace(/\[[^\]]+\]/g, NOT_FOUND_PROBE);
  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) {
      const url = `/${locale}${concrete}`;
      cells.push({
        cellId: `${route}|${locale}|${vp.name}`.replace(/[^a-zA-Z0-9|._-]/g, "_"),
        route,
        url,
        locale,
        // The sweep reads width/height flat and derives the viewport label from
        // them, so the two can never disagree.
        width: vp.width,
        height: vp.height,
        // A dynamic route probed with an id that does not exist is a NOT-FOUND
        // contract test, not detail-page coverage. Recorded as such so nobody
        // later mistakes these screenshots for the populated page.
        expect404: dynamic,
        contract: dynamic ? "NOT_FOUND" : "PAGE",
        file: `stage6a/${locale}-${vp.width}/${route.replace(/^\//, "").replace(/[^a-zA-Z0-9]/g, "-") || "root"}.png`,
      });
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(cells, null, 2));

console.log(`routes:    ${routes.length}`);
console.log(`locales:   ${LOCALES.join(", ")}`);
console.log(`viewports: ${VIEWPORTS.map((v) => v.name).join(", ")}`);
console.log(`cells:     ${cells.length}`);
console.log(`dynamic routes (expect404): ${routes.filter((r) => /\[/.test(r)).length}`);
console.log("");
for (const r of routes) console.log(`  ${/\[/.test(r) ? "[dyn] " : "      "}${r}`);
console.log("");
console.log(`written to ${OUT}`);
