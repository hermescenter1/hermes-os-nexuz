# Phase 107 Stage 6-A — Authenticated Runtime Reliability Closure

> **SUBSTAGE RECORD — SUPERSEDED for phase-level status.**
>
> This document is the working record of Stage 6-A and its narrow correction
> passes. It is **not** the current status of Phase 107 and makes no claim about
> phase completion, visual closure, or test totals.
>
> The one canonical, current, phase-level status document is:
>
> ```
> PHASE-107-FINAL-REPORT.md
> ```
>
> which is generated from the final machine evidence.
>
> Everything below — including every counter this document used to state in a
> block headed "the only place it is stated" — described the tree as it stood
> during Stage 6-A and its corrections. Two of those numbers are now known to be
> stale (`TEST_DISCOVERY_PARITY ... 437 files`, and `VISUAL_AUDIT_COMPLETE=NO`),   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
> and rather than patch them in place the whole block has been retired: a
> substage record that keeps its own live status block will always drift from the
> phase record, and having two live status blocks is the defect, not the values
> in them.
>
> Read this for HOW Stage 6-A reached its conclusions. Read the final report for
> WHERE Phase 107 stands.

## What this stage did

Stage 5's authenticated sweep recorded **73 `UNHANDLED_FETCH_FAILURE`** and
**26 `STUCK_LOADING`** observations across 792 cells. Both counts are now zero,
verified by three independent sweeps that agree cell for cell.

Along the way the audit tool itself was found to be corrupting its own evidence,
and two shared auth helpers were found to be answering 401 to people who were
signed in.

## Counts, all derived mechanically

Every number below comes from a script in `docs/design/stage6a/`, re-run against
the final tree. None is transcribed by hand.

| quantity | value | derived by |
|---|---|---|
| worktree entries (porcelain) | 64 | `git status --porcelain` |
| worktree files (expanded) | 107 | `git status --porcelain -uall` |
| classified files | 107 | `diff-inventory.mjs` |
| unclassified files | **0** | `diff-inventory.mjs` |
| production callers of the two helpers | 81 | `impact-map.mjs` |
| refusal sites analysed | 225 | `impact-map.mjs` |
| refusal-forwarding exceptions | **0** | `impact-map.mjs` |
| English catalogue leaves | 6277 | measured from `messages/en.json` |
| remaining raw-fetch idiom files | 56 | `stage6b-debt.mjs` |

The inventory classifies **every** changed path, including the tooling that
produces these numbers — `diff-inventory.mjs`, `impact-map.mjs`,
`evidence-integrity.mjs`, `build-review-pack.mjs` and the four mutation
scripts all appear under `documentation`. Nothing is excluded from the count;
an earlier review pack under-reported because four such files were omitted, and
that omission is the reason the inventory now refuses to run with any
`UNCLASSIFIED` entry.


---

# Detail

## 1. What the 99 observations actually were

They are not 99 defects. One component rendered in three locales at two
viewports produces six observations, and one copied data-fetching idiom
produces dozens.

| | |
|---|---|
| observations | 99 |
| distinct routes | 28 |
| owning components | 16 |
| **root-cause classes** | **1** |

The class, verbatim, from ten components:

```js
fetch("/api/crm/accounts")
  .then(r => r.json())          // parses an ERROR body as if it were data
  .then(d => setAccounts(d.accounts ?? []))   // …and renders it as "empty"
  .catch(() => {})              // …and discards whatever is left
  .finally(() => setLoading(false));
```

and from four more, the quieter form of the same thing:

```js
const res = await fetch(url);
if (res.ok) { … }               // no else: a 401 sets nothing at all
finally { setLoading(false); }  // …and the spinner ends on the empty state
```

Every one of these has the same consequence: **a failure the user cannot
distinguish from an absence.** A signed-out user was told they had no accounts,
no invoices, no API keys and no training enrolments.

## 2. A correction to an earlier claim

The first pass classified six of these components as *detector false positives*,
on the grounds that each contained a `.ok` check and an error state somewhere in
the file. Reading them showed that in four of the six the error state belonged to
the **save** path while the **load** had no failure branch at all.

Those four — `BillingDashboard`, `OrgOverview`, `ApiKeysDashboard`,
`DepartmentsPanel` — are real defects and are fixed here. The earlier
"false positive" label was wrong, and a static classifier that reads *"is there
a `.ok` anywhere in this file"* is not evidence about the load path.

`BillingDashboard` was the worst of them: only one of its four calls was
treated as required, so a 401 on the other three rendered *"no subscription, no
invoices, no usage"* on the page where a customer checks what they are paying
for.

`ApiKeysDashboard` was the most dangerous: an empty key list invites the reader
to mint a replacement for a key they still hold.

## 3. What was built

| file | role |
|---|---|
| `src/lib/client/resource-request.ts` | checks the status **before** the body means anything; throws a typed `ResourceFailureCode` |
| `src/lib/client/use-resource.ts` | `IDLE │ LOADING │ SUCCESS │ EMPTY │ ERROR` — `EMPTY` reachable only from a 2xx |
| `src/components/ui/ResourceFailureNotice.tsx` | maps a code to localized copy and the one action that can help |
| `messages/{en,fa,de}.json` | `errors.resource` — 18 leaves each, eight failure codes × title/hint plus retry and sign-in |

Modelled deliberately on `src/lib/ot-operations/api.ts`, which already solved
this for the OT estate. The abstraction was introduced only after **fourteen**
consumers were shown to share an identical contract, and only with tests that
prove it.

Auth states are kept apart on purpose: an expired session gets a sign-in link,
a permission failure gets no button at all (retrying cannot help), and only a
network or server failure offers a retry.

## 4. Evidence

**Tests added:** 109 — 19 on the request primitive, 15 on the state machine, 75
mounting all fourteen real components against 401 / 403 / 500 / offline, in
English, Persian and German.

**Mutation proof — 15 defects reintroduced, 15 caught, every file byte-identical
after revert** (`node docs/design/stage6a/mutation-proof.mjs`):

| mutation | caught |
|---|---|
| remove the `response.ok` guard | ✔ |
| return success after a parse failure | ✔ |
| conflate 401 / 403 / 404 | ✔ |
| swallow the rejection instead of entering ERROR | ✔ |
| never leave LOADING on the failing path | ✔ |
| let a stale response overwrite a newer one | ✔ |
| report a caller's own abort as a failure | ✔ |
| suppress the error UI on a list surface | ✔ |
| restore the never-ending spinner | ✔ |
| render an empty list for a failed load | ✔ |
| let "not found" absorb every failure again | ✔ |
| collapse every failure code onto one message | ✔ |
| send a failed org load back to "organization not found" | ✔ |
| let the billing page report zeroes it cannot verify | ✔ |
| drop the locale from the sign-in link | ✔ |

**Affected-route verifier** (`node docs/design/stage6a/verify-affected-routes.mjs`):

```
UNHANDLED_FETCH_FAILURE  observed 73  = attributed 42 (remaining 0) + unattributed 31
STUCK_LOADING            observed 26  = attributed 21 (remaining 0) + unattributed 5
```

## 5. What is NOT closed

> **Superseded by the closure section below.** Everything in §5 and §6 of this
> first report was written before the harness was decontaminated and before the
> authenticated re-sweep could run. The re-sweep HAS now run (168 cells, three
> times), the 36 unattributed cells are resolved, and the remaining-idiom count
> is 56, not "roughly 20". Read the closure section for the current numbers.


**The authenticated re-sweep did not run.** No owner credentials are present in
this environment, and neither inventing them nor photographing signed-out pages
would be evidence. The re-photographed confirmation remains outstanding and
owner-gated.

**36 cells are unattributed, not closed.** The Stage 5 detector flagged a cell
when a console error existed and no on-screen text matched its error-word regex.
The five `/dashboard/ot/*` routes land here because their shared `useOtRecord`
hook *already* implements the complete state machine and renders "Sign-in
required" / "Not authorized" — wording the regex does not match. That is a
defect in the **detector**, not in those pages. The remaining unattributed cells
(`/articles/following`, `/assets/[id]`, `/cmms/settings`, `/crm`,
`/documents/explorer`, `/automation/*`) have no client-side fetch this inventory
can attribute and are reported rather than absorbed.

**The idiom survives elsewhere.** *(SUPERSEDED: the estimate below was wrong; the derived figure is **56** — see Stage 6-A.1 §6.)* It appears in roughly 20 further files outside
the affected set — `crm/LeadListClient`, five `ats/*`, six `customers/*`, five
`operations/*`, `knowledge-graph/KnowledgeGraphClient`, and five more
`customer-portal/*`. They were not observed failing in Stage 5 and are out of
Stage 6-A's scope. They are named here so nobody mistakes this stage for a
repo-wide fix.

**Two out-of-scope findings, not fixed:**
- `AccountListClient` and `OpportunityPipelineClient` build locale links as
  `pathname.startsWith("/fa") ? "/fa" : "/en"`, which sends a German reader to
  the English route.
- The `customer-portal` module still has no `useTranslations`; its body copy is
  English in all three locales. Only the new failure copy is localized.

## 6. Validation actually executed

