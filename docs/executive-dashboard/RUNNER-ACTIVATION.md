# Executive report runner — production activation runbook

Status: **PREPARED; NOT EXECUTED.** Every step below that runs on the production
host is an operator action. Nothing here has been run until its evidence is
recorded in the "Evidence" table at the end.

The runner (`hermes-executive-report-worker`) polls
`POST /api/executive/reports/run` on `hermes-web`, which freezes one report per
organization per finished business day and notifies its owners and
administrators. It authenticates with **its own** bearer token,
`EXECUTIVE_REPORT_WORKER_TOKEN` — decided by the owner on 2026-10-13: the
metering token is **not** shared with this job, even though the route would
accept it.

## 0. Preconditions

| Check | How |
| --- | --- |
| The deployed commit contains the runner, its compose service and this script | production runs a commit at or after `f65a1f42` (PRs #134–#137) plus this runbook's merge |
| Migrations `20261011090000_executive_daily_report` and `20261012120000_executive_settings` are applied | the deploy log: `migrate status` clean, applied count = target count |
| `hermes-web` is healthy | the deploy's post-deploy health gate passed |

## 1. Create the credential — on the host, never printed

From the deployed checkout on the production host, as the deploy user:

```bash
scripts/executive/provision-report-worker-token.sh .env.production
```

It generates 32 random bytes as 64 hex characters, appends the
`EXECUTIVE_REPORT_WORKER_TOKEN` line to `.env.production` without changing the
file's owner or mode, and prints only that the line was added. It is
**idempotent**: run again, it finds the well-formed token, leaves it untouched
and exits 0. A malformed or duplicated value is refused (exit 3) and needs a
human. The value never appears on screen, in shell history, in Git, in CI or in
any message. Rotating is deliberate: remove the line, run the script, then
recreate both containers below.

Do **not** copy `METERING_WORKER_TOKEN` or `METRICS_TOKEN` into it.

**Which containers must load it.** Editing the env file changes no running
container; each reads `.env.production` (`env_file:`) only when it is created.

| Service | Why it needs the token | How it picks it up |
| --- | --- | --- |
| `hermes-web` | verifies the runner's bearer token on `POST /api/executive/reports/run` | recreated by the redeploy in step 2 |
| `hermes-executive-report-worker` | sends the bearer token | created by the start in step 3 |

No other service needs it.

## 2. Make hermes-web read it

An env file is read when a container is created. Redeploy the **same** commit
through the standard workflow (`deploy.yml`, `commit_sha` = `deployed_sha` = the
running commit). That recreates `hermes-web` only, with the backup gate, the
migration check (no new migrations) and the health gate as usual.

## 3. Start the runner — once

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --build hermes-executive-report-worker
```

The deploy workflow never starts workers (it recreates `hermes-web` only), so
this is the one manual start. `restart: unless-stopped` keeps it running across
crashes and host reboots afterwards.

## 4. Verify — what to record

```bash
# image and digest actually running
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production images hermes-executive-report-worker
docker inspect --format '{{.Image}} {{.HostConfig.RestartPolicy.Name}} {{.State.Status}} restarts={{.RestartCount}}' "$(docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production ps -q hermes-executive-report-worker)"

# first lines: "starting … tokenConfigured:true", then "pass complete"
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production logs --no-color --since 30m hermes-executive-report-worker | tail -n 20
```

Expect, in order: `"msg":"starting"` with `"tokenConfigured":true` (a boolean,
never the value), then `"msg":"pass complete"` with `leaseHeld`, `considered`,
`created`, `alreadyReported`, `notified`, `undelivered`. A `"level":"ERROR"`
line `pass refused … fatal:true` means the token does not match `hermes-web`
(step 2 was skipped or the values differ): the runner stops itself rather than
retrying a closed door.

**Schedule and time zone.** The runner polls every 15 minutes
(`EXECUTIVE_REPORT_INTERVAL_MS`, default 900000). A report is produced for an
organization once its business day has FINISHED in that organization's own
zone and cutoff (`/dashboard/executive/settings`; default `HERMES_EXECUTIVE_TIME_ZONE`).
There is no single wall-clock run time by design.

**The first run after start is a MANUAL-START run, not a scheduled one.** Record
it separately. Row 10 of `REQUIREMENTS-TRACKER.md` stays open until a pass that
the 15-minute loop itself triggered — after a business-day boundary has passed
in an organization's zone — has created that night's report, and the report and
its notification have been checked.

**Checking a report and its notification without duplicates:** in the app, as an
owner, `/dashboard/executive/reports` lists one entry per finished day (a
correction appears as a new version, never a second v1); the bell shows one
"Executive daily report" notification per report per owner/administrator.

## 5. Failure monitoring

The runner's log (json-file, rotated 20 MB × 5) carries:

* `WARN organization not reported` — one per organization whose report failed;
* `WARN report not announced` — one per report that reached nobody
  (`NO_RECIPIENT` / `DELIVERY_FAILED`); it is retried on the next pass;
* `ERROR pass refused … fatal:true` — the credential is not accepted.

No log line contains the token, a figure from a report, or a personal field.
Paging on these lines (for example from the existing Uptime Kuma, or a log
alert) is an operator choice and is **not** configured by this runbook.

## 6. Recovery and rollback

* A missed night is still "finished and unreported": the next pass makes it.
* Stop scheduling: `docker compose … stop hermes-executive-report-worker`.
  Reports already made stay in the archive.
* Rotate the token: remove the line from `.env.production`, run step 1 again,
  then steps 2 and 3 (recreate both containers).

## Evidence

| Step | Date / time (UTC) | Result | Recorded by |
| --- | --- | --- | --- |
| 1 credential created | | | |
| 2 hermes-web redeployed | | | |
| 3 runner started (manual start) | | | |
| 4 first pass (manual-start run) | | | |
| 4 first SCHEDULED pass that created a report | | | |
| 4 report + notification checked, no duplicate | | | |
