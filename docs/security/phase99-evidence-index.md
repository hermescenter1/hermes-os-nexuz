# Phase 99 — Evidence Index

Every artefact Phase 99 produces, what it proves, and how to regenerate or
verify it. Where a number is quoted below it reflects the artefact as it
stood when this index was written — the artefacts themselves, not this
prose, are authoritative; regenerate before relying on a figure.

## Machine-readable evidence (`docs/security/`)

| Artefact | Proves | Regenerate / verify |
|---|---|---|
| `phase99-route-security-inventory.json` | Every API handler's classification, its authorization evidence, whether it is declared on a public/webhook/health allowlist, whether it is tenant-scoped, and whether it mutates state. The `tenantCoverage` block carries the current tenant-identity and object-scope coverage percentages. | `node scripts/security/phase99/generate-inventory.mjs` to write; `... --check` to detect drift against the source tree (exits non-zero on mismatch). |
| `phase99-findings.json` | The sanitized internal finding register: every defect found during Phase 99's own review (`P99-INT-*`) and every dependency advisory (`P99-DEP-*`), each with severity, status, remediation and retest references. Explicitly does **not** carry external-review or pilot-blocker findings at exploit-detail level — see `phase99-finding-handling.md`. | Hand-authored; internal consistency (severities, statuses, closure rules, evidence-hash integrity) is checked by the `FINDING_GOVERNANCE` group of `npm run eval:phase99:readiness`. |
| `phase99-dependency-review.json` | A sanitized `npm audit` snapshot against the committed `package-lock.json`: per-package severity, advisory URLs (already public), whether the package is direct or transitive, whether a fix is available without a major bump, and whether it is reachable in the production dependency tree. | `node scripts/ci/phase99-dependency-review.mjs`; checked by the `DEPENDENCY_REVIEW` group. |

## Generated readiness output (repository root)

| Artefact | Proves | Regenerate |
|---|---|---|
| `phase99-readiness.json` | The full internal-readiness result: every group's state (`PASS` / `BLOCKED_OWNER` / `FAIL`), the detail counters behind each, and the overall result. This is generated output, not a hand-authored claim — a stale copy should never be trusted over a fresh run. | `npm run eval:phase99:readiness` (`scripts/ci/phase99-security-readiness-eval.mjs`). |

## Documentation package (`docs/security/`, repository root `SECURITY.md`)

`phase99-architecture-and-plan.md`, `phase99-external-review-scope.md`,
`phase99-rules-of-engagement.md`, `phase99-attack-surface-inventory.md`,
`phase99-test-matrix.md`, `phase99-finding-handling.md`,
`phase99-evidence-index.md` (this file), `phase99-external-review-intake.md`,
and `SECURITY.md` at the repository root. Their existence and required
content (the rules-of-engagement terms, the `PENTEST_TARGET` marker) are
checked by the `EXTERNAL_REVIEW_PACKAGE` group of
`npm run eval:phase99:readiness`.

## Regression tests (`src/lib/security/__tests__/`)

| Artefact | Proves |
|---|---|
| `phase99-remediation.test.ts` | Reproduces each internal finding (`P99-INT-001` through `P99-INT-013`, excluding the two not remediated in Phase 99) against the shape that existed on the Phase 98 head, and proves the fix. Referenced as `retestReference` by the matching entries in `phase99-findings.json`; `evidenceHash` on those entries is the SHA-256 of this file (LF-normalised) at the moment the finding was closed, and is re-verified on every readiness run. |
| `phase99-static-invariants.test.ts` | Locks in the static invariants (no unsafe raw SQL, no user-controlled outbound sink, no unsanitised raw-HTML sink, every upload route bounded, the CSRF cookie/GET-mutation contract, zero `UNKNOWN` route classifications, every webhook authenticated, the infrastructure baseline) and the remediation *shapes* that are code-structure facts rather than response values (`P99-INT-008`, `P99-INT-009`/`P99-INT-012`, `P99-INT-013`, `P99-INT-001`/`P99-INT-002`). |

## Evaluators and their composed modules (`scripts/ci/`, `scripts/security/phase99/`)

`scripts/ci/phase99-security-readiness-eval.mjs` (internal readiness, §2 of
`phase99-architecture-and-plan.md`) composes: `route-inventory.mjs` (route
classification), `tenant-predicates.mjs` (tenant isolation + IDOR analysis),
`static-invariants.mjs` (SQL injection, SSRF, XSS, upload, cookie/CSRF, error
hygiene, infrastructure), `public-surface.mjs` (the justified public/webhook/
health allowlists), `finding-contract.mjs` (finding-register governance),
`external-evidence.mjs` (external-attestation and pilot-acceptance
validators), `data-hygiene.mjs` (adversarial scan of every Phase 99 artefact
for credentials, exploit payloads, the production IP address, or other
material that must never reach a public repository). `generate-inventory.mjs`
produces the committed route inventory. `scripts/ci/phase99-dependency-review.mjs`
produces the dependency snapshot.

## Not yet produced — closure evidence

These do not exist yet, and their absence is expected and correctly reported
as `BLOCKED` rather than `FAIL` or a fabricated `PASS`:

| Placeholder artefact | Would prove | Schema |
|---|---|---|
| `docs/security/phase99-external-attestation.json` (not yet created) | That an independent, human-attributed security review actually happened against a specific commit and scope, with sanitized severity counts and a hash-referenced raw report. | `phase99-external-review-intake.md`; validated by `validateExternalAttestation` in `external-evidence.mjs`. |
| `docs/pilot/phase99-acceptance.json` (not yet created; the wider `docs/pilot/` package itself does not exist yet) | That a real prospective customer operated the platform end to end and formally accepted or rejected the result. | Validated by `validatePilotAcceptance` in `external-evidence.mjs`. |

Both validators reject a record marked `SYNTHETIC_TEST_FIXTURE` and reject a
reviewer/acceptance role that names an agent or automation rather than a
human — see `phase99-architecture-and-plan.md` §3, "The truth boundary."
`npm run eval:phase99:closure`, the official phase-closure gate, is
`BLOCKED` for exactly as long as both of these remain absent.
