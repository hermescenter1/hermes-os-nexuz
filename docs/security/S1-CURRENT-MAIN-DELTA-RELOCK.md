# S1 current-main delta relock — assurance remediation

This is the relock report. It does not issue an independent PASS: it is the work product of a builder and reconciler, prepared for a fresh independent review.

**Source of truth.** The canonical risk register (`docs/security/s1-risk-register.json`) is the only place a severity, a production state, a score or a priority is written, and `docs/security/THREAT-MODEL-AND-RISK-REGISTER.md` is checked against it. This report and its machine-readable counterpart (`docs/security/s1-relock-delta.json`) hold **provenance only**: the commit range, the call-site linkage and the evidence behind each delta finding. Wherever a severity appears below it is a read-only projection of the register, recomputed by `scripts/security/s1/relock-delta-check.mjs` and compared byte for byte.

Every table in this report is generated. A figure typed into the prose between the tables would be a second source, so the checker refuses a digit-led count in the narrative.

## 1. The commits and scopes this report keeps apart

<!-- RELOCK-BLOCK:scopes -->
| Name | Commit | What it is |
|---|---|---|
| Frozen source | `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` | The tree the S0/S1 audit was performed on. |
| Security head | `391fa2f2d3d1a3c714753ef5da8594da2e331658` | Tip of the historical lane. |
| Relock target | `b461ac9709d6e82973de2b05f15317381c2fcc73` | Main as authorized for the relock. |
| Integration merge | `e3da6f2e928420f78d5ae95d668d7e67ba4e2cb0` | Merge of the security head into the target; parents in that order. |
<!-- /RELOCK-BLOCK:scopes -->

Three scopes are never mixed. The **historical S1 baseline** is the audit performed in full on the frozen source; the register pins it and recomputes it from the entries that carry no delta scope. The **delta review** covers the range from the frozen source to the relock target and was performed on the integrated tree. The **reconciled register** is the result: the integrated tree plus the assurance changes made after the merge, which are unstaged. The reconciled figures are in section 1.2 of the register report; the historical figures stay there as a labelled snapshot.

## 2. What the delta contains

<!-- RELOCK-BLOCK:delta -->
| Measure | Value |
|---|---|
| Range | `bcf3be9a..b461ac97` |
| Commits (all / non-merge) | 53 / 32 |
| Changed paths (added / modified / deleted) | 149 (113 / 36 / 0) |
| STRICT_PRODUCT_PATHS | 68 |
| BROAD_RUNTIME_AFFECTING_PATHS | 78 |
| API route files | 7 |
| Pages | 11 |
| Models / enums / migrations added | 4 / 3 / 3 |
| Auth, session, middleware, proxy or nginx named product paths | 1 (`src/lib/executive/report/auth.ts`) |

STRICT_PRODUCT_PATHS is a changed path outside docs/, .github/ and scripts/ that is not a test file (a __tests__/ directory or a .test. or .spec. name) and is not .gitattributes.
BROAD_RUNTIME_AFFECTING_PATHS is a changed path outside docs/ that is not a test file and is not .gitattributes, so it adds the workflows and the scripts to the strict set.
<!-- /RELOCK-BLOCK:delta -->

Two counts are given because one name cannot cover both questions. STRICT_PRODUCT_PATHS answers what application and schema code changed. BROAD_RUNTIME_AFFECTING_PATHS adds the workflows and scripts that can change what runs or what a release does. A figure from an earlier report that could not be reproduced under either definition was dropped rather than carried forward, and the phrase "product paths" is not used here without one of the two names.

The new surface is the executive management feature set and the tenant customer feature set: API routes, pages, a report archive, three additive migrations, a worker image stage with its compose service, a credential provisioning script and a post-deploy health gate. No token, session, storage-mode, middleware, proxy or nginx file changed; the only authentication-named product file is the new worker guard.

## 3. The getPrisma reconciliation

<!-- RELOCK-BLOCK:getprisma -->
| | Frozen source | Integrated tree |
|---|---|---|
| Textual occurrences | 835 | 860 |
| Real call expressions | 392 | 404 |
| Files with a real call | 228 | 236 |

Added 12, removed 0, moved 0, new files 8, changed existing records 92, unresolved call sites 0, unresolved consumer edges 0. Of the 12 added, 10 are manual adjudications and 2 are rule-based decisions: `src/lib/customers/service.ts#L157C25 (R04-guard-503, EXACT)` and `src/lib/executive/settings.ts#L146C24 (R08-guard-null-undefined, HIGH)`. The primary partition sums to 404 of 404 with 0 missing, 0 duplicate and 0 outside the closed set.

| Call site | Classification | Decision | Rule | Reachability | Static importers |
|---|---|---|---|---|---|
| `src/lib/customers/service.ts#L157C25` | DB_UNAVAILABLE_RETURNS_503 | rule (EXACT) | R04-guard-503 | AUTHENTICATED_USER_VISIBLE | 7 |
| `src/lib/executive/oversight.ts#L232C24` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/priorities.ts#L273C24` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/generate.ts#L112C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/generate.ts#L248C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/generate.ts#L281C24` | DB_REQUIRED_FAIL_CLOSED | manual (MANUAL) | R10-no-guard | BACKGROUND_ONLY | 1 |
| `src/lib/executive/report/read.ts#L126C36` | EMPTY_SUCCESS_FALLBACK | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/read.ts#L152C36` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/read.ts#L96C36` | EMPTY_SUCCESS_FALLBACK | manual (MANUAL) | R11-ambiguous | AUTHENTICATED_USER_VISIBLE | 1 |
| `src/lib/executive/report/worker.ts#L191C24` | EMPTY_SUCCESS_FALLBACK | manual (MANUAL) | R19-named-or-shaped-return | BACKGROUND_ONLY | 1 |
| `src/lib/executive/settings.ts#L146C24` | EMPTY_SUCCESS_FALLBACK | rule (HIGH) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 7 |
| `src/lib/executive/summary.ts#L181C24` | EXPLICIT_DEGRADED_MODE | manual (MANUAL) | R08-guard-null-undefined | AUTHENTICATED_USER_VISIBLE | 3 |
<!-- /RELOCK-BLOCK:getprisma -->

Each decision is recorded in the S0 adjudication file or, for the two rule-based decisions, in the scanner's own rules with a residual reachability screening where the rule left the site at high confidence. The classification follows the behaviour of the call expression: where the expression is a local accessor that returns null, the S0 convention is followed and the classification is that of its consumers, and the consumer is named. Three corrections were made after the first review: the claim that the worker passes through the settings accessor was removed because the worker hands the loader its own client; the claim that the claim-release site swallows an exception was moved to its caller, because the expression itself only returns false; and the pass-level empty result now carries a real outcome flag.

"Static importers" is an over-approximation that the checker derives from imports: it lists the files that import a function able to reach the call site, and it cannot see a caller that supplies its own client. The reachability column is the reviewed verdict.

## 4. The platform-capability gate

<!-- RELOCK-BLOCK:authzgate -->
| Route group | Route files | Files that test the platform capability |
|---|---|---|
| ERP routes (`src/app/api/erp`) | 27 | 27 |
| Customer routes (`src/app/api/tenant/customers`) | 4 | 0 |

The test counted is `can(user.role, "admin")`, read from the target tree.

| Route group | Files that read the platform identity (`getCurrentUser`) | Files with an equivalent platform gate |
|---|---|---|
| ERP routes | 27 | 27 |
| Customer routes | 0 | 0 |

The `partyId` column of a project is written by: `src/lib/customers/service.ts`.
The non-test callers of `generateDailyReport` are `src/lib/executive/report/worker.ts`; the callers that mention a correction number 0.
<!-- /RELOCK-BLOCK:authzgate -->

The table above is the platform-capability gate as it stands in the target tree, counted from the files, and is the reference that DELTA-RR-002 is measured against.

## 4a. The runtime environment of the workers

<!-- RELOCK-BLOCK:runtimeenv -->
| Compose service | Declares env_file at the frozen source | Declares env_file at the target |
|---|---|---|
| `hermes-ats-review-worker` | yes | yes |
| `hermes-document-cleanup-worker` | yes | yes |
| `hermes-executive-report-worker` | no | yes |
| `hermes-journal-import` | yes | yes |
| `hermes-metering-worker` | yes | yes |
| `hermes-migrate` | yes | yes |
| `hermes-web` | yes | yes |
| `postgres` | yes | yes |

