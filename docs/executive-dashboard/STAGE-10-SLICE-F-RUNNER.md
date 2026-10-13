# Executive Management Center — Slice F: the nightly runner, made complete and shippable

Status: **CODE AND PACKAGING DONE AND TESTED, NOT YET MERGED; NOT RUNNING IN PRODUCTION**
Date: 2026-10-13
Branch `feature/executive-slice-f-runner`, stacked on slice E (PR #136).

Requirement row 10 in `REQUIREMENTS-TRACKER.md`. It stays `PARTIAL` on purpose: the
runner is now correct for any number of tenants and is packaged like every
other worker, but **it is not scheduled in production until an operator gives
it a credential and starts it** (§5). Until a real production run has produced
a report, the nightly report is not "automatic in production".

---

## 1. Defects closed

| # | Defect | Effect before | Now |
| --- | --- | --- | --- |
| 1 | `organization.findMany({ orderBy: id, take: 50 })`, no cursor | Organizations after the 50th were **never** reported, every pass re-read the same 50 | Each pass takes one bounded batch **after a cursor** and returns `nextAfterOrganizationId`; the runner chains passes until it is null |
| 2 | Lease never released | Every pass held the lease 120 s after finishing; a chained request (new holder) could never take it | Released (fenced) in `finally` at the end of every pass |
| 3 | Lease never renewed | A batch slower than 120 s let a second replica start redundant work | Renewed after a third of the TTL; a lost lease stops the batch, reports `leaseLost`, and the cursor resumes exactly where it stopped |
| 4 | Notify claim spent with nobody told | With no active owner, or a failed send, the row said *notified* and no pass ever tried again | If nobody received it the claim is **given back** (fenced on its own timestamp) and the pass lists it under `undelivered` with `NO_RECIPIENT` or `DELIVERY_FAILED`; the runner logs it as a warning |
| 5 | Retry impossible | A notification was only attempted when a report was **created** | An existing report whose `notifiedAt` is null is retried; one already announced costs nothing |
| 6 | Only the first owner told | `findFirst({ role: OWNER })` | Every active **owner and administrator**, deduplicated, at most 25 |
| 7 | Not shippable | No Dockerfile stage, no compose service, `scripts/` excluded from the image context | Stage `executive-report-worker` (one file, no `node_modules`, no Prisma, `USER worker`), service `hermes-executive-report-worker`, a one-file `.dockerignore` re-include |
| 8 | Ran blind | With no token the runner logged a 401 every interval | Exits 2 at startup with a message, like its siblings |
| 9 | Windows exit assertion | `process.exit()` while sockets closed tripped libuv `UV_HANDLE_CLOSING` | `process.exitCode`; the executed test asserts a clean exit |

## 2. The contract, end to end

```
runner (loop or --once)
  └─ sweep: POST /api/executive/reports/run?max=50            → pass 1, cursor A
            POST /api/executive/reports/run?max=50&after=A    → pass 2, cursor B
            …                                                  → cursor null: done
```

* `?after=` is shape-checked (`^[A-Za-z0-9_-]{1,64}$`) before any pass starts;
  `?max=` keeps its 1–200 ceiling. A refused caller starts nothing.
* A sweep ends early when the pass did not hold the lease (another replica is
  sweeping), and stops with an error line if a cursor ever failed to advance.
* Every request stays bounded; the **sweep** is what makes coverage complete.

## 3. What a pass reports

Unchanged fields plus `undelivered[]` (`organizationId`, `businessDate`,
`reason`), `afterOrganizationId`, `nextAfterOrganizationId`, `leaseLost`. The
runner logs one line per pass (counts, cursor, `more`, `leaseLost`), one warning
per failed organization, and one warning per report not announced. No figure, no
token, no personal field is logged.

## 4. Tests

* `worker.test.ts` — the harness now honours the cursor and id order, renewals,
  recipients and delivery failures. New: 120 organizations in batches of 50 are
  each visited **exactly once** (org 51 included); the cursor reaches the
  query; a full last batch then an empty one ends the sweep; the lease is
  released, renewed in a slow batch, not renewed in a fast one; a lost lease
  stops and resumes at the right organization; owners and admins told once each;
  no recipient → claim released with the exact timestamp and listed; refused or
  thrown sends → released and listed, no message leaked; an unannounced existing
  report is retried; an announced one costs no query.
* `generate.test.ts` — the claim release clears only the caller's own claim, never
  a later one, and nothing for an unreported night. Its fake `updateMany` now
  compares a `Date` by value, as PostgreSQL does (it could never match one before).
* `route.test.ts` (new) — refused caller starts nothing; defaults; cursor and size
  passed through; five malformed cursors and four bad sizes refused before a pass.
* `executive-report-worker-registration.test.ts` (new, modelled on the ATS one) —
  compose service, one-file re-include, stage contents and position, npm scripts,
  and the runner **executed** against a local stub: a three-pass chain with the
  exact URLs, lease-held-elsewhere, a non-advancing cursor, the undelivered
  warning, no token → exit 2 with no request, 401 → exit 1, no token in output.

## 5. What production still needs — owner or operator, not code

1. **Merge and deploy** this slice (after #134, #135, #136).
2. **A credential** in `.env.production` on the server:
   `EXECUTIVE_REPORT_WORKER_TOKEN` (recommended — its own blast radius). The
   route also accepts `METERING_WORKER_TOKEN` or `METRICS_TOKEN` if one of them
   is already set there, by documented design; I cannot see the server's
   environment and do not read it.
3. **Start the service once** on the production host — the deploy workflow
   recreates `hermes-web` only, exactly as for the other three workers:
   `docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d hermes-executive-report-worker`
4. **Evidence**: the first night after start, the runner's log line
   `pass complete … created N` and a row per organization in the archive. Only
   then may row 10 be `DONE`.

**Failure monitoring.** Today: the runner's structured log (json-file, rotated
20m×5) carries one `WARN` per failed organization and per unannounced report,
and `ERROR` on a refused credential; the archive shows a missing night as a gap.
There is no alert that pages anyone — wiring these log lines into the existing
Uptime Kuma or another alerting path is an operator decision.

**Recovery.** Nothing to recover by hand: a missed night is still "finished and
unreported", so the next sweep picks it up; a lost notification claim is given
back and retried; a dead runner is restarted by `restart: unless-stopped`.

**Rollback.** `docker compose … stop hermes-executive-report-worker` stops all
scheduling; reports already made stay in the archive. No schema change in this
slice.

## 6. Files

**Modified:** `src/lib/executive/report/worker.ts`, `generate.ts`,
`src/app/api/executive/reports/run/route.ts`,
`scripts/executive/daily-report-worker.mjs`, `Dockerfile`,
`docker-compose.prod.yml`, `.dockerignore`, `worker.test.ts`,
`generate.test.ts`. **Added:** `route.test.ts`,
`scripts/__tests__/executive-report-worker-registration.test.ts`, this document.

## 7. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` (report lib, run route, registration test) | 0 problems; `node --check` on the runner: ok |
| `vitest` — report worker + generator, run route, the new registration test, and the neighbouring packaging suites (ATS, document cleanup, metering R8, Phase 106A journal path, Phase 99.7 release safety) | 9 files: 215 passed, 1 skipped, **1 failed** — see next row |
| `phase997-release-safety.test.ts` alone, `--testTimeout=300000` | 41 passed. The failure above was the 60 s per-test limit (the test ran 109 s on a loaded machine, diffing the whole history since the Phase 99.7 base); the assertion itself holds — `git diff --name-only <base>...HEAD` lists **no** OpenBao file, on this branch and on `origin/main` |
| `node scripts/security/phase99/generate-inventory.mjs --check` | committed inventory matches the source tree |

Not run anywhere yet: a container build of the new stage. CI's `docker build`
jobs build only the default (`runner`) target, exactly as for the other three
worker stages; this stage is first built on the production host by the
operator's `docker compose … up -d hermes-executive-report-worker`. It is the
same four instructions as the ATS and document-cleanup stages (base image,
user, one `COPY`, `CMD`), and the registration test pins that text. A local
`docker build --target executive-report-worker` was attempted and did not
start: the Docker Desktop engine on this machine answered `500` to its own
`_ping`, so there is no local build evidence either.
