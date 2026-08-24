/**
 * Phase 107 Stage 6-A — account for every cell that declares a refusal.
 *
 * The previous run showed 42 `auth-required` cells and the temptation was to
 * subtract: 25 were OT, so 17 must remain. That arithmetic is worthless. The OT
 * fix changes what those pages DECLARE, other routes may change for unrelated
 * reasons, and a cell that stays `auth-required` might be right or might be the
 * same conflation somewhere else.
 *
 * So every refusing cell is explained individually, from the recorded evidence,
 * and must land in exactly one class:
 *
 *   UNAUTHENTICATED         no session — the only case where signing in helps
 *   ORG_CONTEXT_REQUIRED    signed in, no organization selected
 *   SITE_CONTEXT_REQUIRED   signed in, no site selected
 *   FORBIDDEN               signed in and refused
 *   NOT_FOUND               the thing asked for does not exist
 *   UPSTREAM_FAILURE        the server could not answer
 *   READY / EMPTY           not a refusal at all
 *
 * A cell that declares `auth-required` while the browser held a valid session is
 * an UNEXPLAINED_AUTH_REQUIRED and the gate fails. That is the specific defect
 * this stage set out to close, and it must not be able to hide behind a total.
 *
 * Usage: node docs/design/stage6a/explain-auth-required.mjs [evidenceDir]
 */
import fs from "node:fs";
import path from "node:path";
import { attributeConsoleError } from "../../../tools/audit/visual-evidence/contracts.mjs";

const DIR = process.argv[2] || "E:/hermes-os-phase107-stage6a-evidence";
const recs = fs.readdirSync(path.join(DIR, "_records"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, "_records", f), "utf8")));

/** The status the product's own API actually returned on this page. */
function apiStatuses(rec) {
  return (rec.consoleErrors || [])
    .filter((e) => attributeConsoleError(e) === "NETWORK")
    .map((e) => Number((e.match(/status of (\d{3})/) || [])[1]))
    .filter(Boolean);
}

const CLASSES = [
  "UNAUTHENTICATED", "ORG_CONTEXT_REQUIRED", "SITE_CONTEXT_REQUIRED",
  "FORBIDDEN", "NOT_FOUND", "UPSTREAM_FAILURE", "READY", "EMPTY",
];

const rows = [];
for (const r of recs) {
  const d = r.domSignals || {};
  const declared = d.asyncStates || [];
  const statuses = apiStatuses(r);
  // The sweep only ever ran with a real session; it aborts otherwise.
  const sessionValid = r.accessState === "AUTHENTICATED" && r.sessionRole;

  let klass, why;
  if (declared.includes("org-context-required")) {
    klass = "ORG_CONTEXT_REQUIRED";
    why = `API answered ${statuses.join("/") || "409"}; the session is valid and no organization is selected`;
  } else if (declared.includes("site-context-required")) {
    klass = "SITE_CONTEXT_REQUIRED";
    why = `API answered ${statuses.join("/") || "409"}; no site is selected`;
  } else if (declared.includes("auth-required")) {
    /*
     * The one case that must be justified rather than accepted.
     *
     * An earlier version of this rule accepted the cell whenever the API had
     * answered 401 — which is circular: a 401 sent to a browser holding a valid
     * session is precisely the defect being hunted. `withOtRoute` returned
     * exactly that for 30 cells until an hour ago, and "the API said 401" would
     * have certified every one of them as correct.
     *
     * So the session decides. If the browser was authenticated and the page
     * still tells the reader to sign in, that is unexplained, whatever status
     * produced it.
     */
    klass = sessionValid ? "UNEXPLAINED_AUTH_REQUIRED" : "UNAUTHENTICATED";
    why = sessionValid
      ? `declares auth-required while the browser held a valid ${r.sessionRole} session; API answered ${statuses.join("/") || "nothing"}`
      : `no valid session; API answered ${statuses.join("/")}`;
  } else if (declared.includes("forbidden")) {
    klass = "FORBIDDEN"; why = `API answered ${statuses.join("/") || "403"}`;
  } else if (r.httpState === 404 || declared.includes("not-found")) {
    klass = "NOT_FOUND"; why = `document ${r.httpState} for ${r.finalUrl}`;
  } else if (declared.includes("server-error") || declared.includes("network-error")) {
    klass = "UPSTREAM_FAILURE"; why = `API answered ${statuses.join("/") || "a transport failure"}`;
  } else if (declared.includes("empty")) {
    klass = "EMPTY"; why = "a successful response carrying nothing";
  } else {
    klass = "READY"; why = "the page rendered its content";
  }

  rows.push({
    route: r.route, locale: r.locale, viewport: r.viewport,
    httpState: r.httpState, sessionRole: r.sessionRole ?? null,
    apiStatuses: statuses, declared, class: klass, why,
  });
}

fs.writeFileSync(path.join(DIR, "STAGE6A-AUTH-ACCOUNTING.json"), JSON.stringify(rows, null, 2));

const tally = new Map();
for (const r of rows) tally.set(r.class, (tally.get(r.class) ?? 0) + 1);

console.log(`cells: ${rows.length}\n`);
for (const k of [...CLASSES, "UNEXPLAINED_AUTH_REQUIRED"]) {
  if (!tally.has(k)) continue;
  console.log(`${String(tally.get(k)).padStart(4)}  ${k}`);
}
console.log("");

// Per route, so nothing hides inside a total.
const byRoute = new Map();
for (const r of rows) {
  const key = `${r.route} → ${r.class}`;
  byRoute.set(key, (byRoute.get(key) ?? 0) + 1);
}
console.log("per route");
for (const [k, v] of [...byRoute].sort()) console.log(`   ${String(v).padStart(2)}  ${k}`);

const unexplained = rows.filter((r) => r.class === "UNEXPLAINED_AUTH_REQUIRED");
if (unexplained.length) {
  console.log("\nUNEXPLAINED — a valid session was told to sign in:");
  for (const r of unexplained.slice(0, 12)) console.log(`   ${r.route} ${r.locale} ${r.viewport} — ${r.why}`);
}

// Two states a reader acts on differently must never share a cell.
const conflated = rows.filter((r) => {
  const s = new Set(r.declared);
  return (s.has("auth-required") && (s.has("org-context-required") || s.has("forbidden")))
    || (s.has("empty") && (s.has("server-error") || s.has("auth-required")));
});

console.log("");
console.log(`STATUS_CONFLATION=${conflated.length}`);
console.log(`UNEXPLAINED_AUTH_REQUIRED=${unexplained.length}`);
process.exit(unexplained.length === 0 && conflated.length === 0 ? 0 : 1);
