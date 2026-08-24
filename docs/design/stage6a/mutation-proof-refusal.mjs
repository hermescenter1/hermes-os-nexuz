/**
 * Phase 107 Stage 6-A — prove the refusal split would be missed if undone.
 *
 * Each mutation restores a conflation that was live in this repository during
 * this stage, across the two helpers that feed 81 routes and the surfaces that
 * render their refusals. Every one must turn a suite red; a mutation that passes
 * is a hole in the tests, not a success. The count is not stated here — it is
 * whatever MUTATIONS holds, and the run prints it.
 *
 * Anchors are normalised to each file's own line endings — several sources here
 * are CRLF, and an unmatched anchor reports a clean bill of health it has not
 * earned.
 *
 * Usage: node docs/design/stage6a/mutation-proof-refusal.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BILLING = "src/lib/billing/context.ts";
const PLATFORM = "src/lib/api/auth.ts";
const CONTRACT = "src/lib/auth/context-result.ts";
const NOTICE = "src/components/ui/ResourceFailureNotice.tsx";
const HOOK = "src/lib/client/use-resource.ts";
const OT_API = "src/lib/ot-operations/api.ts";
const MEDIA_ROUTE = "src/app/api/media/assets/route.ts";
const ERROR_STATE = "src/components/ds/ErrorState.tsx";
const VOICE_GUARD = "src/lib/copilot/voice/guard.ts";
const DS_LOGIC = "src/components/ds/logic.ts";
const BILLING_UI = "src/components/billing/BillingDashboard.tsx";
const SETTINGS_UI = "src/components/customer-portal/CustomerSettingsClient.tsx";
const REQ = "src/lib/client/resource-request.ts";
const ORG_CTX = "src/lib/org/context.ts";
const OVERVIEW_UI = "src/components/customer-portal/CustomerOverviewClient.tsx";

const TRACKED = [BILLING, PLATFORM, CONTRACT, NOTICE, HOOK, OT_API, MEDIA_ROUTE, ERROR_STATE, VOICE_GUARD,
  DS_LOGIC, BILLING_UI, SETTINGS_UI, REQ, ORG_CTX, OVERVIEW_UI];

const REFUSAL = ["src/lib/auth/__tests__/context-refusal-semantics.test.ts"];
const SURFACES = ["src/components/__tests__/stage6a-resource-failure-surfaces.test.tsx"];
const OT_STATES = ["src/components/ot-edge-operations/__tests__/ot-context-states.test.tsx"];
const HOOK_SUITE = ["src/lib/client/__tests__/use-resource.test.tsx"];
const MEDIA = ["src/app/api/media/assets/__tests__/media-assets-collection.test.ts"];
const VOICE = ["src/app/api/copilot/voice/__tests__/phase103-voice-guard-chain.test.ts"];
const MALFORMED = ["src/components/__tests__/stage6a2-malformed-success.test.tsx"];
const REQ_SUITE = ["src/lib/client/__tests__/resource-request.test.ts"];

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
    name: "1. a valid session with no organization answers 401 again",
    why: "the defect: a signed-in administrator told to sign in again, on billing and every platform route",
    file: BILLING,
    from: `  if (!member) return { ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" };`,
    to: `  if (!member) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "2. an invalid session answers 409",
    why: "the opposite error — telling someone with no session to pick an organization",
    file: BILLING,
    from: `  if (!role) return { ok: false, reason: "AUTHENTICATION_REQUIRED" };`,
    to: `  if (!role) return { ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" };`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "3. a permission refusal becomes context-required",
    why: "'ask an administrator' and 'choose an organization' are different instructions",
    file: CONTRACT,
    from: `  FORBIDDEN: 403,`,
    to: `  FORBIDDEN: 409,`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "4. drop the ACTIVE-membership requirement",
    why: "a suspended member would regain access to every org-scoped route",
    file: BILLING,
    from: `      where:   { userId, status: "ACTIVE" },`,
    to: `      where:   { userId },`,
    // The media suite stubs its own member lookup, so it cannot see this filter
    // disappear. Only a test that inspects the QUERY can, and that lives here.
    check: () => vitest(REFUSAL),
  },
  {
    name: "5. honour a caller-supplied organizationId",
    why: "the tenant must always be derived server-side; a request must never choose it",
    file: PLATFORM,
    from: `  const org = await resolveFirstOrgId(payload.sub, resolveRequestId(req));`,
    to: `  const forced = new URL(req.url).searchParams.get("organizationId");\n  const org = forced ? { ok: true, orgId: forced } : await resolveFirstOrgId(payload.sub, resolveRequestId(req));`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "6. make a revoked session distinguishable from having none",
    why: "the anti-enumeration property: a prober must not learn that an account exists",
    file: PLATFORM,
    from: `  inactive_or_revoked_session: "AUTHENTICATION_REQUIRED",`,
    to: `  inactive_or_revoked_session: "FORBIDDEN",`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "7. the UI maps a context refusal to \"sign in again\"",
    why: "exactly the advice that cannot work, put back in front of a signed-in reader",
    file: NOTICE,
    from: `  ORGANIZATION_CONTEXT_REQUIRED: { title: "orgContextTitle",  hint: "orgContextHint" },`,
    to: `  ORGANIZATION_CONTEXT_REQUIRED: { title: "unauthenticatedTitle", hint: "unauthenticatedHint" },`,
    check: () => vitest(SURFACES),
  },
  {
    name: "8. leave the spinner running on failure",
    why: "a refusal the reader can never see the end of",
    file: HOOK,
    from: `        setStatus("ERROR");`,
    to: `        setStatus("LOADING");`,
    check: () => vitest(HOOK_SUITE),
  },
  {
    name: "9. render a context refusal as an empty dashboard",
    why: "an empty API-key list invites the reader to mint a replacement for a key they still hold",
    file: "src/lib/client/async-state.ts",
    from: `  ORGANIZATION_CONTEXT_REQUIRED: "org-context-required",`,
    to: `  ORGANIZATION_CONTEXT_REQUIRED: "empty",`,
    check: () => vitest(["src/lib/client/__tests__/async-state.test.ts"]),
  },
  {
    name: "10. rename CONNECTION_FAILED back to a claim about equipment",
    why: "in an OT console \"offline\" says a GATEWAY is down, which this code cannot know",
    file: OT_API,
    from: `    throw new OtRequestError("CONNECTION_FAILED", 0);`,
    to: `    throw new OtRequestError("FAILED", 0);`,
    check: () => vitest(OT_STATES),
  },
  {
    name: "11. a Media route hard-codes AUTHENTICATION_REQUIRED again",
    why: "a 409 carrying \"sign in again\" — the status and the code contradicting each other",
    file: MEDIA_ROUTE,
    from: `if ("error" in auth) return json({ error: auth.error, code: auth.code }, auth.status);`,
    to: `if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);`,
    // GET and POST both forward; the mutation regresses both, as a careless edit would.
    allowMany: true,
    check: () => vitest(MEDIA),
  },
  {
    name: "12. change ONLY the invalid-API-key refusal mapping",
    why: "the fourth pre-authentication reason: distinguishing it tells a prober an account exists",
    file: PLATFORM,
    from: `  invalid_api_key: "AUTHENTICATION_REQUIRED",`,
    to: `  invalid_api_key: "FORBIDDEN",`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "13. shrink the recovery control back below 44px",
    why: "the only way out of the state, made hard to hit on the device most likely to be stuck",
    file: ERROR_STATE,
    from: `        <Button variant="secondary" size="lg" onClick={onRetry}>`,
    to: `        <Button variant="secondary" size="sm" onClick={onRetry}>`,
    check: () => vitest(SURFACES),
  },
  {
    name: "14. let a thrown membership query be reported as \"no organization\"",
    why: "a database fault told to the user as a fact about their account, hiding the incident",
    file: BILLING,
    from: `    return { ok: false, reason: "INTERNAL_ERROR" };`,
    to: `    return { ok: false, reason: "ORGANIZATION_CONTEXT_REQUIRED" };`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "16. shrink the DS large size below 44px, in the token itself",
    why: "the h-8 assertion was written with two REAL backspace bytes and could never match; this proves the corrected regex catches a regression in the implementation, not in a component's props",
    file: DS_LOGIC,
    from: `  lg: "h-11 px-6 text-body",`,
    to: `  lg: "h-8 px-6 text-body",`,
    check: () => vitest(SURFACES),
  },
  {
    name: "15. the voice guard puts one label on every status again",
    why: "a 409 reading AUTHENTICATION_REQUIRED — the same defect, one layer further out",
    file: VOICE_GUARD,
    from: `    return { ok: false, response: refuse(message, code, auth.status) };`,
    to: `    return { ok: false, response: refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status) };`,
    check: () => vitest(VOICE),
  },
  {
    name: "17. billing reads an ABSENT subscription as 'no plan' again",
    why: "a wrong answer about money, produced from a response that never mentioned money",
    file: BILLING_UI,
    from: `          (b) => {
            if (!b || typeof b !== "object" || !("subscription" in b)) return undefined;
            return (b as { subscription: SubscriptionRecord | null }).subscription ?? null;
          },`,
    to: `          (b) => (b as { subscription?: SubscriptionRecord | null }).subscription ?? null,`,
    check: () => vitest(MALFORMED),
  },
  {
    name: "18. the settings form invents defaults from an empty 2xx again",
    why: "an editable form built from values the server never sent, which the reader could then save",
    file: SETTINGS_UI,
    from: `        if (!("preference" in d)) return undefined;`,
    to: ``,
    check: () => vitest(MALFORMED),
  },
  {
    name: "19. a save with no returned record reports success again",
    why: "the one lie a settings form must never tell: 'Saved.' for a write nobody confirmed",
    file: SETTINGS_UI,
    from: `          if (!d.preference || typeof d.preference !== "object") return undefined;
          return d.preference;`,
    to: `          return (d.preference ?? null) as CustomerPortalPreference;`,
    check: () => vitest(MALFORMED),
  },
  {
    name: "20. read the refusal code from `code` only, ignoring the upload family's shape",
    why: "a 409 from the upload routes falls back to generic FAILED — 'something went wrong' instead of 'no organization selected'",
    file: REQ,
    from: `  if (typeof error !== "string") return undefined;
  const upper = error.toUpperCase();
  return MACHINE_CODES.has(upper) ? upper : undefined;`,
    to: `  void error;
  return undefined;`,
    check: () => vitest(REQ_SUITE),
  },
  {
    name: "21. promote ANY string in `error` to a machine code",
    why: "a human sentence would then decide the UI state, and prose changes silently re-route the reader",
    file: REQ,
    from: `  const upper = error.toUpperCase();
  return MACHINE_CODES.has(upper) ? upper : undefined;`,
    to: `  return error.toUpperCase().replace(/ /g, "_");`,
    check: () => vitest(REQ_SUITE),
  },
  {
    name: "22. label every requireOrgActor refusal as an organization-scope problem again",
    why: "a REVOKED session then answers 401 with a body saying the reader lacks org scope, and the UI branches on the body",
    file: ORG_CTX,
    from: `  if (status === 401) return "AUTHENTICATION_REQUIRED";`,
    to: `  if (status === 401) return "ORGANIZATION_SCOPE_REQUIRED";`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "23. let an unknown org-actor status fall back to a login prompt",
    why: "failing OPEN on an unfamiliar refusal describes it as a login problem it may not be",
    file: ORG_CTX,
    from: `  return "FORBIDDEN";
}`,
    to: `  return "AUTHENTICATION_REQUIRED";
}`,
    check: () => vitest(REFUSAL),
  },
  {
    name: "24. settings accepts noAccount BEFORE proving the envelope again",
    why: "malformed 200 {noAccount:true} becomes a confident \"No Account Found\" about an account the body never described",
    file: SETTINGS_UI,
    from: `        if (!("preference" in d)) return undefined;`,
    to: ``,
    check: () => vitest(MALFORMED),
  },
  {
    name: "25. the overview selector does the same",
    why: "the SECOND instance, found by the order-sensitive audit rather than by review",
    file: OVERVIEW_UI,
    from: `        if (d.overview === undefined) return undefined;`,
    to: ``,
    check: () => vitest(MALFORMED),
  },
];

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

console.log("baseline");
const baseline = Object.fromEntries([...TRACKED, "src/lib/client/async-state.ts"].map((f) => [f, sha(f)]));
if (!vitest([...REFUSAL, ...SURFACES, ...OT_STATES, ...HOOK_SUITE])) {
  console.error("  the suites are RED before any mutation — fix that first");
  process.exit(1);
}
console.log("  suites GREEN, nothing mutated\n");

let holes = 0;
for (const m of MUTATIONS) {
  const before = fs.readFileSync(m.file);
  const src = before.toString("utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const from = m.from.split("\n").join(eol);
  const to = m.to.split("\n").join(eol);

  const occurrences = src.split(from).length - 1;
  if (occurrences === 0 || (occurrences > 1 && !m.allowMany)) {
    console.error(`MISAPPLIED  ${m.name} — anchor matched ${occurrences}× in ${m.file}`);
    holes++;
    continue;
  }

  fs.writeFileSync(m.file, m.allowMany ? src.split(from).join(to) : src.replace(from, to));
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
const all = Object.keys(baseline);
for (const f of all) {
  const same = sha(f) === baseline[f];
  if (same) identical++;
  console.log(`  ${same ? "IDENTICAL" : "CHANGED  "}  ${f}`);
}
const finalGreen = vitest([...REFUSAL, ...SURFACES, ...OT_STATES, ...HOOK_SUITE]);
console.log(`\nfiles restored byte-identical: ${identical}/${all.length}`);
console.log(`${MUTATIONS.length - holes}/${MUTATIONS.length} mutations caught`);
console.log(`baseline after all mutations: ${finalGreen ? "GREEN" : "RED"}`);
process.exit(holes === 0 && identical === all.length && finalGreen ? 0 : 1);
