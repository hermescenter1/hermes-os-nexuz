# ATS-M1 — Position management and organization ATS settings

Status: **IMPLEMENTED_PENDING_REVIEW** (feature branch `feature/ats-position-management`, base
`48538431`). Not deployed; the migration has not been run against any production database.

`APPLICATION_ACCEPTANCE_AUTHORIZED` stays `false`. Nothing in this change opens public intake.

---

## 1. Repository audit (Phase 1)

| Area | Found | Consequence for M1 |
| --- | --- | --- |
| Prisma | `AtsJob` (status `DRAFT/OPEN/CLOSED/ON_HOLD`, `isPublic` with no default, `publishedAt`, `closingDate`, `deletedAt`, `requisitionKey` unique per org, `hiringManagerId` composite tenant FK), `AtsJobTranslation` (EN/DE/FA), `AtsJobCriterion` (S1), `RetentionPolicy` (Phase 97), `AuditLog` (org, outcome, correlationId). `AtsApplication_jobId_fkey` has **no ON DELETE** (NO ACTION). | Reuse all of them. Add `PAUSED`/`ARCHIVED`; read legacy `ON_HOLD` as `PAUSED`. The FK already makes a hard delete of a job with applications impossible at the database. |
| Routes | `GET/POST /api/ats/jobs` guarded by the **platform** `authoring` capability (held by `engineer`), and a POST contract with no consumer. `/api/ats/jobs/[id]/criteria` on `requireAtsActor`. No edit / lifecycle / delete / settings route. | Move the collection onto ATS RBAC; add the missing routes under the same resource. |
| RBAC | `src/lib/ats/rbac.ts` — `ATS_VIEW/REVIEW/MANAGE/SCORE/INTERVIEW/ADMIN`, deny by default; `requireAtsActor` = `resolveOrgContext` (tenant, 428 on a write without `x-hermes-organization`) + capability. | Every M1 route calls it first. No change to the matrix. |
| Dashboard | `/dashboard/ats/jobs` rendered DB rows through the fixture `Job` type; no actions. | Replaced by a real management client; `JobListClient.tsx` is left in place (referenced by `docs/design/stage6b-debt.json`) and is now unused — follow-up to retire it. |
| Audit / events / outbox | `buildRecruitmentAuditCreate` (validated metadata, human vs system actor, no PII); `AtsPipelineEvent` and `AtsReviewOutbox` are **application**-scoped. | Extend the adapter (`stage: "M1"`, `affectedCounts`). Position lifecycle writes no pipeline event and no outbox row: it never touches an application and has no asynchronous consumer — an outbox row nobody reads would be fake. |
| AI review | intake → `AI_REVIEW_PENDING` → worker → `PENDING_HUMAN_APPROVAL` → only a recorded human decision leaves it. External model only when `ATS_AI_REVIEW_PROVIDER=router` **and** `ATS_AI_EXTERNAL_PROCESSING_ALLOWED=true`. | Unchanged. M1 adds a third, organization-level condition and a confidence **flag**; no state is added, removed or skipped. |
| Tenant model | `OrganizationMember` (ACTIVE / INVITED / SUSPENDED), the rendered-organization stamp in `AppShell`, `withTenantPrecondition` on the client. | Reused for every mutation. |
| Settings patterns | `Organization.settings` Json bag, **replaced wholesale** by `PATCH /api/organizations/[orgId]`. Phase 97 compliance registry for `RetentionPolicy`. | A dedicated `AtsOrganizationSettings` table (an org edit must not be able to overwrite recruitment policy unaudited). Retention reuses `RetentionPolicy`; the compliance registry remains the general writer. |
| Public careers | `publicJobWhere(now)` is the single predicate for listing, detail, apply, sitemap and JSON-LD. | Only narrowed (organization kill switch); every existing clause still holds. |

## 2. Lifecycle

```
DRAFT ──PUBLISH──▶ OPEN ──PAUSE──▶ PAUSED ──RESUME──▶ OPEN ──CLOSE──▶ CLOSED ──ARCHIVE──▶ ARCHIVED
                     └───────────CLOSE────────────▶ CLOSED ──REOPEN (ATS_ADMIN)──▶ OPEN
DRAFT ──ARCHIVE──▶ ARCHIVED
```

| Move | Capability | Reason | Publish gate |
| --- | --- | --- | --- |
| PUBLISH, RESUME | ATS_MANAGE | optional | yes |
| PAUSE | ATS_MANAGE | optional | — |
| CLOSE | ATS_MANAGE | **required** | — |
| REOPEN | ATS_ADMIN | **required** | yes |
| ARCHIVE | ATS_ADMIN | **required** | — |
| Soft delete (from DRAFT / PAUSED / CLOSED / ARCHIVED, never OPEN) | ATS_ADMIN | **required** + confirmed linked-application count | — |

Source of truth: `src/lib/ats/positions/state-machine.ts` (the UI reads the same table; the server
re-derives it per request).

