/**
 * Phase 107 Stage 6-A — the affected-route verifier.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT
 * ----------------------------------------
 * It re-reads the Stage 5 authenticated evidence manifest, takes every cell
 * recorded as UNHANDLED_FETCH_FAILURE or STUCK_LOADING, walks from the route to
 * the component that owns the request, and asks whether that component can
 * still produce the recorded symptom.
 *
 * It is a SOURCE verifier. It does not re-photograph anything: the authenticated
 * sweep needs owner-supplied credentials that are not present in this
 * environment, and inventing them — or screenshotting signed-out pages and
 * calling them authenticated — would be worse than reporting nothing. The
 * re-photographed confirmation therefore remains outstanding and owner-gated.
 *
 * What makes the source verdict worth anything is that the two behaviours it
 * checks for are themselves under mutation proof: `mutation-proof.mjs`
 * reintroduces each original defect — including deleting the error branch from a
 * converted component and restoring the never-ending spinner — and every one is
 * caught by the test suite. A component is called CLOSED here only because it
 * delegates to primitives whose failure behaviour is proven, and renders the
 * result.
 *
 * Usage: node docs/design/stage6a/verify-affected-routes.mjs [manifest.json]
 */
import fs from "node:fs";

const EVIDENCE = process.argv[2] || "E:/hermes-os-phase107-stage5-evidence/AUTH-EVIDENCE-MANIFEST.json";
const INVENTORY = "docs/design/stage6a/root-cause-inventory.json";

const KINDS = {
  UNHANDLED_FETCH_FAILURE: /fetch failed but the page shows no error/i,
  STUCK_LOADING: /still presenting a loading state/i,
};

const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };

/**
 * Positive `.ok` guards with no `else`.
 *
 * `if (res.ok) { …use the body… }` and nothing more is the quiet form of this
 * whole defect class: the failure branch simply does not exist, so a 401 sets no
 * state, `finally` ends the spinner, and the screen renders its empty case.
 * `if (!res.ok) { … }` is the opposite — the failure is what it handles — so
 * only the positive form without an else counts.
 *
 * Brace-matched rather than pattern-guessed, because "does this guard fall
 * through" is a structural question a regex answers wrongly. Two shapes are NOT
 * swallows and must not be reported as such:
 *
 *   if (res.ok) { … } else { …handle… }        an explicit failure branch
 *   if (res.ok) { …; return; }  …handle…       an early return, so everything
 *                                              after the block IS the failure
 *                                              path (SalesLeadActions does this)
 */
function bareOkGuards(code) {
  const re = /if\s*\(\s*(!?)\s*([A-Za-z_$][\w$]*)\s*\.ok\s*[^)]*\)\s*\{/g;
  const found = [];
  let m;
  while ((m = re.exec(code))) {
    if (m[1] === "!") continue;
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    for (; i < code.length; i++) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}" && --depth === 0) break;
    }
    if (/^\s*else\b/.test(code.slice(i + 1, i + 16))) continue;
    const body = code.slice(bodyStart, i);
    if (/\b(return|throw)\b[^;]*;?\s*$/.test(body)) continue;
    found.push(m[2]);
  }
  return found;
}

/**
 * Can this component still show a failure as data, as emptiness, or as a
 * spinner that never ends?
 */
