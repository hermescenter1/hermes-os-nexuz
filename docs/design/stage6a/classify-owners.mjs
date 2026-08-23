/**
 * Phase 107 Stage 6-A — separate real defects from detector false positives.
 *
 * The Stage 5 verifier flagged UNHANDLED_FETCH_FAILURE when a console error
 * existed and the page showed no text matching
 * /something went wrong|error|failed|خطا|fehler/. That regex is a heuristic
 * about WORDS, not about behaviour — and the OT module, which implements a
 * complete localized state machine, renders "Sign-in required" and
 * "Not authorized". Neither contains any of those words, so a correct error
 * state was reported as an unhandled failure.
 *
 * Before changing any component, each owner is classified on what its CODE does:
 *
 *   REAL_DEFECT       parses the body without checking response.ok, and/or
 *                     swallows the failure so no ERROR state can ever render
 *   ALREADY_CORRECT   checks response.ok, distinguishes failure classes and
 *                     terminates loading on every path
 *
 * Only REAL_DEFECT owners are touched.
 */
import fs from "node:fs";

const OWNERS = JSON.parse(fs.readFileSync("docs/design/stage6a/root-cause-inventory.json", "utf8"));
const seen = new Map();
for (const r of OWNERS) {
  if (!r.sites.length) continue;
  if (!seen.has(r.owner)) seen.set(r.owner, { routes: new Set(), cells: 0, kinds: new Set() });
  const e = seen.get(r.owner);
  e.routes.add(r.route); e.cells += r.cells;
  for (const k of r.kinds) e.kinds.add(k);
}

const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };

const rows = [];
for (const [owner, meta] of seen) {
  const src = read(owner);

  // The three behaviours that decide whether a failure can reach the user.
  const guardsOk = /\bres(ponse)?\w*\.ok\b|\bif\s*\(\s*!\s*\w+\.ok\s*\)/.test(src);
  const swallows = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(src);
  const hasErrorState = /set\w*(Error|Failure)\s*\(|\bfailure\b|useFailureCopy|OtRequestError/.test(src);
  const terminatesLoading = /finally\s*\(|finally\s*\{|setLoading\(false\)/.test(src);
  const distinguishes = /401|403|404|UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|status\s*===/.test(src);
  const guardsStale = /AbortController|signal|cancelled|ignore\b/.test(src);

  // A component is defective when an error cannot become visible: either it
  // never checks the status (so an error body is consumed as success), or it
  // discards the rejection with an empty catch and has no error state at all.
  const verdict = (!guardsOk || (swallows && !hasErrorState)) ? "REAL_DEFECT" : "ALREADY_CORRECT";

  rows.push({
    owner, verdict,
    routes: [...meta.routes], cells: meta.cells, kinds: [...meta.kinds],
    guardsOk, swallows, hasErrorState, terminatesLoading, distinguishes, guardsStale,
  });
}

rows.sort((a, b) => (a.verdict === b.verdict ? b.cells - a.cells : a.verdict === "REAL_DEFECT" ? -1 : 1));
fs.writeFileSync("docs/design/stage6a/owner-classification.json", JSON.stringify(rows, null, 2));

const defects = rows.filter((r) => r.verdict === "REAL_DEFECT");
const correct = rows.filter((r) => r.verdict === "ALREADY_CORRECT");
const cells = (rs) => rs.reduce((a, r) => a + r.cells, 0);
const routes = (rs) => new Set(rs.flatMap((r) => r.routes)).size;

console.log(`REAL_DEFECT     ${defects.length} owners, ${routes(defects)} routes, ${cells(defects)} observation cells`);
for (const r of defects) console.log(`   ok=${r.guardsOk?"Y":"N"} swallow=${r.swallows?"Y":"N"} errState=${r.hasErrorState?"Y":"N"}  ${r.owner}`);
console.log("");
console.log(`ALREADY_CORRECT ${correct.length} owners, ${routes(correct)} routes, ${cells(correct)} observation cells  (detector false positives)`);
for (const r of correct) console.log(`   ok=${r.guardsOk?"Y":"N"} errState=${r.hasErrorState?"Y":"N"} distinguishes=${r.distinguishes?"Y":"N"} stale=${r.guardsStale?"Y":"N"}  ${r.owner}`);
