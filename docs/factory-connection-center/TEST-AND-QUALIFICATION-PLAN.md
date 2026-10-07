# TEST-AND-QUALIFICATION-PLAN.md

HFCC test and qualification plan. Phase 0 — design only. **No test has been
run.** Nothing in this document reports a result.

---

## 1. GROUND RULES

1. **Nothing in this plan may be executed while qualification is active on this
   host.** See `REPOSITORY-BASELINE.md` §1.
2. Tests verify **behaviour**, not implementation detail.
3A test is never weakened, skipped or deleted to produce a pass.
4. Security checks are never weakened to make a test pass.
5. **A green run reporting a closure is not the closure.** (Phase 100 lesson.)
6. **Run the inherited suites UNMUTATED on the new tree before trusting any
   mutation "CAUGHT".** The FC1 lane's SECURITY run 1 was `INVALID_BASELINE` for
   exactly this reason.
7. Every result records the exact command, the tree digest and the host state.

---

## 2. VALIDATION COMMANDS THAT ACTUALLY EXIST

```bash
npm run lint
npx tsc --noEmit -p .          # NOTE: there is NO `npm run typecheck` script
npm run test
npm run build
```

Prisma, when the schema changes:

```bash
npx prisma format              # WARNING: rewrites CRLF -> LF for the WHOLE schema
npx prisma validate
npx prisma generate            # MUST be re-run after a schema edit
npm run db:validate
```

Gates:

```bash
npm run gate:phase102:migrations
npm run gate:phase102:applied-migrations
npm run security:phase99:inventory:check
npm run config:inventory:check
npm run gate:dependency-audit
```

> The CLAUDE.md preferred sequence lists `npm run typecheck`. **That script does
> not exist.** Use `npx tsc --noEmit -p .`.

---

## 3. TEST MATRIX

### 3.1 Unit — pure logic, no I/O

| id | Subject | Asserts |
|---|---|---|
U-01 | state machine | all 21 declared edges accepted from their `from` state |
U-02 | state machine | all 10 `N-nn` undeclared edges refused |
U-03 | state machine | `REVOKED` has **zero** outgoing edges |
U-04 | state machine | exhaustiveness: every state appears in the table |
U-05 | readiness | one BLOCKER + all else perfect ⇒ `HOLD`, **no score emitted** |
U-06 | readiness | `MAJOR`/`MINOR` do not force HOLD |
U-07 | readiness | no input combination yields a score while a blocker is open |
U-08 | FAT algebra | `FAIL`, `NOT_RUN`, `NOT_MEASURED` each count as **not** PASS |
U-09 | FAT algebra | Lab / Simulator / Factory never merge; no total is computable |
U-10 | provenance | `source` is ignored entirely (D-2) |
U-11 | provenance | `UNKNOWN` is never upgraded (D-5) |
U-12 | provenance | `REPLAY` is never LIVE |
U-13 | freshness | computed from `receivedAt`, never `timestamp` |
U-14 | JCS | canonicalisation stable across key order and number formatting |
U-15 | hash chain | recompute + verify; a mutated field is detected |
U-16 | timestamps | **the R21-F11 battery** — strict RFC 3339, real calendar, Gregorian leap, no leap second, `-00:00` refused, explicit zone |
U-17 | CSV parser | each formula prefix (`=` `+` `-` `@` TAB CR) ⇒ row **rejected** |
U-18 | CSV parser | `1e999` ⇒ refused as **non-finite** (not accepted as a number) |
U-19 | CSV parser | duplicate NodeId and duplicate logical tag both detected |
U-20 | CSV parser | each of the 13 columns type-validated |
U-21 | Zod schemas | `.strict()` — an unknown key is **rejected**, not stripped |
U-22 | protocol gate | Modbus/S7/MQTT config ⇒ `422 protocol_not_implemented` |
U-23 | OPC UA schema | scheme allowlist; `SecurityPolicy.NONE` and deprecated policies raise blockers |
U-24 | secret shape | no HFCC model or schema declares a credential-shaped field |

> U-18 is not pedantry. `1e999` parses to `Infinity`, and
> `typeof Infinity === "number"` is `true`. A range validator that checks
> `typeof` accepts it. `Number.isFinite()` is the only correct check — this
> programme has already had a verdict flip on exactly this.

### 3.2 Integration — route handlers

