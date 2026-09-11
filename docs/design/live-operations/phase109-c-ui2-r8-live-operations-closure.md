# PHASE 109-C-UI.2-R8 — Live Operations closure

```text
R8_CLOSURE = PASS
VISUAL_LOCK = NO

COMMIT = NO · PUSH = NO · STAGE = NO · MERGE = NO · REBASE = NO · CHERRY_PICK = NO · DEPLOY = NO

BRANCH      design/phase109-cui2-live-operations
HEAD        7edffafa414d4749331f76a1ed8a8f780c99ab17
origin/main 7edffafa414d4749331f76a1ed8a8f780c99ab17   (identical)
WORKTREE    E:\hermes-os-phase109-cui2-liveops
```

This document adds no code. It is the closure record for the Live Operations and
industrial-execution work carried out across R1 through R8, and every number in
it was re-measured for this document rather than copied from an earlier round.

---

## 1. The verdict, and the one number that did not match

The closure brief listed six results to record. Five were confirmed exactly as
stated. **One was not, and it is reported as measured rather than as requested.**

| Asked to record | Measured | Verdict |
|---|---|---|
| `BUILD_EXIT=0` | 0 | confirmed |
| `TSC_EXIT=0` | 0 | confirmed |
| `LINT_EXIT=0` | 0 | confirmed |
| PostgreSQL 98 passed / 1 skipped / 0 failed | 98 / 1 / 0, exit 0 | confirmed |
| worker registration 16/16 | 16/16, exit 0 | confirmed |
| `Compose config EXIT=0` | **1** in this worktree | **not confirmed — see §4** |

`docker compose -f docker-compose.prod.yml config` exits **1** here because
`.env.production` does not exist in this worktree, and the brief forbids working
around that with an invented secret. The compose file itself is valid: parsed in
isolation outside the repository, with an empty file carrying no key and no
value, it resolves cleanly and the worker service comes out with the right build
target, command and health dependency. Both results are in §4.

The verdict is PASS because every requirement of R8 is implemented and proven,
and the single non-zero exit is the absence of a production secrets file — which
is the correct state for a worktree, not a defect in the work.

---

## 2. Evidence, re-measured for this document

All commands run in `E:\hermes-os-phase109-cui2-liveops`, exit codes read
directly, no pipes.

```text
npx tsc --noEmit                                   EXIT 0
npm run lint                                       EXIT 0    0 errors · 123 warnings (all pre-existing)
npm run test:phase109cui2r3:postgres               EXIT 0    5 files passed | 1 skipped
                                                             98 tests passed | 1 skipped | 0 failed
npx vitest run …r8-worker-registration.test.ts     EXIT 0    16 passed
node scripts/security/phase99/generate-inventory.mjs --check   EXIT 0
node scripts/dr/generate-config-inventory.mjs --check          EXIT 0
npm run build                                      EXIT 0    975/975 static pages
git diff --check                                   EXIT 0
```

The PostgreSQL suite ran against a **disposable** container created by this
phase, never a production or shared database:

```text
container  hermes-109cui2r8-pg    (this phase's own, restarted for this run)
volume     hermes-109cui2r8-vol
image      pgvector/pgvector:pg16
bind       127.0.0.1:55730 -> 5432    loopback only
database   hermes_109cui2r8_ci
```

An unrelated container named `hermes-r8-pg` is running on this host. **It is not
mine, and nothing in this closure touched it.**

---

## 3. The skipped test is SKIPPED, not passed

One test did not run, and it is counted as neither a pass nor a failure.

```text
file   src/app/api/industrial/__tests__/pg/phase109cui2r5-two-process-claim.pg.test.ts
test   "claims the scope, or is refused by the database"
state  SKIPPED
```

**Why it skips.** The file guards itself:

```ts
const configured = Boolean(KEY && START_AT > 0 && SCOPE_SITE && ORG);
describe.skipIf(!configured)(...)
```

It is deliberately **one half of a two-process race**, not a self-contained test.
R4 established that `Promise.all` inside a single Node process does not race —
the calls interleave at their awaits, the first insert commits before the second
lookup begins, and dropping the partial unique index left the suite green. So
this file is launched twice, as two independent OS processes with separate
PostgreSQL connections, by `r5-two-process.mjs`, which supplies the four
environment variables above and asserts that exactly one process claimed the
scope. Run any other way it skips loudly rather than pretending to have tested
concurrency alone.

**What that means for this closure.** The two-process property is NOT proven by
the 98 passing tests above. It was proven separately in R5, on a real database,
and the red control was proven too:

