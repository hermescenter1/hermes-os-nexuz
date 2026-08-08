# Phase 99 — External Review Intake

The procedure for setting up a real, authorised review engagement, and for
getting its results back into this repository in sanitized form. Read
alongside `phase99-external-review-scope.md` (what is reviewed) and
`phase99-rules-of-engagement.md` (the binding rules, including the reporting
channel and the `PENTEST_TARGET` placeholder).

## What the owner must provide before testing begins

- **A target environment.** A dedicated, non-production deployment running
  the exact commit under review, reachable only by the reviewer and the
  owner's designated contacts. Provisioning this environment, and recording
  its address in the reviewer's private engagement materials (never in this
  public repository), is entirely the owner's responsibility — see the
  "Authorised non-production target" section of the rules of engagement.
- **A commit SHA (and, optionally, an image digest).** The exact 40-character
  git commit the target environment runs, plus an optional
  `sha256:<hex>` container-image digest if the target is deployed from a
  built image rather than source. This becomes `testedCommitSha` /
  `testedImageDigest` in the attestation below.
- **Test accounts.** At least two independent synthetic tenant organizations,
  each with its own `hermes99test_*`-prefixed accounts covering the role
  spectrum relevant to the engagement (ordinary member, tenant admin,
  platform admin as applicable). No real account, credential, or customer
  identity is ever provided to a reviewer.
- **A test window.** Explicit start and end date/time for the engagement.
- **A point of contact** for the reporting channel and the critical-finding
  emergency role, per the rules of engagement.
- **A signed engagement agreement / NDA**, if the owner requires one — this
  repository does not define or enforce that agreement; it is a matter
  between the owner and the reviewing firm.

## What the reviewer receives

- This documentation package (`docs/security/phase99-*.md`) as the scope,
  rules, attack-surface description and test matrix for the engagement.
- Read access to this public repository at the pinned commit — the source
  code itself is already public, so no special access grant is required for
  static review.
- The `hermes99test_*` test accounts and the non-production target address,
  communicated through the owner's engagement channel — never committed to
  this repository.
- No production credentials, no production data, no access to any real
  customer's environment.

## How the reviewer returns findings

All findings, drafts and raw evidence go through the private reporting
channel defined in `phase99-rules-of-engagement.md` (a private GitHub
security advisory on this repository, or an owner-designated encrypted
channel) — never as a public pull-request comment, a public issue, or a
commit. A critical, immediately exploitable finding is escalated without
delay to the Security Response Owner role via the emergency path the owner
specifies at kick-off.

At the end of the engagement (and after any agreed retest), the reviewer or
the owner produces exactly one **sanitized attestation record** summarising
the engagement for this public repository. It never contains the raw report,
exploit steps, or any of the material `assertNoSensitiveEvidence` in
`scripts/security/phase99/external-evidence.mjs` rejects on sight (private
keys, provider API keys, webhook secrets, cloud access-key ids, JWTs, script
or SQL-injection payloads, IP addresses, email addresses).

## Sanitized attestation schema

Validated by `validateExternalAttestation` in
`scripts/security/phase99/external-evidence.mjs`. Every field is required
unless noted:

| Field | Type / format | Meaning |
|---|---|---|
| `schemaVersion` | `1` | Schema version pin. |
| `reviewType` | one of `INDEPENDENT_PENETRATION_TEST`, `EXTERNAL_APPLICATION_SECURITY_REVIEW`, `EXTERNAL_API_SECURITY_REVIEW` | What kind of engagement this was. |
| `reviewerOrganizationAlias` | non-empty string | An alias for the reviewing firm — never a customer identity, and only as much of the firm's real identity as the owner has separately approved for disclosure. |
| `reviewerRole` | non-empty string naming a **human** role | Must not name an agent, automation, bot, AI, LLM, copilot, model, "self" or "system" — `isHumanAuthorityRole` in `finding-contract.mjs` rejects those tokens as whole words. |
| `reviewDate` | ISO date | When the review was conducted. |
| `testedCommitSha` | 40-hex git SHA | Must equal the commit named in `phase99-external-review-scope.md` for this engagement. |
| `testedImageDigest` | `sha256:<hex>` or `null` | Optional container-image digest, if the target ran from a built image. |
| `scopeHash` | sha256 hex | Must equal `computeScopeHash` of the exact `phase99-external-review-scope.md` text reviewed — binds the attestation to a specific agreed scope, not a verbal understanding. |
| `rawReportReference` | non-empty string | A pointer into the private reporting channel (advisory URL, document id) — never the report body itself. |
| `rawReportSha256` | sha256 hex | Hash of the raw report, proving which specific document the sanitized counts below came from without exposing its content. |
| `criticalCount`, `highCount`, `mediumCount`, `lowCount`, `infoCount` | non-negative integers | Aggregate finding counts by severity. |
| `retestCompleted` | boolean | Whether every reported-fixed finding has been independently retested. |
| `retestReportReference` | non-empty string, required when `retestCompleted` | Pointer to the retest report in the private channel. |
| `retestReportSha256` | sha256 hex, required when `retestCompleted` | Hash of the retest report. |
| `signedOrOwnerVerified` | must be `true` | The owner has confirmed this attestation's provenance — it did not simply appear in a pull request. |
| `recordedAt` | ISO date | When this sanitized record was recorded in the repository. |

A record marked `SYNTHETIC_TEST_FIXTURE: true` — used only by this
repository's own tests to prove the validator rejects a fixture — **can
never satisfy an external gate**, regardless of how complete its other
fields are. `resolveGate` in `external-evidence.mjs` treats such a record as
`BLOCKED`, the same state as no evidence at all. There is no field value or
combination of fields that makes a synthetic or agent-produced record count
as a real review.

## Process flow

1. **Kick-off.** Owner selects a reviewing firm, agrees the engagement
   scope against `phase99-external-review-scope.md` and the rules against
   `phase99-rules-of-engagement.md`, provisions the target environment and
   test accounts, and sets the `PENTEST_TARGET` value and test window for
   this specific engagement (communicated to the reviewer directly — never
   committed to this public repository).
2. **Testing window.** Reviewer tests against the agreed target and commit
   only, reporting critical findings immediately via the emergency path and
   everything else through the private reporting channel as it is found or
   at agreed intervals.
3. **Draft report.** Reviewer delivers a full draft report through the
   private channel.
4. **Owner triage.** Owner (and engineering team, as directed by the owner)
   triages each finding, assigns severity and status per
   `phase99-finding-handling.md`, and plans remediation.
5. **Remediation.** Fixes are made; for findings the owner elects not to fix,
   a formal risk acceptance is prepared per `phase99-finding-handling.md`
   (never available for a `CRITICAL`).
6. **Retest.** Reviewer retests every reported-fixed finding against the
   remediated commit and records the outcome.
7. **Sanitized attestation recorded.** The attestation record above is
   authored (by the owner, or by the reviewer with the owner's sign-off) and
   committed to this repository at
   `docs/security/phase99-external-attestation.json`, with
   `signedOrOwnerVerified: true`. Only at this point can
   `npm run eval:phase99:closure` move off `BLOCKED` for the external-review
   half of the closure gate; the pilot-acceptance half follows the same
   sanitized-record pattern, described in
   `phase99-evidence-index.md`.
