import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
    // Optional: set SHADOW_DATABASE_URL to a PostgreSQL database that has the
    // pgvector extension installed (e.g. Neon, Supabase, or a second local DB).
    // Without this, `prisma migrate dev` will detect persistent schema drift for
    // the Unsupported("vector(1536)") columns when running on a server without
    // pgvector. `prisma migrate status` and `prisma migrate deploy` are not
    // affected — they apply migrations only and do not check for vector drift.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});

/**
 * Prisma 7 configuration (Phase 11A).
 *
 * Prisma 7 no longer accepts `url` inside the schema's datasource block
 * (P1012). The connection string is supplied here instead, loaded from the
 * environment. When DATABASE_URL is absent the app still builds and runs in
 * V1 session mode — Prisma is only invoked in database mode (see
 * src/lib/db/prisma.ts), so an empty string here never breaks the app.
 *
 * Phase 41.5: SHADOW_DATABASE_URL is now optional. Set it to a pgvector-capable
 * PostgreSQL instance to eliminate vector-column drift warnings during
 * `prisma migrate dev`. When absent, Prisma creates its own shadow database
 * which will not have pgvector; use `prisma migrate status` to confirm all
 * migrations are applied cleanly on servers without pgvector.
 */


