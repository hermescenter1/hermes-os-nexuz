# Hermes OS — `getPrisma()` Failure Semantics (S0-B-05)

**Program:** Hermes Security Dragon
**Addresses:** `S0-B-05` — what does every `getPrisma()` call site do when Prisma is unavailable?
**Revision:** 4 · **Produced:** 2026-10-11 · **Rule set:** `s0-b05.5`
**Status:** every call site, every consumer edge and every residual site is accounted for.
All **nineteen** gate counters are zero, including the three accounting invariants added in this
revision: the primary classification is an exact partition, every outcome class is a deduplicated
id set, and every residual site carries a reachability verdict.

---

## 0. Why the previous CLOSED verdict was reopened

Revision 2 of this document reported `UNRESOLVED_AFTER_MANUAL = 0` and declared `S0-B-05` closed, while
§14 of that same revision disclosed that **61 call sites tagged WRITE, DELETE or AUDIT carried a
HIGH-confidence automatic verdict and had never been traced to a caller**. The review reopened the verdict on
exactly that contradiction, and it was right to: a category reaching zero is not the same thing as the
uncertainty being gone.

The distinction the reopening forced into the tool, and which this revision now enforces mechanically:

| | What it means | What establishes it |
|---|---|---|
| **SYNTACTICALLY_CLASSIFIED** | the rule set matched a shape in full — `return null`, `return false`, `return 0`, `return []`, a result object | the tokenizer, deterministically |
| **SEMANTICALLY_TRACED** | the caller was followed to a terminal boundary, and the HTTP status, retry behaviour, persistence outcome, audit result and user-visible state are known | reading the enclosing function and every caller to a boundary |

`confidence: "HIGH"` is the first and not the second. `return null` is matched with certainty; what `null`
*means* is decided by the caller, and in this repository the same shape maps to **503** in `src/lib/auth`, to
**409** in `src/lib/compliance`, to **422** across `src/app/api/organizations`, to **404** on the industrial
update paths, to **401** on five academy routes, and to **HTTP 200** in the Stripe webhook. A verdict drawn from
the shape alone would have been wrong about every one of those except the first.

Two further corrections the reopening produced, both of which changed numbers rather than only prose:

- the real high-impact set is **73**, not 61 — revision 2's §14 counted only `WRITE`/`DELETE`/`AUDIT` and left
  out `TRANSACTIONAL`, `USER_VISIBLE` and `PUBLIC_PATH`. The set is now generated from the inventory by
  `IMPACT_TAGS`, never typed;
- the wrapper model collapsed a whole accessor to its single worst consumer, which hid every other behaviour.
  §7 replaces it with an addressable, fingerprinted **consumer edge** per behaviour.

### 0.1 The second reopening: accounting, not tracing

Revision 3 was accepted on tracing and reopened on three accounting questions. All three are now
answered by a computation that the gate enforces, so none of them can be answered by prose again.

**The 391 against 392.** There was no missing call site. The partition has always summed to 392;
the 391 came from one stale figure. `HEALTH_OR_DIAGNOSTIC_ONLY` was **3** in the `s0-b05.3` report
and became **4** in `s0-b05.4`, when the readiness probe at `src/app/api/health/ready/route.ts#L33C26`
was adjudicated into that class. A list that mixes that older 3 into the `s0-b05.4` set is one short.
The four members are `admin/system/route.ts#L34C26`, `health/ready/route.ts#L33C26`,
`erp/db.ts#L177C27` and `observability/operator-console.ts#L98C26`. The tool now computes the sum,
the delta and the missing/duplicate id lists itself and gates on them, and an independent
recomputation that uses none of the tool's own functions reproduces 392.

**The outcome phrasing.** "72 edges + DB-08/DB-19/DB-22" was never a total: it did not say whether a
named finding was already one of the counted members. Each outcome class is now a SET of structured
ids — `callsite:<id>` or `edge:<consumerEdgeId>` — so the total is the set's cardinality and overlap
is impossible by construction. The deduplication rule that matters: **a WRAPPER call site is never a
member**, because its behaviour is carried by its consumer edges and counting both would count one
behaviour twice. The tool rejects a flagged wrapper rather than counting it, and a selftest proves it.

**The residual.** Revision 3 called 70 sites low-impact on the strength of their not carrying an
impact tag, while admitting in the same document that `PUBLIC_PATH` is a floor. That was not sound,
and screening them proved it: **twelve of them are security-control dependencies that the rule set
had filed as `EMPTY_SUCCESS_FALLBACK`**, including `isSessionActive` — the canonical session
revocation check — whose `return false` is a DENIAL and says so in its own comment. Those twelve are
now reclassified, which is why `AUTH_OR_SESSION_FAIL_CLOSED` is no longer zero. The residual is now
**69**: `src/lib/ats/application.ts#L83C26` gained a `PUBLIC_PATH` tag when it was reclassified and
moved out of the residual into the impact set.

---

## 1. Scope and method

Static analysis only. No database was contacted, no request was sent anywhere, no product file was changed, no
dependency was installed, nothing was committed. The deliverable is a versioned, reproducible tool plus the
inventory it generates and two fingerprint-pinned trace files that complete it.

`S0-B-03` remains open and its document was not touched.

| Field | Value |
|---|---|
| Worktree | `E:\hermes-security-dragon` |
| Branch | `feature/hermes-security-dragon` |
| Source SHA (lock) | `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` |
| `HEAD` | `e9514b0032cacc3369689189154af852e96972f5` — the S0-B-04 document, exactly 1 file, 507 insertions |
| `MERGE_HEAD` / rebase / cherry-pick | absent |
| `origin/main` now | `e9961048e894d8a4d2966387f2c369860c87bf58` — main has advanced past the lock, which is expected: an audit lock is a point in time |
| Product bytes changed | **0** |
| Tracked files changed | **0** |

---

## 2. Threat model

A `getPrisma()` call site is a decision point about **what the platform does when it cannot reach its own
database**. Six outcomes matter, and they are not equally bad:

| Outcome | Consequence |
|---|---|
| Refuse with a named status (503) | correct — availability is lost, integrity and truthfulness are kept |
| Refuse with a misleading status (409, 422, 404, 401) | the write is still prevented, but no client, operator or retry policy can tell an outage from a conflict, a validation error, a missing record or an expired session |
| Return an empty collection as a success | the caller cannot distinguish "nothing" from "I could not ask". On an industrial surface that is a safety-relevant misstatement |
| Acknowledge to an external party | a provider or gateway is told the event was handled and will never redeliver it |
| Read from an in-process store | the answer is stale or partial, and no consumer is told |
| Write to an in-process store | the write is acknowledged, lives in `globalThis`, dies on restart, is invisible to other replicas, and leaves no audit row because `recordAuditEvent` is itself Prisma-backed |

Production runs `HERMES_STORAGE_MODE=database` (owner-verified). The mode does **not** prevent any of the above:
the fallbacks live inside the database implementations, not behind the mode switch.

---

## 3. Definition of a call site, and of a consumer edge

A **call site** is one real `getPrisma(` call expression — not a file, an import or a textual occurrence.
Excluded by construction: the declaration itself, the import binding, and every occurrence inside a comment, a
string literal or a template literal. Identity `<posix-path>#L<line>C<column>` plus a `fingerprint` (the first
16 hex of SHA-256 over the whitespace-normalised five-line window). **835 textual occurrences, 392 real call
expressions** — the gap is what a naive grep over-counts, reported so the difference is auditable.

A **consumer edge** is one behaviour of one consumer of a local accessor. Identity
`<callsiteId>::<consumerFunction>@L<line>:<edgePath>`, with its own fingerprint, its own classification and its
own trace. **268 edges.** Four edge paths:

| Edge path | Shape | Question it answers |
|---|---|---|
| `NULL_GUARD` | `if (!m) return <fallback>` | what happens when there is no client |
| `EXCEPTION_SILENT` | `catch { return <fallback> }` with no log, metric or audit | what happens on a transient error, unobserved |
| `EXCEPTION_LOGGED` | the same, but it logs | the same, observed |
| `UNCONDITIONAL_DELEGATION` | `return <store>.x()` reached with no CLIENT guard and no try | not outage behaviour at all — see §7.3 |

---

## 4. Scanner architecture

