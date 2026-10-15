# Deploy assurance — open findings, October 2026

Raised while deploying `84437c3c` to production on 2026-10-14 (run 38514426176).
Each one is **OPEN** until the stated closing evidence exists. None of them made
that deploy unsafe, and none of them is closed by it.

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| DA-1 | The backup gate does not check AGE, and the release used a backup 3.7× older than the documented RPO | HIGH | OPEN |
| DA-2 | The migration connection has no lock-wait limit | MEDIUM | **IMPLEMENTED** 2026-10-14 — final acceptance OPEN |
| DA-3 | Nothing binds the running `hermes-web` image to the release commit | MEDIUM | **IMPLEMENTED** 2026-10-15 — not yet exercised by a release |

---

## DA-1 — the backup gate checks integrity but not freshness

**Observed.** The pre-migration evidence gate accepted
`hermes_postgres_20261010_112029.hbk`, taken **2026-10-10 11:20**, for a deploy
that ran **2026-10-14 05:05** — about **89.8 hours** old.

**Why that is a finding and not a detail.** The project's documented recovery
point objective is **24 hours** (`docs/release/phase98-architecture-and-plan.md`:
"System RPO = 24 h", the worst durable component being PostgreSQL). The accepted
backup was **≈3.7× that objective**. The gate's checks are
`verified:true`, `partial:false`, `encrypted:true` and a SHA-256 match — every
one about *integrity*, none about *age*. An intact backup from last month would
pass exactly as this one did.

Had the migration gone wrong, the restore point would have lost up to four days
of production data, against a contract that promises at most one.

**What is not yet known** (requires the host, and is part of closing this):

* why the newest backup is four days old — whether the scheduled job is failing,
  disabled, or was never scheduled on this host;
* whether newer `.hbk` files exist that are not marked verified, and why.

Read-only commands for that, which print no key material and decrypt nothing:

```bash
sudo -n find /backups/postgres -maxdepth 1 -type f -name '*.hbk' -printf '%TY-%Tm-%Td %TH:%TM %10s %p\n' | sort | tail -10
```

```bash
systemctl list-timers --all | grep -i -E 'backup|hermes' ; sudo -n crontab -l 2>/dev/null | grep -i backup ; crontab -l 2>/dev/null | grep -i backup
```

```bash
sudo -n journalctl -u hermes-backup --since '14 days ago' --no-pager | tail -40
```

**Closing evidence required.**

1. A maximum age is defined **from the documented RPO** (24 h) plus the backup
   job's own run window, stated in the runbook.
2. The gate enforces it: a backup older than that maximum is refused with a
   message that names the age and the limit, exactly as the integrity checks do
   now. The age must be read from the same privileged listing the gate already
   does, so no new access is introduced.
3. The reason the 2026-10-10 backup was the newest is established and fixed.
4. **Before the next release**, a fresh backup is taken through the standard
   path and verified, and its timestamp is recorded in the release notes.

---

## DA-2 — the migration connection waits without limit

**Observed.** No `lock_timeout`, `statement_timeout`, `idle_in_transaction_session_timeout`
or `PGOPTIONS` is set anywhere in the repository (compose, `Dockerfile`,
`prisma.config.ts`, SQL — all searched), and the `postgres` service declares no
`command:` override. With PostgreSQL defaults both limits are `0`, meaning *wait
for ever*.

**What that means in practice.** A plain `CREATE INDEX` takes a `SHARE` lock:
readers are unaffected, writers block. If a long transaction held a conflicting
lock, the migration would wait indefinitely and every writer would queue behind
it — a stalled deploy with no error, which is harder to diagnose than a failure.

**What is already known and must not be misread.** Prisma 7.8.0 takes a
`pg_advisory_lock` with a **10 s** timeout before applying anything; that bounds
the wait for the migration *slot*, not the table lock of the statement.

### Implemented 2026-10-14 — final acceptance still open

**The value.** `SET lock_timeout = '5s'` is the default for future production
migrations (owner decision, 2026-10-14). A migration that needs a different
value must say why in its own header and have the change reviewed; the static
rule accepts any positive duration up to two minutes, so the *default* is a
policy, not something the test can enforce alone.

**Where the limit lives, and why not the two obvious places.**

| Candidate | Rejected because |
| --- | --- |
| `PGOPTIONS` on `hermes-migrate` | Prisma's migration engine does not use libpq, so there is no reason to believe it would read it. "Probably works" is not a control. |
| `options=-c lock_timeout=…` in the connection string | That string lives in `.env.production`, which this repository must never read or write. |
| **`SET lock_timeout` as the first statement of the migration file** | **Chosen.** In the repository, visible in the diff, and measured to work. |

`SET` persists for the session because Prisma does **not** wrap a migration
file in a transaction — itself measured, not assumed.

### The evidence, with this project's own CLI against PostgreSQL 16

