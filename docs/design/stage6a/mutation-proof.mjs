/**
 * Phase 107 Stage 6-A — prove the new tests actually catch the old defects.
 *
 * A suite that passes tells you nothing about whether it would have failed. So
 * each mutation below reintroduces one of the exact behaviours the Stage 5
 * evidence caught, runs the suite, and requires it to go RED. A mutation that
 * leaves the suite green is a hole in the tests, not a success.
 *
 * Every mutation is reverted from the bytes captured before it was applied, and
 * the SHA-256 is compared afterwards, so this script cannot leave a change
 * behind even if a run fails.
 *
 * Usage: node docs/design/stage6a/mutation-proof.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REQUEST = "src/lib/client/resource-request.ts";
const HOOK = "src/lib/client/use-resource.ts";
const LIST = "src/components/crm/AccountListClient.tsx";
const LEAD = "src/components/crm/LeadDetailClient.tsx";
const NOTICE = "src/components/ui/ResourceFailureNotice.tsx";
const ORG = "src/components/organization/OrgOverview.tsx";
const BILLING = "src/components/billing/BillingDashboard.tsx";

const SUITES = [
  "src/lib/client/__tests__/resource-request.test.ts",
  "src/lib/client/__tests__/use-resource.test.tsx",
  "src/components/__tests__/stage6a-resource-failure-surfaces.test.tsx",
];

/** Files a mutation may touch; all are restored and hash-checked. */
const TRACKED = [REQUEST, HOOK, LIST, LEAD, NOTICE, ORG, BILLING];

