# ── Stage 1: deps ─────────────────────────────────────────────────────────────
# Install production + dev deps, build tools for native modules, generate Prisma client.
FROM node:20-alpine AS deps
WORKDIR /app

# Build tools required by argon2 (native module) and other bindings
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps

# Phase 99.7: invoke the PINNED, locally-installed Prisma CLI — never `npx`.
#
# With a healthy dependency layer `npx prisma generate` resolves the local CLI
# and is correct. The problem is what it does when that resolution FAILS: it
# silently falls back to the network. An observed build on a degraded layer
# cache logged
#   "npm warn exec The following package was not found and will be installed: prisma@7.9.1"
# — i.e. it was about to generate the client with a DIFFERENT Prisma version
# than this repository pins (7.8.0), chosen at build time by whatever the
# registry served, and only failed afterwards on "Could not resolve
# @prisma/client". A build that quietly substitutes unpinned tooling is exactly
# what the release contract forbids for migrations; it must not be possible for
# client generation either.
#
# Calling the CLI through this checkout's own node_modules makes the version an
# artifact of package-lock.json, and turns "the dependency is missing" into a
# loud, immediate failure instead of a silent network substitution.
RUN node node_modules/prisma/build/index.js generate

# ── Stage 2: builder ──────────────────────────────────────────────────────────
# Full Next.js build. Dummy env values are used so the build completes without
# a live database — real values are injected at container start via .env.production.
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined by webpack at build time — they cannot be
# overridden at runtime. Pass them as --build-arg so the bundle contains the
# real values. Example:
#   docker build --build-arg NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX .
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=""
ARG NEXT_PUBLIC_GTM_ID=""
# SEO canonical host — inlined into every canonical / hreflang / sitemap / robots
# / OpenGraph / JSON-LD URL at build time (src/lib/seo/config.ts). Defaults to the
# canonical production host so a build that forgets to pass it still emits correct
# canonicals; override with --build-arg NEXT_PUBLIC_BASE_URL=… for other envs.
ARG NEXT_PUBLIC_BASE_URL="https://hermesnovin.com"

ENV NODE_ENV=production
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV DATABASE_URL="postgresql://hermes:changeme@localhost:5432/hermes_db"
ENV JWT_ACCESS_SECRET="build-time-placeholder-64-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ENV JWT_REFRESH_SECRET="build-time-placeholder-64-chars-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
ENV NEXT_PUBLIC_APP_URL="https://placeholder.build"
ENV APP_URL="https://placeholder.build"
ENV HERMES_STORAGE_MODE="session"

RUN npm run build

# ── Stage 3: migrator (Phase 99.7) ────────────────────────────────────────────
# Pinned, target-derived migration runner. The runner image deliberately ships
# only the Prisma RUNTIME (client + engines), not the CLI, and its CMD is
# `node server.js` — nothing applies migrations on boot. Production migrations
# are therefore an EXPLICIT step, and this stage is the thing that runs it:
# built from the same pinned checkout as the release (so the migration set and
# the CLI version come from the target commit's own lockfile), never from a
# network-fetched `npx prisma@latest`.
#
# Invoked ONLY via the profile-gated `hermes-migrate` compose service (see
# docker-compose.prod.yml); `docker compose up` never starts it. Read-only over
# the filesystem; run as a non-root user.
FROM node:20-alpine AS migrator
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S migrator -u 1001

# Full node_modules from deps: the Prisma CLI (devDependency), its engines, and
# dotenv (required by prisma.config.ts). Root-owned and read-only to the
# non-root user — `migrate deploy` only reads these files.
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts package.json ./

USER migrator

# `migrate deploy` applies pending migrations and exits non-zero on failure.
# Override the command with `... migrate status` to verify without writing.
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ── Stage 3b: journal-importer ────────────────────────────────────────────────
# PHASE 106A — the one-shot content import path.
#
# WHY A DEDICATED STAGE
# The Phase 106 corpus is imported by scripts/journal/import-articles.mjs, and
# NEITHER that script NOR content/journal reaches any other image: `.dockerignore`
# excluded `scripts/` outright, and no stage ever COPYied `content/`. So the
# importer had no execution path in production at all — the deploy could apply
# the migration and leave the Journal empty. This stage is that missing path,
# and it stays SEPARATE on purpose:
#
#   * the runner must not double as an administrative shell;
#   * schema migration (migrator) and content import stay distinct operations,
#     so one can succeed, be verified, and be reasoned about without the other;
#   * nothing here is reachable from a normal `docker compose up` — the Compose
#     service is gated behind the `journal-import` profile.
#
# node_modules is copied WHOLE from deps, exactly as the migrator stage does.
# The importer needs @prisma/client, @prisma/adapter-pg and the pg driver chain;
# hand-pruning that transitive closure (pg-pool, pg-protocol, pg-connection-string,
# postgres-*, split2 …) is guesswork that fails at run time, in production, on a
# release night. The image is built on the host and never published, so the cost
# is disk, and the benefit is that the dependency set is an artifact of
# package-lock.json rather than of this comment.
FROM node:20-alpine AS journal-importer
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S importer -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts package.json ./

# The corpus and the importer. corpus.mjs resolves the content root RELATIVE TO
# ITS OWN FILE (`dirname(import.meta.url)/../../..`), so this layout — scripts
# and content as siblings under /app — is the one the loader already expects.
COPY content/journal ./content/journal
COPY scripts/journal ./scripts/journal

# Root-owned, read-only to the runtime user: the importer only ever READS the
# corpus. Everything it writes goes to PostgreSQL, never to this filesystem.
USER importer

# DRY RUN IS THE DEFAULT, and it is the default HERE too. import-articles.mjs
# writes only when `--commit` appears in argv, so a container started with no
# command — `docker compose … run --rm hermes-journal-import` — validates and
# exits without opening a database connection. Writing requires an operator to
# type the flag. There is deliberately no --force in the importer.
CMD ["node", "scripts/journal/import-articles.mjs"]

# ── Stage 4: runner ───────────────────────────────────────────────────────────
# Minimal production image using Next.js standalone output.
# NOTE: runner MUST remain the LAST stage — a bare `docker build .` (and the
# production compose build) targets the final stage.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output (contains an embedded Node server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma RUNTIME files (client + engines). The runner never applies migrations —
# that is the migrator stage's job (Phase 99.7); these stay for the query client.
COPY --from=builder --chown=nextjs:nodejs /app/prisma           ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pg       ./node_modules/pg
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pgpass   ./node_modules/pgpass
# dotenv is required whenever prisma.config.ts is loaded (Prisma tooling)
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/dotenv   ./node_modules/dotenv

# Phase 76: Ensure upload directory exists and is owned by the runtime user.
# The Docker volume for uploads is mounted at /app/public/uploads at runtime;
# creating it here initializes correct ownership when the volume is first used.
RUN mkdir -p /app/public/uploads/authors /app/public/uploads/articles && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
