# HERMES Recruitment Intelligence — Baseline Audit

**Status:** Audit complete. This document records the baseline as found and the
S0 closure (§11). **B2 and S1 were built afterwards** on the same branch — see
`ATS_RECRUITMENT_ROADMAP.md` and `ATS_RELEASE_EVIDENCE.md` for what exists now.
§1's "orchestration never implemented" and §5's "no PENDING_HUMAN_APPROVAL" are
therefore historical: both are closed on this branch. The owner acceptance gate
in §1 is still `false`.
**Branch:** `feature/ats-recruitment-intelligence`
**Base commit (verified):** `1c7aa40579d501468212d6542ddac295f3aab685`
**Audited at:** 2026-09-23

---

## 0. Repository truth (measured, not assumed)

The programme brief named `1c7aa40579d501468212d6542ddac295f3aab685` as "the last
reviewed `main`". That value is correct **for `origin/main`**, but it was *not* the
checked-out state:

| Fact | Measured value |
| --- | --- |
| Working-tree `main` at session start | `fb41cb7eb0e973ad1d6f199b53eff4714a0f7283` |
| `origin/main` | `1c7aa40579d501468212d6542ddac295f3aab685` |
| Local `main` vs `origin/main` | **16 commits behind, 0 ahead** |
| Working tree | clean (0 modified paths) |
| Branch created from | `origin/main` (**not** the stale local `main`) |
| `feature/ats-recruitment-intelligence` pre-existing | No — newly created |
| Migrations on disk | **77** |
| Other worktrees | 78 — **none touched** |

