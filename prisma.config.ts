import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration (Phase 11A).
 *
 * Prisma 7 no longer accepts `url` inside the schema's datasource block
 * (P1012). The connection string is supplied here instead, loaded from the
 * environment. When DATABASE_URL is absent the app still builds and runs in
 * V1 session mode — Prisma is only invoked in database mode (see
 * src/lib/db/prisma.ts), so an empty string here never breaks the app.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