| id | Subject |
|---|---|
I-01 | guard order: an API key is refused **before any DB query** (assert zero queries) |
I-02 | every control route refuses without a session |
I-03 | every control route refuses with an insufficient role |
I-04 | step-up required on T-08, T-14, T-21 and all provisioning routes |
I-05 | a stale session ⇒ `401 recent_auth_required` |
I-06 | the transition route accepts a **transition id**, never a target state |
I-07 | an unknown transition id ⇒ `422` |
I-08 | a missing `reason` ⇒ `422` |
I-09 | `expectedStateVersion` mismatch ⇒ `409` |
I-10 | idempotent replay (same key, same payload) ⇒ original result, no second transition |
I-11 | same key, **different** payload ⇒ `409`, not a silent overwrite |
I-12 | every gated operation ⇒ `423` while `QUALIFICATION_HOLD` |
I-13 | cross-tenant id ⇒ `404`, **byte-identical** to an absent id |
I-14 | an error response contains no stack trace, SQL, Prisma text or secret |
I-15 | a DB outage ⇒ `503`, **never 401** (F-020) |
I-16 | list endpoints are cursor-paginated with a hard max; no unbounded list exists |
I-17 | `Cache-Control: no-store` on every authenticated response |
I-18 | downloads carry `Content-Disposition: attachment` + `nosniff` |

### 3.3 PostgreSQL — real database required

A mocked Prisma client cannot demonstrate row locking, a unique violation or a
transaction rollback. These run against real PostgreSQL.

| id | Subject |
|---|---|
S-01 | migration applies cleanly; **all 82 + new** migrations verified |
S-02 | rollback leaves a **schema-identical** tree |
S-03 | an interrupted migration leaves nothing behind |
S-04 | every constraint probe is **REFUSED** (the FC1 rehearsal protocol) |
S-05 | `@@unique([requestId, sequence])` makes a chain fork a DB error |
S-06 | `@@unique([organizationId, dataSourceId, nodeId])` enforced |
S-07 | **two concurrent identical transitions ⇒ exactly ONE transition row** |
S-08 | `stateVersion` optimistic lock under concurrency |
S-09 | tag import commit is **atomic** — a mid-batch failure persists zero rows |
S-10 | rollback removes the whole import and nothing else |
S-11 | a sealed FAT run cannot be updated **by direct SQL** through the applier |
S-12 | a sealed evidence artifact cannot be updated or deleted |
S-13 | idempotency uniqueness is per tenant |
S-14 | `@@unique([organizationId, requestId, checksum])` catches the same file twice |
S-15 | the partial unique index (OD-F(b)), if adopted, permits re-integration after `REVOKED` and forbids two live requests |
S-16 | statement-timeout isolation: a slow query does not starve others |

> **Known trap for S-15:** partial unique indexes are checked **per statement**.
> A transaction relying on a deferrable exclusion constraint needs
> `SET CONSTRAINTS ALL DEFERRED` inside it.

### 3.4 Negative controls — the attack must fail

Every threat in `SECURITY-THREAT-MODEL.md` has its id here. Full list in that
document; the inventory is:

```
N-INT-01..08   intake token: brute force, replay, expiry, revocation,
               cross-scope, dashboard reach, URL leakage, enumeration
N-CSV-01       formula injection, each prefix
N-UP-01..04    polyglot/MIME, size/row/error DoS, zip-bomb/XXE, path traversal
N-XSS-01       stored XSS via a tag display name
N-SSRF-01      endpointUrl: metadata IP, file://, gopher://, DNS rebind
               -- and ZERO outbound socket from CORE
N-CSRF-01      intake mutation without origin/header token
N-TEN-01..07   client-supplied organizationId, findUnique, 403-vs-404,
               nested write, aggregate leak, idempotency collision,
               evidence download
N-SITE-01      cross-site inside one tenant
N-CRED-01..10  API key on credential routes, missing step-up, re-read,
               RSC/flight payload, logs, REVOKED key on EVERY route,
               legacy apiKeyId, unbound industrial.write PATCH,
               download receipt, package tamper
N-ING-01..10   forged telemetry, client provenance, backfill-as-LIVE,
               UNKNOWN upgrade, future timestamps, state advance from ingest,
               silent duplicate drop, DB outage 401, unbounded ingest,
               statement timeout
N-AUD-01..08   row edit, row delete, fork, JSON reorder, forged timestamp,
               sealed mutation, missing reason/actor, manifest self-reference
N-SAFE-01..09  write path, simulator-as-factory, FAIL-as-PASS,
               average hiding a blocker, premature readiness string,
               stale-as-current, MITM, clock skew, disabled-button-as-gate
N-ST-04        forged intake completeness
N-P-01         DEFINED_NOT_IMPLEMENTED protocol config
```