Variable names read by the new worker script: `EXECUTIVE_REPORT_BATCH`, `EXECUTIVE_REPORT_INTERVAL_MS`, `EXECUTIVE_REPORT_WORKER_TOKEN`, `HERMES_WORKER_BASE_URL`, `METERING_WORKER_TOKEN`, `METRICS_TOKEN`.
<!-- /RELOCK-BLOCK:runtimeenv -->

Only variable **names** were derived, from the worker script and from the compose declaration. The environment file itself was not read.

## 5. Delta findings and their canonical owners

<!-- RELOCK-BLOCK:findings -->
| Delta finding | Origin | Disposition | Canonical risk | Severity | Production state | Score | Call-site backed |
|---|---|---|---|---|---|---|---|
| `DELTA-RL-001` | REVIEWER | OWNED_BY_NEW_RISK | `R-65` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 12 | yes (1) |
| `DELTA-RL-002` | REVIEWER | OWNED_BY_NEW_RISK | `R-66` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 8 | no |
| `DELTA-RL-003` | REVIEWER | OWNED_BY_NEW_RISK | `R-67` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | yes (1) |
| `DELTA-RL-004` | REVIEWER | OWNED_BY_EXISTING_RISK | `R-53` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 10 | no |
| `DELTA-RL-005` | REVIEWER | OWNED_BY_NEW_RISK | `R-68` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | yes (1) |
| `DELTA-RL-006` | REVIEWER | OWNED_BY_NEW_RISK | `R-68` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | yes (1) |
| `DELTA-RL-007` | REVIEWER | OWNED_BY_NEW_RISK | `R-68` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | yes (3) |
| `DELTA-RR-001` | REVIEWER | OWNED_BY_NEW_RISK | `R-68` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | yes (1) |
| `DELTA-RR-002` | REVIEWER | OWNED_BY_NEW_RISK | `R-73` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 8 | no |
| `DELTA-RR-003` | REVIEWER | OWNED_BY_NEW_RISK | `R-70` | **LOW** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 4 | no |
| `DELTA-RR-004` | REVIEWER | OWNED_BY_NEW_RISK | `R-71` | **LOW** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3 | no |
| `DELTA-RR-005` | REVIEWER | OWNED_BY_EXISTING_RISK | `R-09` | **HIGH** | ACTIVE_CONFIRMED | 15 | no |
| `DELTA-RR-006` | REVIEWER | OWNED_BY_NEW_RISK | `R-67` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | no |
| `DELTA-RR-007` | REVIEWER | POLICY_AMBIGUITY | `R-72` | **MEDIUM** | POLICY_AMBIGUITY | 6 | no |
| `DELTA-RR-008` | REVIEWER | UNPROVEN | `R-72` | **MEDIUM** | POLICY_AMBIGUITY | 6 | no |
| `DELTA-RR-009` | REVIEWER | OWNED_BY_NEW_RISK | `R-68` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 6 | no |
| `DELTA-RR-010` | REMEDIATOR | OWNED_BY_NEW_RISK | `R-69` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | 9 | no |
| `DELTA-RR-011` | REMEDIATOR | POLICY_AMBIGUITY | `R-72` | **MEDIUM** | POLICY_AMBIGUITY | 6 | no |

Projected severities of the delta findings (by finding, not by risk): CRITICAL 0, HIGH 2, MEDIUM 14, LOW 2, INFORMATIONAL 0. The values are read from the canonical register; this document sets none of them.
<!-- /RELOCK-BLOCK:findings -->

The text of each risk, its factors, its controls, its acceptance criteria and its priority are in the register. The first ten entries of the reconciled remediation order, read from the register and not kept as a list of this report's own, are:

<!-- RELOCK-BLOCK:priorities -->
| Priority | Risk | Severity | Score | Scope |
|---|---|---|---|---|
| 1 | `R-01` | **HIGH** | 20 | HISTORICAL_S1_BASELINE |
| 2 | `R-02` | **HIGH** | 20 | HISTORICAL_S1_BASELINE |
| 3 | `R-04` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 4 | `R-08` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 5 | `R-13` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 6 | `R-16` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 7 | `R-24` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 8 | `R-26` | **HIGH** | 16 | HISTORICAL_S1_BASELINE |
| 9 | `R-32` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
| 10 | `R-33` | **HIGH** | 15 | HISTORICAL_S1_BASELINE |
<!-- /RELOCK-BLOCK:priorities -->

This section records what the review found in the source and how each finding was settled.

**DELTA-RL-001 — the archived report.** The archive list selects envelope fields only; it never selects the snapshot. The leak is in the detail view. The snapshot is produced by the nightly worker under a synthetic OWNER scope with the operations, financial and industrial axes and every active site, and the worker's own comment says the per-reader narrowing happens when somebody opens the report. The detail page does not narrow: it renders the stored snapshot through the shared view and takes only the organization from the resolved scope. No download or export route exists; the only report route is the run entrypoint. An ADMIN of the organization therefore reads the financial section, which is OWNER-only elsewhere, and a platform administrator whose organization role is lower reads the operations, financial and customer aggregates and the plant data of every site. That a platform administrator stays within an organization role is a trust assumption that is runtime-unproven.

**DELTA-RL-002 — customer project cost.** `recordedCost` is the sum of `ErpProjectCost.amount` per currency for the projects linked to a customer. In the live ERP only OWNER sees cost; the customer surface shows it to ADMIN as well. Creating, linking and unlinking a project also reveal project granularity to the customer-management role. No authoritative policy document makes a customer-level cost aggregate exempt from the compensation gate, so this is a policy gap until the owner says otherwise.

**DELTA-RL-003 — the entrypoint.** The guard accepts the dedicated token, the metering token or the metrics token, and compares each in constant time. The comment that says the dedicated token makes the others stop opening the door describes behaviour the code does not have, and the registration test locks the accept-all chain. The route is an ordinary public API path with no origin check and no rate limit, and its response, including the pagination cursor, carries organization ids of tenants other than the caller's. The claim that only the report token opens it was removed from every document.

**DELTA-RL-004 and the historical positive control.** The compose service for the new worker declares the whole production environment file, as the earlier workers do. The image copies one script and is minimal; the running process is not bounded by that. The historical positive control R-53 is therefore revised in the register, with its former state preserved in a revision record and the image-level property kept as an existing control.

**DELTA-RL-005, -006 and -007** are three outcomes of one risk in the register: a default-zone report frozen after a failed settings read, an announcement recorded that nobody received, and a database outage reported as an ordinary state. **DELTA-RR-009** joins them because it is the same consequence, a stored report that does not match its label. Each keeps its own finding and its own outcome.

**DELTA-RR-001 and DELTA-RR-002 follow the reviewer's authoritative text, and are pinned by content, not by identifier.** DELTA-RR-001 is a transient failure of the site read: the worker's single query for an organization's active sites returns an empty list when it throws, the industrial section answers an empty list as FORBIDDEN with the no-sites reason, and the stored report keeps that permission-shaped refusal because the correction option of the generator has no caller. It is owned by the shared report-truthfulness risk. DELTA-RR-002 is the missing platform-administrator gate on the customer and project-link surface: the ERP routes all apply it, the customer routes do not, so an organization owner or administrator who is not a platform admin reads ERP project data and changes a project's customer. It is an authorization bypass inside the tenant relative to the reference ERP policy, not a cross-tenant leak, and it has its own risk. The checker fails if either identifier carries another title, owner, asset set, source reference, mechanism, acceptance criterion or verification method, or if two findings describe the same defect.

Two topics were first filed, wrongly, under those identifiers and are kept under new ones: DELTA-RR-010 (no audit record for creating a frozen financial report or reading the archive) and DELTA-RR-011 (no erasure, export or retention path for customer personal data, broader than the report archive of DELTA-RR-007). DELTA-RR-003 to DELTA-RR-009 follow the one-line descriptions in the brief and were re-derived from source.

## 6. What was checked and found sound

<!-- RELOCK-BLOCK:observations -->
| Observation | What was checked and found sound | Evidence items |
|---|---|---|
| `RL-P01` | The customer data layer keeps tenant isolation in the query and the schema, and writes its audit in the same transaction | 3 |
| `RL-P02` | The executive scope resolver and the settings write guard compose the established gate chain and read nothing tenant-bearing from the client | 2 |
| `RL-P03` | Report generation is idempotent by constraint and notifies at most once | 2 |
| `RL-P04` | The production deploy gate fails closed on an unhealthy release and the new workflow is read-only and pinned | 2 |
| `RL-P05` | The three new migrations only add objects | 1 |
<!-- /RELOCK-BLOCK:observations -->

