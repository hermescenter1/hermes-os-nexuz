# ── Stage 1: deps ─────────────────────────────────────────────────────────────
# Install production + dev deps, build tools for native modules, generate Prisma client.
FROM node:20-alpine AS deps
WORKDIR /app

# Build tools required by argon2 (native module) and other bindings
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps
RUN npx prisma generate

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

ENV NODE_ENV=production
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=$NEXT_PUBLIC_GA_MEASUREMENT_ID
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV DATABASE_URL="postgresql://hermes:changeme@localhost:5432/hermes_db"
ENV JWT_ACCESS_SECRET="build-time-placeholder-64-chars-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
ENV JWT_REFRESH_SECRET="build-time-placeholder-64-chars-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
ENV NEXT_PUBLIC_APP_URL="https://placeholder.build"
ENV APP_URL="https://placeholder.build"
ENV HERMES_STORAGE_MODE="session"

RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
# Minimal production image using Next.js standalone output.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output (contains an embedded Node server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma files needed at runtime for migrations + client
COPY --from=builder --chown=nextjs:nodejs /app/prisma           ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pg       ./node_modules/pg
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/pgpass   ./node_modules/pgpass
# dotenv is required by prisma.config.ts during `npx prisma migrate deploy`
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/dotenv   ./node_modules/dotenv

# Phase 76: Ensure upload directory exists and is owned by the runtime user.
# The Docker volume for uploads is mounted at /app/public/uploads at runtime;
# creating it here initializes correct ownership when the volume is first used.
RUN mkdir -p /app/public/uploads/authors && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