> **N-CRED-06 is deliberately broader than it looks.** FC1 finding F-021 was a
> revoked binding leaving its `ApiKey` valid; because the gateway column no
> longer referenced it, the guard stopped seeing it, and **three suites passed
> while the hole was open**. What found it was a cheap probe with the *old* key
> after rotation. N-CRED-06 therefore retries the revoked key against **every**
> industrial route, not only the one it was revoked on.

### 3.5 Mutation testing — authorization and state transitions

The brief requires mutation tests for authorization and state transition. Each
mutant must be **CAUGHT** by an existing test, or the test suite is incomplete.

| id | Mutation | Must be caught by |
|---|---|---|
M-01 | remove `refuseApiKeyCredential` | N-CRED-01 |
M-02 | remove `requireRecentAuth` | N-CRED-02, I-04 |
M-03 | `requirePermission` → always true | I-03 |
M-04 | `requireSitePermission` → always true | N-SITE-01 |
M-05 | `findFirst({id, orgId})` → `findUnique({id})` | N-TEN-02, N-TEN-03 |
M-06 | 404 → 403 on cross-tenant | N-TEN-03 |
M-07 | drop the `expectedStateVersion` check | S-08 |
M-08 | drop the `from`-state assertion | U-02, I-06 |
M-09 | `NOT_RUN` counted as `PASS` | U-08, N-SAFE-03 |
M-10 | merge the three FAT modes | U-09, N-SAFE-02 |
M-11 | readiness → plain average | U-05, N-SAFE-04 |
M-12 | `executionMode` read from the request body | N-SAFE-02 |
M-13 | provenance read from `source` | U-10, N-ING-02 |
M-14 | freshness from `timestamp` | U-13, N-ING-03 |
M-15 | `UNKNOWN` upgradeable | U-11, N-ING-04 |
M-16 | feature gate checked in UI only | I-12, N-SAFE-09 |
M-17 | invitation `expiresAt` check removed | N-INT-03 |
M-18 | invitation `submittedAt` single-use removed | N-INT-02 |
M-19 | invitation scope from a path parameter | N-INT-05 |
M-20 | `catch { return null }` on the credential lookup | N-ING-08 / I-15 |
M-21 | revoke stops revoking the API key (undo D-7) | N-CRED-06 |
M-22 | `JSON.stringify` instead of JCS | U-14, N-AUD-04 |
M-23 | `occurredAt` from the client | N-AUD-05 |
M-24 | formula-prefix rejection → neutralisation | N-CSV-01 |
M-25 | `Number.isFinite` → `typeof === "number"` | U-18 |
M-26 | Zod `.strict()` → default (strip) | U-21 |
M-27 | signer may equal operator | T-14 guard test |
M-28 | required-check-missing assertion removed | N-SAFE-03 |

A **surviving** mutant is either a missing test or a provably equivalent
mutation. Equivalence must be **argued and recorded**, not assumed — the R2.1
lane carried four survivors (M275/M587/M604/M616) each proven equivalent in
writing.

### 3.6 i18n and localisation

| id | Subject |
|---|---|
L-01 | exact three-way key parity (en/fa/de) |
L-02 | leaf total matches the pin — **2 lines in `german-final-gate.test.ts` (584, 628)** at this baseline; plus any per-namespace `LEAF_COUNTS` table whose namespace HFCC touched (`otEdge` is in none; `industrial` is in `german-final-gate.test.ts:23` with a `267` wave total). Re-measure on the chosen baseline. |
L-03 | **zero DE == EN** (loanwords need an explicit allowlist entry with a reason) |
L-04 | zero FA == EN |
L-05 | placeholder and rich-tag parity across all three |
L-06 | **no Arabic `ي` or `ك`** anywhere in the Persian catalogue |
L-07 | ZWNJ correctness in Persian compounds |
L-08 | **no hard-coded visible string** in any HFCC component — including `aria-label`, chart axes, `<title>`, empty-state and error copy |
L-09 | number and date formatting per locale |
L-10 | stored/exported timestamps are ISO 8601 UTC `Z`, **not** localised |
L-11 | forbidden strings absent from all three catalogues |