## 7. Qualifications, supersessions and scoping

<!-- RELOCK-BLOCK:supersessions -->
| Target | Kind | Statement |
|---|---|---|
| R-53 | REVISED_IN_REGISTER | R-53 is no longer a positive control. The image-level minimality it recorded is kept as an existing control of the revised risk, and the revision record in the register preserves the former state. |
| GETPRISMA-FAILURE-CLASSIFICATION.md and ARCHITECTURE-INVENTORY.md counts | SCOPED_TO_FROZEN_SOURCE | Every call-site count in those documents describes the frozen source. The counts for the integrated tree are in the getPrisma section of this document and in docs/security/s0-getprisma-callsite-inventory.json. |
| phase99-route-security-inventory.json | REGENERATED_BY_MAIN | Main regenerated this inventory itself after the delta added routes; the relock confirmed it matches the source tree and made no change to it. |
| docs/security/S1-CURRENT-MAIN-DELTA-RELOCK.md (first relock report) | SUPERSEDED_BY_REMEDIATION | The first relock report scored its findings in this addendum and kept the register unchanged. The remediation folded them into the canonical register and removed severity and state from this document. |
<!-- /RELOCK-BLOCK:supersessions -->

## 7a. Closure of the first fresh review

A first fresh independent review of this relock returned findings FR-01 to FR-08. None of them changed a product file; each is closed in the assurance artifacts, and the figures that moved because of FR-01 and FR-08 are reported as they now are, not as they were.

- **FR-01 — line endings.** Every source file the S0 scanner reads now passes through one normaliser, so a checkout with CRLF and a checkout with LF give the same call sites, classifications, outcome flags and generated bytes. The unlogged `catch` of one compliance call site had fallen outside a character window under CRLF; it is now recorded, and the inventory, its hash and the derived sections of this document follow from the regenerated inventory. The scanner's rule-set version moved because its input handling and its adjudication record shape changed. Two existing call-site records therefore differ from the security head, both through the remediation and not through the delta: the unlogged catch of `src/lib/compliance/incident-db.ts#L738C24` and the new retry trace of `src/lib/billing-governance/runtime/subscription-events.ts#L63C25`.
- **FR-02 — identity facts.** The authoritative findings are held by structured facts, not by a few anchors. Each fact names a source path, an extraction rule (a literal, an absence, a pattern, a function body, a declaration, a tree-wide absence or a caller scan) and the identity it belongs to; the checker requires the matching evidence item and evaluates it against the committed target. Dropping or editing an item fails the linkage, and a source that stops showing the fact fails the evaluation.
- **FR-03 — mechanism.** The mechanism sentence of each authoritative finding, in this document and in the register, is held by a digest of its canonical text, so an inverted sentence cannot pass by keeping its keywords.
- **FR-04 — closed register schema.** Every structure of the canonical register is closed: an unknown key and a missing required key both stop the canonical check. The only extension is the named, validated `policy` object.
- **FR-05 — committed evidence.** Evidence is read from the blob of the integration merge, never from the working tree. The checker also refuses a modified or untracked file outside the allowlist, and a HEAD that moved outside it; the allowlisted artifacts stay the subject of the review.
- **FR-06 — policy.** For the customer surface the observed behaviour stays code-confirmed and the undecided policy is recorded beside it, with two conditional, testable branches. No decision is made here.
- **FR-07 — evidence of the audit and privacy findings.** The audit finding now carries facts for the create path, the read paths and the absence of a database trigger; the privacy finding carries facts for the personal fields, the three closed registries, the absence of a delete, anonymisation or export operation and the cascade, and it is kept apart from the report-snapshot finding. The process note about an unreconciled text is gone.
- **FR-08 — retry suppression.** One rule, applied to a structured trace, replaces the prose reading: durable state that blocks a later run, no later run, a requester that cannot be told, or a later run of another operation. The worker pass that the next poll runs again no longer counts; the claim that stays set does.

## 7b. Closure of the post-remediation review

A second fresh independent review, run after the remediation above, returned findings POSTREV-F1 to POSTREV-F5. None of them changed a product file.

- **POSTREV-F1 — the scanner read the assurance tools once they were committed.** The tools under `scripts/security/s1/` are untracked while they are reviewed and tracked once they are committed; the scanner then read them, its textual count moved, and the inventory check and the relock check failed on the committed state although both were green before it. The exclusion now names both tool subtrees by their exact repository-relative prefix, before any file is read, on the `git ls-files` path and on the filesystem-walk path, and look-alike paths stay in scope. The committed state is now exercised: a throw-away clone receives exactly the artifacts as one commit, a second clone checks that commit out, and the scanner, the inventory checks and the relock gates are run there; nothing changes after a regeneration.
- **POSTREV-F2 — a policy could be declared decided without an owner.** The policy object now has an owner role, a nullable owner-decision evidence, and branches that each carry an identifier, a condition, the required control, a verification method, operational required tests and testable acceptance criteria. An open policy carries no decision; a decided policy needs evidence from a repository path that is not one of the deliverables or the tool chain, a quoted anchor that the file contains, a branch it names and a revision record. The policy is mandatory for the customer cost view, the customer access surface and the personal-data question, no two branches may share a condition, a control, a test set or an acceptance set, and a generic wish is not an acceptance criterion. No decision has been made.
- **POSTREV-F3 — one retry model for the whole inventory.** Every adjudicated call site and every traced consumer edge that concerns a retry now carries the same structured trace, the outcome class is derived from it alone, and a typed flag or a prose verdict that disagrees is a failure. Applying the single rule found three call-site adjudications whose text said the caller would not retry while they carried no flag; they now carry it, and the totals follow from the data.
- **POSTREV-F4 — hidden changes.** `git update-index --assume-unchanged` and `--skip-worktree` hide an edit from `git status`; the source lock now reads the index tags and refuses either flag on any tracked path, modified or not.
- **POSTREV-F5 — the remaining details.** A lone carriage return is a line ending in every normaliser; the writer of a project's partyId is found structurally, as a data property of a Prisma write, and not as the tail of another name; stale process wording is refused on every line of the register, the delta document and both reports, with one canonical exemption for an explicit superseded quotation; and the exit-code contract of the closed schema is stated: a required key is judged by the first gate that reads it, so the historical gates keep their codes and only the other keys, and every unknown key, are exit twenty-nine.

## 7c. Closure of the final policy and detector review

A third fresh independent review, run after the corrections above, returned findings PC-F2-01, PC-F2-02, PC-F5-01, PC-F5-02 and PC-ENV-01. None of them changed a product file, a risk, a finding, a score, a severity, an inventory count or the edge document.

- **PC-F2-01 — evidence that is the deliverable itself.** The evidence path of a decided policy was tested as written, so a path through `..`, `.`, a doubled separator or other letter case named the register, the delta, the inventory or a checker and passed. The path is now made canonical first (NFKC, separators, `.`, `..`, case) and then resolved through the file system, so a link cannot smuggle a deliverable in. A backslash, a drive letter, a reserved character or a segment that Windows rewrites is refused, not guessed at; a `..` that leaves the repository is refused. Everything under `docs/security/` and `scripts/security/` is a deliverable or part of the tool chain and is never an owner's decision. A real file elsewhere passes only if it contains the quoted anchor.
- **PC-F2-02 — a decision that could not be recorded.** The policy gate asked for a revision of scope `OWNER_POLICY_DECISION` while the reconciliation gate refused every scope but `DELTA_RELOCK`, so a decided policy could never pass the command line. One contract now serves both gates: the revision belongs to the policy risk itself, delta or historical, supersedes only the status `OPEN`, names the risk and the chosen branch and no other, and rewrites no historical value, so the historical snapshot and the list of touched risks are unchanged. The evidence must come from the policy's owner role, quote an anchor that names this risk and the chosen branch and no other risk or branch, and the branch must be one of the policy's own. The command line is exercised end to end with a decided policy and with every way of breaking it. No branch is chosen here.
- **PC-F5-01 — stale wording in another spelling.** Two spaces, a tab, a no-break space, a curly or modifier apostrophe and a line break inside the phrase each defeated a pattern. The text is now canonical before it is matched (Unicode form, zero-width characters, apostrophe look-alikes, whitespace) and consecutive lines of one paragraph are joined, so a wrapped phrase is still the phrase. The exemption for a named open item covers only the line that defines it, not free narration. The statement of the third open item no longer describes a process.
- **PC-F5-02 — the project's customer in any property order.** The writer of a project's `partyId` was recognised only as the first property of `data`. It is now read from the structure of the source: the object that is the value of `data` (or `create` / `update` of an upsert) in a write call on the project model, whatever the order, with spreads, shorthand, quoted keys and many lines; a `partyId` of another model, in `where`, in `metadata`, in a comment, a string or a nested object is not a write. The tree still shows one writer, the customer service, at its single project write.
- **PC-ENV-01 — an environment limit, disclosed.** A worktree at a very deep path stops git with a "Filename too long" error. The tools are supported at the short, real path of a worktree. A git failure is never success: the relock checker exits 3 when git cannot answer and 70 on an internal failure, and neither is a validation code. The scanner falls back to a filesystem walk when `git ls-files` fails and does not report the failure; this is the existing behaviour and is left unchanged. No rule is relaxed to support a deeper path.