`scripts/security/s0/getprisma-callsite-inventory.mjs` — dependency-free, `node:` built-ins only, because this
worktree has no `node_modules` and installing one is not permitted in this phase.

1. **File list.** `git ls-files` over `src/` and `scripts/`, filtered to `.ts .tsx .mts .mjs .js`. Git is primary
   because its output is already sorted, already POSIX, and lists exactly the tracked tree — so an untracked
   build artifact can never enter the inventory and move the hash. A filesystem walk is the fallback.
2. **Candidate narrowing.** `git grep -l getPrisma`. Cannot change the result; turns 143 seconds into about four.
3. **Blanking.** Comments and string/template literals replaced with spaces, **preserving length and newlines**,
   so line and column numbers stay exact.
4. **Discovery.** `\bgetPrisma\s*\(` against the blanked text, minus declaration forms.
5. **Window bounding.** Every forward window is clamped to the enclosing **function body** (§8.2, §8.3).
6. **Guard discovery.** Negative, positive, delegate and one-hop derived shapes (§6).
7. **Null-path classification.** Structure from the *blanked* code, content from the *original* source (§8.1).
8. **Consumer-edge extraction** for a local, non-exported accessor (§7).
9. **Manual traces**, fingerprint-pinned at both levels, with stale and orphan detection.
10. **Render.** Sorted, stable JSON.

Modes: `generate`, `check`, `summary`, `edges`, `coverage`, `reconcile`.

| Artefact | Path |
|---|---|
| Scanner | `scripts/security/s0/getprisma-callsite-inventory.mjs` |
| Selftest | `scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs` |
| Fixture | `scripts/security/s0/fixtures/scenarios.fixture.txt` |
| Call-site adjudications | `scripts/security/s0/getprisma-manual-adjudications.json` |
| **Consumer-edge traces** | `scripts/security/s0/getprisma-consumer-edge-traces.json` |
| Inventory | `docs/security/s0-getprisma-callsite-inventory.json` |
| This report | `docs/security/GETPRISMA-FAILURE-CLASSIFICATION.md` |

Two file names deviate from the brief, both to avoid breaking the repository's own gates: **`.selftest.mjs`**
(because `vitest.config.ts` declares no explicit `include`, so a `*.test.mjs` `node:test` file would be collected
and executed by vitest in CI, which cannot run it) and **`.fixture.txt`** (because `tsconfig.json` includes
`**/*.ts`, so a `.ts` fixture would be type-checked by `next build`, and this fixture deliberately does not
type-check).

---

## 5. Rule set `s0-b05.5`

Carried inside the generated JSON; it must be bumped on any change to the rule table, the tokenizer or the
record shape, so a stale inventory is detectable even when no call site has moved.

### 5.1 Precedence, first match wins

| # | Stage | Rule |
|---|---|---|
| 1 | module identity | `R01-definition-wrapper` |
| 2 | test corpus | `R02-test-path` |
| 3 | accessor return | `R15-accessor-return` |
| 4 | presence test | `R13-presence-test-degraded` / `R14-presence-test` |
| 5 | model accessor | `R12-model-accessor` |
| — | *(3 and 5 first attempt consumer-edge extraction → `R22`)* | |
| 6 | no binding | `R11-ambiguous` |
| 7 | guard discovery | direct → delegate → one derived hop |
| 8 | null-path content | `R04`, `R03`, `R05`, `R20`, `R06`, `R07`, `R08`, `R09`, `R18`, `R19`, `R11` |
| 9 | exception path | `R21-silent-exception` |
| 10 | positive guard, no else | `R16-positive-guard-no-else` |
| 11 | no guard at all | `R10-no-guard` |

### 5.2 The rules

| Rule | Classification | Confidence | Shape |
|---|---|---|---|
| `R01-definition-wrapper` | `WRAPPER_OR_FACTORY` | EXACT | `src/lib/db/prisma.ts` itself |
| `R02-test-path` | `TEST_ONLY` | EXACT | `__tests__/`, `*.test.*`, `*.spec.*`, `testing/` |
| `R15-accessor-return` | `WRAPPER_OR_FACTORY` | EXACT | the result is returned without a decision |
| `R12-model-accessor` | `WRAPPER_OR_FACTORY` | EXACT | `return b ? <delegate> : null` |
| `R22-local-accessor-consumers` | `WRAPPER_OR_FACTORY` | EXACT | a local accessor; its behaviour is published as edges |
| `R13-presence-test-degraded` | `EXPLICIT_DEGRADED_MODE` | HIGH | presence test named for a degraded mode |
| `R14-presence-test` | *unresolved* | MANUAL | any other presence comparison |
| `R04-guard-503` | `DB_UNAVAILABLE_RETURNS_503` | EXACT | `503`, `SERVICE_UNAVAILABLE`, `*_UNAVAILABLE` |
| `R03-guard-throw` | `DB_REQUIRED_FAIL_CLOSED` | EXACT | a throw that names no status |
| `R05-guard-auth-deny` | `AUTH_OR_SESSION_FAIL_CLOSED` | EXACT | `401`/`403`/`FORBIDDEN` |
| `R20-in-memory-write` | `IN_MEMORY_WRITE_FALLBACK` | EXACT | a mutating method on an in-process store, or a `globalThis` write |
| `R06-guard-session-fallback` | `IN_MEMORY_READ_FALLBACK` | HIGH | an in-process store read |
| `R07-guard-empty-array` | `EMPTY_SUCCESS_FALLBACK` | EXACT | `[]` or an object of empty arrays |
| `R08-guard-null-undefined` | `EMPTY_SUCCESS_FALLBACK` | HIGH | `return null` / `undefined` / bare `return` |
| `R09-guard-false-zero` | `EMPTY_SUCCESS_FALLBACK` | HIGH | `return false` / `return 0` |
| `R21-silent-exception` | `SILENT_EXCEPTION_FALLBACK` | EXACT | an unlogged `catch` with no return or throw |
| `R18-result-object-refusal` | *unresolved* | MANUAL | `{ ok/success/applied/consumed: false }`, `{ affected/count: 0 }` |
| `R19-named-or-shaped-return` | *unresolved* | MANUAL | a named binding or shaped object whose emptiness is unreadable |
| `R16-positive-guard-no-else` | *unresolved* | MANUAL | `if (binding) { … }` with no else |
| `R10-no-guard` | *unresolved* | MANUAL | no guard in any recognised shape |
| `R11-ambiguous` | *unresolved* | MANUAL | unbound call, or a null path matching nothing exactly |

**No rule may assert a safe classification on an unmatched shape**, and no rule marked HIGH can close a
high-impact site: the coverage gate (§9) requires a trace for those regardless of what the rule said. A
selftest strips the traces and asserts the gate reopens.

---

## 6. Guard shapes recognised

| Shape | Example | Null path |
|---|---|---|
| `NEGATIVE_CLIENT` | `if (!db)`, `if (db === null)`, `if (db == undefined)` | the consequent |
| `NEGATIVE_DELEGATE` | `if (!db?.engineeringCase)`, `if (!p.model \|\| !p.other)` | the consequent |
| `POSITIVE_CLIENT_WITH_ELSE` | `if (db) { … } else { … }` | the **else** branch |
| `POSITIVE_DELEGATE_WITH_ELSE` | `if (db?.alert) { … } else { … }` | the **else** branch |
| `POSITIVE_NO_ELSE` | `if (db) { … }` | a fall-through — no span, stays manual |
| `DERIVED_ONE_HOP:<shape>` | `const repo = db?.model`, `Boolean(db)`, `db ?? x`, `const m = db ? db.model : undefined` | the guard on the derived name |
| `LOCAL_ACCESSOR_WITH_CONSUMER_EDGES` | a non-exported accessor | every consumer, as its own edge |
| `SWALLOWING_CATCH` | `catch { }` | execution continues past the failure |

A compound condition is reduced to its **first clause**, the only one whose position is deterministic. Exactly
**one** derivation hop is followed.

---

## 7. The consumer-edge model

### 7.1 Why risk-max was replaced

The six brain/storage repositories hold **one** `getPrisma()` call each, inside a local `async function model()`
that returns the delegate or null. The DB-F1 fallback points are not `getPrisma()` call sites at all: they are
the `if (!m) return fallback.create(input)` statements in the methods that **call** that accessor.

