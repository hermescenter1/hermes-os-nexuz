/**
 * Phase 107 Stage 6-A — let the refusal CODE reach the browser.
 *
 * The two dashboards that still told a signed-in administrator to sign in again
 * read their state from a code, never from a sentence: branching on English text
 * is what made the Stage 5 detector misreport 27 healthy pages. The helpers now
 * return `{ error, status, code }`, but the routes forward only `error` and
 * `status`, so the code never arrives.
 *
 * Scope is deliberately narrow. A blanket edit is unsafe here:
 *
 *   - `requireOrgActor` uses the identical `{ error, status }` shape with no
 *     code, so a mechanical rewrite across all 192 forwarding sites would emit
 *     `code: undefined` in scores of unrelated responses; and
 *   - `/api/billing/subscription` already answers 409 for a genuine edit
 *     conflict, so the client must NOT infer "organization required" from a bare
 *     409. Only an explicit code can tell them apart.
 *
 * So only the routes behind `/dashboard/billing` and `/dashboard/api` — the
 * twelve cells still misreporting — forward the code. Everything else keeps the
 * corrected STATUS, which is already the larger half of the fix.
 *
 * Usage: node docs/design/stage6a/forward-refusal-code.mjs
 */
import fs from "node:fs";

/** The endpoints those two dashboards actually call. */
const ROUTES = [
  // `/api/billing/plans` is deliberately public and has no refusal to forward.
  "src/app/api/billing/subscription/route.ts",
  "src/app/api/billing/invoices/route.ts",
  "src/app/api/billing/usage/route.ts",
  "src/app/api/platform/keys/route.ts",
  "src/app/api/platform/rate-limits/route.ts",
];

/** Forward the code only when the refusal actually carries one. */
const rewrite = (name) =>
  `if ("error" in ${name}) return NextResponse.json(` +
  `{ error: ${name}.error, ...("code" in ${name} ? { code: ${name}.code } : {}) }, ` +
  `{ status: ${name}.status });`;

let patched = 0;
let sites = 0;
for (const file of ROUTES) {
  if (!fs.existsSync(file)) { console.log(`  missing (skipped): ${file}`); continue; }
  const src = fs.readFileSync(file, "utf8");
  let next = src;

  for (const name of ["auth", "result", "ctxResult", "org"]) {
    // Two shapes exist in this repository: a one-liner, and a braced block. The
    // billing routes use the second, and a one-line-only codemod silently
    // reported "no matching forwarding site" for all four of them.
    const oneLine = `if ("error" in ${name}) return NextResponse.json({ error: ${name}.error }, { status: ${name}.status });`;
    const blockBody = `return NextResponse.json({ error: ${name}.error }, { status: ${name}.status });`;
    const blockNew = `return NextResponse.json({ error: ${name}.error, ...("code" in ${name} ? { code: ${name}.code } : {}) }, { status: ${name}.status });`;

    let count = next.split(oneLine).length - 1;
    if (count) { next = next.split(oneLine).join(rewrite(name)); sites += count; }

    count = next.split(blockBody).length - 1;
    if (count) { next = next.split(blockBody).join(blockNew); sites += count; }
  }

  if (next !== src) { fs.writeFileSync(file, next); patched++; console.log(`  patched ${file}`); }
  else console.log(`  no matching forwarding site: ${file}`);
}

console.log(`\nfiles patched: ${patched}, forwarding sites rewritten: ${sites}`);
