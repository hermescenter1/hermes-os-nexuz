# Persistent Knowledge Core — Verification

All four entity types — engineering cases, knowledge articles, the unknown
analysis queue, and audit events — read and write through the repository /
service layer (`src/lib/storage/*`, `src/lib/audit/audit-service.ts`). That
layer has two implementations behind one factory:

- **session** (default, no `DATABASE_URL`): in-process store. State is lost on
  restart — this is the V1 demo mode.
- **database** (`DATABASE_URL` set): Prisma + PostgreSQL. State survives
  restart.

The exact same page and API code runs in both modes; only the storage backend
changes. No page reads or writes a session store directly — they all go
through the repositories and the four API routes (`/api/cases`,
`/api/knowledge`, `/api/unknown`, `/api/analysis`) plus `/api/admin/audit`.

## Why "persists after restart" can't be shown in the build sandbox

`prisma generate` requires downloading engine binaries from
`binaries.prisma.sh`, which is outside this sandbox's network allowlist (HTTP
403). Without a generated client, `@prisma/client` is not importable,
`getPrisma()` returns `null`, and every repository deliberately degrades to
session mode. Restart-persistence therefore can only be demonstrated in an
environment with network access and a PostgreSQL instance.

## Confirming restart-persistence (networked environment)

```bash
# 1. Provision the database and generate the client
echo 'DATABASE_URL="postgresql://hermes:hermes@localhost:5432/hermes?schema=public"' >> .env
npm run db:generate
npm run db:migrate     # applies prisma/migrations/* including the auth + audit tables
npm run db:seed        # loads the 14 cases + 30 knowledge libraries

# 2. Start the app and confirm database mode
npm run start
curl -s localhost:3000/api/analysis | jq .storageMode      # -> "database"

# 3. Write through the live UI or API
curl -s -X POST localhost:3000/api/cases -H 'content-type: application/json' \
  -d '{"title":"Restart Test","vendor":"abb","domain":"drives","confidence":80}'

# 4. RESTART the server (Ctrl-C, then npm run start again)

# 5. Confirm the record is still there
curl -s localhost:3000/api/cases | jq '.cases[] | select(.title=="Restart Test")'
# -> the record is returned: persisted across restart.
```

The same pattern verifies knowledge articles (`/api/knowledge`), the unknown
queue (`/api/unknown`, also created automatically when the Brain classifies a
query as unknown), and audit events (`/api/admin/audit`, written on every
login, case/knowledge/unknown mutation).

## What is verified in the build sandbox

- `npm test` — 70 tests, including the `Persistent Knowledge Core` contract
  suite that round-trips create/list/update/delete/dedup and audit
  record/filter through the repository layer.
- `npm run build` — passes with no `DATABASE_URL`.
- Live session round-trip through all four API routes + the audit log.

Activation in production is configuration only (set `DATABASE_URL`, generate,
migrate, seed) — no application code changes are required.
