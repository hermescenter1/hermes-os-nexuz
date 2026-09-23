# ATS Security and Privacy

Scope: the B2 intake path, the S1 review and decision path, and the S0 management-surface closure. Everything here is enforced in code and pinned by a test named beside it.

## 1. Public intake — `POST /api/careers/apply`

| Control | Mechanism | Test |
| --- | --- | --- |
| Rate limit | `careers-apply` (5 / hour / IP, `resolveClientIp` = X-Real-IP only) | `phase104b1-public-surface`, `ats-b2-apply-orchestration` |
| Media type, bounded body (32 KiB) | `isJsonContentType`, `readBoundedTextBody` | same |
| Origin | an `Origin` header, **when present**, must be an allowed origin (exact match). Absent is permitted: the endpoint is anonymous (no cookie → no CSRF surface) and non-browser applicants exist | `ats-b2-apply-orchestration` |
| Strict schema | `stage1ApplicationSchema.strict()` — unknown keys (incl. `workAuthorization`, any publish/consent-bypass flag) are 400 | both |
| Idempotency | key format validated; HMAC-SHA-256 fingerprint of the canonical durable payload under `RECRUITMENT_IDEMPOTENCY_SECRET`; atomic INSERT claim; replay → same reference; mismatch → generic 503 | `phase104b1-idempotency`, `ats-b2-intake` |
| Eligibility | shared `publicJobWhere()` before the gates and **again inside the transaction** | `ats-b2-intake` |
| Owner gate | `APPLICATION_ACCEPTANCE_AUTHORIZED` (false) | `ats-b2-s1-production-boundary` |
| Retention gate | APPROVED + enabled `RetentionPolicy` for `RECRUITMENT_CANDIDATE` with a real `retentionDays`; the period is read from that row | `ats-b2-intake` |
| One refusal | every failure after the front door is the same `503` body; a store fault is never an auth error and never a success | both |
| One success | `202 { received, reference }` — identical for new, replayed and duplicate submissions; never a row id | `ats-b2-apply-orchestration` |
| No logging | the route and the intake service contain no log call (static gate) | `ats-b2-s1-production-boundary` |

## 2. Tenant isolation

- `AtsCandidate` is **global** (no `organizationId`) and `email` is unique across live **and** soft-deleted rows. The intake therefore looks a candidate up by e-mail *without* a `deletedAt` filter: an erased identity is refused by name (`CANDIDATE_ERASED`, generic 503 to the applicant, claim released) instead of either being silently resurrected or hitting the unique constraint and failing forever with nothing recorded (`ats-b2-intake`, proven by reinstating the filter as a control). Resolution belongs to the Phase 97 erasure workflow.
- E-mails are stored lower-cased by the B2 intake. Candidate rows written before B2 with mixed-case addresses would not be matched and a second person row would be created; no production intake existed before B2, so none is expected, but it is unverified against real data.
- `AtsCandidate` is reached only through `AtsApplication`, never listed. The review GET loads the application with the caller's `organizationId` in the predicate and projects candidate fields from it (`ats-s1-routes`).
- Every S1 child table carries `(organizationId, applicationId)` → composite FK to `AtsApplication(organizationId, id)`; `AtsJobCriterion` → `AtsJob(organizationId, id)`. A cross-tenant row is unwritable at the database (`ats-b2-s1-migration-safety`).
- The decision service loads and updates with the **actor's** organization in every predicate; a foreign application is `NOT_FOUND` — the same answer as a missing one (`ats-s1-decision`).
- The worker reads the application with the outbox row's `organizationId` in the predicate (`review-worker`).
- Request bodies never carry `organizationId`; strict schemas refuse it as an unknown key (`security-8-write-boundaries`, `ats-s1-routes`).

## 3. Authorization — ATS capabilities (`src/lib/ats/rbac.ts`)

Isolated from the platform role model and the org permission catalogue (neither changed).

