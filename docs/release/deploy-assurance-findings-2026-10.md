# Deploy assurance — open findings, October 2026

Raised while deploying `84437c3c` to production on 2026-10-14 (run 38514426176).
Each one is **OPEN** until the stated closing evidence exists. None of them made
that deploy unsafe, and none of them is closed by it.

| # | Finding | Severity | State |
| --- | --- | --- | --- |
| DA-1 | The backup gate does not check AGE, and the release used a backup 3.7× older than the documented RPO | HIGH | OPEN |
| DA-2 | The migration connection has no lock-wait limit | MEDIUM | **IMPLEMENTED** 2026-10-14 — final acceptance OPEN |
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