| command | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npx eslint` (touched paths) | 0 errors, 0 warnings |
| `npm run lint` | 0 errors |
| `npx vitest run` | **433 files, 9,705 tests — 9,565 passed, 140 skipped, 0 failed** |
| `npm run build` | exit 0, 970 static pages |

One test **file** fails to collect: `scripts/__tests__/phase102-media-processing.test.ts`,
`SyntaxError: Invalid or unexpected token`. It fails identically in isolation, is
under `scripts/` which this stage did not touch, and is the known Windows-only
Phase-102 collection error that Linux CI passes.

The i18n leaf pin moved 6249 → 6267 (+18) at the time of writing; it has since moved again and the **measured** count is now **6277**. It is pinned in `german-final-gate.test.ts`, in all
three places it is asserted.

Two test doubles were corrected — **no assertion was changed, weakened or
removed**:
- `runtime-crm-subpages.test.tsx`: the fake `Response` implemented only `json()`.
  A real `Response` also has `text()`, which is what lets a caller tell an empty
  body from a malformed one.
- `german-enterprise-render.test.tsx`: same `text()` gap, plus the usage fixture
  used the key `usage` where `GET /api/billing/usage` returns `summary`. The old
  `uBody.summary ?? {}` had been quietly accepting the mismatch.

---

> SUPERSEDED — the status block that stood here claimed
> `AUTHENTICATED_RE_SWEEP=NOT_RUN` and
> `DESIGN_PHASE=AWAITING_OWNER_VISUAL_APPROVAL`. Both were true when written and
> are contradicted by the three sweeps that followed. Status is stated **once**,
> at the top of this document; these lines are recorded in
> **Appendix: HISTORICAL_SUPERSEDED**.

---

# Stage 6-A — Harness Decontamination and Authenticated Closure

## 1. The audit tool was corrupting its own evidence

The Stage 5 driver registered this on every document, before every navigation:

```js
Page.addScriptToEvaluateOnNewDocument({ source:
  "const hide=()=>{const s=document.createElement('style');s.id='__s5';" +
  "s.textContent='nextjs-portal{display:none !important}';" +
  "(document.head||document.documentElement).appendChild(s)};" +
  "document.addEventListener('DOMContentLoaded',hide);hide();" })
