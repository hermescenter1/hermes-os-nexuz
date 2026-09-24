# ATS Production Runbook

This runbook covers what B2/S1 added. It does not replace the platform deploy contract (`docs/…/deploy`), which this branch has **not** exercised: nothing here was deployed.

## 1. Environment variables (names only — never commit values)

| Variable | Required for | Default when absent |
| --- | --- | --- |
| `RECRUITMENT_IDEMPOTENCY_SECRET` | public intake | intake refuses every submission (generic 503, WRITE_COUNT = 0) |
| `ATS_REVIEW_WORKER_TOKEN` | worker trigger route | token auth disabled; only a signed-in platform admin can trigger a pass; the runner script refuses to start |
| `ATS_AI_REVIEW_PROVIDER` | optional | `deterministic` |
| `ATS_AI_EXTERNAL_PROCESSING_ALLOWED` | optional | not allowed — no candidate text leaves the process |
| `HERMES_WORKER_BASE_URL`, `ATS_REVIEW_WORKER_INTERVAL_MS`, `ATS_REVIEW_WORKER_BATCH` | runner script | `http://127.0.0.1:3000`, `30000`, `20` |

`.env.example` was **not** edited in this change (the file is access-restricted in the authoring environment). Add the five `ATS_*` / `RECRUITMENT_*` names there in a follow-up.

## 2. Migration

`prisma/migrations/20260923000000_ats_b2_s1_orchestration_and_review/migration.sql` — additive only. Two `ALTER TYPE … ADD VALUE IF NOT EXISTS` statements are non-transactional in PostgreSQL; the rest is `CREATE TYPE / ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT`. Rollback SQL is in the file header. Apply only through the platform's migrator on a verified backup, per the deploy contract.

Post-migration check:
```sql
SELECT unnest(enum_range(NULL::"AtsApplicationStatus"));            -- must include AI_REVIEW_PENDING, PENDING_HUMAN_APPROVAL
SELECT to_regclass('"AtsReviewOutbox"'), to_regclass('"AtsAiReview"'), to_regclass('"AtsReviewDecision"'), to_regclass('"AtsJobCriterion"');
```

## 3. Enabling intake for ONE organization (exact order)

1. Create and **approve** a `RetentionPolicy` for the organization: `dataClass = RECRUITMENT_CANDIDATE`, `retentionDays = <owner value>`, `retentionTrigger = CREATION` or `LAST_ACTIVITY`, `action = ANONYMISE`, `enabled = true`, `approvalState = APPROVED` — via `POST/PATCH /api/compliance/retention-policies` (permission `manage_retention`). Without this row the intake refuses.
2. Set `RECRUITMENT_IDEMPOTENCY_SECRET` (≥ 16 chars) on `hermes-web`.
3. Apply a role profile to each open job: `POST /api/ats/jobs/{jobId}/criteria { "roleCode": "…" }` (capability `ATS_MANAGE`). A job without criteria is received but its review dead-letters after 5 attempts with `NO_CRITERIA`.
4. Set `ATS_REVIEW_WORKER_TOKEN` and start the runner: `npm run ats:review:worker` (or schedule `npm run ats:review:worker:once`).
5. **Owner decision:** set `APPLICATION_ACCEPTANCE_AUTHORIZED = true` in `src/lib/ats/acceptance-flag.ts` in a dedicated, reviewed commit. `APPLY_JOURNEY_OPEN` then becomes true and the careers UI shows the apply state — note the Stage-1 **form** is not yet built (roadmap S3); until it is, intake is API-only.

## 4. Smoke after deploy

| Check | Expect |
| --- | --- |
| `POST /api/careers/apply` with a valid body, no policy | `503`, no rows |
| same, policy approved, flag still false | `503`, no rows |
| `POST /api/ats/review/deliver` without token | `401` |
| with token | `200 { claimed, delivered, … }` |
| `POST /api/ats/applications/{id}/decision` without `x-hermes-organization` | `428` |
| as ENGINEER member | `403` |
| as RECRUITER of another org | `404` |
| `GET /api/ats/overview` anonymous | `401` |

## 5. Operating the review outbox

```sql
SELECT status, count(*) FROM "AtsReviewOutbox" GROUP BY 1;
SELECT id, "applicationId", attempts, "lastErrorCode", "nextAttemptAt" FROM "AtsReviewOutbox" WHERE status IN ('RETRYING','DEAD_LETTER');
```
`DEAD_LETTER` codes: `NO_CRITERIA` (apply a profile, then reset the row to `PENDING`), `UNKNOWN_ROLE`, `REPORT_INVALID`, `APPLICATION_NOT_PENDING` (a human acted first — nothing to do), `STALE_STATE`, `LOAD_FAILED`, `WRITE_FAILED`, `APPLICATION_NOT_FOUND`. The application stays `AI_REVIEW_PENDING` in every failure case; reset a row with `UPDATE "AtsReviewOutbox" SET status='PENDING', "nextAttemptAt"=now() WHERE id=…` after fixing the cause.

## 6. Retention sweep

`sweepExpiredApplications({ organizationId })` is dry-run unless called with `execute: true` **and** the policy's `dryRunOnly = false`. No scheduler is wired in this change. Run the dry-run report, review `held` / `reviewRequired`, get owner approval, then execute.

## 7. Rollback

Application-only: redeploy the previous `hermes-web` image. The migration is additive; leaving it applied is safe (new columns nullable, new tables unused, two extra enum values unused). Full SQL rollback is in the migration header if required.
