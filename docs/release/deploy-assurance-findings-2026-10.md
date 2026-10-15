# Deploy assurance — open findings, October 2026

Raised while deploying `84437c3c` to production on 2026-10-14 (run 38514426176).
Each one is **OPEN** until the stated closing evidence exists. None of them made
that deploy unsafe, and none of them is closed by it.

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| DA-1 | The backup gate does not check AGE, and nothing schedules the artifact it accepts — the release used a backup 3.7× older than the documented RPO | HIGH | OPEN — gate and timer written, production chain not yet run |
| DA-2 | The migration connection has no lock-wait or statement-time limit | MEDIUM | OPEN |
| DA-3 | Nothing binds the running `hermes-web` image to the release commit | MEDIUM | OPEN |

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

### Corrected diagnosis — 2026-10-15

The first version of this finding guessed that *the backup job was failing*.
Host evidence supplied by the owner shows it was not. The local backup path and
`hermes-dr-backup.service` were both current and both reported PASS throughout
the window.

What is **not** running is the only producer of the artifact the release
contract reads. The gate looks for `*.hbk` plus a `*.meta.json` verification
record in `/backups/postgres`, and the single mechanism in this repository that
writes that pair is `scripts/backup-postgres.sh` (PostgreSQL dump →
`scripts/dr/hbk.mjs`, AES-256-GCM, atomic `.hbk.partial` → `.hbk`, then the
record). The DR runbook has always described its cadence as *owner-activated
host cron*, and the repository shipped **nothing to activate** — no unit, no
timer, no crontab fragment. The newest artifact is therefore 89.8 h old because
nothing has produced a newer one since 2026-10-10.

Two things follow, and both are deliberate omissions rather than oversights:

* **The gate's source is unchanged.** Pointing the gate at the DR snapshots
  would need its own equivalence evidence — coverage, encryption, integrity,
  freshness and restore method — proven side by side. A healthy DR service is
  not that evidence, so no such change is proposed here.
* **Nothing is renamed or hand-written.** A plaintext dump renamed to `.hbk`, or
  a `.meta.json` written by hand, would make this gate green while making the
  restore point fictional. `ops/backup/README.md` states both prohibitions.

### What this change contains

1. **`scripts/deploy/check-backup-freshness.sh`** — the age and consistency
   judgement, split out of the workflow because its branches can only be proven
   against real files. It is handed the artifact name, the file's mtime, the
   computed SHA-256 and a copy of the record; it needs no privilege of its own,
   so the deploy user's `sudo -n` rules are untouched.
2. **`scripts/__tests__/check-backup-freshness.test.ts`** — 30 cases driven
   against the real script with an injected clock: the boundary (29 h fresh,
   exactly 30 h refused, 31 h refused, the historical 89 h refused), a future
   mtime, a future `createdAtMs`, a record naming another artifact, each missing
   or false record field, a hash mismatch, no hash at all, and every bad limit
   (zero, negative, non-numeric, 73, 720). A source-level test over the YAML can
   show that a check exists; only this can show what it decides.
3. **`ops/backup/hermes-pg-backup.{service,timer}` + `README.md`** — the
   schedule the repository never shipped. `OnCalendar=*-*-* 02:40:00` with
   `Persistent=true`, so a missed day is caught up rather than skipped — a
   skipped day is exactly the state that produced this finding. The unit *names*
   `HERMES_BACKUP_KEY_FILE` and `HERMES_BACKUP_KEY_ID` and refuses to default
   them; their values belong in an owner-created drop-in and the key itself is
   only ever read from a file.
4. **The workflow** calls the script after its existing integrity checks and
   refuses the release through the same `backup_refuse` path. The limit is
   **30 h** — the documented 24 h RPO plus one backup interval, so *one* missed
   run stops the next release instead of silently widening the restore window.

### What "age" is worth here

`createdAtMs` is written into the record by `scripts/backup-postgres.sh` when it
finishes; `mtime` is filesystem metadata. **Neither is a cryptographic proof of
creation time** — the record is plain JSON written by a script, and anyone who
can write the file can `touch` it. They are claims by a trusted producer, not
attestations, and neither is presented here as more than that.

So both are read, and the judgement is the **stricter** of the two: an artifact
is fresh only if the record says so *and* the file says so. Using either alone
would make the other the way past. They are also cross-checked — a record whose
`createdAtMs` is more than an hour from the file's mtime is refused as
`TIME_INCONSISTENT`, because it describes a different file or a touched one.
Tightening this further would need a signed timestamp from the producer, which
the backup chain does not currently emit; that is recorded as a limitation, not
closed.

### DA-1 stays OPEN until all five hold

1. A fresh, valid `.hbk` with its `.meta.json` exists in production.
2. A deploy has actually run and its 30 h gate **accepted** that artifact.
3. The timer is installed and active on the host.
4. A real timer or manual service run has succeeded and produced a valid
   artifact.
5. The artifact is readable and restorable through the project's own
   restore/rehearsal path.

Shipping the gate and the unit files satisfies none of these by itself. The
production chain is an owner-run server mutation; its exact commands and the
evidence each must produce are in `ops/backup/README.md`.

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

**Closing evidence required.**

1. The build takes the commit as a build argument and the image records it, as
   an OCI label (`org.opencontainers.image.revision`) and, so a reader needs no
   shell, as a field on `/api/health`.
2. A deploy step asserts the running container's recorded revision equals
   `TARGET_SHA`, and fails the deploy otherwise — the same fail-closed shape as
   the migration-count check.
3. Until then, "production runs commit X" is stated as *the deploy workflow
   recorded X*, never as *the running image reports X*.

---

## Corrections to the earlier report of this deploy

Three statements made while reporting run 38514426176 were wrong or
over-claimed, and are corrected here rather than quietly dropped:

| Said | Correct |
| --- | --- |
| "the residual risk became zero" | The evidence proves **this run** succeeded. It says nothing about the risk class, which is still open as DA-2. A single successful outcome is not the absence of a hazard. |
| "5 seconds — consistent with zero rows" | The 5 s between `Applying migration` and `Migrations verified` is the whole step: container start, advisory lock, Prisma bootstrap, the two `CREATE INDEX` statements, and the verification queries. It is an **upper bound** on the index build, not its net time, and the net time was never measured in production. |
| "production runs `84437c3c`" | The deploy workflow deployed `84437c3c` and recorded it. No runtime attestation confirms the running image was built from it — that is DA-3. |
