# Phase 99 — External Security Review & Pilot Acceptance: Architecture and Plan

**Status:** Documentation and internal-readiness tooling only. No external
penetration test, no external application/API security review and no pilot
customer acceptance has taken place. This document does not claim otherwise
anywhere below.

**Scope of this phase:** produce a review package that a real, independent
security firm can act on, and build the machinery that keeps this repository
honest about the difference between work the engineering team can finish by
itself and evidence that only an external party can supply.

Companion documents (all under `docs/security/` unless noted):

- `phase99-external-review-scope.md` — what is in and out of scope for an
  independent reviewer.
- `phase99-rules-of-engagement.md` — the binding rules a reviewer must follow.
- `phase99-attack-surface-inventory.md` — narrative companion to the route
  inventory, with the unauthenticated write surfaces enumerated.
- `phase99-test-matrix.md` — per-area invariant, internal proof and
  independent-attempt guidance.
- `phase99-finding-handling.md` — severity, status and closure rules for
  findings from any source.
- `phase99-evidence-index.md` — index of every Phase 99 artefact.
- `phase99-external-review-intake.md` — the intake procedure for a real
  reviewer engagement.
- `SECURITY.md` (repository root) — the public vulnerability-disclosure
  policy.

Phase 99 references rather than repeats: `docs/release/slo-sli-contract.md`
and `docs/release/incident-response-runbook.md` (Phase 93) for availability
and incident handling, and the Phase 97 compliance/privacy control plane and
Phase 98 disaster-recovery and release-engineering documents for their
respective domains. None of those are re-derived here.

## 1. Internal readiness vs. external acceptance

Phase 99 deliberately keeps two questions separate, because collapsing them
is how a codebase ends up self-certifying its own security posture:

**Internal readiness** asks: has the engineering team finished the work that
must be true *before* it is reasonable to ask an external reviewer or a pilot
customer to spend their time? That includes a complete, drift-checked route
inventory; static proof of specific invariants (no user-controlled raw SQL,
no user-controlled outbound destination, no unsanitised raw-HTML sink, no
state-changing GET, bounded and rate-limited public writes, authenticated
webhooks, a non-root container, no published data-service ports); a finding
register that is internally consistent (no critical risk-acceptances, no
closed-without-retest findings, no agent-authored risk acceptance); and a
reviewed, sanitized dependency-advisory snapshot. All of this is provable
from inside the repository, offline, deterministically.

**External acceptance** asks a different question entirely: did an
independent human reviewer actually attempt to break the system, and did a
real prospective user actually operate it end to end and accept the result?
Neither question can be answered by static analysis, by a test suite, or by
an engineering agent asserting that the code "looks secure." They require a
human authority external to the team that wrote the code.

## 2. The two evaluators

Phase 99 ships two distinct gates so the difference in §1 is enforced
mechanically rather than left to prose:

- **`npm run eval:phase99:readiness`** (`scripts/ci/phase99-security-readiness-eval.mjs`)
  is the **internal** evaluator. It is offline, deterministic and
  fail-closed, and it may legitimately reach `PASS`. It checks the route
  inventory, tenant-isolation and IDOR coverage, authentication/session
  hygiene, application and API security, business-logic mass-assignment
  shapes, rate-limiting, file upload, SSRF, XSS, CSRF, SQL injection, the
  dependency-advisory snapshot, infrastructure configuration, finding-register
  governance, the existence and shape of this documentation package, the
  external-evidence *contract* (proving that a synthetic or agent-attributed
  attestation is mechanically rejected — not that a real one exists), the
  pilot readiness package, and public-repository data hygiene across every
  Phase 99 artefact. It writes `phase99-readiness.json` at the repository
  root with three possible states per check: `PASS`, `BLOCKED_OWNER` (the
  technical work is done but a decision only the owner can make is
  outstanding — a dependency upgrade, a pilot customer selection), and
  `FAIL`. `BLOCKED_OWNER` is never silently upgraded to `PASS`.

- **`npm run eval:phase99:closure`** is the **official** phase-closure gate.
  It is the one that determines whether Phase 99 is actually done, and it
  stays `BLOCKED` until real external evidence exists: a sanitized external
  review attestation that passes `validateExternalAttestation` in
  `scripts/security/phase99/external-evidence.mjs` (bound to the exact commit
  SHA reviewed and to the exact scope-document hash), and a sanitized pilot
  acceptance record that passes `validatePilotAcceptance` in the same module.
  Both validators reject a record marked `SYNTHETIC_TEST_FIXTURE`, reject a
  `reviewerRole` or `acceptanceAuthorityRole` that names an agent or
  automation rather than a human (`isHumanAuthorityRole` in
  `scripts/security/phase99/finding-contract.mjs`), and resolve absent
  evidence to `BLOCKED` — never to `PASS`. Nothing this repository's own
  tooling produces can make this gate pass. It requires the owner to run a
  real engagement and record its sanitized result.