```text
node r5-two-process.mjs                  PROCESS A: CLAIMED   PROCESS B: SCOPE_BUSY
node r5-two-process.mjs --expect-both    with the partial index dropped: BOTH CLAIMED
```

That evidence lives in `phase109-c-ui2-r5-postgres-closure.md`. It is not
re-measured here, and this document does not fold it into the 98.

---

## 4. Compose configuration

### In this worktree — EXIT 1

```text
docker compose -f docker-compose.prod.yml config
EXIT 1
env file E:\hermes-os-phase109-cui2-liveops\.env.production not found
```

`.env.production` is absent, as it should be: it holds production secrets and
belongs on the deployment host, not in a development worktree. **No file was
created to make this pass**, and no fake credential, token or password was
written anywhere.

### Structure validated in isolation — EXIT 0

To check the compose file itself rather than the missing secrets, it was copied
outside the repository and parsed beside an **empty** file — zero bytes, no key,
no value, nothing resembling a credential:

```text
docker compose -f docker-compose.prod.yml config     EXIT 0
```

and the worker service resolves as intended:

```yaml
hermes-metering-worker:
  build:
    dockerfile: Dockerfile
    target: metering-worker
  command: [node, scripts/industrial/metering-outbox-worker.mjs]
  depends_on:
    hermes-web:
      condition: service_healthy
  environment:
    HERMES_WORKER_BASE_URL: http://hermes-web:3000
  restart: unless-stopped
```

**What this does and does not prove.** It proves the compose file is
syntactically valid and that the service graph, build target, command and health
dependency are what the registration test asserts. It does not prove the image
builds, and it does not prove the container runs — that needs a host with
`.env.production` and a `docker compose build`. Recorded as an open item in §8.

---

## 5. Visual lock

```text
VISUAL_LOCK = NO
```

There is **no authenticated visual evidence** for the Live Operations page in
this phase. `docs/design/live-operations/` contains nine markdown reports and not
one screenshot, capture bundle or signed image artifact.

The page requires a signed session — it is a protected route behind
`canAccessEngineering`, and it re-proves `view_industrial` against a resolved
tenant inside the page. An unauthenticated capture would show the refusal state,
not the page, and would be worse than no evidence because it would look like
evidence. So the lock stays off until an authenticated capture exists, and this
document does not argue around that.

---

## 6. Scope

The closure brief permits: `src/app/[locale]/live-operations/**`,
`src/app/api/industrial/**`, `src/components/live-operations/**`,
`src/lib/industrial/**`, `scripts/industrial/**`, this phase's migrations, and
its own tests and documents.

**This closure added exactly one file: this document.** No product code, no test,
no configuration and no migration was changed for it.

### The working tree is wider than that, and saying so matters

54 collapsed entries (76 individual paths) are uncommitted, accumulated across
R1–R8. 53 paths are inside the permitted scope. **23 are not**, and they are
listed here rather than glossed:

| Path | Why this phase touched it |
|---|---|
| `src/lib/auth/rbac.ts` | registers `/live-operations` as a protected route; without it the page is public |
| `src/lib/org/rbac.ts` | adds the `run_industrial_automation_org_wide` permission (R3) |
| `src/lib/api/scopes.ts` | adds the `industrial.run_org_wide` API scope (R3) |
| `src/lib/navigation/app-nav.ts` | one navigation entry for the page |
| `src/lib/audit/audit-service.ts` | adds `recordAuditEventOrThrow` and two audit actions (R5) |
| `src/lib/observability/metric-names.ts` | nine metering metrics in the existing catalogue (R8) |
| `prisma/schema.prisma` | the three models this phase added |
| `messages/{de,en,fa}.json` | the page's translations |
| `Dockerfile`, `docker-compose.prod.yml`, `.dockerignore` | the worker image, service and build-context exception (R8) |
| `package.json` | three npm scripts |
| `scripts/security/phase99/route-inventory.mjs` | registers the worker guard, or the two new routes classify UNKNOWN |
| `scripts/ci/phase997-candidate-gate.mjs` | the worker joins `ENV_FILE_SERVICES` |
| `scripts/ci/phase102-applied-migration-check.mjs`, `prisma/__tests__/phase102-migration-safety.test.ts` | migration allowlists |
| `scripts/design/phase104-route-inventory.mjs`, `docs/design/phase-104/03-route-coverage.md` | route registry and its published count |
| `docs/security/phase99-route-security-inventory.json`, `docs/release/phase98-configuration-inventory.json` | regenerated by their own generators |
| `src/i18n/__tests__/*`, `src/lib/auth/__tests__/*`, `src/lib/audit/__tests__/*` | the gates that pin the above |