**Publish gate** (`readiness.ts`): public title; English and Persian title, summary and description;
the default careers locale complete; ≥ 1 must-have; ≥ 1 disqualifier; a rubric totalling 100; an
interview kit; an ACTIVE hiring owner of the same organization (re-proven in the transaction); an
approval owner role that holds ATS_REVIEW; an SLA of 1–90 days; a location; no protected
characteristic in anything a candidate is judged on; a closing date not in the past.

**Confidential salary**: when "salary is confidential" is on, no salary field reaches the public
detail page or the JobPosting structured data (`salaryIsPublic` in `src/lib/ats/public-jobs.ts`).

**Protected characteristics** (`findProtectedTerms`, `src/lib/ats/policy.ts`): English whole words with
plural/participle endings, German and Persian whole tokens plus stems for inflected forms, Arabic
diacritics removed, ZWNJ as a separator. A short, explicit, reviewed list of technical phrases that
contain such a word but describe equipment or software ("race condition", "male connector", "single
sign-on", "man hours", "asset age", "Alter der Anlage", "سن تجهیزات", "عکس‌العمل") is removed before
scanning — nothing is exempted by pattern. It is a fail-closed screen, not a guarantee: the human
reviewer and the audit trail remain the control.

**Public visibility** is decided only by `publicJobWhere`: `OPEN` + `isPublic` + `publishedAt ≤ now`
+ not closed + not deleted + the organization has not switched its listing off.

**Safe delete** never removes a row: `deletedAt` is set, the position becomes `ARCHIVED` and private,
and every application, candidate, review, interview and audit record stays. The request must carry
the linked-application count the operator was shown; a changed count is refused
(`LINKED_COUNT_CHANGED`). `atsJob.delete` is not called anywhere, and the database FK would refuse it.

## 3. Organization ATS settings

| Section | Who | Reason | Stored where | Enforced where |
| --- | --- | --- | --- | --- |
| Workflow: SLA default, default interview stages | ATS_MANAGE | optional | `AtsOrganizationSettings` | prefills new positions |
| Workflow: pipeline order, human approval | — | — | not stored | **locked** platform invariants |
| Human approval: default approval-owner role | ATS_ADMIN | **required** | settings | prefills new positions |
| AI review: provider, external processing, minimum confidence | ATS_ADMIN | **required** | settings | review worker (per application's organization) |
| AI review: evidence requirement, versions | — | — | not stored | **locked**; report schema |
| Retention: propose a policy (days, trigger, effective date) | ATS_ADMIN | **required** | `RetentionPolicy` (action always `ANONYMISE`, always back to dry-run) | — |
| Retention: **approve / enable** a policy | ATS_ADMIN **and** org permission `manage_retention` (OWNER / ADMIN — the Phase 97 compliance gate) | **required** | `RetentionPolicy` + `retentionPolicyId` (selected only when approved, enabled and effective) | intake + retention sweep |
| Notifications | ATS_MANAGE | optional | settings | **recorded only — no delivery channel is connected yet** (stated in the UI) |
| Public careers: listing, intake, default locale | ATS_ADMIN | **required** | settings | `publicJobWhere`, intake, publish gate |
| Security | read-only (ATS_ADMIN) | — | never stored | configured / missing computed at read time |

Retention approval stays a compliance act: HR_MANAGER (ATS_ADMIN without `manage_retention`) can
only save proposals, cannot edit an approved policy and cannot convert a policy the compliance
registry configured with another action. A proposal never displaces the selected policy; if a
selected policy later stops being approved, the sweep reports `selectedPolicyUnavailable` instead
of silently doing nothing or guessing another policy. Clearing a policy for real (non-dry-run)
execution remains in the compliance registry. The currently SELECTED policy cannot be edited out of
force from the ATS form (disabled, pending or future-dated) — that would close intake and stop the
sweep as a side effect; select another policy first, or withdraw it in the compliance registry. An
edit is conditional on the policy as read (approval state and `updatedAt`), so a concurrent approval
turns it into `STALE` instead of being reverted.

Note: `sweepExpiredApplications` still has no scheduled caller (as before M1); its
`selectedPolicyUnavailable` flag becomes visible once a retention job is wired to it.

Fail-closed defaults (no row): external AI off, provider deterministic, **intake closed**, no retention
policy selected, notifications off, listing not switched off. Consequence: after deployment, public
intake is closed for every existing organization until an ATS_ADMIN switches it on — today this has
no effect, because the platform-wide `APPLICATION_ACCEPTANCE_AUTHORIZED` is `false`.

External AI now requires **four** yeses: deployment `ATS_AI_REVIEW_PROVIDER=router`, deployment
`ATS_AI_EXTERNAL_PROCESSING_ALLOWED=true`, organization provider `router`, organization external
processing on.

## 4. API

The Idempotency-Key is bound to the acting user (a colleague reusing a key gets a conflict, never
someone else's stored result). The pre-existing S1 route `POST /api/ats/jobs/[id]/criteria` now also
enforces the Origin check, refuses an ARCHIVED position and bumps the position `version`.

All routes: `requireAtsActor(req, <capability>)` first → for writes `requireTrustedOrigin(req, "jwt")`
(CSRF, 403 `ORIGIN_NOT_ALLOWED`) and a mandatory `Idempotency-Key` (400) → strict Zod body →
transactional service with an idempotency claim, membership re-check, `version` condition and audit
row → `{ …, correlationId }` with `x-request-id`, `Cache-Control: no-store`.

| Route | Capability |
| --- | --- |
| `GET /api/ats/jobs` | ATS_VIEW |
| `POST /api/ats/jobs` | ATS_MANAGE |
| `GET /api/ats/jobs/[id]` | ATS_VIEW |
| `PATCH /api/ats/jobs/[id]` | ATS_MANAGE |
| `POST /api/ats/jobs/[id]/transition` | ATS_MANAGE (+ ATS_ADMIN for REOPEN / ARCHIVE, in the service) |
| `POST /api/ats/jobs/[id]/delete` | ATS_ADMIN |
| `GET /api/ats/jobs/[id]/audit` | ATS_VIEW |
| `GET, POST /api/ats/jobs/initial-drafts` | ATS_ADMIN |
| `GET /api/ats/jobs/owners` | ATS_MANAGE |
| `GET, PATCH /api/ats/settings` | ATS_MANAGE (+ ATS_ADMIN per section, in the service) |
| `PUT /api/ats/settings/retention` | ATS_ADMIN |

Breaking change, deliberate: `POST /api/ats/jobs` now takes the M1 position body instead of the B1
`createJobDraft` body (which had no consumer), and the collection is no longer reachable with the
platform `authoring` capability. `createJobDraft()` itself is unchanged.

## 5. Initial positions

`POST /api/ats/jobs/initial-drafts` (ATS_ADMIN, reason required) creates, as private DRAFTs with a
stable requisition key each (a second run skips them):

| Title | Catalogue profile |
| --- | --- |
| Senior Accountant / حسابدار ارشد | `finance_accountant` |
| Senior Electrical and Industrial Automation Engineer / مهندس ارشد برق و اتوماسیون صنعتی | `automation_plc_scada_engineer` |
| Backend Developer / توسعه‌دهندهٔ بک‌اند | `backend_engineer` |
| Artificial Intelligence Specialist / متخصص هوش مصنوعی | `ai_ml_engineer` |
| Senior B2B Marketing Specialist / کارشناس ارشد بازاریابی B2B | `b2b_technical_marketing` |

Criteria, rubric, interview kit, assessment, approval owner and SLA come from the reviewed catalogue.
Hiring owner, location and the public description are left **empty**, so the publish gate refuses
each one until a person completes it.

## 6. Migration

`prisma/migrations/20260925000000_ats_m1_position_management/migration.sql` — additive only: two
`ADD VALUE IF NOT EXISTS` on `AtsJobStatus`, 16 nullable / structurally-defaulted `AtsJob` columns,
one nullable `RetentionPolicy.effectiveFrom`, two new organization-owned tables. The rollback script
is in the file header (the two enum values cannot be dropped from a PostgreSQL type; move any
`PAUSED`/`ARCHIVED` row to a pre-M1 status with a reviewed statement before rolling back code).

It is dated 2026-09-25 so it sorts strictly after Phase 112's `20260924000000_phase112_immutable_reasoning_run`
(two migrations sharing one timestamp would make the apply order depend on folder names).
Registered in `prisma/__tests__/phase102-migration-safety.test.ts` and
`scripts/ci/phase102-applied-migration-check.mjs`; machine-checked by
`prisma/__tests__/ats-m1-migration-safety.test.ts`.

## 7. Remaining manual steps (owner)

1. Review and merge the PR; CI runs the real-PostgreSQL migration rehearsal.
2. Apply the migration through the deploy contract on a verified backup (the host sudoers
   prerequisite of PR #106 still applies).
3. Per organization, as ATS_ADMIN: configure retention (approved, enabled, effective) and decide on
   public listing and intake. Intake stays closed until **both** the organization switch and the
   platform-wide `APPLICATION_ACCEPTANCE_AUTHORIZED` are opened — the latter is an owner decision
   outside this change.
4. Run "Create the five initial drafts", then complete each (hiring owner, location, public copy)
   before publishing.
5. Follow-ups: connect notification delivery (the preferences are recorded only); retire the unused
   `src/components/ats/JobListClient.tsx`; enforce `approvalOwnerRole` and `decisionSlaDays` in the
   gate-decision route (today any ATS_REVIEW holder may decide, as before M1); add an
   `AuditLog(organizationId, entityType, entityId)` index (the position audit history and linked
   counts scan the organization's audit rows — needs a non-blocking index build on a large table);
   consider scanning public copy for protected characteristics (today: criteria, evidence, kit and
   assessment only, so an equal-opportunity statement in a description is not refused).
