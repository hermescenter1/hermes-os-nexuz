# ATS Recruitment Roadmap

Status as of 2026-09-23 on `feature/ats-recruitment-intelligence` (base `1c7aa405…`). Nothing below is deployed.

## Done

| Slice | What | Evidence |
| --- | --- | --- |
| **S0** | Authorization on the four unauthenticated management endpoints; client crash fix | `management-surface-authz.test.ts` |
| **B2** | Intake orchestration (`intake.ts`), rewired `POST /api/careers/apply`, retention stamping, consent records, review outbox, audit; `APPLICATION_ORCHESTRATION_IMPLEMENTED = true` | `ats-b2-intake`, `ats-b2-apply-orchestration`, `ats-b2-retention` |
| **S1** | Schema (`20260923000000_ats_b2_s1_orchestration_and_review`), five-role catalog, deterministic extractor/scorer/engine, prompt guard, review worker + trigger route + runner, human decision service + route, rewired status route, criteria route, review GET, ATS capabilities | `review-engine`, `review-worker`, `ats-s1-decision`, `ats-s1-routes`, `ats-rbac`, `ats-b2-s1-migration-safety`, `ats-b2-s1-production-boundary` |

## Open decisions (fail closed until answered)

1. **Public intake** — `APPLICATION_ACCEPTANCE_AUTHORIZED` stays `false`. Flipping it requires (a) an APPROVED `RetentionPolicy` row per organization, (b) `RECRUITMENT_IDEMPOTENCY_SECRET` in production, (c) the Stage-1 form UI wired to `stage1-contract.ts`, (d) the worker running. See the runbook.
2. **Retention period** — read from the policy row; no default exists anywhere. The compliance UI (`/api/compliance/retention-policies`) is where it is set and approved.
3. **AI provider** — deterministic by default; the router path needs an explicit policy flag and a designated provider key.
4. **Résumé file storage** — no private blob store configured.
5. **Deploy target** — production canonical vs. a separate recruitment host: unknown; nothing was deployed.

## Next slices, in order

| # | Slice | Depends on |
| --- | --- | --- |
| S2 | Migrate `/api/ats/{overview,analytics,pipeline,candidates,jobs,interviews,score}` off fixtures onto org-scoped reads through `AtsApplication`, under `requireAtsActor`; delete `InterviewPlannerClient`'s hardcoded interviews; nullable UI contract + fa/en/de keys | — |
| S3 | Stage-1 apply form UI (`ApplyFormClient` on `stage1-contract.ts`), reviewer UI for the report and the decision (`/dashboard/ats/…`) | S2 |
| S4 | Résumé file upload: private storage, MIME allowlist, size cap, filename normalisation, extraction to `resumeText` with `AtsResumeDocument` status | storage decision |
| S5 | Interview kits persisted (`AtsInterviewKit`, `AtsInterviewFeedback`, append-only), scoring against rubric anchors, SLA tracking | — |
| S6 | Withdrawal route on the B1 OTP service; `withdrawnAt` honoured by retention; candidate self-service | — |
| S7 | Retention sweep scheduler (dry-run report → owner approval → execute), erasure-workflow integration for the global candidate row | compliance owner |
| S8 | PostgreSQL integration tests (`*.pg.test.ts`) for intake, worker and decision under the phase91 runner; Playwright for careers → apply → review → decision | CI DB |
| S9 | Notification outbox (`AtsCommunication`) for applicant receipts and reviewer SLA reminders | S3 |
| S10 | Talent pool (`AtsTalentPoolEntry`) driven by the `recruitment_future_openings` consent | S6 |