- **v2** classified the accessor `WRAPPER_OR_FACTORY` and then excluded wrappers from the production counts, so
  the largest finding in the inventory scored **zero**.
- **v3.0** attributed the accessor to the single highest-risk behaviour among its consumers. Better, but still
  lossy: `case-repository.ts` has consumers that read from the session store, consumers that **write** to it,
  and — in the sibling analysis repository — consumers that delegate to it unconditionally. One word hid two of
  the three, and the audit question is per operation.
- **v3.1** keeps the call site as `WRAPPER_OR_FACTORY` (a true statement: it hands a client or a null to its
  consumers and decides nothing) and publishes **every** consumer behaviour as its own edge.
  `accessorConsumers.highestConsumerRisk` remains as a ranking convenience and is never a substitute. A selftest
  asserts that a wrapper with a read fallback, a write fallback, a fail-closed consumer and an unreadable
  consumer produces four distinct classifications and is itself still `WRAPPER_OR_FACTORY`.

### 7.2 Fail-safe

An edge whose null path the tokenizer cannot read keeps `UNRESOLVED_REQUIRES_MANUAL_REVIEW` and
`manuallyTraced: false`, with `terminalBoundary: null`. It is **never** inferred from a sibling edge. The gate
counts it open until a pinned trace resolves it, and a selftest asserts exactly that for the fixture's
result-object consumer.

### 7.3 `UNCONDITIONAL_DELEGATION` is not outage behaviour

Three edges land here, and reading each one mattered:

- **`analysis-repository.ts:136` and `:139`** — `return fallback.update(id, patch)` and
  `return fallback.delete(id)` with no guard and no try. The database repository **never implements** those two
  methods; they always go to the session store. They are two of DB-F1's 69 `return fallback.` statements and they
  are not failure paths at all.
- **`document-repository.ts:461`** — `if (count === 0) return fallback.update(id, patch)`. Conditional, but on a
  **zero-row match**, not on a missing client. The in-file comment at `:456-461` explains the intent (a document
  that fell back to the session store at `create()` must still receive its `storageKey`) and states the fallback
  is tenant-filtered so it cannot reach another organization. The consequence worth recording is that a `PATCH`
  for an id present in neither store still answers as a successful update.

Both shapes are excluded from the outage count (265 outage edges of 268) so the DB-F1 composition is visible
instead of being folded into one number.

---

## 8. Scanner limitations — stated, not hidden

There is no TypeScript parser available without a dependency, so the analyser is a bounded tokenizer.

1. **Regex literals are not tokenized.** A regex containing a quote or a brace can mis-blank a nearby span. A
   regex cannot contain a `getPrisma(` call, so the worst case is an unresolved verdict, never a wrong one.
2. **Windows are bounded** to 2600 characters *and* to the enclosing function body.
3. **Inter-procedural behaviour is out of scope for the tool**, with one bounded exception: consumer-edge
   extraction, confined to the scope that declares the accessor. Everything else was traced by hand, and every
   trace — at both levels — records the `callerPath` it was followed along.
4. **`R21` is a shape detector, not a terminal-behaviour detector.** A swallowing catch inside a handler that
   then answers normally is classified by the shape; only reading the handler settles what the client receives.
5. **`PUBLIC_PATH` is not derivable from the path** and is applied only by manual adjudication, from the public
   handler inventory established in S0-B-01. Its count is a floor.
6. **`consumerFunction` is the nearest preceding declaration that starts a line.** For a delegation that is not a
   method of its own, the name is approximate; the line number is the anchor, and the edge id carries both.

### 8.1 Structure versus content

Braces, parens and `else` are matched against the **blanked** code; every classification reads its span from the
**original** source. The first revision of this scanner matched content against the blanked text — which erases
the string literals that identify a refusal, turning `code: "OWNER_CONTEXT_UNAVAILABLE"` into `code: ` — and
mis-filed dozens of controlled 503s as ambiguous.

### 8.2 The window defect (TOOL-03)

Windows used to be flat character counts. In a file where two adjacent functions both bind `db`, the window
reached past the first function's closing brace and found the **second** function's guard, so a guardless call
was classified by its neighbour's. Bounded to the enclosing body in revision 2.

### 8.3 The function-body defect (TOOL-05) — the one that mattered most

Revision 2's body detection tested only whether the text before a `{` ended in `)` or `=>`. Two consequences:

- a **TypeScript return-type annotation** ends the header with the type, not the parameter list:
  `function createDatabaseMemoryRepo(owner: X): Repository<A, B> {` ends in `>`. Almost every function in this
  repository is annotated, so the walk fell through to module scope. That is why consumer discovery was still
  effectively file-wide after the "scoping fix", and why the **two accessors in `memory-repository.ts` — one in
  the memory factory, one in the feedback factory, both named `model()` — were each handed all 14 consumers**;
- `if (…) {`, `for (…) {`, `while (…) {`, `catch (e) {` and `switch (x) {` all end in `)`, so a control block
  was accepted as a function body and truncated the window at its own closing brace.

Both are fixed by `isFunctionBodyBrace`, which accepts `)`/`=>`/`) : ReturnType` and rejects the control
keywords. Eleven unit cases pin it. **The fix moved the edge count from 338 to 268** and split
`memory-repository.ts` into 10 + 4, which is what finally made DB-F1 reproduce exactly (§15).

### 8.4 Two further defects found and fixed this revision

- **TOOL-06** — `enclosingMemberName` first used a single regex with an optional return-type group over a
  multi-kilobyte slice. On this repository's long object literals it backtracked catastrophically and turned a
  four-second build into an eighty-second one; and matching anywhere on a line put `Boolean(`, `Date(` and even
  `getPrisma(` into edge ids. It now scans backwards line by line and requires the name to start the line.
- **TOOL-07** — `edgeOperation` used whole-word boundaries, so `\bcreate\b` did not match inside
  `createApiKey`. Almost every exported name here is a compound, and **181 of 269 edges first came back
  `UNKNOWN`**, which under-counted the audit-loss class by more than half. Prefix matching fixed it
  (`WRITE` 104, `READ` 136, `DELETE` 21, `UNKNOWN` 7).
- **TOOL-08** — the unconditional-delegation sweep claimed only the *accessor's* own guard, so a factory method
  holding its own `getPrisma()` call and its own `if (!db) return fallback.x(id)` was reported as permanent
  delegation. Now every `getPrisma` guard inside the scope is claimed first. The orphan-edge gate caught the
  removed edge on the next run, which is the detection working as designed.

---

## 9. The coverage gate

Nineteen counters, all of which must be zero. `check` exits 2 on inventory drift, 3 on a stale
adjudication, 4 on an orphan adjudication, 6 on a stale edge trace, 7 on an orphan edge trace, 8 on a
stale residual screening and 9 on an orphan one; `coverage` exits 5 while any counter is open.

```
PASS  UNRESOLVED                                    = 0
PASS  PRIMARY_PARTITION_DELTA                       = 0
PASS  MISSING_PRIMARY_IDS                           = 0
PASS  DUPLICATE_PRIMARY_IDS                         = 0
PASS  CLASSIFICATIONS_OUTSIDE_CLOSED_SET            = 0
PASS  OUTCOME_DUPLICATE_IDS                         = 0
PASS  OUTCOME_ORPHAN_IDS                            = 0
PASS  OUTCOME_STALE_IDS                             = 0
PASS  RESIDUAL_UNKNOWN_REACHABILITY                 = 0
PASS  RESIDUAL_REQUIRED_FULL_TRACE_MINUS_COMPLETED  = 0
PASS  HIGH_IMPACT_HIGH_UNTRACED                     = 0
PASS  HIGH_IMPACT_UNRESOLVED                        = 0
PASS  WRAPPER_CONSUMER_UNTRACED                     = 0
PASS  STALE_OVERRIDES                               = 0
PASS  ORPHAN_OVERRIDES                              = 0
PASS  STALE_CONSUMER_EDGES                          = 0
PASS  ORPHAN_CONSUMER_EDGES                         = 0
PASS  STALE_RESIDUAL_SCREENINGS                     = 0
PASS  ORPHAN_RESIDUAL_SCREENINGS                    = 0
COVERAGE COMPLETE — every call site and every consumer edge is traced
```

