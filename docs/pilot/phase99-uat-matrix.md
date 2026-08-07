# Hermes OS — Phase 99 UAT Matrix

Status: **method + schema document**. The executable case set is
`phase99-uat-cases.json` (same directory). Companion to `phase99-pilot-plan.md`
(Phase 2 — Guided UAT) and `phase99-workflow-validation.md`.

> **This UAT matrix and its case set prove readiness. They are NOT pilot
> acceptance.** A fully green run of `phase99-uat-cases.json` shows that the
> product behaves as expected against safe synthetic fixtures in a
> non-production environment. It does not, by itself, constitute pilot
> acceptance, a customer commitment, or evidence that a real industrial
> engineer used the product. Only `phase99-acceptance-template.md`, signed by
> a real Acceptance Authority, records acceptance.

## 1. Method

1. Cases run against a non-production or isolated pilot environment only —
   never against production, never against another tenant's real data.
2. Every case uses a safe synthetic fixture (for example
   `hermes99test_operator`, `pilot-alpha`) — never real personal data, real
   credentials, or real plant data.
3. A case is executed by following its `steps` in order and comparing the
   observed behaviour against `expectedResult`.
4. The executor records the real observed behaviour in `actualResult` (never
   left as a description of what was expected — it must describe what actually
   happened, including partial or unexpected outcomes) and sets `status`
   accordingly (§3).
5. If a case fails or is blocked, the executor records `severity`,
   whether it is `releaseBlocker`, and — where available — an
   `evidenceReference` (for example a log excerpt location, a screenshot path,
   or a correlation id from `/api/admin/observability`). Evidence must never
   include secrets, credentials, or another tenant's data.
6. Cases are never marked `PASS` by inference or by re-using a previous run's
   result — each pilot run re-executes and re-records every case it covers.

## 2. Case fields

| Field | Type | Meaning |
|---|---|---|
| `uatId` | string | Stable identifier, e.g. `UAT-001`. |
| `title` | string | Short human-readable name of the scenario. |
| `persona` | string | The role exercising the case (product RBAC role and/or organization role — never a real name). |
| `precondition` | string | State the environment must be in before the case starts. |
| `inputFixture` | string | The safe synthetic fixture used (account handle, organization alias, sample text) — never real data. |
| `steps` | string[] | Ordered actions the executor performs. |
| `expectedResult` | string | The behaviour the product contract implies, written before execution. |
| `actualResult` | string \| null | What was actually observed. `null` until the case is run. |
| `status` | string | One of the closed statuses in §3, or `NOT_RUN`. |
| `severity` | string \| null | Set only when `status` is `FAIL` or `BLOCKED`; otherwise `null`. |
| `releaseBlocker` | boolean | Whether this failure must block pilot progression (Phase 2 exit in the pilot plan). Defaults `false`. |
| `evidenceReference` | string \| null | Pointer to supporting evidence for a non-`NOT_RUN` result; `null` until recorded. |

## 3. Status set (closed statuses)

| Status | Meaning |
|---|---|
| `NOT_RUN` | Case has not been executed yet. Initial state for every case. |
| `PASS` | Observed behaviour matched `expectedResult` with no material deviation. |
| `FAIL` | Observed behaviour did not match `expectedResult`; `severity` and `releaseBlocker` must be set. |
| `BLOCKED` | Case could not be executed (e.g. a prerequisite case failed, environment unavailable, dependency missing); `severity` must be set to reflect the impact of not being able to verify the workflow. |
| `ACCEPTED_WITH_LIMITATION` | Observed behaviour deviated from `expectedResult` in a way the Pilot Coordinator and Acceptance Authority have explicitly reviewed and accepted as a documented, non-blocking limitation. This status is never self-assigned by the executor alone. |

## 4. Coverage

The case set in `phase99-uat-cases.json` covers, using only real navigation
groups from `src/lib/navigation/app-nav.ts`: authentication and onboarding,
organization context switching, site/asset workflow, industrial analysis via
Industrial Brain (advisory only), case and evidence workflow,
knowledge/journal publication, compliance workflow, admin and observability,
entitlement/billing boundary, document export, session/tenant security, and
locale switching across fa/en/de.

## 5. Reporting

Phase 2 of the pilot plan exits when every case reaches a closed status and no
open `FAIL` carries `releaseBlocker: true`. The Pilot Coordinator summarizes
the totals (total / pass / fail / blocked / acceptedWithLimitation / notRun)
into `phase99-acceptance-template.md`'s `uatSummary` field for the Acceptance
Authority's review — the raw case file remains the source of truth.
