# Phase 97 — Assurance Report

> This software provides compliance-control evidence and workflows.
> **It is not legal advice and does not certify compliance.**

Assurance record for the delivered Phase 97 compliance control plane (evidence packs +
Compliance Operations Center), Draft PR #43 (stacked on Draft PR #42). Both PRs remain
Draft; nothing merged, deployed or sent to any external party.

## 1. Local validation (executed)

| Gate | Command | Result |
|---|---|---|
| Working tree | `git diff --check` | clean |
| Prisma client | `npx prisma generate` | ok |
| Schema | `npm run db:validate` | valid |
| Type check | `npx tsc --noEmit` | 0 errors |
| Lint | `npm run lint` | 0 errors (pre-existing warnings only, unrelated files) |
| Phase 95 eval | `npm run eval:phase95` | PASS (offline) |
| Phase 96 eval | `npm run eval:phase96` | PASS (offline) |
| Phase 97 eval | `npm run eval:phase97` | PASS — 14 invariant groups, secret-leak scan clean, 16 files / 287 tests |
| Full unit suite | `npm test` | PASS — 0 failed |
| Production build | `npm run build` | exit 0 — all 10 `/[locale]/compliance/*` pages built for fa/en/de |

## 2. PostgreSQL rehearsal (real `pgvector/pgvector:pg16`)

The new evidence-pack migration + suite were rehearsed against a disposable real
PostgreSQL 16 (pgvector) instance this session:

- **Fresh deployment through migration `20260820000017`** — `prisma migrate deploy` applied
  all 18 migrations (00–17) cleanly on an empty database.
- **Constraint smoke** — scope/target CHECK rejects a target on ORGANIZATION scope; the
  composite scope FK rejects a cross-tenant target; the `(org, idempotencyKey)` unique holds;
  a malformed manifest hash is rejected; the READY-immutability trigger rejects a manifest
  mutation; the item trigger rejects UPDATE and DELETE; a governed READY→REVOKED preserves
  evidence.
- **Full evidence-pack PG suite** (`evidence-pack-linearization.pg.test.ts`) — 11/11 PASS:
  deterministic manifest hash (same data → same hash), idempotent create+generate (one
  authoritative pack per key), held-lock two-finalizer barrier (exactly one finalization,
  no partial items), READY + item immutability, governed revocation preserving evidence,
  historical hash unchanged after source data changes, cross-tenant target rejected,
  foreign-tenant read → null, INCIDENT-scope generation.

The complete multi-file compliance PostgreSQL suite (lineage, concurrency, evidence) and
the second-deploy idempotency check run in the dedicated CI job
`.github/workflows/phase97-compliance-assurance.yml → phase97-postgres` on a fresh
`pgvector/pgvector:pg16` service. (A local full-suite re-run at the end of the session was
interrupted by a Docker Desktop daemon restart on the host; the new migration + evidence
suite rehearsal above is the local record, and the CI job is the reproducible gate.)

## 3. Security invariants (upheld)

Tenant isolation (every route predicated on the server-derived `organizationId`; composite
same-org FKs make a cross-tenant pack/item/target impossible); strict input (client
organizationId/actor/lifecycle/readiness/hash/snapshot/itemCount rejected); deterministic
manifest hashing (order- and duplicate-invariant; stored hash immutable); atomic
finalization (no partial READY, one finalizer); READY + item immutability (DB triggers);
governed revocation preserving evidence; no raw personal data / body / contract /
`sensitiveSummary` / secret in any manifest or item (safe columns only are selected);
server-authoritative RBAC (OWNER-only generation/revocation; a 401/403 renders the
unauthorized state); no destructive-execution control exposed; no legal-compliance /
certification claim; strict FA/EN/DE localization parity. The offline evaluator is
fail-closed (any failed/skipped group fails the run).

## 4. Adversarial review

A multi-agent adversarial review swept the diff across tenant/target, evidence-leak,
integrity/immutability and UI/CI/legal dimensions, with an independent verify pass on every
raw finding. Result: recorded in the PR checkpoint comment.

## 5. Safety posture

`PRODUCTION_CONTACTED=False`, `PROVIDER_CONTACTED=False`, `CUSTOMER_CONTACTED=False`,
`REGULATOR_CONTACTED=False`, `NOTIFICATION_SENT=False`,
`DESTRUCTIVE_RETENTION_EXECUTED=False`, `PRODUCTION_EXPORT_EXECUTED=False`,
`PRODUCTION_ERASURE_EXECUTED=False`, `DEPLOYED=False`, `MERGED=False`. Migration 17 is
additive-only; migrations 00–16 are unmodified.