`HIGH_IMPACT_HIGH_*` is computed from `autoConfidence`, the rule's own confidence, which is retained on every
record even after a manual trace supersedes it. Without that the counter would read zero the moment the work was
done and would stop measuring how much of the inventory rests on a shape match.

### 9.1 Determinism and tamper proofs

| Proof | Value |
|---|---|
| First `generate` | `0fea9170b4db4f592defca15e0c3fb2cd81940c36f7159a45b9535218c48047e` |
| Second `generate` | `0fea9170b4db4f592defca15e0c3fb2cd81940c36f7159a45b9535218c48047e` |
| Byte-identical | **YES** |
| `check` | exit **0** |
| `coverage` | exit **0** |
| One adjudication fingerprint corrupted | exit **3**, naming the stale id |
| An adjudication for a non-existent site | exit **4**, naming the orphan |
| One **edge** fingerprint corrupted | exit **6**, naming `…videos/data.ts#L126C17::loadVideoLibrary@L537:NULL_GUARD` |
| An **edge** trace whose edge no longer exists | exit **7**, naming `…document-repository.ts#L379C22::deleteWithStorageCleanup@L481:UNCONDITIONAL_DELEGATION` — which is how TOOL-08's removed edge was caught |
| One **residual screening** fingerprint corrupted | exit **8**, naming the stale id |
| A **residual screening** for a site no longer in the residual set | exit **9** — which is how `ats/application.ts#L83C26` leaving the residual was caught |

---

## 10. Fixture and test coverage

`node --test scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs` → **75 tests, 75 passed, 0 failed**,
about 2.8 s.

New fixture scenarios for the edge model: one factory with a local accessor and five consumers — a read fallback,
a write fallback, a fail-closed `throw`, an unreadable result-object refusal, and an unconditional delegation —
plus **a second factory in the same file whose accessor is also named `model`**, which is the double-counting
regression.

The new tests assert: that a TypeScript return type is recognised as a function body and a control block is not
(eleven cases); that two same-named accessors do not share consumers; that read, write and fail-closed consumers
of one wrapper keep their own classifications; that an unreadable consumer stays unresolved, untraced and
boundary-less; that an unconditional delegation is a distinct path tagged `NOT_AN_OUTAGE_PATH`; that four
distinct classifications survive on one wrapper; that the call site itself stays `WRAPPER_OR_FACTORY` while still
exposing `highestConsumerRisk`; that edge extraction is deterministic, ordered and unique; that an edge trace
pinned to an old fingerprint is STALE; that every edge carries the contracted fields and every traced edge carries
a boundary, a caller path, a durability outcome, a retry outcome and line evidence; that the gate is zero on every
counter; **that stripping the traces reopens the gate**; that DB-F1 reproduces from edges; and that DB-F2 keeps
its legacy number while reporting the larger semantic one.

---

## 11. Final counts

### 11.1 Call sites — an exact partition

```
rulesetVersion              s0-b05.5
textualOccurrences          835
realCallExpressions         392
productionCallSites         339        testOnly 27      wrapper 26
autoClassifiedExact         148        autoClassifiedHigh 69
manuallyAdjudicated         187        (89 on rule-unresolved sites,
                                        21 agreeing with a decided rule,
                                        69 superseding one)
unresolved                    0
highTotal                   130
highImpactTotal             204
highImpactHighTotal         60         traced 60       untraced 0

PRIMARY_CLASSIFICATION_SUM  392        PRIMARY_PARTITION_DELTA 0
MISSING_PRIMARY_IDS           0        DUPLICATE_PRIMARY_IDS   0
CLASSIFICATIONS_OUTSIDE_CLOSED_SET  0
```

| Classification | Call sites |
|---|---|
| `EMPTY_SUCCESS_FALLBACK` | **163** |
| `DB_UNAVAILABLE_RETURNS_503` | **76** |
| `DB_REQUIRED_FAIL_CLOSED` | **71** |
| `TEST_ONLY` | 27 |
| `WRAPPER_OR_FACTORY` | 26 |
| `EXPLICIT_DEGRADED_MODE` | 13 |
| `AUTH_OR_SESSION_FAIL_CLOSED` | **4** |
| `SILENT_EXCEPTION_FALLBACK` | 4 |
| `HEALTH_OR_DIAGNOSTIC_ONLY` | 4 |
| `IN_MEMORY_READ_FALLBACK` | 2 |
| `IN_MEMORY_WRITE_FALLBACK` | 1 |
| `INITIALIZATION_OR_MAINTENANCE` | 1 |
| `UNRESOLVED_REQUIRES_MANUAL_REVIEW` | **0** |
| **sum** | **392** |

Every one of the 392 records carries exactly one classification from the declared closed set, no id
appears twice, and nothing is classified outside the set. The table's own sum is printed as a row so a
figure transcribed from this report can be checked against it, and an independent recomputation that
uses none of the tool's functions reproduces the same 392.

**Three numbers moved since revision 3, all because of the residual screening (§0.1, §14):**
`EMPTY_SUCCESS_FALLBACK` 175 → **163**, `DB_REQUIRED_FAIL_CLOSED` 63 → **71**, and
`AUTH_OR_SESSION_FAIL_CLOSED` 0 → **4**. Twelve security-control dependencies were reclassified from
an empty success to a denial after their callers were read. The zero in revision 3 was not a detector
gap and not a property of the repository — it was a wrong verdict on `return false`.

The in-memory counts are low **at this level by design**: the repositories' accessors are
`WRAPPER_OR_FACTORY` and their in-memory behaviour is published as edges. Reading either table alone
misrepresents the platform; §11.2 is the other half.

### 11.2 Consumer edges

```
total 268      traced 268      untraced 0      unresolved 0
outage paths 265               unconditional delegations 3
```

| | Edges |
|---|---|
| `EMPTY_SUCCESS_FALLBACK` | **96** |
| `DB_REQUIRED_FAIL_CLOSED` | **77** |
| `IN_MEMORY_WRITE_FALLBACK` | **49** |
| `IN_MEMORY_READ_FALLBACK` | **44** |
| `AUTH_OR_SESSION_FAIL_CLOSED` | 2 |

| Edge path | Count | | Operation | Count |
|---|---|---|---|---|
| `NULL_GUARD` | 141 | | `READ` | 136 |
| `EXCEPTION_SILENT` | **119** | | `WRITE` | **104** |
| `EXCEPTION_LOGGED` | 5 | | `DELETE` | 21 |
| `UNCONDITIONAL_DELEGATION` | 3 | | `UNKNOWN` | 7 |

**119 of 124 exception edges are silent.** Only five log.

### 11.3 Outcome classes — deduplicated id sets

Each class is a SET of structured ids, so the total is the set's cardinality. Membership for an EDGE
is derived from the structured fields its trace records; membership for a CALL SITE comes only from an
explicit `outcomeFlags` on its adjudication, so a site can never enter a set by a prose match. An id
may belong to several classes; a repeat inside one class is a gate failure.

| Outcome | Unique total | Meaning |
|---|---|---|
| `SUCCESS_WITHOUT_PERSISTENCE` | **88** | a 2xx or caller-visible success whose durability is in-memory or none |
| `ACK_WITHOUT_DURABILITY` | **9** | an acknowledgement to an external party that will therefore not redeliver |
| `AUDIT_LOSS` | **146** | a write or delete for which no audit row records what happened |
| `RETRY_SUPPRESSION` | **263** | the caller or provider is not told to try again |

```
OUTCOME_DUPLICATE_IDS 0    OUTCOME_ORPHAN_IDS 0    OUTCOME_STALE_IDS 0
```

**How double counting is prevented.** A wrapper call site is never a member: its behaviour is carried
by its consumer edges, and the tool rejects a flagged wrapper with `WRAPPER_WOULD_DOUBLE_COUNT`
rather than counting it. Each named finding is therefore exactly one of three things, and the tool
says which:

