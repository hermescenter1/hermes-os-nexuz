/**
 * Phase 107 Stage 6-A — prove the context-semantics work would be missed if undone.
 *
 * Splitting "no session" from "no organization" only matters if something fails
 * when they are put back together. Each mutation below restores a conflation
 * that was live in the product an hour ago, and every one must turn a suite red.
 *
 * Files are restored from bytes captured beforehand and hash-compared, so a
 * failed run cannot leave a change behind.
 *
 * Usage: node docs/design/stage6a/mutation-proof-context.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROUTE_KIT = "src/lib/ot-edge/http/route-kit.ts";
const BILLING_CTX = "src/lib/billing/context.ts";
const OT_API = "src/lib/ot-operations/api.ts";
const ASYNC = "src/lib/client/async-state.ts";
const OT_STATES = "src/components/ot-edge-operations/OtStates.tsx";

const TRACKED = [ROUTE_KIT, BILLING_CTX, OT_API, ASYNC, OT_STATES];

const CONTEXT_SUITE = ["src/lib/ot-edge/http/__tests__/ot-context-semantics.test.ts"];
const STATE_SUITE = ["src/lib/client/__tests__/async-state.test.ts"];
/* The OT client and its rendered states — where mutations 7 and 9 live. */
const OT_SUITE = ["src/components/ot-edge-operations/__tests__/ot-context-states.test.tsx"];

const vitest = (files) => {
  try {
    execFileSync("npx", ["vitest", "run", ...files, "--pool=threads"], {
      stdio: "pipe", shell: process.platform === "win32",
    });
    return true;
  } catch { return false; }
};

const MUTATIONS = [
  {
    name: "1. merge 401 and 409 back together",
    why: "the defect itself: a signed-in administrator told their session had ended, on every OT page",
    file: ROUTE_KIT,
    from: `    const code = ({
      AUTHENTICATION_REQUIRED: "UNAUTHENTICATED",
      ORGANIZATION_CONTEXT_REQUIRED: "ORGANIZATION_CONTEXT_REQUIRED",
      INTERNAL_ERROR: "INTERNAL_FAILURE",
    } as const)[org.reason];`,
    to: `    const code = "UNAUTHENTICATED" as const;`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "2. stop distinguishing the two causes in the shared helper",
    why: "then no caller can tell them apart, however carefully it branches",
    file: BILLING_CTX,
    from: `  if (!payload?.sub) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };`,
    to: `  if (!payload?.sub) return { ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" };`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "3. remove the membership check from the gate",
    why: "tenant authorization is not a nicety; without it the org context means nothing",
    file: ROUTE_KIT,
    from: `  const actor = await requireOrgActor(req, org.ctx.orgId);
  if ("error" in actor) {`,
    to: `  const actor = await requireOrgActor(req, org.ctx.orgId);
  if (false) {`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "4. accept an organization id supplied by the caller",
    why: "the tenant must always be derived server-side; a request must never choose it",
    file: ROUTE_KIT,
    from: `  const actor = await requireOrgActor(req, org.ctx.orgId);`,
    to: `  const actor = await requireOrgActor(req, new URL(req.url).searchParams.get("organizationId") || org.ctx.orgId);`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "5. answer a forbidden request with not-found",
    why: "swapping 403 and 404 without a contract changes what a prober can learn",
    file: ROUTE_KIT,
    from: `      actor.status === 401 ? 401 : 403,`,
    to: `      actor.status === 401 ? 401 : 404,`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "6. report an upstream failure as an auth failure",
    why: "503 means retry; 401 means sign in. Confusing them wastes an operator's incident",
    file: ROUTE_KIT,
    from: `  TRANSIENT_FAILURE: 503,`,
    to: `  TRANSIENT_FAILURE: 401,`,
    check: () => vitest(CONTEXT_SUITE),
  },
  {
    name: "7. fold a dropped connection back into a server error",
    why: "the OT client reported every network failure as the server's fault",
    file: OT_API,
    from: `    throw new OtRequestError("CONNECTION_FAILED", 0);`,
    to: `    throw new OtRequestError("FAILED", 0);`,
    check: () => vitest(OT_SUITE),
  },
  {
    name: "8. render context-required as an empty page",
    why: "'nothing here' and 'select an organization' send the reader in opposite directions",
    file: ASYNC,
    from: `  ORGANIZATION_CONTEXT_REQUIRED: "org-context-required",`,
    to: `  ORGANIZATION_CONTEXT_REQUIRED: "empty",`,
    check: () => vitest(STATE_SUITE),
  },
  {
    name: "9. offer a retry that cannot help",
    why: "no number of retries selects an organization",
    file: OT_STATES,
    from: `const RETRYABLE: ReadonlySet<OtFailureCode> = new Set<OtFailureCode>(["UNAVAILABLE", "FAILED", "RATE_LIMITED", "CONNECTION_FAILED"]);`,
    to: `const RETRYABLE: ReadonlySet<OtFailureCode> = new Set<OtFailureCode>(["UNAVAILABLE", "FAILED", "RATE_LIMITED", "CONNECTION_FAILED", "ORGANIZATION_CONTEXT_REQUIRED"]);`,
    check: () => vitest(OT_SUITE),
  },
];

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

console.log("baseline");
const baseline = Object.fromEntries(TRACKED.map((f) => [f, sha(f)]));
if (!vitest([...CONTEXT_SUITE, ...STATE_SUITE, ...OT_SUITE])) {
  console.error("  the context/state suites are RED before any mutation — fix that first");
  process.exit(1);
}
console.log("  suites GREEN, nothing mutated\n");

let holes = 0;
for (const m of MUTATIONS) {
  const before = fs.readFileSync(m.file);
  const src = before.toString("utf8");
  /*
   * Anchors are written with LF in this file; several sources are stored CRLF.
   * Matching without normalising reported "anchor matched 0×" for mutations that
   * were perfectly correct — a false clean bill of health, which is the one
   * outcome a mutation proof must never produce.
   */
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const from = m.from.split("\n").join(eol);
  const to = m.to.split("\n").join(eol);
  const occurrences = src.split(from).length - 1;
  if (occurrences !== 1) {
    console.error(`MISAPPLIED  ${m.name} — anchor matched ${occurrences}× in ${m.file}`);
    holes++;
    continue;
  }
  fs.writeFileSync(m.file, src.replace(from, to));
  let caught;
  try { caught = !m.check(); }
  finally { fs.writeFileSync(m.file, before); }

  if (sha(m.file) !== baseline[m.file]) {
    console.error(`NOT REVERTED  ${m.file} — refusing to continue`);
    process.exit(1);
  }
  console.log(`${caught ? "CAUGHT     " : "NOT CAUGHT "} ${m.name}`);
  console.log(`             ${m.why}`);
  if (!caught) holes++;
}

console.log("");
let identical = 0;
for (const f of TRACKED) {
  const same = sha(f) === baseline[f];
  if (same) identical++;
  console.log(`  ${same ? "IDENTICAL" : "CHANGED  "}  ${f}`);
}
const finalGreen = vitest([...CONTEXT_SUITE, ...STATE_SUITE, ...OT_SUITE]);
console.log(`\nfiles restored byte-identical: ${identical}/${TRACKED.length}`);
console.log(`${MUTATIONS.length - holes}/${MUTATIONS.length} mutations caught`);
console.log(`baseline after all mutations: ${finalGreen ? "GREEN" : "RED"}`);
process.exit(holes === 0 && identical === TRACKED.length && finalGreen ? 0 : 1);