| Role | VIEW | REVIEW | MANAGE | SCORE | INTERVIEW | ADMIN |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| OWNER / ADMIN / HR_MANAGER | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| RECRUITER | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| HIRING_MANAGER | ✓ | ✓ | — | — | ✓ | — |
| INTERVIEWER | ✓ | — | — | — | ✓ | — |
| MANAGER | ✓ | — | — | — | — | — |
| ENGINEER, VIEWER, BILLING_ADMIN, MEMBER, others | — | — | — | — | — | — |

`requireAtsActor(req, capability)` = `resolveOrgContext` (session revocation, ACTIVE membership, Phase 110 selection, write precondition `x-hermes-organization`) → capability. Refusal order: 401 → 409/428/503 → 403 (`ats-rbac`).

Route → capability: decision `ATS_REVIEW`; status transition `ATS_MANAGE`; review GET `ATS_VIEW` (contact details only for REVIEW/MANAGE); criteria GET `ATS_VIEW`, POST `ATS_MANAGE`; worker trigger: bearer `ATS_REVIEW_WORKER_TOKEN` (constant-time) or platform admin.

**Still on the old `authoring` gate (S0, fixture-backed):** `/api/ats/overview`, `analytics`, `pipeline`, `candidates`, `jobs`, `interviews`, `score`. Migrating them to `requireAtsActor` is the next slice.

## 4. Stage gate — no automatic transition

- Intake writes `APPLIED` → `AI_REVIEW_PENDING` and knows no later status (static gate).
- The worker writes `PENDING_HUMAN_APPROVAL` under `updateMany WHERE status='AI_REVIEW_PENDING' AND aiReviewCycle=<row.cycle>` and nothing later (static + behavioural gates).
- Only `recordGateDecision` leaves the gate; only `transitionApplication` moves later stages; both require a reason and both refuse the gate states from the ordinary path (`ats-s1-decision`).
- Both are conditional updates: a concurrent change is `STALE` (409), never merged.

## 5. Consent and retention

- Three typed `ConsentRecord`s per application (ACKNOWLEDGEMENT, ATTESTATION, optional CONSENT), `consentVersion = RECRUITMENT_CONSENT_VERSION`, stored in the intake transaction.
- `retentionPolicyId` and `retentionExpiresAt` stamped at intake from the approved policy. `sweepExpiredApplications` (`retention.ts`) is **dry-run by default**, honours `dryRunOnly`, honours active legal holds via the compliance engine's `isUnderLegalHold` (SUBJECT / RESOURCE / RESOURCE_TYPE / ORGANIZATION / DATE_RANGE), anonymises the application's free text, executes `DELETE` as soft-delete + anonymisation, and **never touches the global candidate row** (`ats-b2-retention`).
- `withdrawnAt` exists on the row; the withdrawal route (OTP service from B1) is not yet wired — see the roadmap.

## 6. AI governance

- Deterministic by default; no candidate text leaves the process.
- External model only with `ATS_AI_REVIEW_PROVIDER=router` **and** `ATS_AI_EXTERNAL_PROCESSING_ALLOWED=true`; advisory prose only; scores never come from the model (`review-engine`).
- Prompt-injection fixtures: identical scores, risk flag raised, lower confidence.
- Every review row stores extractor/rubric/prompt/policy/model versions and the full report.

## 7. Audit

`buildRecruitmentAuditCreate` refuses an entry without a reason, and refuses a human action without a user id and a system action without a named system actor. Metadata carries identifiers and outcomes only; tests assert no name, e-mail or résumé fragment appears (`ats-b2-intake`, `review-worker`).

## 8. Known gaps (honest)

- CV **file** upload is not implemented; only `resumeText` (≤ 20 000 chars) and a link travel. No private blob store is configured. Upload hardening (MIME allowlist, size, filename, malware boundary) is therefore not yet exercised.
- The S0 management routes still serve fixtures behind the `authoring` gate.
- No Playwright/e2e run exists for the new flow; coverage is unit + route-handler level with a captured fake Prisma. No PostgreSQL integration test was added (none could be executed in this environment).
- Interview feedback is not yet append-only; `AtsInterview` keeps the pre-existing mutable columns.