| Question | Result |
| --- | --- |
| A — no conflicting lock | applied, exit 0, index valid |
| B — conflict, cap `2s` | exit 1, lock-timeout error, 5,355 ms total |
| B — conflict, cap `6s` | exit 1, lock-timeout error, 12,770 ms total |
| C — state after failure | `_prisma_migrations` row **unresolved**, `applied_steps_count = 0`, **no index created**, `migrate status` exit 1 |
| D — recovery | `migrate resolve --rolled-back` exit 0, retry applied, index valid, both the rolled-back attempt and the success kept in history |

**A measurement that did NOT match the prediction, reported as it came out.**
The plan was to isolate the wait by differencing the two caps: a `2s` and a
`6s` run should differ by about 4,000 ms. The observed difference is
**7,415 ms**, a slope of ≈1.85 against the cap, with a constant overhead of
≈1.3 s. The engine appears to incur the lock wait **about twice** per failed
file.

Two things are nonetheless settled: the failure really is a lock timeout, and
the elapsed time **scales with the cap** — which is what proves the `SET`
reached the DDL on the same connection. The exact multiple is not explained,
and it has a practical consequence that must be stated rather than rounded
away: **a 5 s cap can add roughly 10 s to a blocked release, not 5 s.** Still
bounded; just not the number the cap names.

### What the timeout does and does not guarantee

It **does** turn a silent, unbounded hang into a visible, fail-closed stop:
the attempt is left unresolved exactly as any other failed migration,
`migrate status` exits non-zero, and the deploy's existing post-migration
check refuses to replace `hermes-web`.

It does **not** guarantee that no migration is left half-applied. In the
measurement nothing was, but that file held a single statement. Prisma does
not wrap a file in a transaction, so in a MULTI-statement file a timeout on
the second statement leaves the first applied — visible through the
unresolved row, and needing manual resolution.

**No general `statement_timeout` was added, and that is a trade-off, not a
safeguard.** A lock that will never be granted and an index build that is slow
but progressing are different failures; killing the second mid-way is one of
the few ways to actually create the half-applied migration this finding exists
to avoid. The consequence is that a long-running statement is still unbounded,
and the deploy path — not this rule — remains responsible for total duration,
for a stalled or disconnected run, and for recovery.

### The rule, and the hole it deliberately closes

Enforced by `prisma/__tests__/migration-lock-timeout.test.ts` (26 cases).

* **"New" is a pinned baseline**, `prisma/__tests__/lock-timeout-baseline.json`
  (87 migrations as of 2026-10-14), **not a date**. A date alone would let a
  new migration named `20200101000000_…` walk past the control.
* The control reads the **value**, not the word `SET`: zero, `DEFAULT`, a
  non-duration and an absurdly large value are all rejected, as are a later
  `RESET`, a later weakening `SET`, `SET LOCAL` outside a transaction (which
  does nothing), a transaction opened without restating the cap, and any DDL
  before the cap is in force. A `SET` inside a comment or a string literal
  does not count — comments and literals are stripped before the scan.
* **Already-applied migrations are not touched**, and the test asserts none
  of them has been: editing one changes its checksum and breaks every
  database that has it.