```

| | |
|---|---|
| source | `auth-sweep.mjs` (evidence root, outside the repo) |
| CDP method | `Page.addScriptToEvaluateOnNewDocument` |
| timing | every new document, plus again on `DOMContentLoaded` |
| target | injects `<style id="__s5">` into `document.head` |
| effect | hid `nextjs-portal` — the **Next.js dev error overlay** |
| cells affected | **790 of 792** carried its exception; all 792 were subject to it |

Two harms. It **suppressed the browser's own report of broken pages** in every
screenshot. And at the earliest evaluation moment neither `document.head` nor
`document.documentElement` exists, so it threw
`TypeError: Cannot read properties of null (reading 'appendChild')` — which was
recorded as a page console error, and the Stage 5 anomaly rule then reported the
tool's own crash as a product defect.

A second mutation lived in the committed harness: `sweep.mjs` forced every
animation to its end time and paused it before each capture.

The Stage 5 pack is quarantined as `SUPERSEDED_VISUAL_EVIDENCE_TOOL_DOM_MUTATION`
(`E:\hermes-os-phase107-stage5-evidence\SUPERSEDED.md`), not deleted. Its HTTP,
`finalUrl` and `accessState` data come from the network layer, not the mutated
DOM, and remain usable; **no image from it may support a visual PASS**.

## 2. The harness now reads and never writes

- `findForbiddenMutation()` — source gate over every harness file. It distinguishes
  a **read** of `outerHTML` (how the fixture proves nothing changed) from a
  **write** to it. An earlier version banned the identifier outright and flagged
  its own evidence-gathering, which would have pushed the next author to delete
  the check rather than fix it.
- `fixture-noncontamination.mjs` — a real Chrome run against a fixture containing
  a `<nextjs-portal>` and a running animation. DOM SHA-256 is byte-identical
  across probe and capture; `<style>` count unchanged; animation `playState`
  stays `running`. Positive controls reintroduce both retired mutations and the
  run goes red.
- `attributeConsoleError()` — every console message is attributed to
  PRODUCT / NETWORK / EXTERNAL_ASSET / AUDIT_HARNESS / BROWSER_INFRASTRUCTURE.

## 3. The 36 unattributed cells, resolved

| classification | cells | what they were |
|---|---|---|
| `PRODUCT_RESPONSE` | 25 | OT APIs answered **401** to the product's own request |
| `CAPTURE_INFRASTRUCTURE_NOISE` | 8 | connection resets, a chunk load error, and `/crm` photographed mid-load |
| `EXPECTED_NOT_FOUND_OR_BAD_FIXTURE` | 3 | a placeholder id, and one route that 404'd only in the Stage 5 environment |

35 of the 36 carried the audit tool's own exception. `/crm` deserves its own
note: `looksLoading` fired for **en and fa but not de**, same viewport, same code
path — a timing race in the capture, not a locale-specific defect. Its owner
(`CrmCommandClient`) checks `res.ok`, has an `unavailable` phase and a catch.

## 4. Disposable identity, real login

A launcher outside the repository generates a random UUID at `@local.invalid`
with a 32-byte password, in memory. The same value is given to the server as its
seed admin (`adminSeed()`, the documented Phase 12A/28 path — no auth mode was
invented and no guard was touched) and to the audit tool as the credential it
types into the real form. Nothing is written to disk, nothing appears on a
command line, nothing is logged.

A scan of 2,845 files across the repository and the evidence pack finds **zero**
occurrences of the identity.

## 5. Results — three sweeps, each on a clean harness

| | run 1 | run 2 | run 3 (final) |
|---|---|---|---|
| cells captured | 168 | 168 | **168** |
| harness console errors | 0 | 0 | **0** |
| `UNHANDLED_FETCH_FAILURE` | 78 | 30 | **0** |
| `STUCK_LOADING` | 0 | 0 | **0** |
| `UNATTRIBUTED_CELLS` | 168 | 0 | **0** |

Run 1 proved the decontamination and the real login. Run 2 added the structural
signals and the consent click. Run 3 added the not-found declarations.

Final state distribution across 168 cells: **96 ready, 42 auth-required,
30 not-found**. Product-authored console errors: **0**.

## 6. OT 401 — the UI is right, the API's semantics are the open question

The OT pages now declare `auth-required` on 30 of 36 cells, so the UI faithfully
reports what the API said. But the API's classification is questionable:
`withOtRoute` calls `requireOrgContext(req)` and answers **401 UNAUTHENTICATED**
when it fails. The session is valid — the same browser is `role=admin` and every
other page renders — so what is missing is **organization context, not
authentication**. Telling that reader to sign in again cannot help them.

Correcting it means changing the API's status semantics or the org/site scoping:

```
OT_AUTH_SEMANTICS=BLOCKED_SCOPE_EXPANSION
```

Reported for authorization; deliberately **not** papered over with a UI change.

## 7. The three 404s

- `/assets/sample-audit-id` and `/automation/executions/sample-audit-id` — the id
  is a **placeholder**, not a fixture, and no legitimate disposable seed exists
  for a database-free local server. Their screenshots are **not** representative
  of a detail page; they are a not-found contract test.
  `DYNAMIC_DETAIL_FIXTURES=BLOCKED_NO_LEGITIMATE_DETAIL_FIXTURE`
- `/automation/settings` — returns **HTTP 200** on this production build across
  all three locales. The Stage 5 404 was an artefact of that run's environment.
  `AUTOMATION_SETTINGS_CLASSIFICATION=STALE_AUDIT_ROUTE`

## 8. Fault injection

Faults forced at the browser's request layer (`Fetch.enable`), never on the DOM.

| injected | declared | cells |
|---|---|---|
| 403 | `forbidden` | 30 |
| 500 | `server-error` | 30 |
| offline | `network-error` | 24 |
| offline | `server-error` | 6 |

**90 pass, 0 fail, 18 not applicable.** `STUCK_LOADING_UNDER_FAULT=0` — no
spinner survives any fault, in any locale, at either viewport.

The 18 are `/dashboard/organization`, which resolves its organization in a
*server* component; with no database it never mounts the client and never makes
the intercepted request. A fault that was never requested cannot be judged, and
scoring it as a failure would have invented a defect.

The 6 `offline → server-error` are `/dashboard/ot/gateways`: `OtFailureCode` has
no `OFFLINE` member, so a dropped connection is classified `FAILED`. A real but
minor semantic gap in the OT client, reported rather than fixed — it belongs with
the OT API question above.

## 9. Out of scope, measured rather than estimated

```
STAGE6A_IS_NOT_A_REPO_WIDE_FETCH_FIX
STAGE6B_REMAINING_IDIOM_FILES=56
```

Derived by `docs/design/stage6a/stage6b-debt.mjs`, not hand-listed. My earlier
report estimated "roughly 20" from a narrower grep; the real figure is **56**.

Also unfixed and unchanged: the `"/fa" : "/en"` locale links that send a German
reader to the English route, and the absent `useTranslations` in Customer Portal.

## 10. Validation

| command | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors |
| focused eslint | 0 errors, 0 warnings in changed files |
| `npx vitest run` | **434 files, 9,734 tests — 9,594 passed, 140 skipped, 0 failed** |
| `npm run build` | exit 0, 970 static pages |
| mutation proofs | **33/33 caught** (15 product + 18 harness), all files byte-identical |
| non-contamination fixture | PASS; both positive controls RED |

File count moved 433 to 434 and tests 9,705 to 9,734 (+22 async-state, +7
harness), exactly the tests added — no file was silently dropped.

`scripts/__tests__/phase102-media-processing.test.ts` still fails to collect with
`SyntaxError`. Proven pre-existing: its git object hash is **identical to the
HEAD blob** (`8927326b…`), `scripts/` is untouched by this stage, it fails
identically under the default pool and `--pool=threads`, it contains no control
character or lone surrogate, and `tsc` includes the file and type-checks it
cleanly. TypeScript parses it; only vitest's oxc transformer rejects it on
Windows, and Linux CI runs it.

---

# Stage 6-A — Final Semantic and Fixture Closure

## 1. The OT 401 was a lie about the reader

`withOtRoute` called `requireOrgContext`, which returns `null` for two entirely
different situations and reported both as **401**:

| situation | what the reader needs |
|---|---|
| no valid session | sign in |
| valid session, no ACTIVE organization membership | **select an organization** |

The second reader was signed in. Telling them their session had ended, and
offering a sign-in link, was advice that could not work — on every OT page, in
every locale.

### What changed, and what deliberately did not

`resolveOrgContext` in `src/lib/billing/context.ts` now returns a discriminated
union and draws the distinction **once**:

```ts
{ ok: true; ctx } | { ok: false; reason: "UNAUTHENTICATED" | "ORGANIZATION_CONTEXT_REQUIRED" }
```

`requireOrgContext` keeps its exact previous behaviour — both causes still 401 —
because nine billing routes and `billing-track.ts` depend on it. Widening their
status codes is a separate decision with its own blast radius.

`ServiceErrorCode` gained `ORGANIZATION_CONTEXT_REQUIRED` and
`SITE_CONTEXT_REQUIRED`, both **409**: the caller is known and the request is
well-formed; what is missing is a selection only they can make. Not 401 (nothing
to re-authenticate), not 403 (nothing refused).

**The authorization chain is untouched.** Same session verification, same
ACTIVE-membership requirement, same server-derived tenant. Twelve tests hold
that: an unknown organization, a suspended member, a missing permission and a
caller-supplied `organizationId` are all still refused, and no answer reveals
whether any organization exists.

## 2. A word that means something else on a plant floor

Adding an `OFFLINE` code broke `ot-edge-static.test.ts`, a Phase 94C1 gate that
forbids `/\boffline\b/i` anywhere in the OT interface. The gate was right and the
change was wrong: in an industrial console "offline" is a claim about a
**gateway**, and this failure is about the browser's own request to Hermes. The
code is `CONNECTION_FAILED`.

That gate caught a real domain error, not a naming preference.

## 3. The remaining 12 — the gate this stage does not pass

Every refusing cell is explained individually rather than by subtraction:

| class | cells | routes |
|---|---|---|
| `ORG_CONTEXT_REQUIRED` | 30 | the five `/dashboard/ot/*` list and detail routes |
| `NOT_FOUND` | 30 | five dynamic routes probed with an id that does not exist |
| `READY` | 96 | |
| **`UNEXPLAINED_AUTH_REQUIRED`** | **12** | `/dashboard/api`, `/dashboard/billing` |

Those 12 are the **identical conflation** in two other helpers:

- `requireOrgContext` → the nine billing routes;
- `requirePlatformAuth` (`src/lib/api/auth.ts:328`) → the platform/API-key routes.

Both answer 401 to a browser holding a valid `admin` session. The narrow
authorization covered OT, so they are reported, not fixed.

**A correction to my own accounting.** The first version of this classifier
accepted any cell whose API had answered 401. That is circular: a 401 sent to a
valid session is precisely the defect being hunted, and `withOtRoute` returned
exactly that for 30 cells an hour earlier. The rule now lets the SESSION decide —
if the browser was authenticated and the page still says "sign in", that is
unexplained, whatever status produced it. Applying the honest rule is what turned
0 into 12.

## 4. Fixtures — blocked, and not faked

`sample-audit-id` is gone from the matrix. It was never a fixture: a screenshot
taken with it was a picture of a 404 dressed up as detail-page coverage. Dynamic
cells now use `stage6a-nonexistent-id` and are labelled `contract: "NOT_FOUND"`.

A legitimate fixture cannot be created here:

- `/api/assets` and `/api/automation/executions` expose **GET only**;
- both stores are Prisma-backed with no session-mode fallback;
- there is no fixture factory in the repository;
- the Docker daemon is not running, so no disposable Postgres exists.

```
DYNAMIC_DETAIL_FIXTURES=BLOCKED_NO_LEGITIMATE_FIXTURE_FACTORY
```

The second contract IS delivered and verified — a nonexistent id renders a
localized, accessible not-found page in all three languages: one `<h1>`
("Page not found" / "Seite nicht gefunden" / "صفحه یافت نشد"), `dir=rtl` for
Persian, zero unnamed controls.

## 5. `/automation/settings`

HTTP **200** across all three locales on this build, `READY`. The Stage 5 404 was
an artefact of that run's environment.

```
AUTOMATION_SETTINGS_CLASSIFICATION=STALE_AUDIT_OBSERVATION_SUPERSEDED
```

## 6. Evidence and proofs

Final sweep against the final build: **168/168 captured, 0 failed**, real form
login as `role=admin`, consent dismissed by clicking the product's own
`reject-non-essential` button.

```
AUDIT_HARNESS_CONSOLE_ERRORS=0     CONSOLE_PRODUCT_ERRORS=0
CAPTURE_INFRASTRUCTURE_FAILURES=0  SESSION_LOSS=0
WRONG_FINAL_LOCATION=0             UNHANDLED_FETCH_FAILURE=0
STUCK_LOADING=0                    UNATTRIBUTED_CELLS=0
STATUS_CONFLATION=0                UNEXPLAINED_AUTH_REQUIRED=12   <-- SUPERSEDED, now 0
```

Fault injection, forced at the browser's request layer: **90 pass, 0 fail, 18 not
applicable**, `STUCK_LOADING_UNDER_FAULT=0`. After the rename, `offline →
network-error` is now 30/30 (it was 24/30 while OT folded it into `FAILED`). The
18 are `/dashboard/organization`, which resolves its organization in a *server*
component and so never mounts its client without a database — a fault never
requested cannot be judged.

**Mutations: 42/42 caught** — 15 product, 18 harness/detector, 9 context — every
file byte-identical afterwards, every baseline green.

Two holes the context proof found in its first run, both now closed: nothing
tested `ot-operations/api.ts`'s throw site, and nothing tested which codes offer
a retry. A mutation proof whose anchors silently fail to match reports a clean
bill of health it has not earned; it is now line-ending aware.

## 7. Validation

| command | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| focused eslint | 0 errors |
| `npx vitest run` | **436 files, 9,764 tests — 9,624 passed, 140 skipped, 0 failed** |
| `npm run build` | exit 0, 970 static pages |

File count 434 → 436 (+2 suites), tests 9,734 → 9,764 (+30) — exactly what was
added, so nothing was silently dropped. `phase102-media-processing.test.ts` still
fails to collect, proven pre-existing by git-object identity with HEAD.

Four OT suites broke on the way and were repaired, never weakened: three test
doubles learned about `resolveOrgContext`, and the security-ordering gate was
updated to name the new resolver while **adding** it to the forbidden-import list
so the machine-route guard did not lose coverage.

```
STAGE6B_REMAINING_IDIOM_FILES=56
STAGE6A_IS_NOT_A_REPO_WIDE_FETCH_FIX
```

---

# Stage 6-A — Final Auth/Context Semantic Closure

## 1. Caller inventory — derived, not remembered

`docs/design/stage6a/caller-inventory.mjs` walked `src/app` and `src/lib`:

| helper | production callers |
|---|---|
| `requireOrgContext` | **10** (9 billing routes + `billing-track.ts`) |
| `requirePlatformAuth` | **71** (copilot, digital-twin, industrial, media, platform, …) |

81 routes. That number is why the impact map was mandatory: this is not a
one-line status change, and seven test files broke as a direct result.

## 2. The contract

Both helpers collapsed several outcomes into 401. The platform helper already
CLASSIFIED them correctly and then threw the classification away.

| situation | was | now |
|---|---|---|
| no credential / bad token / revoked session / bad API key | 401 | **401**, uniform and indistinguishable |
| valid session, no ACTIVE organization | 401 | **409 `ORGANIZATION_CONTEXT_REQUIRED`** |
| site required but not selected | 401 | **409 `SITE_CONTEXT_REQUIRED`** |
| capability insufficient | 403 | **403 `FORBIDDEN`** (unchanged) |
| organization store unreachable | 401 | **500 `INTERNAL_ERROR`** |

`src/lib/auth/context-result.ts` holds the vocabulary, statuses and sentences in
one place, so no call site invents its own.

**The anti-enumeration property is stronger than before, not weaker.** Every
reason reachable BEFORE the session is verified still answers one identical 401 —
and that is now asserted directly, by requiring the four pre-authentication
answers to be byte-identical to one another. The richer answers require a
verified session and describe the caller's own account to that caller.

## 3. Two things the work turned up

**A database outage was being reported as a login problem.**
`organization_resolution_failed` — no client, or the query threw — answered 401,
so an operator hitting an outage was sent to a login form. It is now 500.

**The two helpers disagreed on the same deployment.** `resolveFirstOrgId` returns
`organization_resolution_failed` when there is no client at all, which in SESSION
mode is by design rather than a fault. Billing answered 409 there while the
platform answered 500, claiming an outage that was not happening. `refusalFor()`
now decides by storage mode, and a test asserts the two helpers agree.

## 4. A correction to my own accounting

The first version of the classifier accepted any cell whose API had answered 401.
That is circular — a 401 sent to a valid session IS the defect — and it reported
0 unexplained while 12 cells were plainly wrong. The rule now lets the SESSION
decide: authenticated browser + "sign in" on screen = unexplained, whatever
status produced it. Applying the honest rule turned 0 into 12, and the work in
this round turned 12 into 0.

## 5. Evidence — three genuinely independent runs

My first attempt at "three runs" was not three runs. I reused directory names
that already existed, so run 2 mixed **two** runIds and run 3 never executed at
all — its log was empty and its records were hours old. The verification I ran
against them was therefore describing old builds. Redone into provably new
directories, with identity asserted:

| run | records | runIds | window |
|---|---|---|---|
| 1 | 168 | 1 (`mt42287y-794`) | 07:27:20–07:32:49 |
| 2 | 168 | 1 (`mt429ob3-onw`) | 07:33:07–07:38:39 |
| 3 | 168 | 1 (`mt42h63v-680`) | 07:38:56–07:44:24 |

All three: `captured 168, failed 0`, real form login as `role=admin`, consent
dismissed by clicking the product's own button.

**All three produce identical counters and identical classification:**

```
AUDIT_HARNESS_CONSOLE_ERRORS=0   CONSOLE_PRODUCT_ERRORS=0
CAPTURE_INFRASTRUCTURE_FAILURES=0  SESSION_LOSS=0
WRONG_FINAL_LOCATION=0           UNHANDLED_FETCH_FAILURE=0
STUCK_LOADING=0                  UNATTRIBUTED_CELLS=0
STATUS_CONFLATION=0              UNEXPLAINED_AUTH_REQUIRED=0
```

| classification | cells |
|---|---|
| READY | 96 |
| ORG_CONTEXT_REQUIRED | 36 |
| NOT_FOUND | 30 |
| UPSTREAM_FAILURE | 6 |

The 12 formerly-unexplained cells resolved as: `/dashboard/billing` → 409
`org-context-required` (the reader is told to select an organization), and
`/dashboard/api` → 500 `server-error` (an honest infrastructure answer). Neither
tells a signed-in administrator to sign in again.

## 6. Fixtures — still blocked, still not faked

```
ASSET_DETAIL_FIXTURE=BLOCKED_NO_LEGITIMATE_DETAIL_FIXTURE
EXECUTION_DETAIL_FIXTURE=BLOCKED_NO_LEGITIMATE_DETAIL_FIXTURE
```

`/api/assets` and `/api/automation/executions` expose GET only, both stores are
Prisma-backed with no session-mode fallback, there is no fixture factory, and no
disposable database is available. The not-found contract IS verified: 12 cells,
one `<h1>`, zero unnamed controls, correct direction, localized —
"Page not found" / "Seite nicht gefunden" / "صفحه یافت نشد".

## 7. Mutations — 52 across four proofs

| proof | result |
|---|---|
| product | 15/15 |
| harness / detector | 18/18 |
| context semantics | 9/9 |
| refusal semantics | 10/10 |

Every file byte-identical afterwards; every baseline green.

Three holes the proofs found and forced closed:
- nothing asserted the membership query filters on `status: "ACTIVE"`, so
  deleting it — which would restore access to every suspended member — passed
  unnoticed. Now asserted on the QUERY, not on a stubbed answer;
- nothing covered the context refusal in the UI;
- two anchors had gone stale as the code evolved, reporting a clean bill of
  health the proof had not earned. Anchors are now line-ending aware.

## 8. Tests repaired, never weakened

Seven files broke. Each was updated to the new contract with its security
property intact and stated:

- `platform-auth-classification` — the block titled "the public contract did NOT
  change", carrying the note *"Explicitly NOT 403 — that semantic change is
  deliberately deferred"*, was the deferral this round was authorized to make.
  Replaced with a finer-grained contract that asserts pre-authentication answers
  are byte-identical — a stronger anti-enumeration test than the one it replaced;
- `media-assets-collection` — the test's own comments say "the platform guard
  refuses" and "both fail-closed". Refusal and `mediaAsset.length === 0` are
  unchanged; only which refusal;
- `phase103-voice-*` — still DENIES, still `providerCalls === []`; the accepted
  status set now includes the codes that name the cause;
- the media harness and the platform suite now PIN storage mode, so a test that
  simulates an outage says which deployment it is describing instead of
  inheriting it from the environment;
- three OT test doubles learned `resolveOrgContext`, and the security-ordering
  gate kept its rule while **adding** the new name to the forbidden-import list.

## 9. Validation

| command | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| focused eslint | 0 errors |
| `npx vitest run` | **437 files, 9,797 tests — 9,657 passed, 140 skipped, 0 failed** |
| `npm run build` | exit 0, 970 static pages |
| credential scan | 3,198 files, **0** occurrences |

`phase102-media-processing.test.ts` still fails to collect — proven pre-existing
by git-object identity with HEAD.

## 10. What is NOT green

**`overflow=0` is not met: 4 cells.** All pre-existing and unrelated to this
change:

| route | locale | viewport | overflow | evidence |
|---|---|---|---|---|
| `/documents/explorer` | en/de/fa | 390×844 | 247–251px | Stage 5 recorded 262–266px at 375×812, before any of this work |
| `/crm/customer-success` | de | 390×844 | 50px | German long copy; the diff shows only the fetch idiom and error branch changed, never the success layout |

Both cells render `READY` at HTTP 200 — they are responsive layout debt, not
async-state defects, and fixing them is a design change outside this
authorization.

```
STAGE6B_REMAINING_IDIOM_FILES=56
STAGE6A_IS_NOT_A_REPO_WIDE_FETCH_FIX
```

---

# Stage 6-A.1 — Narrow corrections after independent review

The review returned `CHANGES_REQUIRED` with the direction approved. Six
corrections, no redesign.

## 1. A thrown query is no longer reported as "you have no organization"

The real defect, and the sharpest of the six. `getOrgContext` caught a membership
query exception and returned `null`; `resolveOrgContext` then re-queried, found a
perfectly healthy client, and concluded the account had no organization — so a
**database fault was reported to the user as a fact about their account**, and
the incident stayed invisible.

`resolveOrgContext` is now a single discriminated pass with **one** lookup and
nothing to reconstruct:

| situation | answer |
|---|---|
| identity absent, malformed or unverifiable | 401 `AUTHENTICATION_REQUIRED` |
| no client, database mode | 500 `INTERNAL_ERROR` |
| no client, session mode | 409 `ORGANIZATION_CONTEXT_REQUIRED` |
| `findFirst` **throws** | 500 `INTERNAL_ERROR` |
| no ACTIVE membership row | 409 `ORGANIZATION_CONTEXT_REQUIRED` |
| ACTIVE membership | success |

`getOrgContext` survives only as a compatibility wrapper for callers that still
want the nullable shape, and it delegates rather than repeating the lookup, so
the two can never drift.

A test counts the calls: **exactly one** store query per resolution. That is what
keeps the reconstruction from coming back.

## 2. Every Media refusal is forwarded, not invented

The review flagged eight routes. Auditing all eight found **three** shapes, and
the worst was not among the three already noticed:

| shape | routes | defect |
|---|---|---|
| `json({…, code: "AUTHENTICATION_REQUIRED"}, auth.status)` | assets ×2, assets/[id], transitions | status right, code hard-coded — a 409 carrying "sign in again" |
| `deny(401, "authentication_required")` | poster/upload, subtitles, upload | **status hard-coded too** — still answering 401 to a signed-in caller, on the routes that accept files |
| `securityError({error}, auth.status)` | me/favourites, me/progress | code dropped entirely |

All eight now forward `error`, `status` and `code` exactly as the helper produced
them.

```
MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=0
```

## 3. Recovery controls meet 44px

Both controls this stage introduced were built with the design system's `sm`
size — 32px. A recovery control is the worst place to be hard to hit: the reader
is already stuck, and on a phone that difference decides whether they recover.
Both now use `lg`, the DS token that already documents itself as "44px — meets
mobile touch-target minimum". No arbitrary CSS, and the accessible name, focus
and keyboard behaviour are asserted unchanged.

```
NEW_SUB44_CONTROLS=0
```

## 4. The pre-auth equality proof was incomplete

It claimed four byte-identical answers and compared three. `invalid_api_key` — a
real fourth path, reached with a `hk_` bearer token — was never exercised, so a
change to its mapping alone would have passed unnoticed. It is now included, the
comparison is byte-for-byte on the serialized response, and a mutation that
changes **only** that mapping is caught.

```
PREAUTH_EQUALITY_CASES=4/4
```

## 5. The OT copy no longer promises a selector that does not exist

It said "Select an organization" and "Choose an organization to load its OT
estate". There is no organization selector anywhere in this product. Telling a
stuck operator to do something impossible is only marginally better than telling
them to sign in again.

It now reads, in all three languages: *"No organization context — you are signed
in, but no active organization context is available for this account. Ask an
administrator to add you to an organization."*

Site copy is untouched: the OT list pages have a real site filter, so asking for
a site selection is truthful there. Only values changed, so catalogue leaf counts
are unaffected — 29 leaves in `otEdge.states` before and after — and the German,
Persian, ZWNJ and Arabic ي/ك gates all pass.

## 6. Stage 6-B debt, recorded explicitly

Not fixed in this pass, by instruction, and not to be waved through later:

**Four pre-existing overflow cells**

| route | locale | viewport | overflow |
|---|---|---|---|
| `/documents/explorer` | en | 390×844 | 251px |
| `/documents/explorer` | de | 390×844 | 247px |
| `/documents/explorer` | fa | 390×844 | 247px |
| `/crm/customer-success` | de | 390×844 | 50px |

Stage 5 recorded 262–266px on `/documents/explorer` at 375×812 before any of this
work. Both cells render `READY` at HTTP 200 — responsive layout debt, not async
state.

**56 remaining raw-fetch idiom files** — derived by `stage6b-debt.mjs`, never
hand-listed. Stage 6-A is not a repository-wide fetch fix.

**Hidden-focusable debt**

| viewport | total across 168 cells |
|---|---|
| desktop 1440×900 | 60 |
| mobile 390×844 | 2352 |

135 of 168 cells are affected. The detector definition is
`document.querySelectorAll(<focusable>)` filtered to elements failing the probe's
`visible()` predicate — an element that can receive keyboard focus while not
being visible, so a keyboard user tabs into something they cannot see.

It is app-shell-wide, not caused by this stage: routes never touched here
(`/cmms/settings`, `/articles/following`, `/documents/explorer`) report the same
counts — 1 on desktop, 20–38 on mobile — consistent with an off-canvas mobile
navigation that stays focusable. Stage 5 did not measure this signal, so the
provenance argument rests on untouched routes rather than on a historical
comparison.

```
STAGE6B_DEBT_RECORDED=YES
VISUAL_AUDIT_COMPLETE=NO   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
PHASE107_COMPLETE=NO   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
```

---

---

# Stage 6-A.1 — revalidation on the corrected tree

Re-run in full after the eight corrections. Three things changed as a result,
and one of them was a real defect nobody had asked about.

## 7. The forwarding detector was measuring almost nothing

`MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=0` was going to be reported on the strength
of `impact-map.mjs`. Re-running it on the corrected tree printed
`doesNotForward: 11`, still naming the eight Media routes that had just been
fixed — so the number was checked instead of quoted.

The generator tested **one regex against the whole file**:

```js
/\{\s*status:\s*\w+\.status\s*\}/
```

That recognises exactly one shape, `NextResponse.json(body, { status: x.status })`.
It was wrong in both directions:

- it could not see positional forwarding (`json(body, auth.status)`,
  `deny(auth.status, auth.code)`), so it **false-alarmed** on the eight routes;
- being file-level, it could not see a **single hard-coded site in a file whose
  other sites forward correctly** — which is exactly the defect Stage 6-A exists
  to close. A file with one good site and one hard-coded site read as clean.

It now analyses each `if ("error" in NAME)` site individually: the status must
derive from `NAME.status`, and any code carried must be `NAME.code`. Two narrow
exemptions are stated rather than assumed:

| shape | why it is not an exception |
|---|---|
| `{ error: "Site not found" }, { status: 404 }` | the anti-enumeration 404 CLAUDE.md requires — forwarding 403 would confirm the site exists to someone with no access |
| `return denyAfterLookup();` | one level of local, zero-argument delegation, resolved and re-read; the helper is `deny(404, "not_found")` — the same deliberate answer, named |

Both are deliberately narrow. The delegation resolver refuses any callee that
takes arguments, because a helper handed the refusal could do anything with it.

**225 refusal sites** across the 81 callers are now read individually.

## 8. A real defect the old detector could not have found

With the per-site rule in place, one genuine contradiction appeared — and it was
**caused by this stage's own semantic change**:

```
src/lib/copilot/voice/guard.ts   status=forwarded   code=literal
```

The voice guard forwarded `auth.status` while hard-coding the label:

```ts
refuse("Authentication required", "AUTHENTICATION_REQUIRED", auth.status)
```

That was consistent for as long as `requirePlatformAuth` could answer nothing but
401. Once it began answering **409** for a signed-in caller with no organization
and **500** for an unreachable store, the guard started returning a 409 whose body
read `AUTHENTICATION_REQUIRED` — a signed-in operator told to sign in again, which
is the precise defect this stage was opened to eliminate, reproduced one layer
further out. The voice tests had already been widened to accept 409 and 500, so
nothing was red; only the label was wrong.

The guard now maps the cause it is given, reusing codes the closed
`VoiceErrorCode` union already contains, so no catalogue leaf moved:

| refusal | voice code |
|---|---|
| `ORGANIZATION_CONTEXT_REQUIRED` | `ORGANIZATION_SCOPE_REQUIRED` |
| `INTERNAL_ERROR` | `COPILOT_UNAVAILABLE` |
| everything pre-authentication | `AUTHENTICATION_REQUIRED` |

The anti-enumeration property is unchanged: every pre-authentication cause still
collapses to one status and one code. The two codes that differ are reachable
only *after* identity has been proven, so an unauthenticated prober learns
nothing new.

This is the one change in this pass beyond the eight requested corrections. It is
reported rather than folded in silently because it was self-inflicted: the
semantic split made a previously-correct hard-code wrong.

A test asserts the **pairing** rather than a single expected value — status and
label must agree whichever refusal the chain reaches first — and names the exact
contradiction that shipped, so a regression is unambiguous.

## 9. The detector is now shown to fail

A detector that prints zero is worth nothing until it has caught something; the
previous one printed a reassuring number while blind to every shape that mattered.
`detector-selfcheck.mjs` reintroduces four real defects and requires the exception
count to rise each time:

| reintroduced defect | result |
|---|---|
| a Media route hard-codes the refusal code again | CAUGHT (0 → 2) |
| an upload route hard-codes the refusal **status** again | CAUGHT (0 → 1) |
| the voice guard puts one label on every status again | CAUGHT (0 → 1) |
| a hard-coded **401** dressed as the deliberate-404 exemption | CAUGHT (0 → 1) |

The fourth case exists because an exemption that swallowed a hard-coded 401 would
be worse than no detector at all. Every file was restored from captured bytes and
compared by SHA-256.

SUPERSEDED — this regex-based detector and its four controls were replaced in
Stage 6-A.2 by an AST analyser with five positive and two negative controls.
The count below described that earlier detector; the current one is 7/7.

```
DETECTOR_SELFCHECK=4/4   (SUPERSEDED — see §21)
```

## 10. Two mutation anchors had gone stale — reported, not papered over

Re-running the other three mutation classes dropped from 15/15 to 14/15 and 9/9
to 8/9. Neither was a test hole: both proofs reported `MISAPPLIED — anchor
matched 0 times` and refused to count the mutation as caught. The corrections had
moved the code out from under them:

- correction #1 rewrote `resolveOrgContext` into a single discriminated pass, so
  the combined `if (!role || !payload?.sub)` guard no longer exists — re-anchored
  to the unverifiable-token guard, a distinct third cause;
- correction #3 changed the recovery control from `sm` to `lg`, so the sign-in
  link anchor no longer matched — re-anchored to the 44px control.

This is the behaviour the EOL-aware anchoring was added for: a proof that cannot
find its target must say so, because a silently unmatched anchor reports a clean
bill of health it never earned.

**All four classes, on the final tree:**

| class | result |
|---|---|
| product | 15/15 caught |
| harness | 18/18 caught |
| context | 9/9 caught |
| refusal | 15/15 caught |
| **total** | **57/57**, every file restored byte-identical, baseline GREEN |

## 11. What the validation actually reported

| check | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean (one error found and fixed: the new Media test passed a `title` field `SeedAssetInput` does not have) |
| `npm run lint` | exit 0 |
| focused eslint `--max-warnings=0` | 2 warnings, **0 errors**, both proven pre-existing |
| targeted auth/context/media/UI suites | 23 files, 666 passed, 4 skipped |
| `npm test` | **427 files passed, 1 failed; 9673 tests passed, 140 skipped, 0 test failures** |
| three sweep integrity checks | 168 cells each, 0/0/0, in agreement |

### The one failing file

`scripts/__tests__/phase102-media-processing.test.ts` — `SyntaxError: Invalid or
unexpected token`. **Zero tests failed**; the file fails to parse. It is proven
pre-existing rather than asserted:

- `git status` reports it unmodified;
- it is **byte-identical to HEAD** once line endings are normalised (both
  `67ce54a5…`), the raw difference being the CRLF checkout;
- it fails identically when run alone;
- nothing in the change set touches media processing.

This is the known Windows-only Phase 102 parse failure; Linux CI has previously
shown the same file passing.

### The two lint warnings

`SUBTITLE_REJECTION_REASONS` (used only as a type) and an unused `buildAsset`
import. The first is byte-identical at HEAD and this stage's only edit in that
file is one unrelated line; the second is in a file this stage never touched.
`npm run lint`, the gate the repository actually enforces, exits 0.

## 12. What the sweeps do and do not cover

The three 168-cell sweeps were captured at **07:51–08:32Z, before** the Stage
6-A.1 corrections, and re-capturing was explicitly excluded from this pass. They
are therefore evidence for the tree as it stood at the end of Stage 6-A, not for
the eight corrections on top of it.

What covers the corrections instead: 57 mutations across four classes, the
detector self-check, and the targeted suites. Stated plainly because "three
sweeps agree" would otherwise read as though it included work the sweeps never saw.

A re-sweep is the honest closing step for Stage 6-B, and is listed there.


---

# Stage 6-A.1 — final evidence refresh

No product behaviour was changed in this pass. Its purpose was to prove the tree
that already exists, on evidence captured from that tree rather than from an
earlier one.

## 13. Test discovery was compared, not totalled

The earlier runs reported 437 collected files once and "427 passed" later, and
the gap was never reconciled. Vitest can drop a file silently — a worker that
dies or an environment that fails to start leaves the totals looking healthy
while the assertions inside were never executed — so the difference had to be
explained rather than averaged.

Both pools were run with the JSON reporter and their **discovery manifests**
compared file by file:

| | default pool | `--pool=threads` |
|---|---|---|
| collected files | 437 | 437 |
| passed files | 436 | 436 |
| failed files | 1 | 1 |
| total tests | 9813 | 9813 |
| passed | 9673 | 9673 |
| failed | **0** | **0** |
| skipped | 140 | 140 |
| todo | 0 | 0 |

```
DISCOVERY_ONLY_IN_FORKS=0
DISCOVERY_ONLY_IN_THREADS=0
REQUIRED_SUITES_MISSING=0        11 named Stage 6-A/A.1 suites, present in both
PER_FILE_COUNT_DIFFERENCES=0
TEST_DISCOVERY_PARITY=PASS
```

The 427/437 gap is arithmetic, not loss:

```
427 files with at least one passing test
  9 files entirely skipped
  1 file failed
437 collected
```

The 9 are `.live.` and `.integration.` suites plus two backup-verifier suites,
each gated on a service this machine does not run. None belongs to this stage and
none was disabled here.

`scripts/__tests__/phase102-media-processing.test.ts` remains the single failing
file, with **zero failing tests** — it fails to parse. Proven pre-existing rather
than asserted: unmodified in `git status`, byte-identical to HEAD once line
endings are normalised (both `67ce54a5…`), and failing identically when run alone.

## 14. Three fresh sweeps, on this tree

The three earlier sweeps are marked historical: they were captured before the
Stage 6-A.1 corrections. Three new ones were run against a production build of
the current working tree, each with its own runId and its own output directory.
Nothing was reused.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| runId | `mt4mwp54-4a8` | `mt4n5bab-gkg` | `mt4nd4f7-5y8` |
| cells | 168 | 168 | 168 |
| records = screenshots | 168 = 168 | 168 = 168 | 168 = 168 |

**Classification, identical in all three:**

| bucket | cells |
|---|---|
| READY | 96 |
| ORG_CONTEXT_REQUIRED | 42 |
| NOT_FOUND | 30 |
| SITE_CONTEXT_REQUIRED | 0 |
| DEGRADED_HANDLED | 0 |
| UPSTREAM_FAILURE_HANDLED | 0 |
| UNEXPLAINED_AUTH_REQUIRED | **0** |
| UNHANDLED_FETCH_FAILURE | **0** |
| STUCK_LOADING | **0** |
| WRONG_FINAL_LOCATION | **0** |

```
FINAL_TREE_AUTH_SWEEPS=3/3_COMPLETE
FINAL_TREE_EVIDENCE_CELLS=504/504
CLASSIFICATION_DIFFERENCES=0
EVIDENCE_INTEGRITY_FAILURES=0
AUDIT_HARNESS_CONSOLE_ERRORS=0
PRODUCT_CONSOLE_ERRORS=0
SESSION_LOSS=0
```

### One difference from the earlier sweeps, and it is the fix

The earlier runs classified **6 cells as `server-error` and 36 as
`org-context-required`**. These classify **0 as `server-error` and 42 as
`org-context-required`**. That is correction #1 working end to end: in session
mode there is no organization store *by design*, which is a 409, not a 500. Those
six cells previously told the reader the server had failed.

### Console errors

126 console messages across 78 cells, every one attributed to `NETWORK` — the
API refusals and the deliberate 404s the matrix asks for. **Zero** authored by
the audit tool, **zero** authored by the product, **zero** hydration errors.

## 15. The refusal contract, pinned on the live server

A sweep photographs pages; it cannot show what an endpoint puts in a refusal
*body*, and the body is where the defect lived. A probe drove the same production
server with the same ephemeral identity and the same real form login, as two
callers:

| endpoint family | anonymous | signed in |
|---|---|---|
| 8 Media routes | 401 `AUTHENTICATION_REQUIRED` | 409 `ORGANIZATION_CONTEXT_REQUIRED` |
| 3 voice routes | 401 `AUTHENTICATION_REQUIRED` | 409 `ORGANIZATION_SCOPE_REQUIRED` |

```
ENDPOINTS_PROBED=24
ANON_401_DISTINCT_SHAPES=1          anti-enumeration holds
MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=0
VOICE_REFUSAL_FORWARDING_EXCEPTIONS=0
REFUSAL_CONTRACT_VIOLATIONS=0
```

No refusal other than a 401 carries an authentication label. That single
invariant is what the eight Media routes and the voice guard each broke in their
own way, and it is now asserted against a running server rather than a test double.

### Two probe defects found before they became false findings

Both would have been written up as product defects:

1. **The upload routes gate on `content-type` BEFORE authenticating.** A JSON
   probe got 415 and never reached the guard — so the three routes that had *both*
   the status and the code hard-coded were not being exercised at all. The probe
   now sends `multipart/form-data`, which is the only way to reach their refusal.
2. **Two legitimate refusal body shapes exist.** Most routes answer
   `{ error, code }`; the upload family answers `{ ok: false, error: "<CODE>" }`
   because `deny(status, code)` has always put the machine-readable code in
   `error`. Reading only `code` reported those three as carrying no label.

Neither is a product fault. They are recorded because a probe that reports a
contract it never exercised is the same failure this stage found in the audit
harness itself.

## 16. Responsive debt, unchanged and not attributed to this stage

Present in all three fresh sweeps, at identical measurements:

| route | locale | viewport | overflow |
|---|---|---|---|
| `/documents/explorer` | en | 390×844 | 251px |
| `/documents/explorer` | de | 390×844 | 247px |
| `/documents/explorer` | fa | 390×844 | 247px |
| `/crm/customer-success` | de | 390×844 | 50px |

```
PRE_EXISTING_RESPONSIVE_DEBT=4
VISUAL_AUDIT_COMPLETE=NO   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
```

Not fixed here, by instruction. Stage 6-B.

**Hidden-focusable**, reported separately and *not* attributed to Stage 6-A.1:
135 of 168 cells, 2412 elements — 60 at 1440×900 and 2352 at 390×844. The counts
are identical to those measured before these corrections, and routes this stage
never touched report the same values, which is what places the cause in the app
shell's off-canvas mobile navigation rather than in any change made here.

## 17. Revalidation on the final tree

| check | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` | exit 0 |
| focused ESLint, 65 changed source files, `--max-warnings=0` | 2 warnings, **0 errors**, both proven pre-existing |
| security + route inventory | committed inventory matches the source tree |
| detector self-check | 4/4 |
| report-status check | `REPORT_STATUS_CONFLICTS=0` |
| mutations | **57/57**, every file restored byte-identical, 0 misapplied |
| `npm test` (default pool) | 437 collected, 0 test failures |
| `npx vitest run --pool=threads` | 437 collected, 0 test failures |
| `npm run build` | exit 0, 970/970 static pages |

Nothing above is reported on an exit code alone: the file and test counts and the
discovery manifests are the judge, and the two lint warnings are named rather
than absorbed into a pass.


---

# Stage 6-A.2 — narrow corrections after the second review

Six corrections. One of them turned up five real defects nobody had asked about,
and one of them proved that an assertion this stage relied on had never run.

## 18. The inventory disagreed with itself because measuring changed the tree

The pack reported four numbers for one change set: the report said 107,
`changed-paths.txt` and `diff-inventory.json` listed 113, and
`00-worktree-checksums.json` covered 108 — missing `ROLLBACK.md`,
`final-sweep-report.mjs`, `refusal-contract-probe.mjs`,
`test-discovery-parity.{mjs,json}`.

None was a lie. Each was taken at a different moment, and **every generator
wrote its output back into the worktree it had just measured**:

```
diff-inventory.mjs  ->  docs/design/stage6a/diff-inventory.json
impact-map.mjs      ->  docs/design/stage6a/impact-map.json
```

An inventory that lives inside the tree it inventories can never settle —
writing its own hash changes its own hash — and running the generators in a
different order produced a different total.

The fix is **ordering**, not arithmetic:

1. every generator that writes inside the repository has already run;
2. the tree is **frozen** — nothing after this point writes into the worktree;
3. `git status --porcelain -uall` is read **once**, and is the single source;
4. the snapshot is written **outside** the repository, so measuring cannot disturb;
5. the three views are three projections of one array, so they are equal by
   construction rather than by reconciliation — and `freeze-snapshot.mjs` exits
   non-zero if they are not.

The review ZIP is likewise assembled and written entirely outside the repository,
and it now consumes the frozen snapshot instead of re-reading `git status`.

## 19. A 2xx that says nothing is no longer read as an answer

`requestJson` already treats a selector returning `undefined` as a broken
contract. Three selectors defeated that by turning an ABSENT field into a
valid-looking value:

| surface | was | what the reader saw |
|---|---|---|
| `BillingDashboard` | `subscription ?? null` | a confident "no plan" derived from a body that never mentioned a plan — a wrong answer about money |
| `CustomerSettingsClient` load | `preference ?? DEFAULT_PREFERENCE` | a full settings form built from invented defaults, which they could then save over their real ones |
| `CustomerSettingsClient` save | `preference ?? null`, then `setSaved(true)` unconditionally | **"Settings saved."** for a write nobody could confirm happened |

All three now require the key to be PRESENT. An explicit `null` remains a real
answer — the route contract has exactly two success shapes for settings
(`{preference: null, noAccount: true}` and `{preference}`), and both still work.
The save is stricter than the load because the route returns the upserted record
on every success, so an absent record means the save cannot be confirmed.

All 19 `requestJson` call sites were audited mechanically rather than by eye.
Three still carry a fallback and all three check presence first —
`CustomerAccountClient` guards with
`if (d.account === undefined && d.noAccount === undefined) return undefined`,
which makes its `contacts ?? []` a genuine OPTIONAL.

```
SELECTOR_SITES=19   SELECTORS_WITH_FALLBACK=3   SELECTORS_REQUIRING_FIX=0
```

## 20. Two refusal body shapes, both legitimate

```
{ error: "Organization context required", code: "ORGANIZATION_CONTEXT_REQUIRED" }
{ ok: false, error: "ORGANIZATION_CONTEXT_REQUIRED" }
```

The second is `deny(status, code)` in the Media upload family, which has always
put the machine-readable code in `error`. `requestJson` read only `code`, so
those 409s carried nothing recognised — and since a bare 409 is deliberately NOT
assumed to be a context refusal, they surfaced as a generic `FAILED`. The reader
got "something went wrong" instead of "no organization selected".

`error` is now consulted **only** as a fallback and **only** when its value is an
exact member of the known machine vocabulary. Prose can never be promoted: the
sentence "Authentication required" normalises to `AUTHENTICATION REQUIRED`, with
a space, which is not in the set. A route that starts returning prose degrades to
the generic failure rather than being mis-classified into a specific one.

## 21. The detector was rewritten onto a real parser — and found five live defects

The regex analyser had already been rewritten once (file-level → per-site) and
was still only *nearly* right: every new spelling of a refusal needed a new
pattern, and a shape nobody anticipated read as clean. It now parses with the
TypeScript compiler already in this repository — no new dependency — and asks
structural questions.

Within minutes it found something neither regex version could:

```
5 sites forwarded `member.status` and hard-coded `ORGANIZATION_SCOPE_REQUIRED`
```

`requireOrgActor` refuses for **two** different reasons and says which only
through its status: **401** when there is no usable session — including a
**revoked** one — and **403** when the caller is authenticated but not a member.
So a reader whose session had been revoked received
`401 ORGANIZATION_SCOPE_REQUIRED`: the status said "sign in again", the body said
"you lack organization scope", and the UI branches on the body. It is the same
contradiction Stage 6-A was opened to remove, in guards this stage had never
looked at.

The mapping now lives beside `requireOrgActor` as `orgActorRefusalCode`, so it
cannot drift from the statuses that function actually returns, and it fails
closed (`FORBIDDEN`) for any status it was not taught.

The detector is proven in **both** directions:

| control | result |
|---|---|
| `json(body, 401)` — positional literal status | CAUGHT |
| `deny(409, "site_context_required")` — literal status AND code | CAUGHT |
| `code: "AUTHENTICATION_REQUIRED"` beside a forwarded status | CAUGHT |
| ONE hard-coded site in a file whose others are correct | CAUGHT |
| the voice guard hard-coding its label again | CAUGHT |
| a deliberate anti-enumeration 404 | **QUIET** |
| an exhaustive mapping COMPUTED from `auth.code` | **QUIET** |

The negative controls matter as much as the positive ones: a rule that flagged
any vocabulary literal would have condemned the very mapping this stage added to
the voice guard, and a detector that cries wolf trains everyone to ignore it.

SUPERSEDED — this attribution was not field-sensitive: a DIAGNOSTIC read of
`auth.code` or `auth.status` elsewhere in the arguments sanitised a hard-coded
role. Three controls were added in Stage 6-A.3 and the count is now 10/10; see
§28.

```
DETECTOR_SELFCHECK=7/7   (SUPERSEDED — see §28)
```

## 22. An assertion written to catch the 44px regression had never run

`stage6a-resource-failure-surfaces.test.tsx` contained two **real U+0008
backspace bytes** where a literal `\b` was meant:

```
expect(control!.className).not.toMatch(/<BS>h-8<BS>/);
```

The regex looked for a backspace character next to `h-8`, which no className can
contain. It passed unconditionally — the worst kind of green, because it was
written specifically to catch the recovery control shrinking back to 32px.

The characters are invisible in an editor and in `git diff`, so a byte-level gate
now rejects C0 controls and bidi **overrides** (U+202A–U+202E, U+2066–U+2069)
across every changed file.

A first draft of that gate was too broad and immediately flagged six
**pre-existing, entirely correct** uses of LRM/RLM in `messages/fa.json`:

```
"phoneIran":   "<RLM>+98 913 411 6492"
"noBackupHint": "... هیچ فایل <LRM>.dump<LRM> در BACKUP_DIR ..."
```

Without those marks a leading `+` or a Latin file extension renders on the wrong
side of RTL Persian. Marks are not overrides — they carry no override semantics
and cannot reorder source the way RLO/LRO can — so they are counted and printed
but never fail the gate.

```
CONTROL_CHARACTERS=0   BIDI_MARKS_ALLOWED=6
```

A mutation now shrinks `lg: "h-11 …"` to `h-8` in the design-system token itself,
proving the corrected assertion catches a regression in the **implementation**
rather than in a component's props.

## 23. Provenance

The manifest read `stage: "6-A"` while shipping Stage 6-A.1 content, so two packs
were indistinguishable by their own metadata. It now records `phase: "107"`,
`stage: "6-A.2"`.

## 24. Validation on the final tree

| check | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` | exit 0 |
| focused ESLint, 67 changed source files, `--max-warnings=0` | **real exit 1** — 2 warnings, 0 errors, both proven pre-existing |
| control-character gate | 0 |
| selector audit | 0 requiring fix |
| security + route inventory | matches the source tree |
| detector self-check | 7/7 |
| report-status check | `REPORT_STATUS_CONFLICTS=0` |
| mutations | **65/65** — product 15, harness 18, context 9, refusal 23; 0 MISAPPLIED, all files restored byte-identical |
| `npm test` (default pool, JSON reporter) | 438 files, 9831 tests, **0 failed**, 140 skipped, 0 todo |
| `npx vitest run --pool=threads` | 438 files, 9831 tests, **0 failed**, 140 skipped, 0 todo |
| discovery parity | `TEST_DISCOVERY_PARITY=PASS` |
| `npm run build` | exit 0, 970/970 static pages |

The focused ESLint exit code is reported as it actually was. Both warnings —
`SPEECH_REGISTRY_ID` and `SUBTITLE_REJECTION_REASONS` — are imported-but-unused at
HEAD, in files whose only edits here are unrelated single lines.

`scripts/__tests__/phase102-media-processing.test.ts` remains the one failing
FILE with **zero failing tests**: it fails to parse. Unmodified in `git status`,
byte-identical to HEAD once line endings are normalised (`67ce54a5…` both ways),
and failing identically when run alone — the known Windows-only Phase 102 defect.

## 25. Three fresh sweeps, on the corrected tree

Product code changed in this pass, so every earlier sweep was discarded rather
than reused. Three new runs, each with its own runId and its own directory:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| runId | `mt569i7r-ifs` | `mt56hjue-ip4` | `mt56ozu2-lnw` |
| records = screenshots | 168 = 168 | 168 = 168 | 168 = 168 |
| failed captures | 0 | 0 | 0 |

**Identical in all three:**

| bucket | cells |
|---|---|
| READY | 96 |
| ORG_CONTEXT_REQUIRED | 42 |
| NOT_FOUND | 30 |
| SITE_CONTEXT_REQUIRED / DEGRADED_HANDLED / UPSTREAM_FAILURE_HANDLED | 0 |
| UNEXPLAINED_AUTH_REQUIRED | **0** |
| UNHANDLED_FETCH_FAILURE | **0** |
| STUCK_LOADING | **0** |
| WRONG_FINAL_LOCATION | **0** |

```
FINAL_TREE_AUTH_SWEEPS=3/3_COMPLETE
FINAL_TREE_EVIDENCE_CELLS=504/504
CLASSIFICATION_DIFFERENCES=0
EVIDENCE_INTEGRITY_FAILURES=0
AUDIT_HARNESS_CONSOLE_ERRORS=0   PRODUCT_CONSOLE_ERRORS=0   HYDRATION_ERRORS=0
SESSION_LOSS=0
```

126 console messages across 78 cells, every one attributed to `NETWORK` — the API
refusals and deliberate 404s the matrix asks for.

### The live refusal contract

24 calls against the same production server with the same ephemeral identity,
as two callers:

| caller | result |
|---|---|
| anonymous, 12 endpoints | all `401 AUTHENTICATION_REQUIRED`, **one distinct shape** |
| signed in, 9 media/platform endpoints | `409 ORGANIZATION_CONTEXT_REQUIRED` |
| signed in, 3 voice endpoints | `409 ORGANIZATION_SCOPE_REQUIRED` |

```
ENDPOINTS_PROBED=24   ANON_401_DISTINCT_SHAPES=1
MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=0
VOICE_REFUSAL_FORWARDING_EXCEPTIONS=0
REFUSAL_CONTRACT_VIOLATIONS=0
```

### Screenshot stability, measured in pixels rather than hashes

The previous pass had three cells whose SHA-256 differed across runs. A hash says
only "not identical"; it cannot say whether a page is non-deterministic in a way
a reader would notice. Measured per pixel, this tree has **one**:

| cell | distinct hashes | differing pixels | max channel delta | region |
|---|---|---|---|---|
| `/articles/following` fa 1440×900 | 2 of 3 | 0.0022% | 1 of 255 | 6×6 at (1412,27) |

A one-level channel difference in a 36-pixel region is sub-perceptual. It is
recorded as EXPLAINED, and byte-equality across runs is **not** claimed:

```
UNSTABLE_CELLS=1   UNEXPLAINED_INSTABILITY=0   BYTE_EQUALITY_CLAIMED=NO
```

## 26. Responsive debt — unchanged, and not attributed to this stage

Present in all three fresh sweeps at identical measurements:

| route | locale | viewport | overflow |
|---|---|---|---|
| `/documents/explorer` | en | 390×844 | 251px |
| `/documents/explorer` | de | 390×844 | 247px |
| `/documents/explorer` | fa | 390×844 | 247px |
| `/crm/customer-success` | de | 390×844 | 50px |

```
PRE_EXISTING_RESPONSIVE_DEBT=4
VISUAL_AUDIT_COMPLETE=NO   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
```

Not fixed here, by instruction. Stage 6-B.

**Hidden-focusable**, reported separately and NOT attributed to Stage 6-A.2:
135 of 168 cells, 2412 elements — 60 at 1440×900 and 2352 at 390×844. Identical
to the counts measured before these corrections, and routes this stage never
touched report the same values, which places the cause in the app shell's
off-canvas mobile navigation rather than in anything changed here.


---

# Stage 6-A.3 — three blockers, and what closing them uncovered

## 27. The no-account path was still a false success

`CustomerSettingsClient` checked `d.noAccount` **before** proving the documented
`preference` key existed:

```ts
if (d.noAccount) return null;                    // returns BEFORE any guard
if (!("preference" in d)) return undefined;
```

So `200 {"noAccount": true}` short-circuited to `null` and rendered **"No Account
Found"** — a confident statement about the reader's account, derived from a body
that never described it. Both documented envelopes carry `preference`
(`{preference: null, noAccount: true}` and `{preference}`), so its absence is a
broken contract in *every* shape. The presence check now runs first.

| body | result |
|---|---|
| `{}` | FAILED |
| `{noAccount: true}` | **FAILED** — was "No Account Found" |
| `{ok: true, data: {...}}` | FAILED |
| `{preference: null, noAccount: true}` | valid — no account |
| `{preference: null}` | valid — seeds defaults |
| `{preference: {...}}` | valid |

### The audit that certified it had asked the wrong question

`selector-audit.mjs` searched for `"k" in d` **anywhere** in the selector and
answered SAFE if it found one. The guard existed — it simply ran after the return
it was meant to protect. A guard that executes after the value it guards guards
nothing, and a textual search cannot tell the difference.

The audit now reads the AST **in statement order**: at each `return` producing a
value, has a presence check already executed on this path? It is proven to catch
the exact defect — moving the guard back below the early return takes
`SELECTORS_REQUIRING_FIX` from 0 to 1, with the file restored byte-identically.

### It immediately found a second instance nobody had reported

```
src/components/customer-portal/CustomerOverviewClient.tsx:28
   ! early value return: if (d.noAccount) return null;
```

`/api/customer/overview` has the identical contract — `{overview: null,
noAccount: true}` or `{overview}` — and the identical defect. Fixed the same way,
with the same four-shape test coverage.

One finding of the rewritten audit was its **own** false positive: it called the
settings SAVE selector unsafe because the guard
`!d.preference || typeof d.preference !== "object"` contains `||`. That `||`
narrows a check; it cannot manufacture data. Fallback detection is now scoped to
expressions that are actually **returned**.

```
SELECTOR_SITES=19   SELECTORS_WITH_FALLBACK=3
SELECTORS_NOT_ANALYSED=0   SELECTORS_REQUIRING_FIX=0
```

## 28. The AST detector was not field-sensitive

It asked "does `NAME.status` appear anywhere in any argument?" — so a
**diagnostic** read sanitised a hard-coded field. All three shapes below were
reported clean:

```ts
json({ diagnostic: auth.code, code: "AUTHENTICATION_REQUIRED" }, auth.status)
json({ diagnosticStatus: auth.status, code: auth.code }, 401)
json({ diagnosticStatus: auth.status, diagnosticCode: auth.code,
       code: "AUTHENTICATION_REQUIRED" }, 401)
```

Each role is now resolved to the **one expression that occupies it** — the
`status:` property or the positional status argument; the `code:` property or the
positional code argument — and only that expression is judged. Reads elsewhere in
the arguments are ignored: a diagnostic cannot make a literal correct. A read
*inside* the role expression still counts, which is what keeps an exhaustive
computed mapping (`auth.code === "X" ? "A" : "B"`) classified as derived rather
than hard-coded.

All three shapes are permanent positive controls. Every earlier control is
retained.

| # | positive control | result |
|---|---|---|
| 1 | `json(body, 401)` — positional literal status | CAUGHT |
| 2 | `deny(409, "site_context_required")` | CAUGHT |
| 3 | `code: "AUTHENTICATION_REQUIRED"` beside a forwarded status | CAUGHT |
| 4 | ONE hard-coded site in a file whose others are correct | CAUGHT |
| 5 | the voice guard hard-coding its label | CAUGHT |
| 6 | diagnostic `auth.code` beside a hard-coded `code` | CAUGHT |
| 7 | diagnostic `auth.status` beside a hard-coded status | CAUGHT |
| 8 | diagnostics for BOTH roles, both roles hard-coded | CAUGHT |

| # | negative control | result |
|---|---|---|
| A | deliberate anti-enumeration 404 | QUIET |
| B | exhaustive mapping computed from `auth.code` | QUIET |

```
BASELINE_EXCEPTIONS=0
DETECTOR_POSITIVE_CONTROLS=8   DETECTOR_NEGATIVE_CONTROLS=2
DETECTOR_SELFCHECK=10/10
```

## 29. The pixel-diff claim is now independently reproducible

The previous pack proved only that two hashes differed; the PNG bytes were
excluded, so `0.0022% / 1 of 255 / 6×6` had to be taken on trust.

The pack now carries, for every cell that is not byte-identical across the three
final-tree runs:

- the **original PNG bytes**, one file per distinct hash;
- an explicit **run → SHA-256 mapping**, so which run produced which image is
  recorded rather than inferred;
- the SHA-256 of each emitted file, recomputed from the bytes as written;
- the **raw `image-diff.mjs` output** against exactly those emitted files, plus a
  `REPRODUCE.txt` giving the command.

Two cells vary on this tree, and their symmetry is itself informative:

| cell | distinct hashes | differing | max delta | bounding box |
|---|---|---|---|---|
| `/articles/following` **en** 1440×900 | 2 of 3 | 28 of 1,296,000 (0.0022%) | 1 of 255 | 6×6 at **x=22**, y=26 |
| `/articles/following` **fa** 1440×900 | 2 of 3 | 28 of 1,296,000 (0.0022%) | 1 of 255 | 6×6 at **x=1412**, y=27 |

Identical size, identical count, identical one-level delta, at **mirrored**
leading-corner positions for LTR and RTL — the same 6×6 element rendering one
channel level apart, not a page that re-renders differently. Sub-perceptual, and
recorded as EXPLAINED.

```
UNSTABLE_CELLS=2   UNEXPLAINED_INSTABILITY=0   BYTE_EQUALITY_CLAIMED=NO
```

**Byte-equality across runs is not claimed.** 166 of 168 cells are byte-identical;
the two above are not, and the evidence to recompute exactly how they differ now
travels with the pack.

## 30. Validation on the Stage 6-A.3 tree

| check | result |
|---|---|
| `git diff --check` | clean |
| `npx tsc --noEmit` | clean |
| `npm run lint` | exit 0 |
| focused ESLint, 67 changed source files, `--max-warnings=0` | **real exit 1** — 2 warnings, **0 errors**, both proven pre-existing |
| control-character gate | `CONTROL_CHARACTERS=0`, `BIDI_MARKS_ALLOWED=6` |
| selector audit | `SELECTORS_REQUIRING_FIX=0` |
| detector self-check | 10/10 |
| mutations | **67/67** — product 15, harness 18, context 9, refusal 25; **MISAPPLIED=0**, all files restored byte-identical |
| `npm test` (default pool) | 438 files, 9837 tests, **0 failed**, 140 skipped, 0 todo |
| `npx vitest run --pool=threads` | 438 files, 9837 tests, **0 failed**, 140 skipped, 0 todo |
| discovery parity | `TEST_DISCOVERY_PARITY=PASS` |
| `npm run build` | exit 0, 970/970 static pages |

`scripts/__tests__/phase102-media-processing.test.ts` remains the single failing
FILE with **zero failing tests** — the known Windows-only parse failure,
unmodified and byte-identical to HEAD once line endings are normalised.

## 31. Three fresh sweeps on the Stage 6-A.3 tree

Product code changed, so all Stage 6-A.2 evidence was discarded rather than reused.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| runId | `mt58q39k-6po` | `mt58xlra-j1g` | `mt5951ua-lb8` |
| records = screenshots | 168 = 168 | 168 = 168 | 168 = 168 |

**Identical in all three:** 96 READY, 42 ORG_CONTEXT_REQUIRED, 30 NOT_FOUND;
SITE_CONTEXT_REQUIRED, DEGRADED_HANDLED, UPSTREAM_FAILURE_HANDLED,
UNEXPLAINED_AUTH_REQUIRED, UNHANDLED_FETCH_FAILURE, STUCK_LOADING and
WRONG_FINAL_LOCATION all **0**.

```
FINAL_TREE_AUTH_SWEEPS=3/3_COMPLETE   FINAL_TREE_EVIDENCE_CELLS=504/504
CLASSIFICATION_DIFFERENCES=0          EVIDENCE_INTEGRITY_FAILURES=0
AUDIT_HARNESS_CONSOLE_ERRORS=0        PRODUCT_CONSOLE_ERRORS=0
HYDRATION_ERRORS=0                    SESSION_LOSS=0
```

**Live refusal contract**, 24 calls, same server and ephemeral identity:

```
ENDPOINTS_PROBED=24   ANON_401_DISTINCT_SHAPES=1
MEDIA_REFUSAL_FORWARDING_EXCEPTIONS=0
VOICE_REFUSAL_FORWARDING_EXCEPTIONS=0
REFUSAL_CONTRACT_VIOLATIONS=0
```

## 32. Stage 6-B debt, unchanged

Four pre-existing overflow cells (`/documents/explorer` en/de/fa 251/247/247px,
`/crm/customer-success` de 50px) and the app-shell hidden-focusable debt (135 of
168 cells, 2412 elements) are present at identical measurements and are not
attributed to this stage.

```
PRE_EXISTING_RESPONSIVE_DEBT=4
VISUAL_AUDIT_COMPLETE=NO   (SUPERSEDED — canonical value lives in PHASE-107-FINAL-REPORT.md)
```


# Appendix: HISTORICAL_SUPERSEDED

Every state below was true when written and is **not** true now. Kept because the
sequence of wrong answers is part of the audit trail; superseded because each was
replaced by a later measurement.

| once claimed | superseded by |
|---|---|
| the three `-a2f-*` sweeps | superseded by three fresh sweeps (`-a3-1/2/3`) on the Stage 6-A.3 tree; product code changed again, so the earlier evidence was discarded |
| `DETECTOR_SELFCHECK=7/7` | superseded by 10/10 — three field-sensitivity controls added after the detector was found to let a DIAGNOSTIC read sanitise a hard-coded role |
| `MUTATIONS_CAUGHT=65/65` | superseded by 67/67 |
| `SELECTORS_REQUIRING_FIX=0` from the text-matching audit | that audit asked whether a presence check appeared ANYWHERE, and so certified a guard that ran after the return it protected; the order-sensitive audit found two live defects |
| ONE unstable screenshot cell | TWO on this tree (en and fa), both 28 pixels at delta 1, at mirrored LTR/RTL positions; PNG bytes now travel so the measurement is reproducible |
| the three `-final-*` sweeps and their 96/42/30 classification | superseded by three FRESH sweeps (`-a2f-1/2/3`) on the corrected tree; product code changed in Stage 6-A.2, so the earlier evidence was discarded rather than reused |
| `WORKTREE_FILES=107` / `CLASSIFIED_FILES=107` | four different totals were in circulation (107, 108, 113) because every generator wrote into the tree it measured; superseded by ONE frozen snapshot taken outside the repository |
| three `/articles/following` cells with differing hashes | measured per pixel: ONE cell, 0.0022% of pixels, max channel delta 1/255 — sub-perceptual |
| `DETECTOR_SELFCHECK=4/4` (regex analyser) | superseded by an AST analyser with 5 positive and 2 negative controls, 7/7 |
| `MUTATIONS_CAUGHT=57/57` | superseded by 65/65 after Stage 6-A.2 added eight mutations |
| the three `-v2-*` sweeps as the current evidence | superseded by three fresh sweeps on this tree (`-final-1/2/3`); the v2 runs predate the Stage 6-A.1 corrections and are kept, not deleted |
| 6 cells classified `server-error` | 0 — correction #1 makes a session-mode server a 409, not a 500; those 6 are now among the 42 `org-context-required` |
| `STAGE_6_A_STATUS=PASS_PENDING_VISUAL_CONFIRMATION`, `AUTHENTICATED_RE_SWEEP=NOT_RUN`, `PR_STATE=KEEP_DRAFT` (mid-document block) | three authenticated 168-cell sweeps were run and agree; status is now stated once, at the top |
| `DESIGN_PHASE=AWAITING_OWNER_VISUAL_APPROVAL` | three authenticated sweeps completed; status now stated once at the top |
| `STAGE6A_FINAL=BLOCKED` — 12 unexplained cells | the 12 closed; `/dashboard/billing` → 409, `/dashboard/api` → 500 |
| `UNEXPLAINED_AUTH_REQUIRED=0` (first classifier) | **wrong when written.** The rule accepted any cell whose API answered 401 — circular, since a 401 to a valid session is the defect. Corrected to let the session decide, which turned 0 into 12, and the work then turned 12 into 0 |
| leaf pin 6249, then 6267 | measured **6277** |
| "roughly 20 remaining idiom files" | derived **56** |
| "three independent sweeps" (first attempt) | not three runs. Directory names were reused: run 2 mixed two runIds, run 3 never executed. Redone into provably new directories with identity asserted |
| 36 unattributed cells | resolved: 25 PRODUCT_RESPONSE, 8 CAPTURE_INFRASTRUCTURE_NOISE, 3 EXPECTED_NOT_FOUND |
| six components called "detector false positives" | **wrong when written.** Four were real defects whose error state belonged to the save path while the load had no failure branch |
| `/automation/settings` 404 | HTTP 200 on the current build; the Stage 5 observation was environmental |
