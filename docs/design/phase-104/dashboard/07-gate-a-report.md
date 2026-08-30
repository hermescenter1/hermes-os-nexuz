# Phase 104-I.D — Gate A report

**`GATE_A1_STATUS = SECURITY_HOLD`**
**`GATE_B_ALLOWED = NO`**
**`CREDENTIAL_INCIDENT_CLOSED = NO`**
**`OWNER_VISUAL_APPROVAL = PENDING`**

Claude does not declare this work premium and does not approve it. This document
records what was built, what was measured, and what is still open.

## Gate A.1.1 — the false greens, removed

Gate A.1 did not pass independent review. Three of its green results were not
green. All three are mine.

### The page auth boundary is a SECURITY HOLD, not a footnote

Gate A.1 recorded that a page route accepted a session minted under a different
signing secret — then let the pack verify 91/91 by calling it pre-existing and
out of scope. **That is a false green.** Ownership decides who fixes a defect and
where; it does not turn an observed failure into a pass.

Re-measured directly, with tokens ASSEMBLED rather than signed (the page gate
never inspects the signature, so no key is needed — which is itself the finding):

| Check | Result |
| --- | --- |
| `PAGE_AUTH_SIGNATURE_VERIFICATION` | **FAIL** |
| `PAGE_SESSION_INVALIDATION` | **FAIL** |
| `TAMPERED_ROLE_ACCEPTED` | **FAIL** |
| `EXPIRED_TOKEN_REJECTED` | PASS |
| `MALFORMED_TOKEN_REJECTED` | PASS |
| `API_SESSION_INVALIDATION` | PASS |
| `REFRESH_SESSION_INVALIDATION` | PASS |

**14 of 14** protected pages returned 200 to an invalid-signature token with a
self-chosen role, each serving 410–485 KB of server-rendered content where an
anonymous caller gets a 307 and zero bytes. Expiry *is* enforced, so the bound is
`exp` — **not** secret rotation. Full detail in `security/`; the fix belongs to a
security-owned lane and needs owner authorization.

The verifier now **gates closure semantics**: claiming the incident closed while
a page still accepts an unverified session fails with a named code.

### The rail gate was measuring the wrong element

The capture selected the tab rail with `nav[aria-label]`, which returns the FIRST
labelled nav — the AppShell sidebar. The proof was sitting in the published
ledger: every Alarm Center row recorded its active tab as *"Operations Center"* /
*"Betriebszentrale"* / *"مرکز عملیات"*, which are sidebar items, not tabs.

So "active tab fully visible: true" and "clipped labels: 0" were true of
something nobody was asking about. **A third vacuous gate**, after the backspace
byte and the malformed machine-path regex.

The rail now carries `data-phase104-operations-rail` and each tab
`data-phase104-operations-tab` with a locale-stable route id. The selector must
match exactly once or the row is a `MEASUREMENT FAULT`.

**Correcting it immediately exposed two defects the broken gate had hidden:**

1. The German **war-room** tab was 99.57% visible at all three mobile widths — at
   maximum scroll its trailing edge sat flush against the rail edge and rounding
   clipped ~0.5px. Fixed with a trailing pad; now 45/45 fully visible.
2. **`/dashboard/operations/intelligence` leaks 97–248px of page overflow** on
   every mobile width, in all three locales. That is a real sideways scroll. It
   lives in a file outside the 30 pinned paths, so it is **reported, not fixed** —
   see `OUT-OF-SCOPE-FINDINGS.md`. The verifier gates undeclared overflow and
   requires every exception to be documented.

### Undersized targets were counted, never attributed

`smallTargets: 39` was published with no element identities, and the verifier
ignored the field entirely. Each entry now carries an accessible name, tag, role,
selector, rectangle and owning component:

| Owner | Count |
| --- | ---: |
| `pre-existing:app-shell-sidebar` | 38 |
| `pre-existing:unclassified` (skip-link, 1×1, visible on focus) | 1 |
| **Gate A owned** | **0** |

Every operations tab and every Alarm Center control measures at least 44×44.
The shell debt is reported separately and belongs to D8.

### Patch identity

Three hashes were published for "the patch" with no statement of what each
covered. They are three different artefacts, now named apart, and the 3-byte
discrepancy was an incidental `.trim()`:

| Artefact | Derivation |
| --- | --- |
| raw tracked diff | byte-exact `git diff HEAD` stdout — **authoritative** |
| trimmed tracked diff | the same, decoded and `.trim()`'d — 3 bytes shorter, unintentional |
| new-file payload | full text of every untracked file under an explicit banner |
| complete review patch | raw diff + new-file payload |

A disposable clone at the pinned base reconstructs all 30 paths: **0 content
mismatches**, 22 byte-exact and 8 newline-only (the `core.autocrlf` smudge). The
reviewed worktree is never written to.

