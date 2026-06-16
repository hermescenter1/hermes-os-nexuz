# Hermes OS — Database (Phase 11)

Hermes OS runs in two storage modes. The database layer is **optional and
additive**: with no database configured the app builds and runs exactly as V1
did, using in-process session storage. Provide a `DATABASE_URL` and the same
code paths persist to PostgreSQL instead.

## Storage modes

| Condition | Mode | Behavior |
|---|---|---|
| `DATABASE_URL` set | `database` | Cases, knowledge articles, analysis history, and unknown records persist to PostgreSQL via Prisma. |
| `DATABASE_URL` missing | `session` | In-process memory + bundled JSON corpus. Nothing is written to disk or a database. State clears on restart. |

Mode is decided at runtime by `getStorageMode()` (`src/lib/storage/storage-mode.ts`).
Every storage API route returns the active `storageMode`, and the Studios show a
quiet "Storage: Session / Database" indicator.

The Prisma client is loaded **dynamically** and only in database mode
(`src/lib/db/prisma.ts`). If the client is unavailable or a query fails, every
repository degrades to the session implementation — the app never crashes
because of the database.

## DATABASE_URL

Set in `.env` at the project root (see `.env.example`):

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/hermes?schema=public"
```

Example for a local Postgres:

```
DATABASE_URL="postgresql://hermes:hermes@localhost:5432/hermes?schema=public"
```

Prisma 7 reads the URL from `prisma.config.ts` (not from the schema). The app
reads it from the environment via `getStorageMode()`.

## Commands

Package scripts (all wrap the Prisma CLI):

| Script | Command | Purpose |
|---|---|---|
| `npm run db:generate` | `prisma generate` | Generate the typed Prisma client. Run after install and after schema changes. |
| `npm run db:validate` | `prisma validate` | Validate the schema and config. |
| `npm run db:migrate` | `prisma migrate dev` | Create/apply a development migration. |
| `npm run db:seed` | `tsx prisma/seed.ts` | Seed the bundled corpus (14 cases + 30 knowledge libraries). |
| `npm run db:studio` | `prisma studio` | Open Prisma Studio to browse data. |

## First-time setup

```bash
# 1. Configure the connection
echo 'DATABASE_URL="postgresql://hermes:hermes@localhost:5432/hermes?schema=public"' >> .env

# 2. Generate the client
npm run db:generate

# 3. Create and apply the initial migration
npm run db:migrate

# 4. Seed the existing corpus
npm run db:seed
```

After this, restart the app — `getStorageMode()` returns `database` and the
Studios, Unknown Center, and analysis history persist to PostgreSQL.

## Seed

`prisma/seed.ts` reads the existing V1 corpus from
`src/lib/industrial/knowledge-data/` and upserts it:

- **14 engineering cases** → `EngineeringCase` (status `published`)
- **30 knowledge libraries** → `KnowledgeArticle` (status `published`)

It is idempotent (upsert on a deterministic `seed-<id>` key), so re-running it
does not create duplicates. The seed only ever touches the database; it is
never imported by the application.

## Production migrations

In development use `npm run db:migrate` (`prisma migrate dev`), which creates
new migration files as the schema evolves.

In production, **do not** run `migrate dev`. Apply already-committed migrations
with:

```bash
npx prisma migrate deploy
```

`migrate deploy` applies pending migrations without prompting and without
generating new ones — the correct command for CI/CD and production rollouts.
Seed production explicitly and only when intended:

```bash
npm run db:seed
```

## Session fallback

No migration is required to run the app. With `DATABASE_URL` unset:

- `npm run build` and `npm run test` pass with no database.
- All four storage API routes (`/api/cases`, `/api/knowledge`, `/api/analysis`,
  `/api/unknown`) operate against the in-process session store.
- The Studios, Unknown Center, Brain, and Copilot behave exactly as in V1.

This makes the database strictly opt-in: a developer can clone, install, and
run Hermes OS with zero database setup, then enable persistence later by adding
`DATABASE_URL` and running the setup steps above.
