/**
 * Phase 107 FINAL — the Stage 6-B visual/accessibility debt, as a hard gate.
 *
 * Four overflow cells and a large hidden-focusable count were carried from
 * Stage 6-A as "Stage 6-B debt" across several passes, each time re-stated in a
 * report rather than measured by anything that could fail. A number a report
 * repeats is not a gate.
 *
 * This derives both counts from the sweep records themselves and exits non-zero
 * if either is above zero, so the claim
 *
 *     VISUAL_AUDIT_COMPLETE=YES
 *
 * cannot be written down unless the evidence supports it.
 *
 * WHAT CHANGED IN THE MEASUREMENT, and why it is not moving the goalposts:
 *
 *   - `hOverflow` is unchanged. It is `document.body.scrollWidth - clientWidth`
 *     and it went to zero because two layouts were fixed, not because the rule
 *     was relaxed. The same rule still reports the same four cells against the
 *     previous build.
 *
 *   - `hiddenFocusable` WAS redefined, because the old rule counted elements the
 *     browser removes from the tab order (`display:none`, `visibility:hidden`).
 *     Those cannot be "focusable but hidden" — the phrase describes a hazard
 *     that requires the element to still be reachable. The app shell renders
 *     `md:hidden` twins of its navigation, so at each viewport the dormant copy
 *     contributed dozens of phantom findings. The corrected rule additionally
 *     excludes two patterns after ASKING the page rather than guessing: a
 *     control that becomes visible when focused (the skip link), and a control
 *     inside a genuinely scrollable region (a tab strip the browser scrolls into
 *     view on focus). What remains — rendered, tabbable, zero-area or off-screen
 *     with no way to reach it — is the actual hazard.
 *
 * Usage: node docs/design/stage6a/visual-debt-gate.mjs <evidenceDir> [more...]
 */
import fs from "node:fs";
import path from "node:path";

const DIRS = process.argv.slice(2);
if (!DIRS.length) {
  console.error("usage: visual-debt-gate.mjs <evidenceDir> [more...]");
  process.exit(2);
}

let overflowCells = 0;
let hiddenCells = 0;
let hiddenElements = 0;
let cells = 0;
const overflowDetail = [];
const hiddenDetail = [];
const breakdown = {};

for (const dir of DIRS) {
  const rec = path.join(dir, "_records");
  if (!fs.existsSync(rec)) { console.error(`missing records: ${rec}`); process.exit(2); }
  for (const f of fs.readdirSync(rec).filter((n) => n.endsWith(".json"))) {
    const r = JSON.parse(fs.readFileSync(path.join(rec, f), "utf8"));
    const s = r.domSignals ?? {};
    cells++;

    const o = s.hOverflow ?? 0;
    if (o > 0) {
      overflowCells++;
      overflowDetail.push({
        run: path.basename(dir), route: r.route, locale: r.locale, viewport: r.viewport,
        overflow: o, widest: (s.widestElements ?? []).slice(0, 2),
      });
    }

    const h = s.hiddenFocusable ?? 0;
    if (h > 0) {
      hiddenCells++;
      hiddenElements += h;
      hiddenDetail.push({
        run: path.basename(dir), route: r.route, locale: r.locale, viewport: r.viewport,
        count: h, samples: s.hiddenFocusableSamples ?? [],
      });
    }
    for (const [k, v] of Object.entries(s.focusBreakdown ?? {})) breakdown[k] = (breakdown[k] ?? 0) + v;
  }
}

console.log(`cells inspected: ${cells}  across ${DIRS.length} run(s)`);
console.log("");
console.log("focus-candidate disposition (summed over every cell):");
for (const [k, v] of Object.entries(breakdown).sort()) console.log(`   ${String(v).padStart(6)}  ${k}`);
console.log("");

if (overflowDetail.length) {
  console.log("horizontal overflow:");
  for (const d of overflowDetail.slice(0, 20)) {
    console.log(`   ${d.route}  ${d.locale}  ${d.viewport}  ${d.overflow}px   [${d.run}]`);
    for (const w of d.widest) console.log(`        widest: ${w.tag}.${w.cls}  w=${w.w} right=${w.right}`);
  }
}
if (hiddenDetail.length) {
  console.log("hidden but focusable:");
  for (const d of hiddenDetail.slice(0, 20)) {
    console.log(`   ${d.route}  ${d.locale}  ${d.viewport}  ${d.count}   [${d.run}]`);
    for (const sm of d.samples) console.log(`        ${sm}`);
  }
}

console.log("");
console.log(`OUTSTANDING_OVERFLOW_DEBT=${overflowCells}`);
console.log(`OUTSTANDING_HIDDEN_FOCUSABLE_DEBT=${hiddenCells}`);
console.log(`OUTSTANDING_HIDDEN_FOCUSABLE_ELEMENTS=${hiddenElements}`);
console.log(`VISUAL_AUDIT_COMPLETE=${overflowCells === 0 && hiddenCells === 0 ? "YES" : "NO"}`);
process.exit(overflowCells === 0 && hiddenCells === 0 ? 0 : 1);