The 16 commits local `main` was missing are CSP / deploy-gate / Microsoft Clarity
work (PRs #97–#102). Verified by diff that **none of them touch any ATS path**:

```
git diff --stat fb41cb7 origin/main -- src/app/api/ats src/lib/ats \
  'src/app/[locale]/dashboard/ats' prisma/schema.prisma   →   empty
```

Every finding below was therefore re-confirmed at `1c7aa405…` and holds there.

---

## 1. BLOCKER — Hermes cannot receive a single application today

`src/lib/ats/acceptance-flag.ts` hard-closes the apply journey at the source level:

```ts
export const APPLICATION_ACCEPTANCE_AUTHORIZED     = false;  // owner decision
export const APPLICATION_ORCHESTRATION_IMPLEMENTED = false;  // B2 never built
export const APPLY_JOURNEY_OPEN =
  APPLICATION_ACCEPTANCE_AUTHORIZED && APPLICATION_ORCHESTRATION_IMPLEMENTED;
```

Two independent facts are both `false`:

1. **`APPLICATION_ACCEPTANCE_AUTHORIZED`** is an *owner business decision*. It is
   not an engineering defect and must not be flipped by an agent. Flipping it also
   requires an **APPROVED retention policy** record, which `/api/careers/apply`
   re-checks server-side (`isRetentionPolicyApproved`).
2. **`APPLICATION_ORCHESTRATION_IMPLEMENTED`** is an *engineering gap*. The Phase
   104-B2 orchestration — atomic idempotency claim → in-transaction eligibility
   re-check → persist → claim completion — was specified but **never implemented**.

Consequence: `/api/careers/apply` answers `503 notAccepting()` to every submission,
and the careers UI correctly hides all apply affordances. **No ATS scoring,
pipeline or interview work can be exercised against real data until B2 ships.**

This is the single highest-priority item for "start hiring at Hermes", and it is
*upstream* of everything in Stages 1–5 of the brief.

---

## 2. BLOCKER — four unauthenticated ATS management endpoints

`src/middleware.ts` line 163 excludes the entire API surface from edge auth:

```ts
matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
```

`/api/**` is therefore protected **only** by in-route checks. Four ATS management
endpoints have **none**:

| Route | Method | Auth | Org scope | Source |
| --- | --- | --- | --- | --- |
| `/api/ats/overview` | GET | **none** | **none** | fixture |
| `/api/ats/analytics` | GET | **none** | **none** | fixture |
| `/api/ats/pipeline` | GET | **none** | **none** | fixture |
| `/api/ats/candidates` | GET | **none** | **none** | fixture |

Today these leak only invented fixture rows, so there is **no live PII exposure**.
The danger is precisely the work Stage 1 of the brief orders: *"wire these routes to
PostgreSQL."* Doing that first, and adding authorization second, converts four
harmless endpoints into an **unauthenticated, cross-tenant candidate-PII firehose**
(`name`, `email`, `phone`, `location`, `salaryExpectation`, score breakdown).

**Therefore the implementation order is inverted from the brief: authorization and
tenant scoping must land BEFORE the database wiring, in the same commit or earlier.**
This is recorded as a deliberate, justified deviation.

---

## 3. Mock surfaces — measured inventory

`grep` for `ats/mock-data` across `src/`, comments excluded, production paths only:

| File | Use | Severity |
| --- | --- | --- |
| `src/app/api/ats/overview/route.ts` | entire response | production mock |
| `src/app/api/ats/analytics/route.ts` | entire response | production mock |
| `src/app/api/ats/pipeline/route.ts` | entire response | production mock |
| `src/app/api/ats/candidates/route.ts` | GET response + POST job lookup | production mock |
| `src/app/api/ats/score/route.ts` | job contract lookup | production mock |
| `src/app/api/candidate/applications/route.ts` | **silent fallback** for job title/dept/location | production mock fallback |
| `src/components/ats/InterviewPlannerClient.tsx` | **hardcoded fabricated interviews** — see below | production fake data |
| `src/lib/ats/__tests__/production-boundary.test.ts` | assertion strings | legitimate (test) |

`src/app/api/candidate/applications/route.ts` is the subtlest: it queries the real
database first and then does `dbJob?.title ?? mockJob?.title ?? "Unknown Position"`.
A DB miss is silently papered over with fixture text shown to a real candidate.
This is exactly the "silent fallback to mock in production" the brief forbids.

### `InterviewPlannerClient.tsx` — the worst of the three, and it imports nothing

A `grep` for `mock-data` under-reports this file, because it does not import the
fixture — it **contains one**. The component calls `/api/ats/pipeline`, discards
the response entirely (`.then(() => { … })`), and renders a hardcoded
`STATIC_INTERVIEWS` array of invented people and interviewers, complete with a
comment claiming the list is trustworthy because it is deterministic:

```ts
fetch("/api/ats/pipeline")
  .then(() => {
    // …we inline a deterministic list
    // derived from the known interview data (no AI, no hallucination)
    const STATIC_INTERVIEWS: Interview[] = [ /* invented names, dates, notes */ ];
```

Determinism is not truthfulness. This is fabricated hiring data on a production
surface, and because the fetch result is thrown away, the interviews page will
keep displaying these invented candidates even after every API behind it is
wired to PostgreSQL. **A future "we removed all mock imports" check would pass
on this file while it is still the most misleading one.** Any real-data
migration must delete this array, not just re-point the fetch.

**Non-ATS mock surfaces found (OUT OF SCOPE, recorded only):** `lib/crm`,
`lib/erp`, `lib/document`, `lib/automation`, and six `/api/customers/*` routes.
They are not touched by this programme.

### Existing boundary gate and why it did not catch this

`src/lib/ats/__tests__/production-boundary.test.ts` already performs a static
import audit — but its `DISCOVERY_SURFACES` list covers only **search-engine-visible**
modules (sitemap, robots, llms.txt, careers pages, SEO schemas, admin SEO).
**No `/api/ats/*` route is in that list.** The gate is sound; its scope is narrower
than the brief assumes. Stage 7's regression test must extend this list rather than
create a competing one.

---

## 4. What is genuinely production-grade already (preserve, do not rewrite)

| Surface | State |
| --- | --- |
| `/api/ats/jobs` GET+POST | Real. `getAuthRole` → `can(role,"authoring")` → `resolveOrgContext` → org-scoped `getOrgJobs`. POST uses `createJobDraftInputSchema.omit({organizationId}).strict()` — client-supplied `organizationId`, `status`, `isPublic` are 400s. DRAFT-only, EN/DE/FA translations in one transaction, typed audit. |
| `/api/ats/interviews` POST | Real. Staff-role gate, then `requireOrgActor(req, application.organizationId)`, and returns **404** (not 403) on cross-tenant — correct information-leak posture. |
| `/api/ats/applications/[id]/status` PATCH | Real, authenticated. |
| `/api/careers/apply` POST | Hardened: IP rate limit, `Content-Type` check, bounded body (32 KiB), strict Stage-1 Zod schema, idempotency key validation, uniform `503` refusal that enumerates nothing. |
| `/api/candidate/*` | Authenticated via `getTokenUser()` with an explicit `role !== "candidate"` rejection. (An early pass of this audit mis-flagged these as unauthenticated — the grep pattern missed `getTokenUser`. Corrected.) |
| `src/lib/ats/db.ts` | 18 typed functions, every query hard-filters `deletedAt IS NULL`. |
| `src/lib/ats/eligibility.ts` | `publicJobWhere()` — single source of publishability truth. |

---

## 5. Prisma baseline and the gap to the brief

Existing models (`prisma/schema.prisma`, lines 2439–2780): `AtsJobStatus`,
`AtsApplicationStatus`, `AtsInterviewType`, `AtsInterviewDecision`, `AtsJob`,
`AtsJobLanguage`, `AtsJobTranslation`, `AtsCandidate`, `AtsApplication`,
`AtsInterview`, `AtsPipelineEvent`, `AtsCandidateScore`.

### `AtsCandidateScore` cannot express the brief's Stage 4 contract

Present: six dimension ints, `overallScore`, `riskFlags`, `explanations`,
`scoredAt`, `scoringVersion`.

**Absent — every one required by Stage 4:** `recommendation`
(`ADVANCE`/`REVIEW_REQUIRED`/`HOLD`/`REJECT_RECOMMENDED`), `confidence`,
`hardGateResults`, `missingEvidence`, `contradictoryEvidence`, `modelVersion`,
`promptVersion`, `policyVersion`, `humanReviewStatus`, `reviewerId`,
`reviewerDecision`, `reviewerReason`.

There is also **no `PENDING_HUMAN_APPROVAL` state** anywhere in
`AtsApplicationStatus`, so the brief's mandatory Stage Gate has no representation.

### `upsertScore()` has ZERO consumers

`src/lib/ats/db.ts:561` defines `upsertScore()`. A repository-wide grep finds
**no caller**. `/api/ats/score` computes a score from a *fixture* job and returns it
to the client without ever writing a row. Scoring is currently non-persistent and
non-auditable.

### Migration risk

77 applied migrations. The two ATS ones are
`20260731000000_phase58b_ats_persistence` and
`20260824000000_phase104_b1_recruitment_foundation`. Both are already applied in
production and **must not be edited**. All new work is additive-only, in new
migration files, with tenant indexes. No backfill of `AtsCandidateScore` is
possible without inventing evidence, so new evidence columns must be nullable or
default to an explicit `UNKNOWN` — never to a guessed value.

---

## 6. Authorization helper reality vs. CLAUDE.md

`CLAUDE.md` instructs that `requireActor`, `requirePermission`, `requireSiteActor`
and `requireSitePermission` must not be bypassed, and adds "use the repository's
current equivalents if these names have changed." Measured:

| CLAUDE.md name | Exists | Actual module |
| --- | --- | --- |
| `requireActor` | **NO** | — use `requireOrgActor` / `resolveOrgContext` |
| `requirePermission` | yes | `src/lib/org/rbac.ts` |
| `requireSiteActor` | yes | `src/lib/site/context.ts` |
| `requireSitePermission` | yes | `src/lib/site/rbac.ts` |

Canonical org-scoping helpers for this programme:
`resolveOrgContext(req)` (`src/lib/billing/context.ts`, returns a typed refusal),
`requireOrgActor(req, orgId)` (`src/lib/org/context.ts`), and the `refuse()` helper
in `src/lib/auth/context-result.ts` used by `/api/ats/jobs`.

### Weak tenant resolution in `/api/ats/interviews` GET

It resolves the tenant by hand-rolled "first `OrganizationMember` ordered by
`createdAt asc`", and on failure returns `200 {interviews: [], total: 0}` instead of
failing closed. For a multi-org user this silently answers for an arbitrary org, and
an empty list is indistinguishable from "no access". Should adopt
`resolveOrgContext` and a typed refusal.

---

## 7. Permission matrix — measured (`src/lib/auth/roles.ts`)

| Role | authoring | admin | superadmin | dashboard | billing_admin | org_admin | api_admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| superadmin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| engineer | ✓ | — | — | ✓ | — | — | — |
| customer | — | — | — | ✓ | — | — | — |
| viewer | — | — | — | — | — | — | — |
| candidate | — | — | — | — | — | — | — |
| vendor | — | — | — | ✓ | — | — | — |

**Gap vs. the brief.** The brief requires distinct `recruiter`, `hiring manager`,
`interviewer`, `HR manager` and `finance` actors. The capability model has none of
them: every ATS management route currently gates on the single broad `authoring`
capability, which **`engineer` also holds**. Today any engineer can read the entire
recruitment pipeline. Least-privilege for hiring needs either new capabilities
(`recruiting_read`, `recruiting_write`, `recruiting_decide`, `recruiting_admin`) or
an ATS-local role table. This is a design decision requiring owner input — it is
**not** something to infer.

---

## 8. Validation commands — availability check

`package.json` measured. The brief's sequence is **partly unavailable as written**:

| Brief command | Exists | Note |
| --- | --- | --- |
| `npm run db:validate` | ✓ | `prisma validate` |
| `npx tsc --noEmit` | ✓ | binary present |
| `npm test -- --run` | ✓ | `test` = `vitest run` (`--run` is redundant but harmless) |
| `npm run lint` | ✓ | `next lint` |
| `npm run build` | ✓ | `next build` |
| `npm run typecheck` | **✗ DOES NOT EXIST** | CLAUDE.md's preferred sequence names it; use `npx tsc --noEmit` |

No command in this audit phase was run beyond `git`, `grep`, `find` and `node -e`
reading `package.json`. **No lint, typecheck, test or build result is claimed.**

---

## 9. Implementation plan (proposed — awaiting owner approval)

Ordered so that no step can create an exposure that a later step is meant to close.

**S0 — Authorization first (no DB wiring). — DELIVERED on this branch, see §12.**
Capability gate on `overview`, `analytics`, `pipeline`, `candidates` GET while they
still serve fixtures, plus the 401/403 contract tests. *Closes §2 without touching
data.*

Two things deliberately NOT done in S0, against the first draft of this plan:

- **`resolveOrgContext` was not added.** Resolving a tenant for a handler that then
  returns organization-independent fixture rows would look like tenant isolation
  while isolating nothing. Org scoping belongs in the same change as the real
  queries, where it can constrain a `WHERE` clause. This is stated in the guard's
  own header so the omission cannot be read as an oversight.
- **`production-boundary.test.ts` was not extended to `/api/ats/*`.** That test
  asserts a file does not import the fixture, and these four routes still do — by
  design, until S2. Adding them now would make the suite red and the honest fix
  would be to delete the assertion. The list is extended when the imports go.

**S1 — Stage-Gate + evidence schema.** One additive migration: `PENDING_HUMAN_APPROVAL`
in the application status enum; `AtsCandidateScore` gains recommendation, confidence,
hard-gate, missing/contradictory evidence, model/prompt/policy version and human-review
columns; new `AtsReviewDecision`, `AtsJobCriterion`, `AtsCandidateEvidence`,
`AtsHardGateResult`, `AtsAiRun`. Tenant indexes on every table. No backfill.

**S2 — Domain services.** Typed, org-scoped repositories replacing fixture reads;
`upsertScore()` wired into a real `/api/ats/score` that loads job + application from
the DB. Fail closed and visible when the DB is unavailable — never fall back to fixture.

**S3 — Job contract + role-specific rubrics** for the five target roles, EN/DE/FA.

**S4 — Resume evidence + parsing** with `source`/`evidenceSpan`/`confidence`/
`extractedAt`/`extractorVersion`/`verifiedBy`, upload allowlist and private storage.

**S5 — Interview kits** for the five roles, append-only audit.

**S6 — B2 apply orchestration** (§1) — the actual unblocker for hiring.

**S7 — Test suites** per brief Stage 7, then the full validation sequence.

**S8 — Deploy:** NOT attempted. See §10.

---

## 10. Open questions — fail closed, no assumed values

These block specific stages and are **business or infrastructure decisions, not
engineering ones**. No default has been assumed for any of them.

1. **`APPLICATION_ACCEPTANCE_AUTHORIZED`** — flipping this is the owner's decision
   and also requires an APPROVED retention-policy record. Confirm explicitly.
2. **Recruitment roles** — add ATS capabilities to `roles.ts` (platform-wide blast
   radius) or an ATS-local role table (isolated)? §7 has no answer in the code.
3. **Should `engineer` retain pipeline access?** Today it does, via `authoring`.
4. **Resume storage target** — no private blob store is configured for CVs. Local
   disk, S3/OVH object storage, or DB bytes? Not inferable.
5. **AI provider + consent policy** for scoring. Brief §6 requires policy/consent
   before any candidate data leaves the platform. No provider is designated.
6. **Salary ranges, headcount and sponsorship** for the five roles — real business
   data that does not exist in the repo. Publishing a job without them is prohibited
   by the brief's own "unknown never becomes an assumed value" rule.
7. **Deploy target.** The brief asks whether a separate recruitment server exists.
   Unknown. No SSH to an unidentified host will be attempted.

---

## 11. What this branch actually contains (S0 only)

### Changed files

| File | Change |
| --- | --- |
| `src/lib/ats/management-guard.ts` | **new** — `requireRecruitmentReader()`, the shared 401/403 gate |
| `src/app/api/ats/overview/route.ts` | gate added; `no-store`; header states it is still fixture-backed |
| `src/app/api/ats/analytics/route.ts` | same |
| `src/app/api/ats/pipeline/route.ts` | same |
| `src/app/api/ats/candidates/route.ts` | same — closes the GET/POST asymmetry |
| `src/lib/ats/__tests__/management-surface-authz.test.ts` | **new** — 17 assertions |
| `src/components/ats/AtsOverviewClient.tsx` | check `r.ok` before `r.json()` |
| `src/components/ats/AtsAnalyticsClient.tsx` | same |
| `src/components/ats/PipelineBoardClient.tsx` | same |
| `src/components/ats/CandidateListClient.tsx` | same, plus a distinct `unavailable` state |
| `docs/ats/ATS_BASELINE_AUDIT.md` | **new** — this document |

### The client changes are a regression fix, not polish

Adding the gate created a defect that had to be repaired in the same change.
`/[locale]/dashboard/ats` is protected by the `dashboard` capability, which
`customer` and `vendor` also hold — so those roles can open the ATS dashboard.
The clients did `.then(r => r.json())` with no `r.ok` check, so the new 403 body
`{error, code}` was cast to `AtsOverview`, leaving `byStage` undefined, and
`Math.max(...Object.values(data.byStage), 1)` **throws a TypeError**. Before the
gate those roles saw fixture recruitment data; without this fix they would have
seen a crashed page.

Each client now falls through to the "unavailable" state it already had, so **no
new translation keys were needed and no fa/en/de catalog changed.**
`CandidateListClient` got a distinct `unavailable` flag rather than reusing its
empty result, because "you may not read this" and "your search matched nothing"
are different answers and must not render identically.

### Validation actually executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** — clean, exit 0 |
| `npm run lint` | **PASS** — 0 errors; 0 warnings on any changed file (pre-existing warnings elsewhere untouched) |
| `npm run db:validate` | **PASS** — schema valid (unchanged by this branch) |
| `npx vitest run src/lib/ats src/lib/security src/app/api/careers` | **PASS** — 285/285 |
| `npx vitest run …/management-surface-authz.test.ts` | **PASS** — 17/17 |
| `npm test` (full suite) | **12924 passed, 1 failed, 145 skipped** — see below |
| `npm run build` | **PASS** — full route table emitted, 978/978 static pages prerendered, zero `Failed to compile` / `Type error` / `npm ERR` |

The build result was read from the log's **content**, not from its exit status.
The command was `npm run build … | tee … | tail`, and without `set -o pipefail`
a pipeline reports the exit code of its LAST stage — `tail`, which returns 0
whatever npm did. "exit code 0" on that invocation proves nothing. The evidence
used instead is the emitted route table (`Route (app)`, `First Load JS shared by
all`, the `ƒ`/`○`/`●` legend) plus a grep finding no failure marker.

All four hardened routes appear as `ƒ` (server-rendered on demand), which is the
expected consequence of reading cookies for the auth check, and the three
`/[locale]/dashboard/ats*` pages still prerender for `fa`, `en` and `de`.

### The one failing test is pre-existing and environmental

`src/lib/dashboard-demo/__tests__/phase109b0-retirement.test.ts › has no
/api/telemetry route module` fails because `src/app/api/telemetry/` exists on
this machine as an **empty directory**, and the test uses `existsSync()` on the
directory itself.

It is not caused by this branch and would not fail in CI:

- the path is **not tracked at `origin/main`** (`git ls-tree` finds nothing);
- it is **not in this branch's changes**;
- git cannot track empty directories, so `git status` does not show it at all —
  which is exactly why it survived the Phase 109-B0 retirement cleanup;
- its mtime is 2026-09-12, eleven days before this session.

It is leftover local state. Removing it is a deletion of an untracked path, so it
was **not** done without approval.

### Proof that the new test discriminates

The suite was re-run with the guard deliberately bypassed in
`/api/ats/pipeline` (`void requireRecruitmentReader;`). Exactly the four pipeline
assertions failed — the 401, both 403s, and the `no-store` refusal check — while
the other 13 still passed. The guard was then restored and all 17 passed again.
A test that cannot fail proves nothing; this one fails for the right reason.

### What is explicitly NOT done

Stages S1–S8 are untouched. In particular: no schema change, no migration, no
`PENDING_HUMAN_APPROVAL`, no evidence model, no scoring persistence, no resume
parsing, no interview kits, no B2 apply orchestration, and **no deployment**. The
four routes still serve fixtures and are still not tenant-scoped, which their
headers now say out loud. Of the eight deliverables the brief lists, only
`ATS_BASELINE_AUDIT.md` exists; the other six documents belong to stages that have
not started.

---

## 12. Honest limitations of this audit

- Static analysis only. No server was started, no database queried, no test run.
- The 78 other worktrees were listed but not inspected; ATS work may exist in one.
- `src/lib/ats/mock-data.ts` content was not read in full (line count only).
- The claim "no live PII exposure today" rests on those four routes reading only
  fixtures at `1c7aa405…`; it would stop being true the moment they query the DB.