## Gate A.1 — what Codex rejected, and what changed

Codex returned `GATE_A_RESULT=CHANGES_REQUIRED`. Every finding was reproduced
before it was fixed. Three were mine and serious.

### P0 — the package shipped live credentials

`preflight/gatea-cookies.txt` carried three real session cookie values
(`hermes_at`, `hermes_rt`, `hermes_session`) and
`preflight/local-dev-credentials.md` published a password and a JWT secret in
plaintext. "Local", "throwaway" and "loopback" do not make a credential
publishable, and I should not have packaged them.

The previous archive is **`REJECTED_DO_NOT_DISTRIBUTE`**. It was deleted, not
rewritten, along with every extracted copy.

Now: the capture process generates the password and JWT secret with
`crypto.randomBytes()`, keeps them in memory, and passes them only through the
server's environment. Session cookies reach the child capture processes through
the environment too — they were previously passed on the **command line**, where
any process on the machine could read them. `auth-proof.json` records cookie
NAMES only, never values and never hashes. The server log is scrubbed of both
secrets before it is written, and shutdown now verifies the port owner is gone.

### P0 — the archive was Windows-only

`Compress-Archive` stored **137 of 141** entry names with backslash separators.
InfoZip extracts those with a warning and exit 1; Python's `zipfile` treats them
as filenames that literally contain a backslash. The package could not be opened
correctly anywhere but Windows.

Replaced with a dependency-free ZIP writer (`node:zlib` only) that refuses to
emit a non-portable name, plus `tools/verify-zip.mjs`, which reads the archive's
own central directory and checks separators, absolute names, traversal,
duplicates, case-collisions, symlinks, the UTF-8 flag and EOCD agreement.

### P0 — a gate that could never fail

The machine-identity regex shipped with its backslashes collapsed, so the
Windows home-directory alternative degenerated into a bare pipe and the pattern
could not match a Windows path at all. (The broken form is deliberately not
reproduced here: a document that spells out a machine path to illustrate the
rule becomes the very thing the rule looks for, and the scanner would flag this
file.) A
text-substitution step had eaten its backslashes, so it matched **nothing** —
and the verifier reported "no machine-identity leakage" as a PASS that was
structurally incapable of failing.

While fixing it I found the **same corruption in my own severity gate**: `\b`
had become a literal BACKSPACE byte (0x08), so `/\bsignal\b/` was
`/<BS>signal<BS>/`. The affirmative-accent check had been passing while a
severity was genuinely repainted in the success accent — I verified this by
mutation, and the gate stayed green.

This is the worst class of defect in the whole phase: **a gate that cannot fail
converts an unchecked property into a green tick.** Both regexes now live in
files edited directly rather than through substitution, carry canaries in both
directions, and a new test scans the gate sources for stray control bytes and
proves each pattern matches the text it forbids.

### P1 — the payload validator was not fail-closed

It checked only that two arrays existed, that `builtAt` was a string, and that
four numbers were finite. Malformed-but-200 payloads reached the ready state.
It now validates every alert and category element, rejects unknown severities,
requires non-negative whole counts, reconciles `total` against the alert array,
reconciles the severity counts and the category ledger against the alerts, and
rejects duplicate ids and categories.

Because those checks are layered, removing any one often leaves a later one to
catch the defect — good for safety, useless for proving a single guard works. So
the predicates are exported and asserted in isolation, and each negative control
now disables the guard it actually names.

### P1 — freshness froze

`assessFreshness` ran only at render, so a surface opened while data was fresh
kept asserting "Current" indefinitely. It is now driven from state by a single
timer scheduled for the crossing point — no polling, no request, cleaned up on
unmount — and proved with fake timers: fresh, advance past the threshold, stale,
and no second fire an hour later.

### Semantics and accessibility

- `StateBoundary` announced every state as a polite `role="status"`. A failed
  read now announces assertively via `role="alert"`; loading and empty stay
  polite. Role and politeness are derived from `tone`, so a failure cannot be
  dressed in danger colours and still announced quietly.
- The affirmative-accent gate covered only `SEVERITY_TEXT`. All four maps are
  now gated, with a dedicated negative control each.
- `SEVERITY_BADGE.info` used `hs--nominal`. That token is visually neutral
  (steel, not the affirmative teal), so it was never painting informational
  alarms as success — but the word "nominal" asserts *the system is operating
  normally*, a posture claim an informational alarm cannot make. It is now
  composed from neutral metadata tokens.

### Evidence

- Resource failures are attributed per shot — URL, type, origin, CDP error,
  cancelled/blocked, first-party/third-party, critical or not. A bare
  `SOME_FAILED` is now a gate failure. Exactly one cancellation rule is declared,
  with its reason.