> L-02 hazard: the pin currently reads `8162` in the **dirty** tree while `HEAD`
> is `8128`. Re-measure; never copy.
> L-06 hazard: `fa.json` is **CRLF**; a raw LF-vs-CRLF compare yields a
> Windows-only false difference.

### 3.7 Accessibility

| id | Subject |
|---|---|
A-01 | automated audit, zero violations, every page, all three locales |
A-02 | keyboard-only completion of the intake wizard end to end |
A-03 | keyboard-only completion of a FAT run |
A-04 | focus visible ≥ 3:1, no keyboard trap, focus restored after every dialog |
A-05 | contrast ≥ 4.5:1 text / ≥ 3:1 graphical, **both** themes |
A-06 | state never conveyed by colour alone (glyph + text present) |
A-07 | decorative glyphs `aria-hidden`; state in real adjacent text |
A-08 | the topology SVG has a text-equivalent table |
A-09 | every chart has a textual summary and a data table |
A-10 | one `h1` per page, no skipped heading level |
A-11 | `prefers-reduced-motion` honoured |
A-12 | usable at 200 % zoom |
A-13 | error summary links to each invalid field |

### 3.8 Responsive and overflow

| id | Subject |
|---|---|
R-01 | **`document.body.scrollWidth <= clientWidth`** at 320, 360, 375, 414, 768, 1024, 1440, 1920 — every page, all three locales |
R-02 | a 64-char fingerprint does not overflow at 320 px |
R-03 | a long OPC UA NodeId does not overflow at 320 px |
R-04 | a German compound heading does not overflow its **box** at 320 px |
R-05 | tables scroll inside their container, never the page body |
R-06 | the stepper remains usable at 320 px |
R-07 | RTL at every breakpoint, no mirrored topology or time axis |

> R-01 is the only honest overflow check: a measured `scrollWidth` on `<body>`.
> R-04 is phrased as "its box" deliberately — Gate C.0 was an unbreakable German
> compound in an `h1` whose *container* fit while the *text* did not.

### 3.9 Browser — real rendering

| id | Subject |
|---|---|
B-01 | intake wizard end to end, fa / en / de |
B-02 | a full lifecycle walkthrough, fa / en / de |
B-03 | zero console errors on every page |
B-04 | the one-time credential reveal: shown once, absent from the **whole** RSC flight payload |
B-05 | mobile emulation at 375 px, all pages |
B-06 | RTL verified visually in Persian |
B-07 | light and dark |

> **Browser-gate hazards measured in this programme, all applicable:**
> - **React 19 streaming reveal (`$RB`/`$RV`) is paint-gated.** In the embedded
>   pane a hidden tab never fires rAF, and mobile emulation can take ≥ 100 s, so
>   a streamed Suspense boundary stays at its fallback. **Front the tab before
>   judging content.**
> - **`next-intl` inlines the WHOLE catalogue into every page's flight data.**
>   Finding a bare catalogue string proves nothing about what rendered. Assert
>   the **placeholder-substituted** text or a state element id.
> - `X-Frame-Options: DENY` **blocks an iframe harness** — drive the page
>   directly.
> - `resize_window` on a maximised Chrome window does nothing and hides the tab.
> - **Extension "connected" ≠ site signed in.** These are two separate
>   prerequisites, and the owner must do the signing in — Claude never types
>   passwords.

### 3.10 Secret scanning

| id | Subject |
|---|---|
X-01 | repository scan: zero secrets in source, docs, tests, logs |
X-02 | no HFCC schema field matches the credential-shaped pattern |
X-03 | no credential-shaped value in any HTTP response |
X-04 | no credential-shaped value in `AuditLog.metadata` or any log line |

> **Scan calibration (FC1 F-039):** a name filter that is too broad flags
> identifier slugs and cuids and refuses a clean pack. Exclude **only** declared
> identifier keys that have identifier shapes, listed by key. Keep every
> SUPERSEDED/VOID run on file; never delete one.

---

## 4. QUALIFICATION GATES

Ordered. A gate that fails stops the sequence; it is not "noted and carried".

