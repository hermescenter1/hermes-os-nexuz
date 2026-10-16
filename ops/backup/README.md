# Scheduling the encrypted PostgreSQL backup

The deploy gate releases only against a `.hbk` artifact in `/backups/postgres`
produced by `scripts/backup-postgres.sh`. These units run that script daily.

## Why this exists

The DR runbook has always said the cadence is *"24 h, owner-activated host
cron"*, and the repository shipped nothing to activate. On **2026-10-15** the
consequence surfaced in production:

* the local backup (`/var/backups/hermes/2026-10-15_03-16-27`) was **current**,
  `HERMES_BACKUP=PASS`;
* `hermes-dr-backup.service` was **current**, snapshot `e7a2bca7` at
  `2026-10-15 03:46:12`, `HERMES_DR_BACKUP=PASS`;
* and the newest `.hbk` in `/backups/postgres` was still from **10 October**.

Backups were running. The artefact the **release contract** accepts was not
being produced. The two are different mechanisms, and a healthy DR pipeline
says nothing about the one the deploy gate reads.

> `hermes-dr-backup.service` is **not** a substitute. Replacing the gate's
> source would require proving equivalence of coverage, encryption, integrity,
> freshness and restore procedure, separately and on its own evidence. That
> has not been done and is not proposed here.

## The order, end to end

Each step produces the evidence the next one depends on. Doing them out of
order — merging first, or dispatching a deploy before a fresh artefact exists
— produces a red gate that proves nothing about the fix.

| # | Step | Evidence it must produce |
|---|------|--------------------------|
| 1 | **Step 0**, below: find the existing key binding | the file that binds it, the key-file path, the key id — no key material |
| 2 | **Install**, below: units + drop-in + `enable --now` | `systemd-analyze verify` clean, `systemctl status` loaded/enabled, `list-timers` with a next elapse |
| 3 | **Take one now**: one controlled `systemctl start` | a new `.hbk` **and** its `.meta.json` in `/backups/postgres`, journal exit 0, no key in the journal |
| 4 | Check that artefact against the contract | `verified:true`, `partial:false`, `encrypted:true`, `"file"` naming it, `transportSha256` equal to `sha256sum`, age well under 30 h |
| 5 | **Prove it restores**: `hbk.mjs header` + `verify` | both exit 0 against the real artefact |
| 6 | Merge the DA-1 pull request | main carries the gate, the units and this runbook |
| 7 | Dispatch a **fresh** deploy from the new main | the run's pre-migration step prints `FRESHNESS result=FRESH` with the real age and limit |

DA-1 closes at step 7, on that line in a real production run — not on a green
test suite, and not on this document.

## Step 0 — find the key binding that already exists, without reading it

`scripts/backup-postgres.sh` has been producing encrypted artefacts on this
host before, so the key and its identifier are already bound somewhere. Find
*where* before writing a new drop-in — a second, divergent binding is how a
host ends up with artefacts nothing can decrypt.

Every command below prints **file names, variable names, a path and a
non-secret identifier**. None prints key material, none dumps `.env` or shell
history, and none prints an environment block unredacted.

Which files mention the two variables — **paths only**, `-l` suppresses every
matching line:

```bash
sudo -n grep -rslE 'HERMES_BACKUP_KEY_(FILE|ID)' /etc/systemd/system /etc/default /etc/hermes-backup /etc/cron.d 2>/dev/null
```

Which of the two each file binds — **variable names only**, `-o` without a
value pattern:

```bash
sudo -n grep -rhoE 'HERMES_BACKUP_KEY_(FILE|ID)\b' /etc/systemd/system /etc/default /etc/hermes-backup /etc/cron.d 2>/dev/null | sort | uniq -c
```

The key **file path** and the **key id** are configuration, not secrets — the
id is already written in plaintext into every `.meta.json` the gate reads, and
the path is a filename. Both are needed to write a matching drop-in:

```bash
sudo -n grep -rhoE 'HERMES_BACKUP_KEY_(FILE|ID)=[^[:space:]"'"'"']+' /etc/systemd/system /etc/default /etc/hermes-backup 2>/dev/null | sort -u
```

Confirm the key file itself exists and is owner-only — **metadata only, never
contents**:

```bash
sudo -n stat -c '%n owner=%U:%G mode=%a size=%s' /etc/hermes-backup/hermes-backup.key
```

Any unit that already carries the variables, with **values redacted**:

```bash
sudo -n systemctl show hermes-dr-backup.service -p Environment | sed -E 's/=[^[:space:]]+/=<redacted>/g'
```

What is scheduled today — **unit names only**:

```bash
systemctl list-timers --all --no-pager | grep -iE 'hermes|backup' ; sudo -n ls -1 /etc/cron.d 2>/dev/null | grep -i backup
```

If Step 0 finds an existing binding, reuse those exact values in the drop-in
below. If it finds none, the key id and path must come from the owner — do not
invent either.

> **Run on 2026-10-15.** Step 0 was carried out on the production host and the
> key file it reports is `/etc/hermes-backup/hermes-backup.key`, which is the
> path used throughout this document from here on. An earlier draft guessed
> `/etc/hermes/backup.key`; that guess was wrong and is gone.
>
> The **key id** is deliberately not written here. It is not a secret — it is
> recorded in plaintext in every `.meta.json` the gate reads — but it belongs
> in the host's drop-in, not in the repository, where it would only ever be a
> stale copy of what the host already knows.

