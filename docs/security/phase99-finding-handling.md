# Phase 99 — Finding Handling

How a security finding — from any source — is recorded, tracked, and closed.
The rules below are not aspirational: they are enforced mechanically by
`evaluateRegistry` in `scripts/security/phase99/finding-contract.mjs`, run by
the `FINDING_GOVERNANCE` group of `npm run eval:phase99:readiness` against
`docs/security/phase99-findings.json`.

## Severity

A closed, five-value set. Anything else is `UNKNOWN_SEVERITY` and fails
governance:

`CRITICAL` · `HIGH` · `MEDIUM` · `LOW` · `INFO`

## Status

A closed, seven-value lifecycle. Anything else is `UNKNOWN_STATUS` and fails
governance:

`OPEN` → `TRIAGED` → `REMEDIATION_IN_PROGRESS` → `RETEST_PENDING` →
`VERIFIED_FIXED` | `RISK_ACCEPTED` | `NOT_APPLICABLE`

`VERIFIED_FIXED`, `RISK_ACCEPTED` and `NOT_APPLICABLE` are the only
**resolved** statuses — a finding in any of the other four is still open and
counts toward release-blocking totals if `releaseBlocker` is `true`.

## Source

Each finding records where it came from and that attribution is never
rewritten after the fact: `INTERNAL_REVIEW`, `INTERNAL_REGRESSION`,
`EXTERNAL_PENETRATION_TEST`, `EXTERNAL_APPLICATION_SECURITY_REVIEW`,
`EXTERNAL_API_SECURITY_REVIEW`, `DEPENDENCY_REVIEW`,
`INFRASTRUCTURE_REVIEW`, `PILOT_BLOCKER`. As of this writing every finding in
`docs/security/phase99-findings.json` is sourced `INTERNAL_REVIEW` or
`DEPENDENCY_REVIEW`, consistent with the truth boundary in
`phase99-architecture-and-plan.md` — no external review has produced a
finding yet.

## The three closure rules

These are structural, not policy suggestions, and each is checked by its own
governance counter:

1. **A CRITICAL finding can never be risk-accepted.** A `CRITICAL` finding
   set to `RISK_ACCEPTED` increments `CRITICAL_RISK_ACCEPTANCE`, which fails
   governance unconditionally. A `CRITICAL` finding closes only by
   `VERIFIED_FIXED` (with retest evidence) or `NOT_APPLICABLE` (with a
   documented reason it does not apply — never used to dodge a real defect).

2. **A HIGH finding closes only two ways:** a real fix with retest evidence
   (`VERIFIED_FIXED`, requiring both `remediationReference` and
   `retestReference`), or a formal, unexpired, owner-attributed risk
   acceptance (`RISK_ACCEPTED`, requiring a matching record in
   `docs/security/phase99-risk-acceptances.json` validated by
   `validateRiskAcceptance` — see "Risk acceptance record" below). A `HIGH`
   finding left open with no acceptance is counted in
   `summary.highOpen`; `FINDING_GOVERNANCE` resolves to `BLOCKED_OWNER` (not
   silently to `PASS`) whenever `highOpen > 0`, because closing it is an
   owner decision this repository's tooling cannot make on its own.

3. **No agent-generated risk acceptance is ever valid.** `ownerAuthorityRole`
   on a risk-acceptance record must name a human role; `isHumanAuthorityRole`
   in `finding-contract.mjs` rejects any role string containing `agent`,
   `automation`, `bot`, `claude`, `assistant`, `ai`, `llm`, `copilot`,
   `model`, `self` or `system` as a whole word. A record explicitly marked
   `SYNTHETIC_TEST_FIXTURE` is rejected outright and increments
   `AGENT_SELF_RISK_ACCEPTANCE`. There is no mechanism by which an
   engineering agent — this one included — can accept risk on the owner's
   behalf.

## Evidence integrity

A `VERIFIED_FIXED` finding's `retestReference` must point at a real file, and
`evidenceHash` — the SHA-256 of that file with line endings normalised to
`\n` — must still match the file's current content. `FINDING_GOVERNANCE`
re-computes and re-verifies this hash on every run, so a retest file that
regresses after a finding was closed fails governance rather than silently
staying green.

## Governance counters

`evaluateRegistry` publishes and requires zero for all of:

`UNKNOWN_SEVERITY`, `UNKNOWN_STATUS`, `CRITICAL_RISK_ACCEPTANCE`,
`HIGH_ACCEPTED_WITHOUT_OWNER_EVIDENCE`, `CLOSED_WITHOUT_RETEST_EVIDENCE`,
`RELEASE_BLOCKER_WITHOUT_RESOLUTION`, `HIGH_SEVERITY_DOWNGRADE_ON_ACCEPTANCE`,
`AGENT_SELF_RISK_ACCEPTANCE`.

It also publishes a summary: `total`, `bySeverity`, `criticalOpen`,
`highOpen`, `highFormallyAccepted`, `releaseBlockers`.

## Risk acceptance record

A `HIGH` finding's risk acceptance is a separate record (in
`docs/security/phase99-risk-acceptances.json`, keyed by `findingId`),
validated by `validateRiskAcceptance`:

| Field | Requirement |
|---|---|
| `findingId` | Matches `P99-{INT\|EXT\|DEP\|INF\|PLT}-NNN` and the finding it accepts. |
| `severity` | Must be exactly `HIGH` — a `CRITICAL` cannot reach this path at all. |
| `decision` | Must be exactly `ACCEPT`. |
| `ownerAuthorityRole` | A human role — never an agent/automation token. |
| `reason` | A substantive justification (minimum 20 characters; a one-word reason fails). |
| `compensatingControls` | A non-empty list of concrete mitigations already in place. |
| `scope` | What, specifically, the acceptance covers. |
| `acceptedAt` / `expiresAt` | ISO dates. An acceptance with `expiresAt` in the past is invalid and the finding reverts to blocking. |
| `evidenceReference` / `evidenceSha256` | Pointer to and hash of the supporting evidence. |

Acceptances are never open-ended: every one has an expiry, and an expired
acceptance stops protecting the finding automatically rather than requiring
someone to notice.

## External findings never post raw detail to this repository

Findings from an external penetration test or application/API security
review are **not** recorded in `docs/security/phase99-findings.json` at the
level of exploit detail. Per `phase99-rules-of-engagement.md`, raw reports
and proof-of-concept material go to a private GitHub security advisory on
this repository, or an owner-controlled encrypted-storage location — never
to a public pull-request comment, a public issue, or a commit. What reaches
the public repository is limited to:

- A sanitized finding entry (if the finding is severe enough to warrant
  public-repository tracking): `title`, `severity`, `category`,
  `affectedSurface` described generically enough not to itself be a roadmap
  for an attacker, `status`, and references — never the exploit steps.
- The sanitized external-attestation record described in
  `phase99-external-review-intake.md`: aggregate counts by severity
  (`criticalCount`, `highCount`, `mediumCount`, `lowCount`, `infoCount`), a
  `rawReportReference` (a pointer into the private channel, not the report),
  and `rawReportSha256` (a hash proving which specific report the counts
  came from, without exposing its content).

This is the same reason `assertNoSensitiveEvidence` in
`scripts/security/phase99/external-evidence.mjs` rejects any attestation or
pilot-acceptance record containing something that looks like a private key,
a provider API key, a webhook secret, an AWS key id, a JWT, a script
payload, a SQL-injection payload, an IP address, or an email address: those
records are destined for a **public** repository, and the contract enforces
that only sanitized facts about a review ever land there.
