/**
 * Phase 107 Stage 6-A — who depends on the two auth helpers.
 *
 * `requireOrgContext` and `requirePlatformAuth` both answer 401 for two
 * different situations: no session, and a valid session with no usable
 * organization. Correcting that changes what every caller returns, so every
 * caller is enumerated FROM THE CODE before anything is edited — never from a
 * previous report and never from memory.
 *
 * For each caller this records what the route is, which capability it asks for,
 * whether it needs a session, an organization or a site, and what it answers
 * today, so the "should be" column in the report is a decision made against
 * evidence rather than an assumption.
 *
 * Usage: node docs/design/stage6a/caller-inventory.mjs
 */
import fs from "node:fs";
import path from "node:path";

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

const files = ROOTS.flatMap((r) => walk(r));
const rows = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const used = HELPERS.filter((h) => new RegExp(`\\b${h}\\s*\\(`).test(code));
  if (!used.length) continue;

  const isTest = /__tests__/.test(file);
  // The route a request would actually hit.
  const route = file.startsWith("src/app/api/")
    ? "/" + file.replace(/^src\/app\//, "").replace(/\/route\.tsx?$/, "")
    : null;

  // What the handler asks of the caller, read from the source.
  const methods = [...code.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
  const capability = [...code.matchAll(/permission:\s*"([^"]+)"|requirePermission\(\s*[^,]+,\s*"([^"]+)"/g)]
    .map((m) => m[1] || m[2]).filter(Boolean);
  const needsSite = /getAllowedSiteIds|allowedSiteIds|siteId/.test(code);
  const usesOrgId = /\.orgId|organizationId/.test(code);

  // What it answers today when the helper refuses.
  const statuses = [...code.matchAll(/status:\s*(\d{3})|,\s*(\d{3})\s*\)/g)]
    .map((m) => Number(m[1] || m[2])).filter((n) => n >= 400 && n < 600);

  rows.push({
    file, route, isTest,
    helpers: used,
    methods,
    capability: [...new Set(capability)],
    needsSession: true,          // both helpers require one by construction
    needsOrganization: usesOrgId,
    needsSite,
    currentRefusalStatuses: [...new Set(statuses)].sort(),
  });
}

fs.writeFileSync("docs/design/stage6a/caller-inventory.json", JSON.stringify(rows, null, 2));

const prod = rows.filter((r) => !r.isTest);
const tests = rows.filter((r) => r.isTest);

console.log(`callers found: ${rows.length}  (${prod.length} production, ${tests.length} test)\n`);
for (const helper of HELPERS) {
  const mine = prod.filter((r) => r.helpers.includes(helper));
  console.log(`## ${helper} — ${mine.length} production caller(s)`);
  for (const r of mine) {
    console.log(`   ${r.route ?? r.file}`);
    console.log(`      methods=${r.methods.join(",") || "—"}  capability=${r.capability.join(",") || "—"}` +
      `  org=${r.needsOrganization}  site=${r.needsSite}  refuses with ${r.currentRefusalStatuses.join("/") || "—"}`);
  }
  console.log("");
}
console.log("test files that mock or exercise them:");
for (const r of tests) console.log(`   ${r.file}  [${r.helpers.join(", ")}]`);