| Gate | Content | Pass criterion |
|---|---|---|
G-0 | **Host idle** | no qualification, build, test or tsc process active — **verified, not assumed** |
G-1 | Baseline frozen | branch + digest recorded; working tree clean; conflicts declared |
G-2 | Schema | `prisma validate`, `generate`, additive-only diff confirmed |
G-3 | Migration rehearsal | S-01…S-04 on a **throwaway** database |
G-4 | Migration gate | `gate:phase102:migrations` + `:applied-migrations` — the new migration **declared** (F-033) |
G-5 | Static | `npm run lint` + `npx tsc --noEmit -p .` clean, zero suppressions |
G-6 | Unit + integration | §3.1, §3.2 fully green |
G-7 | PostgreSQL | §3.3 fully green on **real** PostgreSQL |
G-8 | **Inherited suites UNMUTATED** | the pre-existing suite green on the new tree **before** any mutation is trusted |
G-9 | Negative controls | §3.4 — every attack refused, **zero** exceptions |
G-10 | Mutation | §3.5 — every mutant CAUGHT, or survival argued in writing |
G-11 | Route-security inventory | `security:phase99:inventory:check`; composite guards registered + lock test |
G-12 | i18n | §3.6 fully green |
G-13 | Accessibility | §3.7 fully green |
G-14 | Responsive | §3.8 fully green |
G-15 | Browser | §3.9 — **requires the owner to sign in** |
G-16 | Secret scan | §3.10 clean, with a calibrated filter |
G-17 | Build | `npm run build` succeeds |
G-18 | Dependency | `gate:dependency-audit` — see the note below |
G-19 | Evidence | chain verification + pack reproducible by independent extraction |
G-20 | Diff review | every modified file reviewed; zero unrelated files |

> **G-15 is a hard human dependency.** The FC1 lane was capped at HOLD for a
> full day on exactly this, then needed a second round because *signing into the
> site* is not the same as *connecting the browser extension*. Both are needed,
> and only the owner can do either.

> **G-18 carries a known standing condition.** The dependency gate is **RED on
> `main`** (10 high advisories) and is **unreachable to zero without breaking
> major upgrades** (tailwind 3→4, nodemailer 9→10, upstream-unpatched `braces`).
> Seven dev-only HIGHs are accepted until 2026-11-02. HFCC must not be blocked
> on a condition it did not create, and must not silently inherit a claim that
> the gate is green.

---

## 5. WHAT THE EVIDENCE PACK MUST CONTAIN

```
REPOSITORY-BASELINE.md            branch, digest, conflicts
HOST-STATE.json                   proof G-0 passed, with process evidence
TEST-MATRIX.md                    every test id, command, result, timestamp
RESULTS.json                      machine-readable
NEGATIVE-CONTROLS.md              every attack, its refusal, its evidence
MUTATION-RESULTS.md               every mutant: CAUGHT | survived + argument
MIGRATION-REHEARSAL.md            apply, rollback, interrupt, constraint probes
I18N-PARITY.md                    leaf counts, parity, zero-carryover proof
ACCESSIBILITY.md                  per-page audit output
RESPONSIVE.md                     measured scrollWidth per breakpoint per locale
BROWSER-GATE.md                   pane + real-Chrome halves, per locale
SECRET-SCAN.md                    configuration + result + filter rationale
TRANSITION-CHAIN-VERIFICATION.md  head hash, recomputation, gap check
SHA256-MANIFEST.txt               every artifact, atomically verified
VERDICT.md                        the verdict and its single blocking reason if HOLD
```

Rules for the pack:

- The manifest is **atomic** — verified before and after any move, and again
  independently.
- **A manifested document cannot quote its own TOTAL.** The manifest is not an
  artifact listed inside itself.
- Every SUPERSEDED or VOID run is **kept**, never deleted, and labelled.
- Every digest line is checked for a real 64-hex value. (A Cygwin
  `dofork … died unexpectedly` under memory pressure once silently emptied a
  `$(digest)` capture, blanking `DIGEST_AFTER` and voiding a whole stage.)
- Reproduced by **two independent extractors**.

---

## 6. VERDICT VOCABULARY

The only permitted qualification verdicts, and what each costs:

```
FACTORY_CONNECTION_CENTER_IMPLEMENTATION_REVIEW_READY
    gates G-0..G-20 green, evidence pack reproducible

FACTORY_CONNECTION_CENTER_IMPLEMENTATION_HOLD
    any gate failed, or a blocker is open -- with the single blocking reason named
```

**Explicitly NOT available from this plan, at any outcome:**

```
FACTORY_READY   PILOT_READY   DEPLOY_READY   PRODUCTION_READY
```

Those require a formal owner ruling, real plant measurement at
`executionMode = FACTORY`, and a real OPC UA adapter. **No volume of green
SIMULATOR or LAB evidence can produce them** — that is the whole point of the
three-way `executionMode` split.