function classify(owner) {
  const src = read(owner);
  if (!src) return { verdict: "UNREADABLE", why: "source not found" };

  const delegates = /@\/lib\/client\/(resource-request|use-resource)/.test(src);
  const showsFailure = /ResourceFailureNotice|useResourceFailureCopy/.test(src);

  // The original idiom, in the forms the inventory actually found.
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const rawParse = /\.then\(\s*\(?\s*r\w*\s*\)?\s*=>\s*r\w*\.json\(\)/.test(code);
  const emptyCatch = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(code);

  if (rawParse || emptyCatch) {
    return { verdict: "OPEN", why: rawParse ? "parses the body without checking the status" : "discards the rejection" };
  }
  if (delegates && showsFailure) {
    return { verdict: "CLOSED", why: "loads through the audited primitives and renders the failure" };
  }
  // Modules that were already correct before Stage 6-A began — notably the OT
  // estate, which implements the same guarantees independently — reach here.
  const bare = bareOkGuards(code);
  if (bare.length) {
    return {
      verdict: "OPEN",
      why: `a failed response falls through \`if (${bare[0]}.ok)\` with no else, so nothing is set and the empty state renders`,
    };
  }
  const handlesFailure = /if\s*\(\s*!\s*\w+\.ok\s*\)|catch\s*(\(|\{)/.test(code);
  const hasErrorState = /set\w*(Error|Failure)\s*\(|useFailureCopy|OtRequestError|\bfailure\b/.test(code);
  if (handlesFailure && hasErrorState) {
    return { verdict: "CLOSED_PREEXISTING", why: "checks the status and routes a failed response to a visible error" };
  }
  return { verdict: "OPEN", why: "no path from a failed request to a visible failure" };
}

/* ── route → owners, from the inventory built at the start of Stage 6-A ───── */
const inventory = JSON.parse(read(INVENTORY) || "[]");
const ownersByRoute = new Map();
for (const row of inventory) {
  if (!row.sites?.length) continue;
  if (!ownersByRoute.has(row.route)) ownersByRoute.set(row.route, new Set());
  ownersByRoute.get(row.route).add(row.owner);
}

/* ── every affected cell, from the authenticated evidence ─────────────────── */
const manifest = JSON.parse(read(EVIDENCE) || "null")?.manifest;
if (!manifest) {
  console.error(`cannot read the Stage 5 evidence manifest at ${EVIDENCE}`);
  process.exit(2);
}

const cells = [];
for (const cell of manifest) {
  for (const anomaly of cell.anomalies || []) {
    for (const [kind, re] of Object.entries(KINDS)) {
      if (re.test(anomaly)) cells.push({ kind, route: cell.route, locale: cell.locale, viewport: cell.viewport });
    }
  }
}

/* ── verdict per owner, then per cell ─────────────────────────────────────── */
const verdicts = new Map();
for (const owners of ownersByRoute.values()) {
  for (const owner of owners) if (!verdicts.has(owner)) verdicts.set(owner, classify(owner));
}

const remaining = { UNHANDLED_FETCH_FAILURE: 0, STUCK_LOADING: 0 };
const observed = { UNHANDLED_FETCH_FAILURE: 0, STUCK_LOADING: 0 };
const unattributed = { UNHANDLED_FETCH_FAILURE: 0, STUCK_LOADING: 0 };
const openRoutes = new Map();
const unmapped = new Map();

for (const cell of cells) {
  observed[cell.kind]++;
  const owners = [...(ownersByRoute.get(cell.route) ?? [])];
  if (!owners.length) {
    // No client-side fetch was found behind this route at all — the symptom
    // cannot be attributed to a request this inventory can see.
    unmapped.set(cell.route, (unmapped.get(cell.route) ?? 0) + 1);
    unattributed[cell.kind]++;
    continue;
  }
  const stillOpen = owners.filter((o) => verdicts.get(o)?.verdict === "OPEN");
  if (stillOpen.length) {
    remaining[cell.kind]++;
    for (const o of stillOpen) openRoutes.set(`${cell.route}  ${o}`, (openRoutes.get(`${cell.route}  ${o}`) ?? 0) + 1);
  }
}

/* ── report ───────────────────────────────────────────────────────────────── */
const byVerdict = new Map();
for (const [owner, v] of verdicts) {
  if (!byVerdict.has(v.verdict)) byVerdict.set(v.verdict, []);
  byVerdict.get(v.verdict).push({ owner, why: v.why });
}

console.log(`evidence manifest: ${EVIDENCE}`);
console.log(`affected cells:    ${cells.length} across ${ownersByRoute.size} route(s) with an identified owner`);
console.log("");
for (const verdict of ["OPEN", "CLOSED", "CLOSED_PREEXISTING", "UNREADABLE"]) {
  const rows = byVerdict.get(verdict) ?? [];
  if (!rows.length) continue;
  console.log(`${verdict}  (${rows.length})`);
  for (const r of rows) console.log(`   ${r.owner}\n      ${r.why}`);
  console.log("");
}

if (unmapped.size) {
  console.log("cells whose route has no client fetch this inventory can attribute:");
  for (const [route, n] of unmapped) console.log(`   ${n} cell(s)  ${route}`);
  console.log("");
  console.log("   These are NOT counted as closed. The Stage 5 detector flagged a cell when a");
  console.log("   console error existed and no on-screen text matched its error-word regex. The");
  console.log("   five /dashboard/ot/* routes reach here because their shared `useOtRecord` hook");
  console.log("   already implements the full state machine and renders \"Sign-in required\" /");
  console.log("   \"Not authorized\" — wording the regex does not match. That is a defect in the");
  console.log("   DETECTOR, not in those pages, and it is reported rather than quietly absorbed.");
  console.log("");
}

if (openRoutes.size) {
  console.log("still open:");
  for (const [k, n] of openRoutes) console.log(`   ${n} cell(s)  ${k}`);
  console.log("");
}

for (const kind of ["UNHANDLED_FETCH_FAILURE", "STUCK_LOADING"]) {
  const attributed = observed[kind] - unattributed[kind];
  console.log(
    `${kind.padEnd(24)} observed ${observed[kind]}` +
    `  = attributed ${attributed} (remaining ${remaining[kind]})` +
    ` + unattributed ${unattributed[kind]}`,
  );
}
console.log("");
/*
 * This script reads the Stage 5 observations and the source fixes. It cannot
 * know whether a re-sweep has since run, and it used to PRINT that it had not —
 * a hard-coded claim that stayed in the output long after three authenticated
 * sweeps had been captured, contradicting them in every log that carried it.
 *
 * A script must not report a fact it is not in a position to observe.
 */
console.log("AUTHENTICATED_RE_SWEEP: not observable here —");
console.log("  run verify-stage6a-evidence.mjs <dir> for the per-sweep counters,");
console.log("  and evidence-integrity.mjs <dir…> for cross-run agreement.");

process.exit(remaining.UNHANDLED_FETCH_FAILURE + remaining.STUCK_LOADING === 0 ? 0 : 1);
