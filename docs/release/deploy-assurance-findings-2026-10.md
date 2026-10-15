# Deploy assurance — open findings, October 2026

Raised while deploying `84437c3c` to production on 2026-10-14 (run 38514426176).
Each one is **OPEN** until the stated closing evidence exists. None of them made
that deploy unsafe, and none of them is closed by it.

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| DA-1 | The backup gate does not check AGE, and the release used a backup 3.7× older than the documented RPO | HIGH | OPEN |
| DA-2 | The migration connection has no lock-wait or statement-time limit | MEDIUM | OPEN |
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

**Closing evidence required.**

1. A bounded wait on the runner's **real** connection — the `migrator` stage —
   not in the already-applied migration file, which must not be edited.
   Candidates, in order of preference: `options=-c lock_timeout=...` on the
   migrator's connection string, or a `PGOPTIONS` environment entry on the
   `hermes-migrate` service only.
2. Proven on an isolated database: with a competing transaction holding the
   lock, the migration **fails loudly** within the limit.
3. Proven that the limit cannot hide a half-applied migration: after a timeout,
   `_prisma_migrations` must show the attempt unresolved and `migrate status`
   must exit non-zero, so the existing post-migration count check still refuses
   to replace `hermes-web`. A timeout that silently left the schema half-changed
   would be worse than no timeout.
4. A statement-time limit is considered separately from the lock limit: a long
   but *progressing* index build is not the same failure as a lock that will
   never be granted, and the two deserve different numbers.

---

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
