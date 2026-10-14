# Deploy assurance — open findings, October 2026

Raised while deploying `84437c3c` to production on 2026-10-14 (run 38514426176).
Each one is **OPEN** until the stated closing evidence exists. None of them made
that deploy unsafe, and none of them is closed by it.

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| DA-1 | The backup gate does not check AGE, and the release used a backup 3.7× older than the documented RPO | HIGH | OPEN |
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