| Finding | Call site | Membership |
|---|---|---|
| **DB-08** | `src/lib/industrial/telemetry.ts#L64C24` | INDEPENDENT call-site member of all four classes |
| **DB-12** | `…/subscription-events.ts#L63C25` and `…/webhook-store.ts#L21C29` | INDEPENDENT call-site members; the three `mark*` siblings are separate members again |
| **DB-19** | `src/lib/storage/case-repository.ts#L118C22` | **LABEL ON EDGES** — a wrapper whose 12 edges already carry the outcome; adding the site would double count |
| **DB-21** | `src/lib/industrial/gateways.ts#L112C24` | INDEPENDENT member of `AUDIT_LOSS` and `RETRY_SUPPRESSION` |
| **DB-22** | `src/lib/industrial/gateways.ts#L126C24` | INDEPENDENT member of all four |
| **DB-06** | `src/app/api/auth/route.ts#L188C22` (+ `#L48C20`) | INDEPENDENT members |
| **DB-04** | `src/lib/storage/case-repository.ts#L225C20` | INDEPENDENT member of `RETRY_SUPPRESSION` only — it is a read, so nothing was to be persisted |
| **DB-07** | `…/academy/certificates/[id]/route.ts#L19C20` | INDEPENDENT member of `RETRY_SUPPRESSION` only — it mis-attributes, it does not fail to persist |
| **DB-09** | `src/app/api/industrial-graph/route.ts#L41C22` | INDEPENDENT member of `RETRY_SUPPRESSION` only |
| **DB-13** | `src/lib/auth/session-store.ts#L227C20` | **NOT a member of any class** — its null path is unreachable and it refuses; the risk is the exception path |

### 11.4 Secondary tags, call-site level

`READ` 233 · `WRITE` 120 · `DELETE` 8 · `SILENT` 211 · `SILENT_CATCH` 108 · `LOGGED` 40 ·
`TENANT_SCOPED` 241 · `SITE_SCOPED` 50 · `AUDIT` 79 · `USER_VISIBLE` 111 · `TRANSACTIONAL` 40 ·
`BACKGROUND_JOB` 11 · `PUBLIC_PATH` 9 (a floor).

- **Tenant isolation is not weakened by any fallback.** The session repositories apply the same owner predicate,
  no tenant route takes `organizationId` from the client, and no cross-tenant read has been demonstrated in any
  phase of this programme. The document tenant repository's zero-row delegation is explicitly tenant-filtered.
- **Site isolation has one latent defect** (DB-09), currently masked.
- `logInfraFailure` fires in exactly **three** places on a null client in the whole platform: `prisma.ts` at
  client initialisation, `rotateRefreshToken`, and the readiness probe.

---

## 12. How the traces were made, and why they are reliable

Each call site was opened, its enclosing function read in full, its null path and its exception path followed,
and its exported symbol resolved to every caller with `git grep -w` — mechanically, not from memory, because
guessing a symbol name is how a trace becomes fiction. Each consumer edge inherits the terminal boundary
established for its function, with its own line evidence and its own fingerprint.

Both trace files carry, per entry: the id, the pinned `sourceFingerprint`, the classification, the secondary
tags, a reason, line `evidence`, the `callerPath` that was followed, and the `terminalBoundary`. Edge traces also
carry `terminalResponse`, `retryBehavior`, `durability` and `auditOutcome`.

Five properties make these auditable rather than assertions:

1. **Every entry names its evidence by line**, and selftests fail if any entry lacks a line reference, a caller
   path, a terminal boundary, a durability outcome or a retry outcome.
2. **Every entry is fingerprint-pinned**, at both levels, with stale and orphan detection proven in §9.1.
3. **Fingerprints were read from the inventory, never retyped.**
4. **The rule set and the manual verdicts were cross-checked.** On the 78 sites where both reached a decision, 21
   agree and 57 supersede. One of those disagreements is what surfaced the `R03`/`R04` ordering defect in
   revision 2, and the DB-F1 reconciliation is what surfaced TOOL-05 in this one.
5. **A classification mapped from a terminal boundary is explicit.** The edge-trace builder maps each boundary to
   a classification in a table and **throws** on an unmapped boundary, so a new boundary can never silently
   inherit one.

The reviewer label is `S0 manual adjudication`. It does **not** claim an independent human review. The
adjudication files were assembled with one-off generators that read fingerprints from the inventory so a pin
cannot be mistyped; those generators are not part of the deliverable, because the JSON is the evidence and
`check` validates it against the source on every run.

---

## 13. Findings

### 13.1 The seven findings the review asked to be pinned to the edge model

| ID | Call site | Fingerprint | Terminal response | Durability | Audit | Retry | Exploitability precondition |
|---|---|---|---|---|---|---|---|
| **DB-08** | `src/lib/industrial/telemetry.ts#L64C24` | `7837a697874db968` | **HTTP 201 Created** `{ ingested: 0 }` | NONE — readings dropped | a `TELEMETRY_INGESTED` row is attempted asserting `count: 0`, and fails on the same outage | **NO** — 201 is success, so the gateway does not buffer or resend | none; any telemetry POST during an outage |
| **DB-12** | `src/lib/billing-governance/runtime/subscription-events.ts#L63C25` + `webhook-store.ts#L21/62/71/80` | `f8a9db155f30dc2b` | **HTTP 200** `{ received: true, outcome: "IGNORED" }` | NONE | the `WEBHOOK_REJECTED` row is Prisma-backed and also fails | **NO** — the provider treats 200 as delivered | none; any provider event during an outage |
| **DB-09** | `src/app/api/industrial-graph/route.ts#L41C22` | `701fa7934692ec09` | HTTP 200 with an **empty** graph | n/a (read) | a `GRAPH_QUERY` row recording `nodeCount: 0` | NO | **LATENT.** Requires the graph loader to gain a cache, snapshot or in-process fallback. Today `loadOrgGraph` returns `null` on the same condition, so the skipped site filter has nothing to disclose. Cross-tenant exposure impossible: `organizationId` is filtered unconditionally |
| **DB-13** | `src/lib/auth/session-store.ts#L227C20` | `0704eff220bfb157` | the caller discards the result | the `tokenVersion` bump may not happen | none | n/a | **EXCEPTION PATH ONLY.** Requires the SUSPENDED status write to commit and the generation bump to throw. The null-client path is unreachable: `model()` in `src/lib/org/members.ts` has already refused the status write at `:193`. Org surfaces stay denied by the per-request role re-read; non-org sessions survive until expiry |
| **DB-04** | `src/lib/storage/case-repository.ts#L225C20` | `4650b3e80e10ad0e` | HTTP 200 with published cases read from `globalThis.__hermesCaseDrafts` | in-memory | none | NO | none; any anonymous `/api/eng-graph` or `/api/operations` request during an outage. Published-only, so not a disclosure |
| **DB-06** | `src/app/api/auth/route.ts#L188C22` (+ `#L48C20`, `#L75C20`) | `74994c65f6416a12` | the login still fails | no counter, no `login.failed`, no lockout state | none | n/a | none for the loss of detection. The `isAccountLocked → false` fail-open is masked: `issueTokens` throws and the handler answers 503, so no login can succeed |
| **DB-07** | `src/app/api/academy/certificates/[id]/route.ts#L19C20` | `7364a533954b10b9` | **HTTP 200** with holder name `"Unknown"` | n/a (read) | none | NO | none; any public certificate verification during an outage. Mis-attributes, does not mis-validate |

Representative edge ids for the DB-F1 write path, each with its own pinned fingerprint:

```
c222ef716fad5933  src/lib/storage/case-repository.ts#L118C22::create@L167:NULL_GUARD
f65ef0d75b479a2f  src/lib/storage/case-repository.ts#L118C22::create@L174:EXCEPTION_SILENT
a14d07753f26448e  src/lib/storage/case-repository.ts#L118C22::delete@L197:NULL_GUARD
76694786461d5cd2  src/lib/storage/case-repository.ts#L118C22::delete@L203:EXCEPTION_SILENT
ec83fb769bd4700a  src/lib/documents/document-repository.ts#L379C22::delete@L470:NULL_GUARD
ba92924df506092a  src/lib/documents/document-repository.ts#L379C22::delete@L475:EXCEPTION_SILENT
```

### 13.2 New findings from this revision's tracing