## 8. The historical files

<!-- RELOCK-BLOCK:historicalfiles -->
| File | Role | SHA-256 at the security head | Preserved by the integration merge |
|---|---|---|---|
| `docs/security/s1-risk-register.json` | S1_ARTIFACT | `8ef30aeeaa0d64a5a7b1e17d083c15d17dda3730f6c658d004304f6a9026774c` | yes |
| `docs/security/THREAT-MODEL-AND-RISK-REGISTER.md` | S1_ARTIFACT | `b2b9856d6ffd54fed71ea5d9d74dfcf67163787172db39d284674ab9eb252779` | yes |
| `scripts/security/s1/risk-register-check.mjs` | S1_ARTIFACT | `0041d004a29705815b2250501a42958833950200dd7426a3430829462e38fb24` | yes |
| `scripts/security/s1/__tests__/risk-register.selftest.mjs` | S1_ARTIFACT | `e3eb3a6793f2de87e0ab9f16d6f38414f3e8a64c52b271dbd52010fd8700bbfc` | yes |
| `docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md` | S0_EVIDENCE | `0d44a6c2c99e7aed4066d5975d2d9326b34d417ee5ab462ec353b77f07be8d08` | yes |
| `.gitattributes` | CONFIGURATION | `e05dd762e7e366640523196e72e55ba12c49032408fac9fd7ef1c4a3b37df2da` | no |
<!-- /RELOCK-BLOCK:historicalfiles -->

The earlier statement that five files were byte-identical to the frozen lane was imprecise and is withdrawn. The four S1 artifacts (the register, its report, its checker and its selftest) were identical in the integration merge and are modified by this remediation on purpose; the table above records the hash each had at the security head and whether the merge preserved it. The edge document is historical S0 evidence, not one of the S1 artifacts, and the checker requires it to stay identical. The attributes file is configuration and differs because main changed it.

## 9. Mutation evidence for this checker

<!-- RELOCK-BLOCK:mutations -->
| Measure | Value |
|---|---|
| Manifest version | relock-mut-2 |
| Manifest SHA-256 | `7eb5a0b118c87c6054381f3839b01ea3889cc4d22cd4940e48c36ae943451d99` |
| Mutants | 324 |
| Targeted kills | 324 |
| Incidental kills | 0 |
| Survivors | 0 |
| Invalid mutants | 0 |
| Placebos green | 324 of 324 |
| Controls as expected | 4 of 4 |
| Deviations | 0 |
| Cleanup | REMOVED |

