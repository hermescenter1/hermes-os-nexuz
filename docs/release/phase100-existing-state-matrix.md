# Phase 100 — Existing-state matrix (GA release closure)

Read-only, evidence-first audit performed **before any Phase 100 code was
written**, so Phase 100 could *wire and extend* the closure machinery Phases
93–99.7 already built rather than grow a second, competing evaluator.

Audit base: `7f52b233583cbc26b47707ec089936b847fd9e76` (`origin/main`, the
Phase 99.7 merge commit of PR #54).
Audit branch: `agent/phase100-ga-release-closure`.

## Classification vocabulary

| Class | Meaning |
|---|---|
| `EXISTING_REUSABLE` | Present, adequate, reused by Phase 100 without behavioural change |
| `PARTIAL` | Present but insufficient for GA closure — extended here |
| `MISSING` | Not present before Phase 100 — added here |
| `CONTRADICTORY` | An in-repository claim that conflicts with the current evidence — repaired here |
| `OWNER_BLOCKED` | Requires a decision or configuration only the project owner can make |
| `EXTERNAL_BLOCKED` | Requires evidence issued by a party outside this repository |

`OWNER_BLOCKED` and `EXTERNAL_BLOCKED` describe *evidence*, not code. Phase 100
implements the gate; it never satisfies it.

---

## 1. Closure and readiness evaluators

| Item | Class | Evidence / action |
|---|---|---|
| `scripts/ci/phase99-closure-eval.mjs` (`eval:phase99:closure`) | `EXISTING_REUSABLE` → refactored | Already judges 15 required gates (3 external reviews, CRITICAL/HIGH findings, 8 pilot sub-gates, release blockers, finding register) and emits `phase99_closure=PASS\|BLOCKED`. Phase 100 **extracts its engine** into `scripts/security/phase99/closure-core.mjs` and keeps this file as a thin CLI with byte-identical output, so Phase 100 consumes the *same* verdict instead of re-deriving it. |
| **`eval:phase99:closure` is never executed by CI** | `PARTIAL` | `package.json` defines it, but no workflow runs it. `.github/workflows/phase99-security-pilot-readiness.yml:71` runs only `eval:phase99:readiness`; the closure evaluator appears solely in a comment (line 7). This is the single biggest structural gap Phase 100 closes. |
| `scripts/ci/phase99-security-readiness-eval.mjs` (`eval:phase99:readiness`) | `EXISTING_REUSABLE` | 20 internal groups with `PASS` / `BLOCKED_OWNER` / `FAIL` and `internalReadinessComplete`. Phase 100 **invokes it as a child process** and consumes its verdict verbatim for `PHASE100_INTERNAL_TECHNICAL_READINESS`; no group logic is copied. |
| `scripts/ci/phase95-ai-governance-eval.mjs` (`eval:phase95`) | `EXISTING_REUSABLE` | Offline AI-governance evaluation. Does **not** produce live-model evidence. |
| `scripts/ci/phase96-billing-governance-eval.mjs` (`eval:phase96`) | `EXISTING_REUSABLE` | Proves billing *code* correctness. Carries no commercial owner decision. |
| `scripts/ci/phase97-compliance-governance-eval.mjs` (`eval:phase97`) | `EXISTING_REUSABLE` | Proves privacy/compliance *machinery*. Explicitly "not legal advice and does not certify compliance" (`docs/compliance/phase97-assurance-report.md:4`). |
| `scripts/ci/phase98-dr-release-eval.mjs` (`eval:phase98`) | `EXISTING_REUSABLE` | Proves DR *mechanisms* (encryption round-trip, recovery policies, migration/rollback classification). Carries no evidence that a production backup has ever actually run. |
| `scripts/ci/phase997-*.mjs` (migration integrity / safety / candidate) | `EXISTING_REUSABLE` | Phase 99.7 cutover gates; unchanged by Phase 100. |

## 2. Evidence contracts and validators

| Item | Class | Evidence / action |
|---|---|---|
| `scripts/security/phase99/external-evidence.mjs` | `EXISTING_REUSABLE` | `computeScopeHash`, `validateExternalAttestation`, `validatePilotAcceptance`, `resolveGate`, `assertNoSensitiveEvidence`. Binds evidence to `expectedCommitSha` + `expectedScopeHash`, hard-rejects agent-authored attestations and synthetic fixtures. Phase 100 reuses all of it and adds no competing primitive. |
| `scripts/security/phase99/finding-contract.mjs` | `EXISTING_REUSABLE` | `isHumanAuthorityRole`, `isSyntheticFixture`, `validateRiskAcceptance` (with expiry), `evaluateRegistry`. Reused verbatim. |
| Expiry semantics on external attestations | `PARTIAL` | `validateExternalAttestation` validates `reviewDate` and `recordedAt` but has **no expiry concept**. Phase 100 adds an *additive, opt-in* `validityExpiresAt` check in its own layer; the Phase 99 validator is not weakened or changed. |
| Legal / privacy evidence contract | `MISSING` | Added: `LEGAL_PRIVACY` evidence type. |
| Live model-evaluation evidence contract | `MISSING` | Added: `LIVE_MODEL_EVALUATION` evidence type. |
| Backup-operations evidence contract | `MISSING` | Added: `BACKUP_OPERATIONS` evidence type. |
| Commercial owner-decision contract | `MISSING` | Added: `COMMERCIAL_DECISIONS` evidence type. |
| Infrastructure-prerequisite contract (OpenBao / production) | `MISSING` | Added: `INFRASTRUCTURE_PREREQUISITES` evidence type. |
| Final GA authorization contract | `MISSING` | Added: `GA_AUTHORIZATION` evidence type. |

## 3. Evidence files — present, and deliberately absent

Present in the tree (real, generated or hand-authored, all sanitized):

| File | Class | Note |
|---|---|---|
| `docs/security/phase99-findings.json` | `EXISTING_REUSABLE` | The finding register the closure evaluator scores. |
| `docs/security/phase99-dependency-review.json` | `EXISTING_REUSABLE` | Generated by `security:phase99:deps`. |
| `docs/security/phase99-route-security-inventory.json` | `EXISTING_REUSABLE` | Generated; checked by `security:phase99:inventory:check`. |
| `docs/pilot/phase99-uat-cases.json` | `EXISTING_REUSABLE` | UAT case catalogue (cases, not results). |
| `docs/release/phase98-configuration-inventory.json` | `EXISTING_REUSABLE` | Secret-FREE: environment key *names* only. |
| `docs/release/phase99.7-migration-ledger.json` | `EXISTING_REUSABLE` | Migration ledger for the cutover. |

Absent **by design** — this is the fail-closed surface, and Phase 100 does not
fill it:

| Expected path (verified absent at the audit base) | Class |
|---|---|
| `docs/security/phase99-external-attestations.json` | `EXTERNAL_BLOCKED` |
| `docs/pilot/phase99-pilot-acceptance.json` | `OWNER_BLOCKED` + `EXTERNAL_BLOCKED` |
| `docs/security/phase99-risk-acceptances.json` | `OWNER_BLOCKED` |
| `docs/legal/phase100-legal-privacy-approvals.json` | `EXTERNAL_BLOCKED` |
| `docs/ai-governance/phase100-live-model-evaluation.json` | `OWNER_BLOCKED` |
| `docs/release/phase100-backup-operations.json` | `OWNER_BLOCKED` |
| `docs/release/phase100-commercial-decisions.json` | `OWNER_BLOCKED` |
| `docs/release/phase100-infrastructure-prerequisites.json` | `OWNER_BLOCKED` |
| `docs/release/phase100-ga-authorization.json` | `OWNER_BLOCKED` |

Every reader uses `?? null` / `?? []` / `?? {}` and resolves `BLOCKED` on
absence, so **adding a real evidence file later breaks no existing evaluator**.

## 4. Workflows

| Item | Class | Evidence / action |
|---|---|---|
| `.github/workflows/phase99-security-pilot-readiness.yml` | `PARTIAL` | Runs readiness, prior-phase evals, full suite, PostgreSQL regressions and a disposable-image smoke — but **not** the closure evaluator. Left untouched by Phase 100. |
| `.github/workflows/phase997-production-completion.yml` | `EXISTING_REUSABLE` | Pattern source for Phase 100: `permissions: contents: read`, SHA-pinned actions, `persist-credentials: false`, concurrency group, bounded timeout, no secrets. |
| `.github/workflows/ai-governance-live-eval.yml` | `EXISTING_REUSABLE` | `workflow_dispatch`-only, protected `ai-evaluation` environment, guard-before-install. It is the **producer** of live-model evidence; Phase 100 is the **consumer**. Phase 100 does not trigger it. |
| Phase 100 GA closure workflow | `MISSING` | Added: `.github/workflows/phase100-ga-closure.yml`. Offline, read-only, PR-triggered, never contacts Production/OpenBao/Stripe/a model provider/a customer. |

## 5. Release documents and contradictory claims

| Item | Class | Evidence / action |
|---|---|---|
| `docs/release/go-no-go-matrix.md:82` — `V1_RELEASE_READY: YES` | `CONTRADICTORY` | A Phase 93 artefact. It asserts release readiness while `RELEASE_BLOCKERS=1` (`PILOT_ACCEPTANCE_MISSING`) and all three external security gates are `BLOCKED_EXTERNAL`. Lines 75–78 additionally carry unfilled placeholders (`<finalized after …>`) *beside* the readiness claim. **Repaired by Phase 100.** |
| `docs/release/phase93-production-acceptance.md:137` | `PARTIAL` | Refers to the `V1_RELEASE_READY` determination without asserting it. Annotated with a pointer to the canonical result. |
| `docs/release/v1-release-checklist.md` | `EXISTING_REUSABLE` | An unchecked checklist — asserts nothing. Extended with the Phase 100 GA closure row. |
| `docs/security/phase99-assurance-report.md:406` — `PHASE_100_ALLOWED=NO` | `EXISTING_REUSABLE` | **Left unchanged, and still correct.** It says Phase 99's external gates are not complete, so no *release* may proceed on Phase 99's authority. Phase 100 does not contradict it: Phase 100 builds the closure *mechanism* and its first act is to report those same gates as still `BLOCKED`. A security record is not edited to make a later phase look finished. |
| `docs/release/phase98-release-engineering-runbook.md:261` — `v1.0.0` reserved for Phase 100 | `EXISTING_REUSABLE` | Correct; Phase 100 supplies the gate that must precede that tag. |
| `docs/PRODUCTION_LAUNCH_CHECKLIST.md` | `EXISTING_REUSABLE` | Operational deployment checklist (Phase 46). Makes no GA-readiness claim. |

Repository-wide search for `V1_RELEASE_READY|GA_READY|GA_RELEASE_READY|RELEASE_READY`
returned exactly **two** hits (both above). A broad prose search for
"production-ready"/"release-ready" returned two further hits, neither of which is
a release claim about Hermes OS (`docs/design/phase-87-closure/native-apply-evidence.md:109`
explicitly says *not* production-ready; `docs/i18n/german-knowledge-review.md:1900`
is translated article content).

## 6. Gate-by-gate coverage before Phase 100

| Required GA gate | Covered before Phase 100? | Class |
|---|---|---|
| Independent penetration test | Yes — `phase99-closure-eval.mjs` | `EXTERNAL_BLOCKED` |
| External application-security review | Yes — same | `EXTERNAL_BLOCKED` |
| External API-security review | Yes — same | `EXTERNAL_BLOCKED` |
| CRITICAL findings zero | Yes — finding register | `EXISTING_REUSABLE` |
| HIGH findings resolved / formally accepted | Yes — finding register + `validateRiskAcceptance` | `EXISTING_REUSABLE` |
| Risk acceptance for unresolved lower-severity findings | `PARTIAL` — `validateRiskAcceptance` restricts formal acceptance to `HIGH`; MEDIUM/LOW residuals had no gate | `MISSING` → added as an explicit residual-risk gate |
| 8 pilot sub-gates | Yes — `phase99-closure-eval.mjs` | `OWNER_BLOCKED` |
| Signed final pilot decision | Yes — `PILOT_ACCEPTANCE_DECISION` | `OWNER_BLOCKED` |
| External legal review | No | `MISSING` |
| External privacy / GDPR review | No | `MISSING` |
| Approved legal-document versions | No | `MISSING` |
| Subprocessors and transfer governance | No | `MISSING` |
| Owner-approved residual legal risk | No | `MISSING` |
| Live model evaluation (environment / model / provider / version binding, thresholds, owner approval) | No — `ai-governance-live-eval.yml` can *produce* a run, nothing *records* it as evidence | `MISSING` |
| Backup scheduler has actually executed in production | No | `MISSING` |
| Latest encrypted backup verified | `PARTIAL` — `verify-backup.sh` exists and is rehearsed in CI; no production execution record | `MISSING` → evidence gate added |
| Verified off-host copy | No | `MISSING` |
| Tested recovery evidence | `PARTIAL` — CI rehearsals prove the mechanism; nothing records a production-representative recovery test | `MISSING` → evidence gate added |
| Owner-confirmed recovery-key custody | No | `MISSING` |
| Pricing decision | No — `docs/billing/phase96-gate-assessment.md:44` records prices as unresolved by owner decision | `OWNER_BLOCKED` |
| Payment-provider (Stripe) decision | No — `:56` records that live Stripe verification was deliberately not performed | `OWNER_BLOCKED` |
| Tax / currency / refund decisions | No | `OWNER_BLOCKED` |
| Production billing activation, separated from code readiness | No | `MISSING` |
| OpenBao private-transport requirement | `PARTIAL` — `docs/release/phase99.7-production-cutover-contract.md:284` records prior owner evidence, unobservable from CI | `OWNER_BLOCKED` |
| Production / OpenBao activation decision | `PARTIAL` — `:285` records `OT_SECRET_BACKEND` unset and fail-closed | `OWNER_BLOCKED` |
| Credential and recovery ownership | `PARTIAL` — `phase98` `RECOVERY_OWNERSHIP` covers roles, not a production confirmation | `OWNER_BLOCKED` |
| Final GA release authorization | No | `MISSING` |

## 7. Consequences for the Phase 100 design

1. **Extend, do not fork.** The Phase 99 closure engine becomes an importable
   module; Phase 100 consumes its gates rather than restating them. The Phase 99
   CLI keeps its exact output, exit code and `phase99-closure.json` artifact.
2. **One canonical machine-readable result.** `phase100-ga-closure.json` is the
   single source of truth; human-readable documents point at it instead of
   re-asserting a verdict that can go stale — which is exactly how
   `go-no-go-matrix.md:82` became wrong.
3. **Absence is `BLOCKED`, never `PASS`.** Every new gate follows the existing
   `resolveGate` contract: absent evidence is `BLOCKED`, present-but-invalid is
   `FAIL`, a synthetic fixture is `BLOCKED`.
4. **The honest expected result at this base commit** is
   `PHASE100_IMPLEMENTATION=PASS`, `GA_RELEASE_READY=NO`,
   `PHASE100_CLOSURE=BLOCKED`. That result is *derived*, never hard-coded — the
   adversarial suite proves the evaluator flips to `PASS` when, and only when,
   fully valid evidence is supplied for every gate.

## 8. Pre-existing hardening debt (NOT changed by Phase 100)

Phase 100 pins its own workflow to a full commit SHA:

```
actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

The SHA was resolved from `refs/tags/v4.6.2` in the official
`actions/upload-artifact` repository at pin time.

Three **pre-existing** uses of the same action remain on the mutable `@v4` tag.
They are recorded here as debt rather than fixed in this pull request, so the
Phase 100 diff stays reviewable as a release-gate change and does not silently
become a CI-wide supply-chain change:

| Workflow | Line | Current | Class |
|---|---|---|---|
| `.github/workflows/phase97-compliance-assurance.yml` | 118 | `actions/upload-artifact@v4` | `PRE_EXISTING_DEBT` |
| `.github/workflows/phase98-dr-release-assurance.yml` | 79 | `actions/upload-artifact@v4` | `PRE_EXISTING_DEBT` |
| `.github/workflows/phase99-security-pilot-readiness.yml` | 84 | `actions/upload-artifact@v4` | `PRE_EXISTING_DEBT` |

**Why this is debt and not merely a style preference.** A tag is a mutable ref.
Anyone able to move `v4` — including an attacker who compromises the action
repository — changes what executes inside those jobs, with the job's token, on
the next run. Pinning to a SHA removes that entirely; the trade is that
`dependabot`/`renovate` must bump the pin for legitimate upgrades.

**Recommended follow-up:** a single dedicated change that pins all three, run
against a real workflow execution so an incorrect SHA is caught by CI rather
than at release time. That change touches Phase 97, 98 and 99 assurance
pipelines and should be reviewed as its own unit of work.