## 3. The truth boundary

This is the load-bearing rule of Phase 99 and it is stated here explicitly so
it cannot be diluted by later edits:

> The engineering agent that wrote this code and these documents is **not** a
> licensed penetration tester, **not** a pilot customer performing user
> acceptance testing, and **not** an authority that can accept risk or sign
> off a release. Every artefact this repository can produce on its own —
> the route inventory, the static invariants, the finding register, the
> regression tests, the dependency snapshot — is *internal engineering
> evidence*. It can make the internal readiness evaluator pass. It cannot,
> by construction, satisfy the closure evaluator, because the closure
> evaluator specifically checks for evidence this repository is structurally
> incapable of producing about itself.

Concretely, that means:

- No finding in `docs/security/phase99-findings.json` is sourced as
  `EXTERNAL_PENETRATION_TEST`, `EXTERNAL_APPLICATION_SECURITY_REVIEW` or
  `EXTERNAL_API_SECURITY_REVIEW` — only `INTERNAL_REVIEW`,
  `INTERNAL_REGRESSION`, `DEPENDENCY_REVIEW` and `INFRASTRUCTURE_REVIEW`
  appear, because those are the only sources this phase actually produced.
- No `docs/security/phase99-external-attestation.json` or
  `docs/pilot/phase99-acceptance.json` exists yet. Their schemas are
  documented (`phase99-external-review-intake.md`) so the owner and a real
  reviewer know exactly what to produce, but producing one is outside the
  scope of what this repository's own tooling does.
- Any HIGH-severity finding closed by risk acceptance requires
  `ownerAuthorityRole` to name a human role; the validator in
  `finding-contract.mjs` rejects `agent`, `automation`, `bot`, `ai`, `llm`,
  `copilot`, `self` and similar tokens outright.

## 4. Artefact map

**Documentation (this package, `docs/security/` + repository-root `SECURITY.md`):**
`phase99-architecture-and-plan.md` (this file), `phase99-external-review-scope.md`,
`phase99-rules-of-engagement.md`, `phase99-attack-surface-inventory.md`,
`phase99-test-matrix.md`, `phase99-finding-handling.md`,
`phase99-evidence-index.md`, `phase99-external-review-intake.md`, `SECURITY.md`.

**Machine-readable evidence (`docs/security/`):**
`phase99-route-security-inventory.json` (every handler, its classification and
its authorization evidence — regenerated by
`scripts/security/phase99/generate-inventory.mjs`, drift-checked with
`--check`), `phase99-findings.json` (the sanitized finding register),
`phase99-dependency-review.json` (the sanitized `npm audit` snapshot).

**Evaluators (`scripts/ci/`, `scripts/security/phase99/`):**
`scripts/ci/phase99-security-readiness-eval.mjs` (internal readiness, §2),
`scripts/ci/phase99-dependency-review.mjs` (produces the dependency snapshot),
and the pure-logic modules it composes: `route-inventory.mjs`,
`tenant-predicates.mjs`, `static-invariants.mjs`, `public-surface.mjs`,
`finding-contract.mjs`, `external-evidence.mjs`, `data-hygiene.mjs`,
`normalization.mjs`.

**Regression tests (`src/lib/security/__tests__/`):**
`phase99-remediation.test.ts` (reproduces each internal finding against the
unfixed shape and proves the fix), `phase99-static-invariants.test.ts` (locks
in the static invariants and the remediation shapes that are code-structure
facts rather than response values).

**Not yet produced — the closure evaluator's actual subject matter:** a
sanitized external-review attestation and a sanitized pilot-acceptance
record, per the schemas in `phase99-external-review-intake.md`. Both require
owner action outside this repository's tooling.

## 5. Open items requiring an owner decision

These are recorded as findings (`docs/security/phase99-findings.json`) rather
than resolved here, because each is a decision this documentation package is
not authorised to make:

- Seven HIGH-severity dependency advisories are open against the committed
  lockfile (`P99-DEP-001` through `P99-DEP-007`); clearing them needs either
  an in-range lockfile update or, for `next`/`postcss`/`sharp`, a framework
  major-version upgrade.
- One MEDIUM finding (`P99-INT-011`) documents an unbounded, unmemoized
  derived-graph read reachable from anonymous endpoints; the two candidate
  remediations change product behaviour and are left for owner selection.
- Selecting and engaging an independent security firm, provisioning the
  authorised non-production target it will test against, and selecting a
  pilot customer are all owner actions with no internal substitute — see
  `phase99-external-review-intake.md` and
  `phase99-rules-of-engagement.md`.