* **`CREATE INDEX CONCURRENTLY` is not exempt by its nature.** The exemption
  list is empty, and an entry in it is only half of an exemption: the
  migration's own header must answer `EXEMPTION REASON`, `ALTERNATIVE
  CONTROL`, `EXPECTED WAIT`, `STATE AFTER FAILURE` (a failed concurrent build
  leaves an INVALID index occupying space and unusable by the planner) and
  `RECOVERY`. A test exercises that requirement rather than asserting it.

**Still open on DA-2:** the ≈2× multiple is unexplained; no production release
has exercised the rule yet; and the deploy path still has no cap on total
migration duration or handling for a stalled connection.

## DA-3 — the running image is not bound to the release commit

**Observed.** The `Dockerfile` sets no `LABEL`, no build argument carries a
commit SHA, and `/api/health` and `/api/health/ready` report no version. So
nothing produced by the running container states which commit it was built from.

**Why `git rev-parse HEAD` and `docker compose ps` are not enough.** They prove
the server's *checkout* is at a commit and that *a* container is running. They
do not prove the running container was built from that checkout: an image built
earlier, or from a different checkout, would look identical in both outputs.
Today the only link is procedural — the deploy workflow asserts
`HEAD == TARGET_SHA` and a clean worktree *before* building, and that chain is
in the run log — which is evidence about the process, not an attestation from
the artefact.

### Implemented 2026-10-15 — NOT closed; no production release has run it

**What this control is, named precisely.** It matches the **revision metadata**
of the image a container is running against the SHA a release deployed. It is
**not** an image signature — nothing is signed and nothing is checked against
a key — and it is **not** proof that the image CONTENTS correspond to that
commit. A label is metadata, set at build time by whoever ran the build. It
proves the build was *stamped* with that commit. It closes exactly one gap:
that nothing produced by a running container said anything at all about its
origin.

**The chain**, which attests nothing unless every link holds:

| # | Link | Where |
| --- | --- | --- |
| 1 | the runner stage takes `GIT_REVISION` and records `org.opencontainers.image.revision` | `Dockerfile` |
| 2 | compose passes it to the `hermes-web` build, defaulting to `unknown` | `docker-compose.prod.yml` |
| 3 | the deploy exports it from `TARGET_SHA` before building | `deploy.yml` |
| 4 | after the container is replaced, the deploy runs `scripts/deploy/attest-image-revision.sh` and refuses on anything but a match | `deploy.yml` |

#### Read from the image the container is bound to — not a tag, not the container

The first cut read `docker inspect <container>`. That reports the image's
labels **merged with whatever the container was created with**, and compose
can set those — so a check about the *build* could have been satisfied by a
label added at *run time*. The script now resolves `.Image` (a content
address), reads the label from that image id, and treats a container whose own
label disagrees as `CONTAINER_LABEL_OVERRIDE`, because the disagreement is
itself the dressing-up. Tags are never consulted: a tag can be moved at any
moment, and "the image called `hermes-web:latest`" is a different question
from "the image this container is running".

It records all three identities — `container_id`, `image_id`, `revision` — so
the evidence names what it checked.

#### Proven against real images and containers

`scripts/__tests__/attest-image-revision.docker.test.ts`, 11 cases, all green:

| Case | Result |
| --- | --- |
| image carries the target revision | `MATCH`, exit 0, all three ids recorded |
| image carries a different revision | `MISMATCH` |
| image built without one (`unknown`) | `UNKNOWN_REVISION` |
| image with no label at all | `NO_REVISION` |
| **the tag is repointed at another image** | verdict unchanged, same `image_id` |
| **a revision label is set on the CONTAINER** | `CONTAINER_LABEL_OVERRIDE` |
| a short SHA as the target | `BAD_EXPECTED` — no prefix matching |
| empty target, missing container | `BAD_EXPECTED`, `NO_CONTAINER` |

Three defects in the test harness itself were found and fixed on the way, each
of which would have made the suite lie:

* a `beforeAll` that exceeded its timeout made vitest report its eight cases
  as **SKIPPED, not failed** — a suite whose whole job is to exercise real
  Docker was sliding past as green. A guard now fails if Docker was reachable
  and the cases did not run, and it is set at the end of `beforeAll`, not in
  `afterAll`, which runs even after a failed setup;
* `shell: true` on Windows concatenates arguments instead of escaping them
  (DEP0190), so `--change "LABEL …"` arrived as several arguments. Measured:
  no shell is needed for `spawnSync("docker", …)` on Windows either;
* `docker build` of a three-line Dockerfile took about four minutes per image
  here. `docker commit --change` does the same job in milliseconds.

#### The failure path

On a mismatch the run does **not** report success. It restores
`hermes-web:previous-good`, waits for that container to be healthy, and exits
non-zero regardless — a recovered failure is not a release. If
`previous-good` is missing it refuses rather than leaving the rejected
container serving.

A rollback to an image that carries **no** revision label — one built before
this label existed — is reported **separately**, as a warning naming the
image: that is an absence of evidence about the rolled-back release, neither a
second failure nor a pass.

**Not yet exercised.** The rollback path has textual coverage only; unlike the
attestation it has not been run against real containers, because it lives
inside `deploy.yml` rather than in a script a test can drive. Extracting it
the same way is the next step.

#### Not published to the internet

`/api/health` is the container healthcheck *and* a public liveness probe
returning only `{"status":"ok"}`. A commit SHA there would hand an anonymous
caller a precise version to match against known vulnerabilities. A test
asserts the route stays free of version information.

**DA-3 stays OPEN.** The control is implemented and proven in isolation; it
has never run in a production release. Until a deploy records a match, the
honest phrasing remains "the deploy workflow recorded X", not "the running
image reports X".

## Corrections to the earlier report of this deploy

Three statements made while reporting run 38514426176 were wrong or
over-claimed, and are corrected here rather than quietly dropped:

| Said | Correct |
| --- | --- |
| "the residual risk became zero" | The evidence proves **this run** succeeded. It says nothing about the risk class, which is still open as DA-2. A single successful outcome is not the absence of a hazard. |
| "5 seconds — consistent with zero rows" | The 5 s between `Applying migration` and `Migrations verified` is the whole step: container start, advisory lock, Prisma bootstrap, the two `CREATE INDEX` statements, and the verification queries. It is an **upper bound** on the index build, not its net time, and the net time was never measured in production. |
| "production runs `84437c3c`" | The deploy workflow deployed `84437c3c` and recorded it. No runtime attestation confirms the running image was built from it — that is DA-3. |