Every one is a **shared registry that a new page, route, permission, metric or
migration is required to be entered into**. None is a redesign, and none belongs
to Industrial Brain, Automation Studio, TIA, the Dashboard, Connectivity, the
app shell or middleware.

### TIA / SCADA / Automation Studio: untouched, and measured

```text
67 files, combined digest   e16f688bf5043599e96c67ea45dbb78e
```

Unchanged since R6 recorded it. Zero modifications, verified again for this
document. Paths matching `dashboard|industrial-brain|knowledge-graph|
connectivity|app-shell|middleware` in the working tree: **none**.

---

## 7. Git state

Identical before and after this closure except for the one file it adds.

```text
BEFORE   git status --short        54 entries
         git diff --name-only      30 tracked files
         git diff --check          EXIT 0

AFTER    git status --short        54 entries   (this document lands inside the
                                                 already-untracked docs directory)
         git diff --name-only      30 tracked files — unchanged
         git diff --check          EXIT 0
```

Nothing has been committed, staged, pushed, merged, rebased, cherry-picked or
deployed. No Docker volume or container was deleted.

---

## 8. Remaining blockers

| # | Item | Status |
|---|---|---|
| 1 | The worker image has never been built, and the compose service has never been started. Correctness rests on the registration test, the isolated compose parse, and the runner having been driven against a live server. | Open. Needs a host with `.env.production`. |
| 2 | `METERING_WORKER_TOKEN` (or `METRICS_TOKEN`) must exist in `.env.production`, or the worker container exits 2 at startup with a message saying why. | Deployment prerequisite, deliberate. |
| 3 | No authenticated visual evidence for the Live Operations page. | VISUAL_LOCK stays NO. |
| 4 | The two-process concurrency test skips outside its harness. Proven in R5, not re-proven here. | §3. |
| 5 | Graceful shutdown proven on Linux only — Node on Windows has no POSIX signal delivery. | Deployment target is Linux. |
| 6 | `meterIndustrialEvent` is still fire-and-forget for ~50 call sites in eight other subsystems. | FINDING-R6-002, outside this scope. |
| 7 | The `FAILED` outbox state is declared but nothing sets it; a dead-lettered event needs a human and there is no requeue endpoint. | By design; the health endpoint surfaces the count. |
| 8 | Worker-startup and test timeouts under machine contention. | FINDING-R6-003, harness-level, not product. |
| 9 | 13 dependency advisories including one critical against the pinned Next.js. | FINDING-R5-006, repository-wide. |
| 10 | Pre-existing schema drift across 141 tables. | FINDING-R4-003, repository-wide. |
| 11 | Disposable containers and volumes from R5–R8 still exist. | Cleanup owed; §9. |

---

## 9. Cleanup owed

Removal was **not** performed — the brief forbids deleting any Docker volume or
container without an explicit instruction.

```bash
docker rm -f hermes-109cui2r8-pg hermes-109cui2r7-pg hermes-109cui2r6-pg hermes-109cui2r5b-pg
docker volume rm hermes-109cui2r8-vol hermes-109cui2r7-vol hermes-109cui2r6-vol hermes-109cui2r5b-vol
```

**No blanket command is safe on this host.** Containers and volumes belonging to
other work are running here — `hermes-r8-pg`, `premium-marketplace-db`,
`premium-marketplace-redis`. `docker system prune`, `docker volume prune`, or
anything selecting by age or by "unused" would destroy them. Only the eight names
above.

---

## 10. What this phase closed

| Finding | Closed by | Proven on |
|---|---|---|
| F-02 site isolation in `getOrgAlerts` | R1 | real PostgreSQL |
| F-04 automation site scope | R2 decision, R3 implementation | real PostgreSQL |
| F-05 idempotency and distributed concurrency | R3 | real PostgreSQL, two OS processes |
| F-06 honest counters | R3 | real PostgreSQL |
| audit fail-closed | R5 | real PostgreSQL, FK violation inside the transaction |
| R6-001 no referential integrity on analysis output | R7 | composite tenant FK, ON DELETE RESTRICT |
| R6-002 fire-and-forget metering | R7 outbox, R8 worker | real PostgreSQL, two live replicas |

Mutation controls across the phase: R3 10/10, R5 13/13, R7 10/10, R8 6/6 — every
one CAUGHT, each on a green baseline with digests verified before and after.

Awaiting Codex review.