## Install

Validate the units **before** they are installed; `systemd-analyze verify`
parses them without activating anything:

```bash
systemd-analyze verify /opt/hermes-os-nexuz/ops/backup/hermes-pg-backup.service /opt/hermes-os-nexuz/ops/backup/hermes-pg-backup.timer
```

```bash
sudo install -m 0644 -o root -g root /opt/hermes-os-nexuz/ops/backup/hermes-pg-backup.service /etc/systemd/system/
sudo install -m 0644 -o root -g root /opt/hermes-os-nexuz/ops/backup/hermes-pg-backup.timer   /etc/systemd/system/
```

Every command in this section is idempotent: `install` overwrites in place,
`daemon-reload` is a no-op when nothing changed, and `enable --now` on an
already-enabled, already-started timer changes nothing. Running the whole
section twice is safe and is the intended way to re-apply after an edit.

Supply the two required inputs in a drop-in that is **not** in this
repository. The script fails closed (exit 2) without them, which is the
correct outcome for a misconfigured host:

```bash
sudo mkdir -p /etc/systemd/system/hermes-pg-backup.service.d
sudo install -m 0600 /dev/stdin /etc/systemd/system/hermes-pg-backup.service.d/key.conf <<'EOF'
[Service]
Environment=HERMES_BACKUP_KEY_FILE=/etc/hermes-backup/hermes-backup.key
Environment=HERMES_BACKUP_KEY_ID=REPLACE_WITH_THE_NON_SECRET_KEY_ID
EOF
```

The key **file path** and its **identifier** are configuration. The key itself
is never written here, never passed on a command line and never echoed — the
script reads it from the file, which must be owner-only (`chmod 600`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-pg-backup.timer
```

## Verify the schedule is real

Both are required: `status` proves the unit loaded and is enabled, and
`list-timers` proves a next elapse is actually scheduled. A timer can be
enabled and still never fire if its unit failed to load.

```bash
systemctl status hermes-pg-backup.timer --no-pager
```

```bash
systemctl list-timers hermes-pg-backup.timer --all --no-pager
```

## Take one now, and confirm it satisfies the release contract

```bash
sudo systemctl start hermes-pg-backup.service
journalctl -u hermes-pg-backup.service --no-pager -n 40
```

Then check exactly what the deploy gate checks — newest artifact, no
`.partial` sibling, a verification record naming that file and marking it
verified, complete and encrypted, and a transport hash that matches:

```bash
sudo -n find /backups/postgres -maxdepth 1 -type f -name '*.hbk' -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort | tail -3
```

```bash
NEWEST="$(sudo -n find /backups/postgres -maxdepth 1 -type f -name '*.hbk' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"; sudo -n cat "${NEWEST}.meta.json"; sudo -n sha256sum "${NEWEST}"
```

The `transportSha256` in the record must equal that `sha256sum`, and the
record's `"file"` must name that exact artifact. The record carries
`verified`, `partial`, `encrypted`, `keyId`, `transportSha256` and
`createdAtMs` — all non-secret, and `keyId` is an identifier, not a key.

Confirm the journal leaked nothing. `scripts/dr/hbk.mjs` takes keys only via
`--key-file`, never as a value, so this must return no match:

```bash
sudo -n journalctl -u hermes-pg-backup.service --no-pager -n 200 | grep -ciE 'BEGIN [A-Z ]*PRIVATE KEY|[A-Za-z0-9+/]{60,}={0,2}'
```

## Prove the artifact is actually restorable

A gate that accepts an artefact nothing can restore has proven nothing. The
repository's own path does this, and it authenticates before it writes:

```bash
node scripts/dr/hbk.mjs header --in "${NEWEST}"
```

```bash
node scripts/dr/hbk.mjs verify --in "${NEWEST}" --key-file /etc/hermes-backup/hermes-backup.key
```

`verify` authenticates the AES-256-GCM envelope without decrypting to disk and
without touching any database. Only a full rehearsal goes further, and it is
**destructive to its target** — `scripts/restore-postgres.sh <artifact.hbk>`
refuses to run without `RESTORE_CONFIRM`, and must be pointed at a disposable
database, never production. The CI equivalent, which proves the whole
backup → disaster → restore pipeline against a throwaway PostgreSQL 16, is
`scripts/ci/phase93-dr-restore-rehearsal.mjs`.

## What must never be done instead

* **Do not rename a plaintext dump to `.hbk`.** The artifact is an AES-256-GCM
  envelope produced and authenticated by `scripts/dr/hbk.mjs`; a renamed dump
  is an unencrypted database with a misleading extension.
* **Do not hand-write a `.meta.json` or set `"verified": true`.** The record is
  written by the script only after `hbk.mjs verify` has authenticated the
  sealed artifact. A record that claims verification nothing performed is worse
  than no record: the gate would pass and the restore would not.

## Freshness

The gate refuses an artifact older than `BACKUP_MAX_AGE_HOURS` (default **30**:
the 24 h RPO plus one interval, so a single missed run stops the next release
rather than quietly widening the restore window).