/** Each entry restates a defect the evidence recorded, as a code change. */
const MUTATIONS = [
  {
    name: "remove the response.ok guard",
    why: "the original defect: an error body was parsed as data and rendered as an empty list",
    file: REQUEST,
    from: "  if (!response.ok) {",
    to: "  if (false) {",
  },
  {
    name: "return success after a parse failure",
    why: "a 502 HTML page or a 204 would be delivered to the screen as valid data",
    file: REQUEST,
    from: "  if (body === undefined) throw new ResourceRequestError(\"FAILED\", response.status);",
    to: "  if (body === undefined) return undefined as unknown as T;",
  },
  {
    name: "conflate 401, 403 and 404 into one code",
    why: "\"sign in again\", \"ask for access\" and \"this does not exist\" need different words and different remedies",
    file: REQUEST,
    from: "  if (status === 401) return \"UNAUTHENTICATED\";\n  if (status === 403) return \"FORBIDDEN\";\n  if (status === 404) return \"NOT_FOUND\";",
    to: "  if (status === 401 || status === 403 || status === 404) return \"FAILED\";",
  },
  {
    name: "swallow the rejection instead of entering ERROR",
    why: "the `.catch(() => {})` that made 73 failures invisible",
    file: HOOK,
    from: "        setData(null);\n        setFailure(error instanceof ResourceRequestError ? error.code : \"FAILED\");\n        setFailureStatus(error instanceof ResourceRequestError ? error.status : 0);\n        setStatus(\"ERROR\");",
    to: "        return;",
  },
  {
    name: "never leave LOADING on the failing path",
    why: "the 26 STUCK_LOADING cells: a spinner with no path out",
    file: HOOK,
    from: "        setStatus(\"ERROR\");",
    to: "        setStatus(\"LOADING\");",
  },
  {
    name: "let a stale response overwrite a newer one",
    why: "a slow answer for an old id repainting the record the user is now looking at",
    file: HOOK,
    from: "        if (superseded || controller.signal.aborted) return;\n        setData(value);",
    to: "        setData(value);",
  },
  {
    name: "report a caller's own abort as a failure",
    why: "an error banner painted over a screen the user has already navigated away from",
    file: HOOK,
    from: "        if (error instanceof DOMException && error.name === \"AbortError\") return;",
    to: "        void error;",
  },

  /* ── the surface layer: a correct state machine nobody renders ─────────── */

  {
    name: "suppress the error UI on a list surface",
    why: "the state machine can be perfect and still leave the screen silent — this is what the 73 cells actually looked like",
    file: LIST,
    from: "      {accountsState.status === \"ERROR\" && accountsState.failure && (",
    to: "      {false && accountsState.failure && (",
  },
  {
    name: "restore the never-ending spinner",
    why: "the 26 STUCK_LOADING cells: a skeleton that outlives the request",
    file: LIST,
    from: "      {accountsState.status === \"LOADING\" && (",
    to: "      {accountsState.status !== \"NEVER\" && (",
  },
  {
    name: "render an empty list for a failed load",
    why: "the original behaviour — a signed-out user told they have no accounts",
    file: LIST,
    from: "      {(accountsState.status === \"SUCCESS\" || accountsState.status === \"EMPTY\") && filtered.length === 0 && (",
    to: "      {accountsState.status !== \"LOADING\" && filtered.length === 0 && (",
  },
  {
    name: "let \"not found\" absorb every failure again",
    why: "a 401 on a detail page telling the reader the record was deleted",
    file: LEAD,
    from: "  if (leadState.status === \"EMPTY\" || leadState.failure === \"NOT_FOUND\") {",
    to: "  if (leadState.status !== \"SUCCESS\") {",
  },
  {
    name: "collapse every failure code onto one message",
    why: "\"sign in again\" and \"ask for access\" are different instructions to a reader",
    file: NOTICE,
    from: "  const copy = COPY[code];",
    to: "  const copy = COPY.FAILED;",
  },
  {
    name: "send a failed org load back to \"organization not found\"",
    why: "the shape these four were originally misfiled under: an `if (res.ok)` with no else, falling through to the empty case",
    file: ORG,
    from: "  if (orgState.status === \"ERROR\" && orgState.failure && orgState.failure !== \"NOT_FOUND\") {",
    to: "  if (false && orgState.failure) {",
  },
  {
    name: "let the billing page report zeroes it cannot verify",
    why: "three of its four calls used to swallow a 401 into null/[]/{} on the page where a customer checks what they pay for",
    file: BILLING,
    from: "  if (billingState.status === \"ERROR\" && billingState.failure) {",
    to: "  if (false && billingState.failure) {",
  },
  {
    name: "drop the locale from the sign-in link",
    why: "a German reader bounced to the English login is a localization regression, not a detail",
    file: NOTICE,
    from: "    <Link href={`/${locale}/auth/login`} className={buttonVariants(\"secondary\", \"lg\")}>",
    to: "    <Link href=\"/en/auth/login\" className={buttonVariants(\"secondary\", \"lg\")}>",
  },
];

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** True when the suite passes. Vitest exits non-zero on failure. */
function suitePasses() {
  try {
    execFileSync("npx", ["vitest", "run", ...SUITES, "--pool=threads"], {
      stdio: "pipe", shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

console.log("baseline");
const baseline = Object.fromEntries(TRACKED.map((f) => [f, sha(f)]));
if (!suitePasses()) {
  console.error("  the suite is RED before any mutation — fix that first");
  process.exit(1);
}
console.log("  suite GREEN, nothing mutated\n");

let holes = 0;
for (const m of MUTATIONS) {
  const before = fs.readFileSync(m.file);
  const src = before.toString("utf8");

  const occurrences = src.split(m.from).length - 1;
  if (occurrences !== 1) {
    console.error(`MISAPPLIED  ${m.name} — anchor matched ${occurrences} times in ${m.file}`);
    holes++;
    continue;
  }

  fs.writeFileSync(m.file, src.replace(m.from, m.to));
  let caught;
  try {
    caught = !suitePasses();
  } finally {
    // Restore from the captured bytes, not from git, so this holds even in a
    // dirty tree.
    fs.writeFileSync(m.file, before);
  }

  if (sha(m.file) !== baseline[m.file]) {
    console.error(`NOT REVERTED  ${m.file} — refusing to continue`);
    process.exit(1);
  }

  console.log(`${caught ? "CAUGHT     " : "NOT CAUGHT "} ${m.name}`);
  console.log(`             ${m.why}`);
  if (!caught) holes++;
}

console.log("");
for (const f of TRACKED) {
  console.log(`reverted  ${f}  sha256 ${baseline[f].slice(0, 16)}…  ${sha(f) === baseline[f] ? "IDENTICAL" : "CHANGED"}`);
}
console.log(`\n${MUTATIONS.length - holes}/${MUTATIONS.length} mutations caught`);
process.exit(holes ? 1 : 0);