| Mutant | Gate under test | Named test | Result |
|---|---|---|---|
| `M01` | schema: unknown key | schema: an unknown key inside a finding is refused | TARGETED_KILL |
| `M02` | schema: missing key | schema: a missing required key is refused | TARGETED_KILL |
| `M03` | schema: version | schema: a wrong schema version is refused | TARGETED_KILL |
| `M04` | schema: derived section absent | schema: a missing derived section is refused | TARGETED_KILL |
| `M05` | sources: merge parents | sources: swapped merge parents are refused | TARGETED_KILL |
| `M06` | sources: second parent | sources: a security head that is not the merge's second parent is refused | TARGETED_KILL |
| `M07` | sources: merge base | sources: a frozen source that is not the merge base is refused | TARGETED_KILL |
| `M08` | sources: git objects | sources: a commit that is not in the repository is refused | TARGETED_KILL |
| `M09` | sources: ancestor | sources: a frozen source that is not an ancestor of the target is refused | TARGETED_KILL |
| `M10` | derived: orphan adjudication | derived: an orphan adjudication is refused | TARGETED_KILL |
| `M11` | derived: stale fingerprint | derived: an adjudication pinned to a stale fingerprint is refused | TARGETED_KILL |
| `M12` | derived: stale inventory | derived: a stale inventory is refused | TARGETED_KILL |
| `M13` | derived: section drift | derived: a delta count the tree does not produce is refused | TARGETED_KILL |
| `M14` | derived: unresolved call sites | derived: an unresolved call site is refused | TARGETED_KILL |
| `M15` | derived: unresolved edges | derived: an unresolved consumer edge is refused | TARGETED_KILL |
| `M16` | derived: primary partition | derived: a primary partition that does not cover every call site is refused | TARGETED_KILL |
| `M17` | derived: position | derived: a call site position that holds no getPrisma token is refused | TARGETED_KILL |
| `M18` | derived: reviewed | derived: a call site with no reachability review is refused | TARGETED_KILL |
| `M19` | derived: review of unknown call site | derived: a review of a call site the delta did not add is refused | TARGETED_KILL |
| `M20` | derived: historical evidence merge | derived: historical S0 evidence not preserved by the merge is refused | TARGETED_KILL |
| `M21` | derived: historical evidence edited | derived: S0 evidence edited after the merge is refused | TARGETED_KILL |
| `M22` | derived: frozen register hash | derived: a frozen register hash that differs from the pin is refused | TARGETED_KILL |
| `M23` | findings: register finding missing from delta | findings: a register delta finding missing from the delta document is refused | TARGETED_KILL |
| `M24` | findings: id shape | findings: a malformed delta finding id is refused | TARGETED_KILL |
| `M25` | findings: register id | findings: a wrong register id is refused | TARGETED_KILL |
| `M26` | findings: duplicate | findings: a duplicate delta finding is refused | TARGETED_KILL |
| `M27` | findings: not in register | findings: a delta finding missing from the register is refused | TARGETED_KILL |
| `M28` | findings: owner | findings: an owner that the register does not record is refused | TARGETED_KILL |
| `M29` | findings: disposition | findings: a disposition that the register does not record is refused | TARGETED_KILL |
| `M30` | findings: status | findings: a register status that the disposition does not map to is refused | TARGETED_KILL |
| `M31` | findings: duplicate ownership | findings: a finding owned by two risks is refused | TARGETED_KILL |
| `M32` | findings: no owner | findings: a finding no risk lists is refused | TARGETED_KILL |
| `M33` | findings: new-risk scope | findings: a new-risk disposition on a historical owner is refused | TARGETED_KILL |
| `M34` | findings: existing-risk scope | findings: an existing-risk disposition on a delta owner is refused | TARGETED_KILL |
| `M35` | findings: call-site backed without link | findings: a call-site-backed finding with no linked call site is refused | TARGETED_KILL |
| `M36` | findings: link without call-site backed | findings: linked call sites on a finding that is not call-site-backed are refused | TARGETED_KILL |
| `M37` | findings: link relation | findings: a link with no stated relation is refused | TARGETED_KILL |
| `M38` | findings: link target | findings: a link to a call site the delta did not add is refused | TARGETED_KILL |
| `M39` | findings: link anchored | findings: a link no evidence anchors is refused | TARGETED_KILL |
| `M40` | findings: delta evidence | findings: a finding with no delta-scope evidence is refused | TARGETED_KILL |
| `M41` | findings: evidence path | findings: an evidence path that does not exist is refused | TARGETED_KILL |
| `M42` | findings: evidence anchor | findings: an evidence anchor that no longer exists is refused | TARGETED_KILL |
| `M43` | findings: evidence absence | findings: an evidence absence that no longer holds is refused | TARGETED_KILL |
| `M44` | findings: evidence form | findings: evidence with neither an anchor nor an absence is refused | TARGETED_KILL |
| `M45` | paths: outside delta | paths: delta evidence on a file the delta did not change is refused | TARGETED_KILL |
| `M46` | findings: projection present | findings: a projection entry that is missing is refused | TARGETED_KILL |
| `M47` | report: block drift | report: a stale generated block is refused | TARGETED_KILL |
| `M48` | report: block absent | report: an absent generated block is refused | TARGETED_KILL |
| `M49` | report: narrative number | report: a digit-led count in the narrative is refused | TARGETED_KILL |
| `M50` | report: finding named | report: a delta finding missing from the report is refused | TARGETED_KILL |
| `M51` | report: independent pass claim | report: a claim of an independent pass is refused | TARGETED_KILL |
| `M52` | report: missing report | report: a missing report is refused | TARGETED_KILL |
| `M53` | record: consistency | record: a surviving mutant is refused | TARGETED_KILL |
| `M54` | record: all killed | record: a recorded survivor with consistent totals is still refused | TARGETED_KILL |
| `M55` | record: placebo | record: a placebo that is not green is refused | TARGETED_KILL |
| `M56` | record: cleanup | record: a cleanup that did not remove the copies is refused | TARGETED_KILL |
| `M57` | record: controls | record: a control that did not behave as expected is refused | TARGETED_KILL |
| `M58` | content: secret | content: a secret-shaped string is refused | TARGETED_KILL |
| `M59` | content: absolute path | content: an absolute local path is refused | TARGETED_KILL |
| `M60` | content: clock time | content: a clock time is refused | TARGETED_KILL |
| `M61` | exit: order | exit: the lowest-order failing class sets the code | TARGETED_KILL |
| `M62` | exit: distinct codes | exit: the validation codes are distinct from usage and from a crash | TARGETED_KILL |
| `M63` | rule: strict product path | rule: the strict product-path rule excludes docs, workflows, scripts, tests and the attributes file | TARGETED_KILL |
| `M64` | rule: broad runtime path | rule: the broad runtime-affecting rule keeps workflows and scripts and drops docs, tests and the attributes file | TARGETED_KILL |
| `M65` | trace: importer detection | trace: only a file that imports the defining module is a static importer | TARGETED_KILL |
| `M66` | trace: enclosing function | trace: the enclosing function of a call site is the nearest definition above it | TARGETED_KILL |
| `M67` | trace: local helper walk | trace: a local helper is followed to the exported function that calls it | TARGETED_KILL |
| `M68` | derive: decision split | clean: the committed provenance has no violation | TARGETED_KILL |
| `M69` | derive: strict rule applied | clean: the committed provenance has no violation | TARGETED_KILL |
| `M70` | derive: compose services | clean: the committed provenance has no violation | TARGETED_KILL |
| `M71` | derive: worker variable names | clean: the committed provenance has no violation | TARGETED_KILL |
| `M72` | derive: projection | clean: the committed provenance has no violation | TARGETED_KILL |
| `M73` | trace: a handler is its own consumer | trace: a route handler is its own consumer | TARGETED_KILL |
| `M74` | render: scopes block | clean: the committed provenance has no violation | TARGETED_KILL |
| `M75` | render: delta block | clean: the committed provenance has no violation | TARGETED_KILL |
| `M76` | cli: crash is not a validation code | e2e crash: an input that parses but breaks the checker is exit 70, never a validation code | TARGETED_KILL |
| `M77` | cli: canonical form | e2e canonical: a document that is correct but not canonical is exit 12 | TARGETED_KILL |
| `M78` | cli: malformed json exit | e2e malformed json: unreadable JSON is exit 4 | TARGETED_KILL |
| `M79` | cli: generate refreshes blocks | e2e generate is idempotent: regenerating the committed inputs changes no byte | TARGETED_KILL |
| `M80` | cli: usage exit | e2e usage: an unknown mode is a usage error | TARGETED_KILL |
| `M81` | cli: missing record is a record failure | e2e record: a missing mutation record is exit 13 | TARGETED_KILL |
| `M82` | cli: exit follows the first class | e2e path outside delta: delta evidence on an unchanged file is exit 11 | TARGETED_KILL |
| `M83` | derive: priorities order | priorities: the report lists the register's first ten risks in the register's order | TARGETED_KILL |
| `M84` | identity: title | identity: RR-001 carrying the audit-snapshot topic is refused | TARGETED_KILL |
| `M85` | identity: swapped ids | identity: swapping the contents of RR-001 and RR-002 is refused | TARGETED_KILL |
| `M86` | identity: delta owner | identity: moving the delta owner of RR-001 is refused | TARGETED_KILL |
| `M87` | identity: register owner | identity: moving the register owner of RR-002 is refused | TARGETED_KILL |
| `M88` | identity: source reference RR-001 | identity: dropping the main source reference of RR-001 is refused | TARGETED_KILL |
| `M89` | identity: source reference RR-002 | identity: dropping the main source reference of RR-002 is refused | TARGETED_KILL |
| `M90` | identity: mechanism | identity: a fixed title over a different mechanism is refused | TARGETED_KILL |
| `M91` | identity: register mechanism | identity: a register summary that no longer states the mechanism is refused | TARGETED_KILL |
| `M92` | identity: assets | identity: an owner risk that drops an affected asset is refused | TARGETED_KILL |
| `M93` | identity: verification | identity: an owner risk with another verification method is refused | TARGETED_KILL |
| `M94` | identity: acceptance | identity: an owner risk without the pinned acceptance criterion is refused | TARGETED_KILL |
| `M95` | identity: missing finding | identity: an authoritative finding that is not declared is refused | TARGETED_KILL |
| `M96` | identity: gate fact | identity: the platform-capability gate is read from the tree, and its pin must still hold | TARGETED_KILL |
| `M97` | identity: derive gate count | identity: the ERP gate facts are derived from the target tree, never typed | TARGETED_KILL |
| `M98` | duplicate: title | identity: a new finding that duplicates an existing finding's title is refused | TARGETED_KILL |
| `M99` | duplicate: evidence | identity: a new finding that cites exactly an existing finding's evidence is refused | TARGETED_KILL |
| `M100` | duplicate: declared duplicate allowed | identity: a declared duplicate is allowed to repeat its original | TARGETED_KILL |
| `M101` | render: authzgate | clean: the committed provenance has no violation | TARGETED_KILL |
| `M102` | pin: RR-001.SITE_IDS_FN | identity fact: dropping RR-001.SITE_IDS_FN is refused | TARGETED_KILL |
| `M103` | pin: RR-001.MISSING_DELEGATE_EMPTY | identity fact: dropping RR-001.MISSING_DELEGATE_EMPTY is refused | TARGETED_KILL |
| `M104` | pin: RR-001.CATCH_EMPTY | identity fact: dropping RR-001.CATCH_EMPTY is refused | TARGETED_KILL |
| `M105` | pin: RR-001.SCOPE_CONSUMES | identity fact: dropping RR-001.SCOPE_CONSUMES is refused | TARGETED_KILL |
| `M106` | pin: RR-001.EMPTY_TO_FORBIDDEN | identity fact: dropping RR-001.EMPTY_TO_FORBIDDEN is refused | TARGETED_KILL |
| `M107` | pin: RR-001.CORRECTION_OPTION | identity fact: dropping RR-001.CORRECTION_OPTION is refused | TARGETED_KILL |
| `M108` | pin: RR-001.ALREADY_REPORTED_GUARD | identity fact: dropping RR-001.ALREADY_REPORTED_GUARD is refused | TARGETED_KILL |
| `M109` | pin: RR-001.WORKER_NEVER_PASSES | identity fact: dropping RR-001.WORKER_NEVER_PASSES is refused | TARGETED_KILL |
| `M110` | pin: RR-001.NO_CORRECTION_CALLER | identity fact: dropping RR-001.NO_CORRECTION_CALLER is refused | TARGETED_KILL |
| `M111` | pin: RR-002.PROJECTS_PERMISSION_ONLY | identity fact: dropping RR-002.PROJECTS_PERMISSION_ONLY is refused | TARGETED_KILL |
| `M112` | pin: RR-002.ERP_REFERENCE_GATE | identity fact: dropping RR-002.ERP_REFERENCE_GATE is refused | TARGETED_KILL |
| `M113` | pin: RR-002.PARTY_WRITE | identity fact: dropping RR-002.PARTY_WRITE is refused | TARGETED_KILL |
| `M114` | pin: RR-002.NO_GETCURRENTUSER_PROJECTS | identity fact: dropping RR-002.NO_GETCURRENTUSER_PROJECTS is refused | TARGETED_KILL |
| `M115` | pin: RR-002.NO_ADMIN_GATE_PROJECTS | identity fact: dropping RR-002.NO_ADMIN_GATE_PROJECTS is refused | TARGETED_KILL |
| `M116` | pin: RR-002.NO_GETCURRENTUSER_LIST | identity fact: dropping RR-002.NO_GETCURRENTUSER_LIST is refused | TARGETED_KILL |
| `M117` | pin: RR-002.CUSTOMER_TREE_NO_GATE | identity fact: dropping RR-002.CUSTOMER_TREE_NO_GATE is refused | TARGETED_KILL |
| `M118` | pin: RR-002.PAGE_SCOPE_NO_GATE | identity fact: dropping RR-002.PAGE_SCOPE_NO_GATE is refused | TARGETED_KILL |
| `M119` | pin: RR-002.PAGES_ORG_PERMISSION_ONLY | identity fact: dropping RR-002.PAGES_ORG_PERMISSION_ONLY is refused | TARGETED_KILL |
| `M120` | pin: RR-010.AUDIT_ONLY_ON_CORRECTION | identity fact: dropping RR-010.AUDIT_ONLY_ON_CORRECTION is refused | TARGETED_KILL |
| `M121` | pin: RR-010.SINGLE_AUDIT_CALL | identity fact: dropping RR-010.SINGLE_AUDIT_CALL is refused | TARGETED_KILL |
| `M122` | pin: RR-010.CREATE_NOT_AUDITED | identity fact: dropping RR-010.CREATE_NOT_AUDITED is refused | TARGETED_KILL |
| `M123` | pin: RR-010.NO_WORKER_AUDIT | identity fact: dropping RR-010.NO_WORKER_AUDIT is refused | TARGETED_KILL |
| `M124` | pin: RR-010.NO_READ_AUDIT | identity fact: dropping RR-010.NO_READ_AUDIT is refused | TARGETED_KILL |
| `M125` | pin: RR-010.NO_LIST_PAGE_AUDIT | identity fact: dropping RR-010.NO_LIST_PAGE_AUDIT is refused | TARGETED_KILL |
| `M126` | pin: RR-010.NO_DETAIL_PAGE_AUDIT | identity fact: dropping RR-010.NO_DETAIL_PAGE_AUDIT is refused | TARGETED_KILL |
| `M127` | pin: RR-010.NO_RUN_ROUTE_AUDIT | identity fact: dropping RR-010.NO_RUN_ROUTE_AUDIT is refused | TARGETED_KILL |
| `M128` | pin: RR-010.NO_DB_TRIGGER_MIGRATION | identity fact: dropping RR-010.NO_DB_TRIGGER_MIGRATION is refused | TARGETED_KILL |
| `M129` | pin: RR-010.NO_DB_TRIGGER_ANYWHERE | identity fact: dropping RR-010.NO_DB_TRIGGER_ANYWHERE is refused | TARGETED_KILL |
| `M130` | pin: RR-011.PARTY_PERSONAL_FIELDS | identity fact: dropping RR-011.PARTY_PERSONAL_FIELDS is refused | TARGETED_KILL |
| `M131` | pin: RR-011.INTERACTION_FREE_TEXT | identity fact: dropping RR-011.INTERACTION_FREE_TEXT is refused | TARGETED_KILL |
| `M132` | pin: RR-011.ERASURE_REGISTRY_LACKS_PARTY | identity fact: dropping RR-011.ERASURE_REGISTRY_LACKS_PARTY is refused | TARGETED_KILL |
| `M133` | pin: RR-011.EXPORT_REGISTRY_LACKS_PARTY | identity fact: dropping RR-011.EXPORT_REGISTRY_LACKS_PARTY is refused | TARGETED_KILL |
| `M134` | pin: RR-011.INVENTORY_LACKS_PARTY | identity fact: dropping RR-011.INVENTORY_LACKS_PARTY is refused | TARGETED_KILL |
| `M135` | pin: RR-011.NO_DELETE_IN_LIB | identity fact: dropping RR-011.NO_DELETE_IN_LIB is refused | TARGETED_KILL |
| `M136` | pin: RR-011.NO_DELETE_IN_ROUTES | identity fact: dropping RR-011.NO_DELETE_IN_ROUTES is refused | TARGETED_KILL |
| `M137` | pin: RR-011.NO_ANONYMISE_OR_EXPORT | identity fact: dropping RR-011.NO_ANONYMISE_OR_EXPORT is refused | TARGETED_KILL |
| `M138` | pin: RR-011.ONLY_ORG_CASCADE | identity fact: dropping RR-011.ONLY_ORG_CASCADE is refused | TARGETED_KILL |
| `M139` | pin: RR-011.NOTHING_DELETED_NOTE | identity fact: dropping RR-011.NOTHING_DELETED_NOTE is refused | TARGETED_KILL |
| `M140` | evidence: committed blob | evidence: a PRESENT fact is read from the committed blob, not from the working tree | TARGETED_KILL |
| `M141` | evidence: committed blob (absence) | evidence: an ABSENT fact is read from the committed blob, not from the working tree | TARGETED_KILL |
| `M142` | evidence: committed tree grep | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M143` | worktree: allowlist enforced | worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M144` | worktree: untracked kind | worktree: an untracked product file is refused (WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M145` | worktree: product dirty path accepted | worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST) | TARGETED_KILL |
| `M146` | worktree: untracked files listed | worktree: the live status of a real repository is read the same way | TARGETED_KILL |
| `M147` | head: moved outside the allowlist | head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit | TARGETED_KILL |
| `M148` | wiring: head gate | wiring: checkRelock applies the head gate | TARGETED_KILL |
| `M149` | wiring: worktree gate | wiring: checkRelock applies the worktree gate | TARGETED_KILL |
| `M150` | wiring: evidence context | wiring: checkRelock evaluates every evidence item against the committed integration merge | TARGETED_KILL |
| `M151` | mechanism: negation flip | mechanism: a negation flip that keeps every keyword is refused | TARGETED_KILL |
| `M152` | mechanism: subject and object swap | mechanism: a subject and object swap that keeps every keyword is refused | TARGETED_KILL |
| `M153` | mechanism: success and failure inversion | mechanism: a success and failure inversion that keeps every keyword is refused | TARGETED_KILL |
| `M154` | mechanism: owner swap | mechanism: an owner swap inside the sentence is refused | TARGETED_KILL |
| `M155` | mechanism: inversion that keeps every source reference | mechanism: a semantic inversion that keeps every pinned source reference is refused | TARGETED_KILL |
| `M156` | mechanism: register sentence | mechanism: a changed sentence of RR-002, RR-010 or RR-011 in the register is refused as well | TARGETED_KILL |
| `M157` | identity: unknown fact | identity fact: a fact name that no pin carries is refused | TARGETED_KILL |
| `M158` | identity: repeated fact | identity fact: a fact carried twice is refused | TARGETED_KILL |
| `M159` | identity: edited fact | identity fact: an edited fact item is refused as not the pinned one | TARGETED_KILL |
| `M160` | identity: domain separation | domain: RR-011 evidence under the report module, and RR-007 evidence under the customer library, are refused | TARGETED_KILL |
| `M161` | identity: derived route sets | gate sets: the derived route sets, counts and the partyId writer are pinned | TARGETED_KILL |
| `M162` | identity: correction callers | correction callers: the derived callers of generateDailyReport must exist and must not pass a correction | TARGETED_KILL |
| `M164` | policy: branch count | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M165` | policy: second acceptance branch | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M166` | rule: REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M167` | rule: ABSENT_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M168` | rule: FN_BODY_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M169` | rule: BLOCK_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M170` | rule: TREE_ABSENT_REGEX | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M171` | rule: CALLERS_LACK | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M172` | rule: CALLERS_LACK needs a caller | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M173` | rule: missing symbol | evidence: every rule holds and fails on a fixture tree | TARGETED_KILL |
| `M174` | s0 eol: normalisation removed | eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes | TARGETED_KILL |
| `M175` | s0 eol: normaliser unit | eol: normalizeSourceText turns CRLF and a lone CR into LF and leaves LF alone | TARGETED_KILL |
| `M176` | s0 eol: normalisation missing on the inventory path | eol: every analyser read of a source file goes through readSourceText | TARGETED_KILL |
| `M177` | s0 eol: normalisation missing on the inventory path (bytes) | eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes | TARGETED_KILL |
| `M178` | s0 eol: normalisation missing on the reconcile path | eol: every analyser read of a source file goes through readSourceText | TARGETED_KILL |
| `M179` | s0 retry: durable state | retry: durable state that blocks a later run is suppression | TARGETED_KILL |
| `M180` | s0 retry: flip of the independent next run | retry: an independent next run of the same operation is not suppression | TARGETED_KILL |
| `M181` | s0 retry: a different operation | retry: a later run of a different operation, or no later run, is suppression | TARGETED_KILL |
| `M182` | s0 retry: requester not told | retry: a requester that is not given a signal it can act on cannot retry, one that is can | TARGETED_KILL |
| `M183` | s0 retry: a flag that disagrees with its trace | retry: a flag or a prose verdict that disagrees with its trace is a violation, for a call site and for an edge | TARGETED_KILL |
| `M184` | s0 retry: an untraced retry statement | retry: a call site or an edge that talks about a retry, or declares the outcome, without a trace is a violation | TARGETED_KILL |
| `M185` | s0 retry: trace shape | retry: a trace with a missing key, an unknown key, a bad enum, a timing that disagrees or a bad reference is a violation | TARGETED_KILL |
| `M186` | s0 retry: edge flag is derived from the trace | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M187` | s0 retry: call site flag is derived from the trace | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M188` | s0 retry: the completeness gate is computed | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
| `M189` | s0 retry: the completeness gate stops the command | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
| `M190` | s0 scope: git ls-files path | scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths | TARGETED_KILL |
| `M191` | s0 scope: filesystem walk path | scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths | TARGETED_KILL |
| `M192` | s0 scope: the s1 prefix is dropped | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M193` | s0 scope: the s0 prefix is dropped | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M194` | s0 scope: a look-alike prefix is excluded | scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1 | TARGETED_KILL |
| `M195` | index flags: skip-worktree | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M196` | index flags: assume-unchanged | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M197` | index flags: only one lowercase tag | index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain | TARGETED_KILL |
| `M198` | index flags: the verbose listing | index flags: assume-unchanged and skip-worktree hide a product edit from status and are refused, modified or not | TARGETED_KILL |
| `M199` | wiring: index flag gate | wiring: checkRelock applies the index-flag gate | TARGETED_KILL |
| `M200` | eol: a lone CR in a committed blob | eol: the blob reader turns LF, CRLF and CR-only into the same text | TARGETED_KILL |
| `M205` | stale text: the gate is wired | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M206` | stale text: the report is scanned | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M207` | stale text: the delta document is scanned | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M208` | stale text: a defining open-item id is exempt | stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts | TARGETED_KILL |
| `M209` | s0 retry: a typed flag is not trusted | retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag | TARGETED_KILL |
| `M210` | partyId writer: the property must be the payload key | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M211` | partyId writer: only the payload's own properties | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M212` | partyId writer: comments and strings are blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M213` | partyId writer: a line comment is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M214` | partyId writer: a block comment is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M215` | partyId writer: a string is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M216` | partyId writer: a template is blanked | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M217` | partyId writer: a regular-expression literal is read | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M218` | partyId writer: a quoted key is a key | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M219` | partyId writer: a shorthand property is a property | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M220` | partyId writer: any property position | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M221` | partyId writer: a spread is not a property | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M222` | partyId writer: a createMany array is a payload | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M223` | partyId writer: the create and update payloads of an upsert | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M224` | partyId writer: only the project model | partyId writer: a lookalike key, another place, a comment, a string or another model is not a write | TARGETED_KILL |
| `M225` | partyId writer: optional chaining on the model | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M226` | partyId writer: a generic call | partyId writer: a partyId property of the data of a project write is found, in any property order and layout | TARGETED_KILL |
| `M227` | partyId writer: a writer file is one with a write site | partyId writer: only a file with a real project write is a writer, a file that merely names the column is not | TARGETED_KILL |
| `M228` | partyId writer: the customer service is read from the committed blob | partyId writer: the committed tree has exactly one project write of the customer, found through the structural reader | TARGETED_KILL |
| `M229` | policy pin: a decided policy without the owner's evidence | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M230` | policy pin: a decided policy is refused whatever its evidence | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M231` | policy pin: evidence that is a deliverable is not the owner's | policy: R-73 must keep both branches and the remediation must not choose one | TARGETED_KILL |
| `M232` | environment: no repository is a missing prerequisite | e2e environment: when git cannot answer the checker exits 3 (a missing prerequisite), never 0 and never a validation code | TARGETED_KILL |
| `M233` | layer 2: original frozen source required | layer 2: a second-layer document without the original frozen source is refused | TARGETED_KILL |
| `M234` | layer 2: original frozen source must be an ancestor | layer 2: an original frozen source that is not a proper ancestor of the range base is refused | TARGETED_KILL |
| `M235` | layer 2: original frozen source must be a proper ancestor | layer 2: an original frozen source that is not a proper ancestor of the range base is refused | TARGETED_KILL |
| `M236` | layer 2: a first-layer document has no original frozen source | layer 2: a first-layer document that names an original frozen source is refused | TARGETED_KILL |
| `M237` | layer 2: reconciled tree must descend from the merge | layer 2: a reconciled tree commit that does not descend from the integration merge is refused | TARGETED_KILL |
| `M238` | layer 2: the first layer's head base is the later merge | head: the committed layer is measured from the repository's real history, whatever position HEAD has | TARGETED_KILL |
| `M239` | layer 2: a successor must descend from the first-layer merge | layer 2: a successor that does not descend from the first-layer merge is not accepted as the head base | TARGETED_KILL |
| `M240` | layer 2: HEAD is judged against the base it is given | layer 2: HEAD is judged against the base it is given | TARGETED_KILL |
| `M241` | layer 2: the diff is taken from the base it is given | layer 2: the diff is taken from the base it is given | TARGETED_KILL |
| `M242` | layer 2: a finding carries its own layer's prefix | layer 2: a first-layer identifier in a second-layer document is refused | TARGETED_KILL |
| `M243` | layer 2: an observation carries its own layer's prefix | layer 2: an observation of the wrong layer is refused | TARGETED_KILL |
| `M244` | layer 2: a new-risk disposition needs a risk of the second layer | layer 2: a second-layer finding that claims a new risk is refused | TARGETED_KILL |
| `M245` | layer 2: a document is asked only for its own layer's findings | layer 2: the first-layer document is not asked to declare the second layer's findings | TARGETED_KILL |
| `M246` | layer 2: the first layer's content pins are not applied to the second | layer 2: the content pins of the first layer are not applied to the second | TARGETED_KILL |
| `M247` | layer 2: the original register hash pin belongs to the first layer | layer 2: the original register hash pin belongs to the first layer | TARGETED_KILL |
| `M248` | layer 2: only a document that names a reconciled tree is sealed | layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files | TARGETED_KILL |
| `M249` | layer 2: a sealed layer yields to caller-supplied files | layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files | TARGETED_KILL |
| `M250` | layer 2: a sealed layer reads its inventory from git | layer 2: the sealed first layer's figures do not follow the current inventory | TARGETED_KILL |
| `M251` | layer 2: the batch blob reader skips what is not a blob | layer 2: the batch blob reader returns what git returns | TARGETED_KILL |
| `M252` | layer 2: the batch blob reader steps over the separator | layer 2: the batch blob reader returns what git returns | TARGETED_KILL |
| `M253` | layer 2: a document without a layer is the first | layer 2: a document without a layer is the first, and the layers are named by their document | TARGETED_KILL |
| `M254` | layer 2: the second-layer report names its columns | layer 2: the committed second-layer provenance has no violation | TARGETED_KILL |
| `M255` | layer 2: the second layer has its own prefix | layer 2: a first-layer identifier in a second-layer document is refused | TARGETED_KILL |
| `M256` | layer 2: the first layer has its own prefixes | layer 2: a second-layer identifier in a first-layer document is refused | TARGETED_KILL |
| `M257` | layer 2: --layer=2 selects the second layer | e2e layer: --layer=2 checks the second-layer document and its report and exits 0 on the committed files | TARGETED_KILL |
| `M258` | layer 2: the layers have different documents | e2e layer: the second-layer paths are not the first layer's | TARGETED_KILL |
| `M259` | cli parser: an invalid layer value | cli parser: every other spelling of the layer is refused and never read as the first layer | TARGETED_KILL |
| `M260` | cli parser: a repeated option | cli parser: every other spelling of the layer is refused and never read as the first layer | TARGETED_KILL |
| `M261` | cli parser: an empty value | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M262` | cli parser: an unknown option | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M263` | cli parser: a stray argument | cli parser: unknown options, stray arguments, repeated options and empty values are usage errors | TARGETED_KILL |
| `M264` | cli: a usage error stops the command | e2e layer parser: an invalid layer is a usage error for every mode and never falls back to the first layer | TARGETED_KILL |
| `M265` | cli: no layer is the first layer | e2e layer parser: the two valid layers give different answers and no layer gives the first | TARGETED_KILL |
| `M266` | head: not a descendant of the base | head: an unrelated commit, a rewritten history and a history that lost the merge are not descendants | TARGETED_KILL |
| `M267` | head: a merge after the integration merge | head: a merge commit after the integration merge is refused even when it brings only allowlisted paths | TARGETED_KILL |
| `M268` | head: every commit is judged, not only the net change | head: a product change that a later commit reverted still fails, because the history is the subject | TARGETED_KILL |
| `M269` | head: the per-commit gate reports | head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit | TARGETED_KILL |
| `M270` | head: the allowlist is the allowlist | head: HEAD may be the integration merge or a descendant whose every commit stayed inside the allowlist | TARGETED_KILL |
| `M271` | ledger: a path without a disposition | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M272` | ledger: a retyped path | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M273` | ledger: a path reviewed at another blob | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M274` | ledger: a disposition for a path the range did not change | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M275` | ledger: a path recorded twice | ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused | TARGETED_KILL |
| `M276` | ledger: a disposition that does not describe the category | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M277` | ledger: security-relevant and unlinked | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M278` | ledger: linked and not security-relevant | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M279` | ledger: a disposition that cannot be linked | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M280` | ledger: a finding the document does not hold | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M281` | ledger: an observation the document does not hold | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M282` | ledger: a finding that cites no evidence at the path | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M283` | ledger: an observation that cites no evidence at the path | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M284` | ledger: evidence that no row names | ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round | TARGETED_KILL |
| `M285` | ledger: the second layer carries the list | ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists | TARGETED_KILL |
| `M286` | ledger: the first layer carries no ledger key | ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists | TARGETED_KILL |
| `M287` | ledger: the aggregates are the ledger's | ledger: every path of the range has exactly one row, and the aggregates are read from the rows | TARGETED_KILL |
| `M288` | ledger: strict means product | ledger: the strict, broad and category rules classify known paths | TARGETED_KILL |
| `M289` | ledger: the categories | ledger: the strict, broad and category rules classify known paths | TARGETED_KILL |
| `M290` | ledger: a rename names where it came from | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M291` | ledger: a row is reviewed only at the same blob | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M292` | ledger: the rename is detected | ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale | TARGETED_KILL |
| `M293` | moved: a source behaviour change must be described | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M294` | moved: a description needs a real change | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M295` | moved: a description needs a moved call site | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M296` | moved: a description once | moved ledger: a source behaviour change must be described, and only a real one may be | TARGETED_KILL |
| `M297` | moved: the old identifier in an S0 artifact | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M298` | moved: the old identifier in the document | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M299` | moved: the old identifier in the report | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M300` | moved: an adjudication that points elsewhere | moved ledger: an old identifier left in an artifact, or in the document, is refused | TARGETED_KILL |
| `M301` | moved: a pair whose verdict changed is not a move | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M302` | moved: an ambiguous pair | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M303` | moved: one row per moved call site | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M304` | moved: the change model is counted from the rows | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M305` | moved: the ledger counts its rows | moved ledger: the gates read the derived ledger | TARGETED_KILL |
| `M306` | moved: the report names no unqualified count | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M307` | moved: the narrative names no unqualified count | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M308` | moved: the phrase is recognised | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M309` | moved: the named kinds are allowed | moved ledger: the words 'semantic change' are refused unless they name one of the three kinds | TARGETED_KILL |
| `M310` | moved: a position is not a verdict | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M311` | moved: evidence and caller path are positions | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M312` | moved: the trace position is a position | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M313` | moved: comments are not behaviour | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M314` | moved: a function ends at the next declaration | moved ledger: a position-only move is told from a verdict change, and the function body from its comments | TARGETED_KILL |
| `M315` | moved: the derived tags | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M316` | moved: the source behaviour is read from the code | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M317` | moved: the pair is one to one | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M318` | moved: the first-layer tree is the before | moved ledger: the three kinds of change are counted apart, from the rows | TARGETED_KILL |
| `M319` | evidence window: the expression is where the line says | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M320` | evidence window: the range is inside the file | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M321` | evidence window: a file in the tree | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M322` | evidence window: the citation of the call site's own file is near it | moved ledger: an adjudication's references are checked for range, expression and window | TARGETED_KILL |
| `M323` | s0 retry identity: the operation names its call site | retry identity: the old identifier of a moved call site is refused as the operation identity | TARGETED_KILL |
| `M324` | s0 retry identity: a range inside the file | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M325` | s0 retry identity: a reference near the call site | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M326` | s0 retry identity: an edge reference includes its consumer line | retry identity: a source reference at the old position, or outside its file, is refused | TARGETED_KILL |
| `M327` | s0 retry identity: an edge names its consumer | retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier | TARGETED_KILL |
| `M328` | s0 retry identity: a call site names its identifier | retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier | TARGETED_KILL |
| `M329` | s0 retry identity: the gate runs on every subject | retry: the completeness gate is computed from the committed data and stops the command line with exit 10 | TARGETED_KILL |
<!-- /RELOCK-BLOCK:mutations -->

The campaign tool (`scripts/security/s1/relock-mutation-campaign.mjs verify`) additionally binds this record to the manifest and to the exact bytes of the checker, the selftest and the end-to-end test; the record's own consistency is checked here.

## 10. Open items

<!-- RELOCK-BLOCK:openitems -->
| Item | Statement |
|---|---|
| `OPEN-1` | Every finding is code-confirmed on the target tree. None was exercised at run time and no production request was made. |
| `OPEN-2` | The contents of the production environment file were not read; only variable names were derived from code. The platform-administrator trust assumption behind R-65 is a design assumption. |
| `OPEN-3` | RR-001 and RR-002 describe the two findings as the relock brief states them. RR-010 and RR-011 are independent findings for two topics that were first filed, wrongly, under RR-001 and RR-002; they were re-derived from source and each is held by structured facts that the checker evaluates against the committed target. RR-003 to RR-009 follow the one-line descriptions in the brief and were re-derived from source. |
| `OPEN-4` | No product file was changed. Each finding records a remediation requirement and acceptance criteria in the canonical register instead. |
| `OPEN-5` | A contradiction among the historical token-lifecycle statements was named in an earlier brief and was not identified; the delta changes no token, session or storage-mode code. |
| `OPEN-6` | Three fresh independent reviews returned findings FR-01 to FR-08, POSTREV-F1 to POSTREV-F5 and PC-F2-01, PC-F2-02, PC-F5-01, PC-F5-02 and PC-ENV-01; the remediation closes them, and a remediation session does not issue an independent PASS. A further fresh independent review is required before any commit. |
| `OPEN-7` | Environment limit. Git cannot read a path that is too long for the host ("Filename too long"), so the tools are supported at the short, real path of a worktree and at no deeper one. When git cannot answer, the relock checker exits 3 and an internal failure exits 70; neither is a validation code, and neither is success. The scanner falls back to a filesystem walk when `git ls-files` fails and does not report that failure. No security rule or path check is relaxed to reach a deeper path. |
<!-- /RELOCK-BLOCK:openitems -->

## 11. Reproduction

```
node scripts/security/s1/relock-delta-check.mjs generate
node scripts/security/s1/relock-delta-check.mjs check
node scripts/security/s1/relock-mutation-campaign.mjs verify
node --test scripts/security/s1/__tests__/relock-delta.selftest.mjs scripts/security/s1/__tests__/relock-delta.e2e.mjs
node scripts/security/s1/risk-register-check.mjs check
```
