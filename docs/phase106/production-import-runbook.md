# Phase 106 — production Journal import runbook

The Phase 106 corpus (50 topics × EN/FA/DE = 150 editions) is **content data**,
not schema. Deploying the release and applying its migration does not import it,
and is not meant to: a deploy can succeed, be verified and be rolled back
without ever implying that production content was rewritten.

This runbook covers the separate, explicit operation that writes the corpus.

## Why the import is not part of the deploy

`deploy.yml` is held to a contract by Gate 0D-A: within the deploy path,
`docker compose run` is permitted only for `hermes-migrate`, and `exec` only for
read-only `SELECT`s. The deploy therefore **provably cannot write to the
database** beyond applying migrations — which is what makes it safe to approve.
Appending a content import there would delete that property for every future
release. The import lives in its own protected workflow instead.

## Preconditions

| Requirement | Why |
| --- | --- |
| The target commit is already deployed and running | The importer image is built from the production checkout; importing from a different commit would write a corpus the running code was not built for |
| Production worktree is clean and at that exact SHA | Verified on the server by the workflow; it never moves source itself |
| The migration is applied and verified | `ArtLanguage` must already contain `DE` and `Article` must carry the `(slug, language)` composite unique, or the write cannot land |
| A verified pre-import backup exists | Content import is a data write; the deploy workflow's backup gate covers the migration, not this |

## The two commands

Both run on the production host, from the deployment directory. The importer
image is built from the pinned checkout, so the corpus is exactly the target
commit's.

Build the one-shot importer:

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile journal-import build hermes-journal-import
```

### 1. Dry run — always first

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile journal-import run --rm hermes-journal-import
```

The image `CMD` is the dry run, so the bare `run` above never writes.

Expected tail:

```text
Validation errors:      0
DRY_RUN=PASS

No database connection was opened. To write, re-run with --commit.
```

Required before continuing: `DRY_RUN=PASS`, `Validation errors: 0`, 50 topics /
150 editions, and the explicit "no database connection" line. If any differ from
the release-candidate evidence, stop — do not import.

### 2. Real import — explicit `--commit`

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production --profile journal-import run --rm hermes-journal-import node scripts/journal/import-articles.mjs --commit
```

Expected on a first rollout:

```text
Created:    150
Updated:      0
Unchanged:    0
Conflicts:    0
```

Expected on any subsequent run (idempotency):

```text
Created:      0
Updated:      0
Unchanged: 150
Conflicts:    0
```

Run it a second time and confirm the second shape. A row moving to `Updated`
that nobody edited means something else is writing to those records.

## Preferred path: the protected workflow

Rather than running the commands by hand, use **Actions → Journal Content
Import**. It performs the same steps against the same pinned image, but adds the
controls a hand-run cannot:

| Input | Value |
| --- | --- |
| `commit_sha` | The 40-hex SHA currently deployed in production |
| `journal_import_confirmation` | Leave **empty** for a dry-run rehearsal; type `import-phase106-journal` to actually import |

It runs in the protected `production` environment (same required reviewers as a
deploy), verifies the commit is in approved main history, verifies the server is
clean at that SHA, **always runs the dry run first and fails closed if it does
not report `DRY_RUN=PASS`**, and only then — with the exact confirmation phrase —
performs the write. A wrong phrase is refused outright; an absent one yields a
rehearsal. It never falls back to importing.

## Database verification

Read-only. Run after a real import:

```bash
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U hermes -d hermes_db -c "SELECT count(DISTINCT slug) AS topics, count(*) AS rows FROM \"Article\""
```

Required: `topics = 50`, `rows = 150`, every group trilingual, zero duplicate
`(slug, language)` pairs. The workflow asserts all four and fails the job if any
is wrong.

## Stop conditions

Stop before the write, capture evidence, and classify the defect if any of these
appear:

- the dry run reports any validation error, or a topic/edition count other than 50 / 150
- the dry run does not print that it opened no database connection
- production HEAD is not the requested SHA, or the worktree is dirty
- `ArtLanguage` has no `DE`, or the `(slug, language)` unique is missing
- pre-existing rows collide with corpus slugs under a different author
- the second import reports anything in `Updated` or `Conflicts`

## Rollback posture

The migration is additive and the importer is idempotent, but **the imported
editions are production content**. There is deliberately no automated command
that deletes them.

- To roll back **code**, redeploy the previous good SHA. The corpus stays; it is
  additive data and the previous release simply does not link to it.
- To roll back **data**, restore from the verified pre-import backup as a
  separate, human-decided operation.
- Never answer a failed import with a database restore inside the import path.
  Capture the importer output, verify the current row counts, then decide.

The importer has no `--force`. It issues no delete, no truncate and no
destructive raw SQL, and each translation group is written in one transaction —
a group either lands whole or not at all. Do not add a switch to work around a
conflict; a conflict means the content and the database disagree, and that is a
question to answer, not a flag to pass.