| ID | Finding | Evidence |
|---|---|---|
| **DB-19** | **The response asserts `storageMode: "database"` while the write went to `globalThis`.** `POST /api/cases` answers HTTP 200 `{ storageMode: getStorageMode(), case: rec, updated: … }` after `repo.create()` fell back to the session store. The same shape is in `/api/knowledge` and `/api/analysis`. The client is not merely told the write succeeded — it is told which store it went to, and that statement is false. | `src/app/api/cases/route.ts:102-119` · `src/app/api/knowledge/route.ts:90-101` · `src/app/api/analysis/route.ts:63-65` |
| **DB-20** | **An outage is reported as an authentication failure on five academy routes.** The local `resolveUser` helper collapses four conditions — no client, no cookie, an invalid token, no ACTIVE membership — into one `null`, and the handlers answer **HTTP 401 "Authentication required"**. Users are sent to re-authenticate pointlessly and every auth-failure monitor fills with infrastructure noise. The sixth route, `academy/overview`, answers HTTP 200 with a null stats block for the same condition: one module, one failure, two incompatible stories. | `src/app/api/academy/certificates/route.ts:8-26` and the enroll, progress, course-progress and quiz-attempt siblings; the divergent one at `src/app/api/academy/overview/route.ts:32-34` |
| **DB-21** | **Gateway revocation answers "already revoked" while the credential stays valid.** `revokeGateway` returns `null` and the route answers **HTTP 404 "Gateway not found or already revoked"**, with the `GATEWAY_REVOKED` audit event written only after the guard. An operator revoking a gateway they believe is compromised is told the job is already done, nothing happened, and no audit row records the attempt. This is the most consequential mis-statement found in this revision. | `src/lib/industrial/gateways.ts:111-113`; route `src/app/api/industrial/gateways/[id]/route.ts:110-114` |
| **DB-22** | **The gateway heartbeat endpoint audits a heartbeat it never persisted.** `touchGatewayHeartbeat` is `Promise<void>` and returns early; the route does not check it and goes on to meter the call and write a `GATEWAY_HEARTBEAT` audit event. `src/lib/scada-control-room/contract.ts:8-20` documents that this function is one of only two writers of the gateway status column and that "a gateway that heartbeats once and then dies stays ONLINE in the database forever" — so the missed write does not make the status worse, but an audit row asserting a heartbeat that was not recorded is new. | `src/lib/industrial/gateways.ts:125-127`; route `src/app/api/industrial/gateways/[id]/heartbeat/route.ts:36-44` |
| **DB-23** | **The industrial and twin UPDATE paths report an outage as a missing record, while their CREATE siblings answer 503.** `createAsset`, `createSite`, `createGateway`, `createConnector`, `createNode` and `createLayout` all map `null` to **503**. `updateAsset`, `updateSite`, `updateGateway`, `updateConnector`, `updateNode`, `updateTag`, `updateRelation` and `dismissAlert` map the same `null` to **404 "… not found"**, with the audit event after the guard. On a plant surface that is a statement about the equipment, not about the platform. `createRelation` and `createTag` are worse again: **422 "may be duplicate"**, i.e. an outage reported as a unique-key violation. | the create/update pairs in `src/app/api/industrial/**` and `src/app/api/digital-twin/**`, cited line by line in the adjudication file |
| **DB-24** | **Twenty-seven consumer edges and nine exported functions are dead product surface.** `git grep -w` finds no caller in `src/` or `scripts/` for: the whole of `src/lib/site/members.ts` (`getUserSites`, `getSiteMembers`, `grantSiteAccess`, `updateSiteRole`, `revokeSiteAccess` — so **site membership cannot be read or managed through the product at all**), the whole of `src/lib/knowledge/categories.ts`, `org/members.transferOwnership` (corroborating S0-B-04's declared-but-unimplemented `transfer_ownership`), `knowledge/rootcauses.createRootCause`, `knowledge/articles.createAssetKnowledgeLink` and `listAssetLinks`, `billing/usage.listUsage`, `org/organizations.getOrganizationBySlug`, `time-series/health-history.snapshotAssetHealth`, `observability/audit-retention.sweepAuditRetention` (test-only), and both exports of `ats/withdrawal-otp`. Each refuses correctly; each is surface whose refusal nothing can observe. | the generated caller resolution; `reconcile` and the trace files record the per-function result |
| **DB-25** | **The document tenant repository redirects a zero-row update to the in-process store.** `if (count === 0) return fallback.update(id, patch)` — so a `PATCH` for an id present in neither store still answers as a successful update. Deliberate and tenant-filtered (the comment explains both), but it is the one in-memory write on that surface that is not an outage path. | `src/lib/documents/document-repository.ts:450-466` |
| **DB-26** | **`119 of 124` exception edges are silent.** Only five log. Combined with `SILENT` on 211 of 392 call sites, an outage or a transient error is invisible to an operator almost everywhere outside the readiness probe. | §11.2, §11.4 |

### 13.3 Findings carried forward unchanged

DB-01 (the empty-success ratio), DB-05 (the silent majority), DB-10 (organization/billing/knowledge/platform-key
writes as **422** echoing `"Database unavailable"`), DB-11 (compliance writes as **409**, and the export-download
path writing an `EXPORT_TOKEN_REPLAY_DENIED` audit row for an outage), DB-14 (dead write paths — now extended by
DB-24), DB-15 (`isFallback: false` on a fallback), DB-16 (health functions reporting zeros instead of unknown),
DB-17 (usage metering dropped silently), DB-18 (`initiatePasswordReset` cannot signal its own failure).

### 13.4 Severity

**No critical bypass was found, and no `S0_SECURITY_STOP` is issued.** The two closest cases both have stated,
non-remote preconditions recorded in §13.1: DB-09 is masked by a loader that fails closed on the identical
condition, and DB-13 needs a partial database failure between two statements and is bounded by a per-request
org-role re-read. Neither is an authentication or tenant-isolation bypass. Final severity for everything here is
deferred to S1, as instructed. The damage class is integrity, durability, auditability and truthfulness.

---

## 14. Residual after tracing — screened, not assumed

### 14.1 Why the residual had to be screened

Revision 3 declared 70 sites low-impact because they carried no impact tag, while stating in the same
document that `PUBLIC_PATH` is a floor applied only by manual adjudication. Those two statements are
incompatible: an untagged site can be publicly reachable and simply not yet tagged. Screening them was
therefore not a formality, and it did not come back clean.

### 14.2 The reachability table

Every residual site carries a verdict, a caller, a terminal surface, a reason, line evidence and a
pinned fingerprint, in `scripts/security/s0/getprisma-residual-reachability.json`. Three verdicts
demand a full terminal trace; `UNKNOWN_REACHABILITY` keeps B-05 open.

```
RESIDUAL_HIGH_TOTAL              69
RESIDUAL_INTERNAL_ONLY            9
RESIDUAL_BACKGROUND_ONLY          0
RESIDUAL_AUTH_USER_VISIBLE       45
RESIDUAL_PUBLIC                   3
RESIDUAL_SECURITY_DEPENDENCY     12
RESIDUAL_UNKNOWN_REACHABILITY     0
RESIDUAL_REQUIRED_FULL_TRACE     60   RESIDUAL_FULLY_TRACED 60
```

**69, not 70.** `src/lib/ats/application.ts#L83C26` gained a `PUBLIC_PATH` tag when it was
reclassified (§14.3) and moved out of the residual into the impact set. The orphan-screening gate
caught it on the next run, which is exit 9 working as designed.

**No site was called INTERNAL_ONLY on the strength of its file name.** For every module the exported
surface was resolved with `git grep -w` and its consumers under `src/app` were listed. Every one of
the ~20 local accessors that looked internal sits in a module a route or page imports, so they are
`AUTHENTICATED_USER_VISIBLE`, not internal. The nine `INTERNAL_ONLY_PURE_READ` verdicts are pure
reads with **no product caller at all**: `digital-twin/graph.getDependencyPath`,
`digital-twin/layout.getLayout`, `digital-twin/nodes.countNodes`,
`digital-twin/relations.countRelations`, `digital-twin/tags.getAssetByTag`,
`industrial/telemetry.countTelemetry` and three `time-series/kpi` calculators. The stronger statement
about them is that they are dead surface (DB-24), not that they are low-risk.

| Verdict | Count | Representative members |
|---|---|---|
| `SECURITY_CONTROL_DEPENDENCY` | 12 | `auth/session-store.isSessionActive`, `org/context`, `site/context`, `auth/service.dbUserByEmail`, `billing-governance/entitlement-store` ×3, `ai-governance/policy-store`, `academy/request-scope`, `tenant/context` ×2, `billing-governance/trial-service` |
| `PUBLICLY_REACHABLE` | 3 | `ats/public-jobs.listPublicJobCards` (anonymous `/api/careers/jobs`), `ats/public-jobs.getPublicJobPosting` (the public posting page), `articles/engagement.isArticleSaved` (the public article page) |
| `AUTHENTICATED_USER_VISIBLE` | 45 | the four presence-test page renders, the compliance/CRM/ATS/media local accessors, and the industrial and twin `get*` readers |
| `INTERNAL_ONLY_PURE_READ` | 9 | the dead pure readers listed above |

### 14.3 What the screening found — twelve reclassifications

Twelve of the twelve `SECURITY_CONTROL_DEPENDENCY` sites were classified `EMPTY_SUCCESS_FALLBACK` by
the rule set because it matched `return false` or `return null`. Every one of them is a **denial**,
and most say so in their own comments. They are now reclassified, with the trace recorded:

| Call site | Was | Now | The terminal the rule could not see |
|---|---|---|---|
| `auth/session-store.ts#L105C20` `isSessionActive` | EMPTY_SUCCESS | **AUTH_OR_SESSION_FAIL_CLOSED** | `// fail closed — cannot confirm, so deny`. Reached from `isPayloadSessionActive`, the canonical revocation check for ~20 modules: during an outage every sid-bound session is DENIED |
| `org/context.ts#L68C20` `getOrgActorContext` | EMPTY_SUCCESS | **AUTH_OR_SESSION_FAIL_CLOSED** | a null actor context authorises nothing; also dead surface |
| `site/context.ts#L52C20` `getSiteActorContext` | EMPTY_SUCCESS | **AUTH_OR_SESSION_FAIL_CLOSED** | a null site context denies; also dead surface |
| `academy/request-scope.ts#L34C20` | EMPTY_SUCCESS | **AUTH_OR_SESSION_FAIL_CLOSED** | its comment binds the caller: "callers must treat that as 'no access', never as 'no filter'" |
| `auth/service.ts#L52C20` `dbUserByEmail` | EMPTY_SUCCESS | **DB_REQUIRED_FAIL_CLOSED** | the login credential lookup finds no user, so authentication fails |
| `billing-governance/entitlement-store.ts#L65/#L93/#L114` | EMPTY_SUCCESS | **DB_REQUIRED_FAIL_CLOSED** | `// no DB ⇒ fail closed`; the resolver's `safe()` turns any null into a denial and converts unknown usage to `POSITIVE_INFINITY`, which forces `allowed = false` |
| `ai-governance/policy-store.ts#L15C31` | EMPTY_SUCCESS | **DB_REQUIRED_FAIL_CLOSED** | `if (!policy) return { allowed: false, reason: "NO_POLICY" }` — external-AI egress is denied |
| `ats/application.ts#L83C26` `isRetentionPolicyApproved` | EMPTY_SUCCESS | **DB_REQUIRED_FAIL_CLOSED** | "Absence of proof refuses — an outage is a refusal too, never an acceptance", on the public candidate application path |
| `tenant/context.ts#L803C24/#L815C24` | EMPTY_SUCCESS | **DB_REQUIRED_FAIL_CLOSED** | no tenant can be established, so no caller proceeds as another tenant |

Every one is fail-closed, so **no new exposure was found** — but the inventory had been publishing a
wrong verdict on the platform's session, tenant, entitlement and AI-egress controls, and the
`AUTH_OR_SESSION_FAIL_CLOSED: 0` that revision 3 defended as genuine was an artefact of it.

### 14.4 What actually remains

Documented tool limitation only:

1. The tokenizer limits in §8.1–§8.4 — regex literals, the 2600-character window ceiling,
   `consumerFunction` being the nearest line-leading declaration, and `PUBLIC_PATH` being a floor.
2. **69 call sites still carry a HIGH automatic confidence**, of which **0** are on an impact path and
   all 69 are now screened for reachability, with the 60 that demanded a full terminal trace having one.
3. `UNKNOWN` operation on **7 of 268** edges, where neither the member name nor the fallback call names
   an operation. All seven are traced; only their read/write label is unresolved.

## 15. DB-F1 and DB-F2 — generated, not asserted

### DB-F1 — `CONFIRMED_EXACT`, 69, now reproduced from consumer edges

| File | `return fallback.` | bare `catch {` | consumer edges |
|---|---|---|---|
| `src/lib/storage/knowledge-repository.ts` | 14 | 7 | 14 |
| `src/lib/storage/memory-repository.ts` | 14 | 7 | 14 (10 + 4, across its **two** accessors) |
| `src/lib/storage/case-repository.ts` | 12 | 7 | 12 |
| `src/lib/storage/project-repository.ts` | 10 | 5 | 10 |
| `src/lib/storage/unknown-repository.ts` | 10 | 5 | 10 |
| `src/lib/storage/analysis-repository.ts` | 8 | 3 | 8 (6 outage + **2 unconditional**) |
| **subtotal** | **68** | **34** | **68** |
| `src/lib/documents/storage-cleanup.ts` | +1 | — | — (a direct site, not an accessor) |
| **total** | **69** | **34** | |

The edge count equals the grep count **exactly, per file**, and a selftest asserts that equality so the two can
never drift. The composition is now visible: of the 68 edges in the six repositories, **66 are outage or
exception paths and 2 are unconditional delegations** that never had a database implementation. Adding the one
`storage-cleanup.ts` database-mode fallback gives the historic 69, of which **67 are outage-conditional**.

`storage-cleanup.ts` has **two** `return sessionStore` statements and exactly one is a database-mode failure
path; the other is the storage-mode switch, a configuration branch. The tool distinguishes them and reports both.

Writes are included, telemetry is absent (zero log calls inside those catch blocks), and this is **not** a
confidentiality leak — the session store applies the same owner predicate. `DB_F1_FINAL_COUNT: 69`,
`DB_F1_CONSUMER_EDGE_COUNT: 68`.

### DB-F2 — two numbers, kept apart on purpose

```
DB_F2_LEGACY_SINGLE_LINE_COUNT      = 26
DB_F2_SEMANTIC_EMPTY_SUCCESS_COUNT  = 98
```

**Legacy, 26.** The historic definition: the single-line shape `if (!db|prisma|client) return []` across the six
module directories (`industrial`, `digital-twin`, `predictive`, `time-series`, `multi-site`, `knowledge`), 23
files contributing, two of them twice. This number is kept so the series **12 → 19 → 26** stays comparable, and
the reasons it moved are recorded: both earlier counts came from a hand-written list of files to check rather
than from an enumeration of the module set — the same class of error as counting only the files one happens to
remember.

**Semantic, 98.** The same question without the shape constraint: every guard in those directories whose null
path returns a **normal answer** rather than refusing. It is produced by running the rule set over the module
set, not by a grep. The 72 additional sites are distributed across 33 files, the largest groups being
`industrial/gateways` 5, `digital-twin/graph` 5, `industrial/metering-worker` 5, `time-series/kpi` 4,
`digital-twin/nodes` 4, `digital-twin/relations` 4 and `digital-twin/tags` 4.

Neither number is allowed to absorb the other: silently widening a finding's definition is how a count stops
being comparable with the one it replaced, and silently keeping the narrow one is how the real extent stays
hidden. A selftest asserts the legacy number is preserved and the semantic number is strictly larger.

---

## 16. Assurance tooling is not runtime protection

A green gate is easy to mistake for a secure platform.

Everything in this document is **assurance**: it describes what the code will do, it can be re-derived by a third
party, and it fails loudly when the code moves underneath it. It changes **nothing** at runtime. After this phase
the platform behaves exactly as it did before: 163 call sites and 96 edges still answer an outage with an
apparent success, 72 edges still report success for a write that was not persisted, a gateway still receives HTTP
201 for telemetry that was dropped, a Stripe event still gets a 200 it will never be retried after, and an
operator revoking a gateway credential is still told it was already revoked.

What the tooling buys is the ability to *decide*: 392 adjudicated decision points and 268 traced edges, each with
a terminal boundary, a durability outcome and an audit outcome; eight gate counters that fail a pull request
introducing a 393rd unguarded call site or a 269th untraced edge; and a fingerprint scheme that invalidates a
verdict the moment its code changes. The remediation in §17 is what changes behaviour. Until it lands, the
correct statement about this platform's database-failure posture is that it is **measured**, not that it is
**safe**.

---

## 17. Recommended S1 remediation order

1. **DB-08** — an industrial gateway must never receive 201 for telemetry that was not stored. Answer 503, do not
   write the `TELEMETRY_INGESTED` audit row, let the gateway buffer and retry.
2. **DB-12** — a webhook the platform could not durably claim must not be answered 200. Return 5xx so the provider
   retries, and never mark an event PROCESSED/IGNORED/FAILED on a path that returns early without a client.
3. **DB-21** — gateway revocation must never report "already revoked". It is the one mis-statement in the
   inventory that can make an operator stop responding to a suspected compromise.
4. **DB-19** — stop asserting `storageMode: "database"` in a body whose write went to `globalThis`. Either refuse,
   or state the mode that was actually used.
5. **Make the 67 outage-conditional DB-F1 edges refuse.** In database mode no sensitive read or write may fall
   back to `globalThis`; answer the controlled 503 the ERP layer already models, with a stable error code.
6. **DB-23** — give the industrial and twin update paths the 503 their create siblings already use, and stop
   reporting an outage as a duplicate key.
7. **DB-20** — an outage is not an authentication failure. Separate the four conditions `resolveUser` collapses,
   and make the six academy routes agree with each other.
8. **DB-13** — `changeMemberStatus` must check `revokeAllSessions`'s result, or wrap the status update and the
   generation bump in one transaction.
9. **Give the 26 legacy DB-F2 sites a third state**, then the remaining 72 semantic ones. `[]` must mean
   "nothing"; an outage must be `DATA_UNAVAILABLE`, distinguishable by the client.
10. **DB-10 and DB-11** — a database outage is 503, not 422 and not 409, and the internal reason string must not
    be echoed. `src/lib/automation/write-error.ts` is the pattern to copy.
11. **Instrument the silent paths.** 119 of 124 exception edges and 211 of 392 call sites are silent. Every
    degraded path needs a `logInfraFailure` with correlationId, subsystem and failure class — no secret — and a
    metric. `src/app/api/health/ready/route.ts:30-38` is the shape to copy.
12. **DB-06 and DB-17** — losing brute-force detection and losing usage records are the two cases where a database
    failure quietly weakens a control rather than only an answer.
13. **DB-22, DB-16, DB-15** — do not audit an event that was not recorded; a health function must report unknown,
    not zero; a payload with an `isFallback` field must not set it to `false` on a fallback.
14. **DB-09** — make the site-filter construction fail closed (an empty allow-list, not `undefined`) so the bypass
    cannot become live if the graph loader ever gains a cache.
15. **DB-24** — delete or wire up the dead surface, starting with `src/lib/site/members.ts`: site membership
    management that no caller reaches is either missing functionality or dead code, and both deserve a decision.
16. **Reject session mode at production startup.** W7 warns; it should be FATAL, which also closes the deferred
    half of the legacy-token risk in `AUTH-TOKEN-LIFECYCLE.md`.
17. **Wire this scanner into CI** as a `check` + `coverage` gate.
18. **Then, and only then, re-measure.** The counts in §11 are a baseline to improve against, not a score.

---

## 18. Reproduction manifest

```bash
# ── tool ──
node scripts/security/s0/getprisma-callsite-inventory.mjs generate
node scripts/security/s0/getprisma-callsite-inventory.mjs check       # exit 0
node scripts/security/s0/getprisma-callsite-inventory.mjs coverage    # exit 0, nineteen PASS lines
node scripts/security/s0/getprisma-callsite-inventory.mjs summary
node scripts/security/s0/getprisma-callsite-inventory.mjs edges       # the edge inventory and outcome classes
node scripts/security/s0/getprisma-callsite-inventory.mjs reconcile   # DB-F1, DB-F2 legacy and semantic

# ── determinism ──
node scripts/security/s0/getprisma-callsite-inventory.mjs generate
sha256sum docs/security/s0-getprisma-callsite-inventory.json
node scripts/security/s0/getprisma-callsite-inventory.mjs generate
sha256sum docs/security/s0-getprisma-callsite-inventory.json          # identical

# ── tests ──
node --test scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs   # 75/75

# ── tamper gates (edit one entry, run check, restore) ──
#   adjudication fingerprint  -> exit 3   adjudication for no site      -> exit 4
#   edge-trace fingerprint    -> exit 6   edge trace for no edge        -> exit 7
#   screening fingerprint     -> exit 8   screening for no residual     -> exit 9

# ── the high-impact set, generated rather than typed ──
node -e "const j=require('./docs/security/s0-getprisma-callsite-inventory.json');
  const T=['WRITE','DELETE','AUDIT','TRANSACTIONAL','USER_VISIBLE','PUBLIC_PATH'];
  const u=j.callSites.filter(r=>(r.autoConfidence??r.confidence)==='HIGH'&&T.some(t=>r.secondaryTags.includes(t)));
  console.log('high-impact HIGH', u.length, 'untraced', u.filter(r=>!r.adjudication).length)"

# ── DB-F1 by hand, to check the tool ──
for f in case knowledge memory project unknown analysis; do
  grep -c "return fallback\." src/lib/storage/$f-repository.ts
  grep -c "catch {"          src/lib/storage/$f-repository.ts
done
grep -n "return sessionStore" src/lib/documents/storage-cleanup.ts

# ── DB-F2 legacy by hand ──
grep -rnE "if \(!(db|prisma|client)\) return \[\]" --include=*.ts \
  src/lib/industrial src/lib/digital-twin src/lib/predictive \
  src/lib/time-series src/lib/multi-site src/lib/knowledge | wc -l

# ── independent accounting, using none of the tool's own functions ──
node -e "const j=require('./docs/security/s0-getprisma-callsite-inventory.json');
  const t={}; for(const r of j.callSites) t[r.classification]=(t[r.classification]||0)+1;
  const sum=Object.values(t).reduce((a,b)=>a+b,0);
  console.log('partition sum',sum,'records',j.callSites.length,'delta',j.callSites.length-sum);
  console.log('tool says',j.summary.primaryPartition.sum,'| outcomes',JSON.stringify(j.summary.outcomes.totals))"

# ── isolation ──
git status --porcelain --untracked-files=all
git diff --stat HEAD                                                  # empty
git show --stat --oneline HEAD                                        # 1 file: PRIVILEGED-ROUTE-CLASSIFICATION.md
sha256sum docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md                  # unchanged, S0-B-03 untouched
```

---

## 19. Gate A

**`S0-B-05` is CLOSED, with a disclosed low-impact residual.**

Delivered: a versioned, dependency-free, deterministic scanner (`s0-b05.5`) with a 75-test selftest;
a byte-identical inventory of **392** call sites and **268** consumer edges with **zero** unresolved
at either level; **187** fingerprint-pinned call-site adjudications, **268** fingerprint-pinned edge
traces and **69** fingerprint-pinned residual reachability screenings, each carrying line evidence, a
traced caller or terminal surface, and an observed terminal boundary; a **nineteen**-counter coverage
gate with stale and orphan detection proven at all three levels (exits 3/4, 6/7, 8/9); the primary
classification proved to be an exact partition of 392 with an independent recomputation agreeing; the
four outcome classes converted from prose into deduplicated structured-id sets with a stated rule that
makes double counting impossible; four tool defects found, fixed and pinned by tests in revision 3 and
three accounting invariants added in revision 4; **twelve security-control dependencies reclassified**
from an empty success to a denial after their callers were read; DB-F1 reproduced from edges with its
composition visible; DB-F2 split into a comparable legacy number and a semantic one; and eleven new
findings across the two revisions, four of them consequential.

Not delivered: the documented tokenizer limitations in §8 and §14.4, and 69 non-impact reads that
still rest on a HIGH automatic confidence — all 69 now screened for reachability, none of them on an
impact path, and the 60 that demanded a full terminal trace having one.

**What this phase did NOT establish.** It is a static analysis. No database was stopped, no fault was
injected, and no claim here is a runtime observation. The terminal behaviours are what the code says
it will do, traced to the statement that does it; they have not been watched happening.

**Gate A overall remains NOT PASSED: `S0-B-03` awaits one independent-vantage request** (§19 of
`EDGE-ORIGIN-AND-CLIENT-IP.md`, which this phase did not touch).
