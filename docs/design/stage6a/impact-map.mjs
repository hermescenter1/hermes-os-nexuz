/**
 * Phase 107 Stage 6-A — the impact map, re-derived from source.
 *
 * Changing what `requireOrgContext` and `requirePlatformAuth` RETURN changes what
 * every caller answers. This re-reads them all and records, per caller, which
 * statuses are now reachable and what happens to the caller's own handling of
 * them — in particular the two ways a status change turns into a user-visible
 * defect: a refusal that never ends the loading state, and a refusal that sends
 * the browser back to a page which will refuse again.
 *
 * The count is DERIVED. Nothing here hard-codes 81.
 *
 * FORWARDING IS ANALYSED PER REFUSAL SITE, NOT PER FILE. The first version of
 * this script tested one regex against the whole file, recognising exactly one
 * shape — `NextResponse.json(body, { status: x.status })`. That was wrong in
 * both directions. It reported eight Media routes as "doesNotForward" when they
 * forward positionally (`json(body, auth.status)`, `deny(auth.status, auth.code)`),
 * and — far worse — a file-level test cannot see a SINGLE hard-coded site in a
 * file whose other sites forward correctly, which is precisely the defect this
 * stage was asked to close.
 *
 * The rule now: at each `if ("error" in NAME)` site, the status must be derived
 * from `NAME.status`, and if a refusal code is carried it must be `NAME.code`.
 * A literal in either position is an EXCEPTION, because a hard-coded code can
 * contradict the status it travels with — a 409 that says "sign in again".
 *
 * Usage: node docs/design/stage6a/impact-map.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { sitesIn } from "./refusal-sites.mjs";

const HELPERS = ["requireOrgContext", "requirePlatformAuth"];
const ROOTS = ["src/app", "src/lib"];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p.split(path.sep).join("/"));
  }
  return out;
}

const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/*
 * PHASE 107 STAGE 6-A.2 — site analysis now runs on a real AST.
 *
 * The regex version was rewritten once already (file-level -> per-site) and was
 * still only *nearly* right: it matched text, so every new spelling of a refusal
 * needed a new pattern, and a shape nobody anticipated read as clean. Parsing
 * with the TypeScript compiler already in this repository removes the class of
 * error rather than another instance of it. See `refusal-sites.mjs`.
 */

const rows = [];
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const raw = fs.readFileSync(file, "utf8");
  const code = strip(raw);
  const used = HELPERS.filter((h) => new RegExp(`\\b${h}\\s*\\(`).test(code));
  if (!used.length) continue;
  if (/__tests__/.test(file)) continue;          // tests are inventoried separately

  const route = file.startsWith("src/app/api/")
    ? "/" + file.replace(/^src\/app\//, "").replace(/\/route\.tsx?$/, "")
    : null;

  const sites = sitesIn(file, raw);
  const branchesOnStatus = /\.status\s*===\s*40[13]|\.status\s*===\s*409|\.status\s*===\s*500/.test(code);

  // A refusal that redirects to a page which will refuse again is a loop.
  const redirectsOnRefusal = /redirect\(\s*["'`][^"'`]*\/auth\/login/.test(code);
  const retriesOnRefusal = /while\s*\(|for\s*\(;;|setInterval\(/.test(code)
    && /requireOrgContext|requirePlatformAuth/.test(code);

  rows.push({
    file,
    route,
    helpers: used,
    // Both helpers refuse before the handler runs, so every route inherits the
    // same reachable set; 403/404 come from the route's own later gates.
    reachable: ["401", "403", "404", "409", "500"],
    refusalSites: sites.length,
    forwardsRefusalVerbatim: sites.length > 0
      && sites.every((s) => s.statusSource === "forwarded" || s.statusSource === "deliberate-404"),
    forwardsCode: sites.some((s) => s.codeSource === "forwarded"),
    forwardingExceptions: sites.filter((s) => s.exception).length,
    sites,
    branchesOnStatus,
    redirectsOnRefusal,
    retriesOnRefusal,
    // Server routes have no loading state; the browser owns termination.
    loadingOwner: "client",
  });
}

fs.writeFileSync("docs/design/stage6a/impact-map.json", JSON.stringify(rows, null, 2));

const byHelper = Object.fromEntries(
  HELPERS.map((h) => [h, rows.filter((r) => r.helpers.includes(h)).length]),
);

const allSites = rows.flatMap((r) => r.sites.map((s) => ({ ...s, route: r.route ?? r.file })));
const exceptions = allSites.filter((s) => s.exception);
const mediaExceptions = exceptions.filter((s) => /\/api\/media\//.test(s.route));

const hazards = {
  branchesOnStatus: rows.filter((r) => r.branchesOnStatus),
  redirectLoop: rows.filter((r) => r.redirectsOnRefusal),
  retryLoop: rows.filter((r) => r.retriesOnRefusal),
  doesNotForward: rows.filter((r) => r.refusalSites > 0 && !r.forwardsRefusalVerbatim),
};

console.log(`CALLERS_DISCOVERED=${rows.length}`);
for (const [h, n] of Object.entries(byHelper)) console.log(`  ${h}: ${n}`);
console.log("");
console.log(`refusal sites analysed          : ${allSites.length}`);
console.log(`status forwarded                : ${allSites.filter((s) => s.statusSource === "forwarded").length}`);
console.log(`code forwarded                  : ${allSites.filter((s) => s.codeSource === "forwarded").length}`);
console.log("");
for (const [name, list] of Object.entries(hazards)) {
  console.log(`${name}: ${list.length}`);
  for (const r of list.slice(0, 8)) console.log(`   ${r.route ?? r.file}`);
}

if (exceptions.length) {
  console.log("\nforwarding exceptions:");
  for (const s of exceptions) console.log(`   ${s.route}  status=${s.statusSource} code=${s.codeSource}`);
}

const unsafe = hazards.branchesOnStatus.length + hazards.redirectLoop.length + hazards.retryLoop.length;
console.log(`\nREDIRECT_OR_RETRY_LOOP_RISK=${unsafe}`);
console.log(`REFUSAL_FORWARDING_EXCEPTIONS=${exceptions.length}`);
console.log(`MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=${mediaExceptions.length}`);
process.exit(0);