- Isolation evidence is captured **after** all work, not 26 seconds after
  `git worktree add`, and compares against the true pre-phase baseline.
- `git/FINAL-SNAPSHOT.json` carries the complete effective delta: every changed
  path with its working-tree hash, the tracked patch hash, and proof that
  `package.json` and the lockfile are untouched.

## Scope delivered

| Stage | Status |
| --- | --- |
| Isolated worktree from the authorized parent commit | done, isolation proved by hash |
| D0 — authenticated route and ownership audit | done, 279 routes / 208 internal, derived |
| D1 — Command Center architecture | done, 4 new primitives |
| D2 — Reference A: Workspace Home | done |
| D2 — Reference B: Alarm Center | done, rebuilt |
| Tests + negative controls | 13/13 controls caught |
| 54-screenshot matrix | 54/54 against a production build |
| State + contact-sheet evidence | 12 states, 6 sheets |
| Mass migration of remaining families | **NOT STARTED — not authorized** |

## The six defects that mattered

1. **A fabricated KPI.** The Alarm Center displayed `Resolution Coverage: 100%`
   in the affirmative accent. No field anywhere in the payload backs it. Removed.

2. **An API outage rendered as a crash.** The client called `.json()` on every
   response without checking `r.ok`, so the 500 envelope
   `{error:"alerts_unavailable"}` was stored *as data*. The truthiness guard then
   passed and the render read `data.counts.total` off an object with no
   `counts` — a TypeError. An unreadable alarm feed produced a broken page, and
   had the render survived it would have shown zeroes.

3. **Five routes sharing one generic `<h1>`.** The operations layout owned the
   heading, so the Alarm Center, Global Ops, Site Monitor, Intelligence Wall and
   War Room all announced themselves as "Operations Command Center".

4. **`down` mapped to the success colour.** One `Record<string, string>` served
   two unrelated semantic domains — lifecycle status *and* risk-trend direction.
   Correct for "risk trending down", dangerously wrong for a device that is down,
   and untypeable as a bug because the key was `string`.

5. **A semantic tone that was visually inert.** Found during visual review, not
   by a test: `.type-panel-title` hard-sets `color: var(--muted)`, so pairing it
   with `text-danger` printed failure states in the same neutral grey as calm
   ones. Correct copy, invisible severity. Now gated (`NC-13`).

6. **"1 alarms remain".** Also found only by looking: the filtered-empty copy
   interpolated a pre-formatted count into a fixed plural. It now uses ICU
   plurals in all three catalogues and receives a real number, so the locale
   selects both the plural form and the digit shape (Persian included).

Defects 5 and 6 are the reason the brief's "verify the rendered product" rule exists. Both
passed every unit test, every type check and the whole build. Only looking at the
rendered pixels found them.

## Measured results

### Screenshot matrix — 54/54

Production build, real authenticated session, Chrome via CDP.

| Gate | Result |
| --- | --- |
| Document status | 200 on all 54 |
| Alerts/telemetry API status | 200 on all 54 |
| Exactly one visible `<h1>` | 54/54 |
| Horizontal document overflow | 0px on all 54, including 320×568 |
| Unnamed interactive controls | 0 on all 54 |
| Hydration errors | 0 |
| Page errors | 0 |
| Persian documents `dir="rtl"` | 18/18 |
| Acknowledge control present | **0 — absent on every alarm shot** |
| Consent banner visible at capture | **0 — dismissed via its real control** |

#### Interactive target size — an honest partial

Up to **39 visible controls fall under 44x44** at viewports >= 1024px. The
measurements localise them precisely, and none is in a Gate A surface:

| Viewport | Sidebar | Controls (Workspace / Alarm) | Sub-44px |
| --- | --- | --- | ---: |
| < 1024px | hidden | 11 / 28 | **1** |
| >= 1024px | visible | 48 / 65 | **39** |

The count is identical on both routes and rises by 38 exactly when the shared
`AppShell` sidebar appears, adding the same 37 controls to each. The Alarm
Center contributes 17 controls at mobile width and **zero** sub-44px targets.
Every offender is therefore pre-existing shell chrome, and the remaining single
mobile offender is present on both routes — also shell chrome.

Gate A's own controls meet the minimum: the severity filters, the retry and
clear actions and the sub-navigation tabs all carry `min-h-11`. Fixing the
sidebar is `AppShell` work and belongs to D8, not to a scoped reference-surface
gate.

### Tests

| Run | Result |
| --- | --- |
| Gate A contract suite | **50 / 50 passing** |
| Whole repository | **465 files / 10,837 tests passing**, 9 files + 140 tests skipped |
| Repository failures | **1 — pre-existing, proven (below)** |
| TypeScript (`tsc --noEmit`) | **0 errors project-wide** |
| Production build | **succeeds** |

There is **no `typecheck` script** in `package.json`; the repository's own
compiler was invoked directly rather than adding one, since `package.json` must
not change.

#### The one repository failure is not this phase's

`scripts/__tests__/phase104-workflow-contract.test.ts` fails on:

```
expected 'name: Phase 104 design assurance\r\n…' to contain 'permissions:\n  contents: read'
```

`core.autocrlf=true` rewrites the workflow to CRLF on a Windows checkout while
the assertion is an LF-only substring. It is Windows-only and pre-existing.

**Proved, not assumed** — both inputs are byte-identical to the authorized
parent commit `07acea2d`:

| File | Parent | Index | |
| --- | --- | --- | --- |
| `.github/workflows/phase104-design-assurance.yml` | `ddd9caba33ad` | `ddd9caba33ad` | IDENTICAL |
| `scripts/__tests__/phase104-workflow-contract.test.ts` | `60eb7628908e` | `60eb7628908e` | IDENTICAL |

Neither file is in this phase's diff, so the failure reproduces with zero of
these changes applied. It is **not fixed here**: it is outside Gate A's scope and
belongs in a separate test-hygiene change, matching the standing ruling on the
same defect class (`WINDOWS_CRLF_RAW_COMPARISON_PORTABILITY`).

### Negative controls — 13/13 caught

Each injects one specific defect, requires the gate to fail **on its own named
assertion**, then restores the file and re-verifies by hash.

`UNCLASSIFIED_INTERNAL_ROUTE`, `DASHBOARD_FAMILY_ORDER_INVERTED`,
`FAKE_SUCCESS_FOR_UNKNOWN_DATA`, `UNBOUND_ACKNOWLEDGE_CONTROL`,
`REMOVED_PERMISSION_GUARD`, `MISSING_LOCALE_KEY`, `HARDCODED_COLOUR_OR_SHADOW`,
`LAYOUT_RECLAIMS_H1`, `GERMAN_ENGLISH_CARRYOVER`, `MUTATING_METHOD_ADDED`,
`SEVERITY_PAINTED_AS_SUCCESS`, `EMPTY_AND_FILTERED_COLLAPSED`,
`TONE_DEFEATED_BY_COMPONENT_CLASS`.

The harness itself was corrected mid-run: an exception inside a control's verify
step was inheriting the initial `SURVIVED` verdict, which reported a crashed
control as an uncaught defect. Controls now start `UNRESOLVED` and a throw is
recorded as `HARNESS_ERROR`.

## Honest reporting

- **`vitest` exits 0 while files fail.** The first full run reported exit code 0
  with **2 files / 3 tests failing**. Do not read the exit code as the result.
- One failure was real and mine: a **third** whole-catalogue leaf pin (`6718`,
  in four places in `german-final-gate.test.ts`) that my 54 new keys moved. Fixed
  to `6772`.
- Two further failures in that first run were **fork-pool worker-start timeouts**
  under CPU contention (`phase104h-shell-closure.test.tsx`,
  `runtime-media-surfaces.test.tsx`). Both pass in isolation (266/266), neither
  file is in this phase's diff, and neither recurred on the final quiet run.
- The `PHASE104A_WORKTREE=CLEAN` precondition **failed** — that lane carries real
  uncommitted Final.1.2 work. Worktree creation was proved non-destructive by
  hash rather than assumed.
- **No CI run covers this work.** It is uncommitted by instruction. Every result
  here was produced locally and is reproducible via the bundled verifier.

## Collateral change, declared

Four routes outside the Gate A scope — `/dashboard/operations`,
`/sites`, `/intelligence`, `/war-room` — each received **one** change: a
page-owned, translated `<h1>`. This was forced by the H1 contract: the Alarm
Center could not own its heading while the shared layout owned it, and removing
the layout heading without giving the siblings one would have traded a single
defect for four headless routes. Their internal composition is untouched. They
remain **unmigrated** in the D3 backlog.

## Open items

| Item | Owner |
| --- | --- |
| 27 authenticated routes render no chrome | D3–D7 |
| 22 authenticated routes on `LegacyPageShell` | D6–D7 |
| `/academy/admin` wears public marketing chrome | D6 |
| `EngineeringShell` is a third parallel app shell | D9 |
| The four operations siblings are still generic compositions | D3 |
| Reduced-motion behaviour not yet captured as visual evidence | D8 |

## Standing declarations

```
COMMIT=NO
PUSH=NO
MERGE=NO
DEPLOY=NO
PR63_CHANGED=NO
MASS_MIGRATION=NOT_STARTED
OWNER_VISUAL_APPROVAL=PENDING_CODEX_AND_OWNER
WAITING_FOR_CODEX_GATE_A_REVIEW=YES
```
