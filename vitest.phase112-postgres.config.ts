import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 112 — dedicated config for the immutable reasoning-run PostgreSQL
 * integration tests.
 *
 * Runs ONLY the Phase 112 `*.pg.test.ts` files, which require a live PostgreSQL
 * database (DATABASE_URL + HERMES_STORAGE_MODE=database) and the real Prisma
 * client with the `@prisma/adapter-pg` driver adapter. They are excluded from
 * the ordinary `npm run test` run (vitest.config.ts excludes `*.pg.test.ts`)
 * and invoked only via `npm run test:phase112:postgres`.
 *
 * WHY A REAL DATABASE IS THE ONLY PLACE THESE CAN RUN
 * The properties under test — the DB immutability triggers rejecting UPDATE, the
 * lowercase-SHA-256 and positive-byte-size CHECK constraints, the composite
 * tenant FK, the (organizationId, idempotencyKey) unique constraint deciding a
 * concurrent create race, and RESTRICT protecting a run's parent asset — cannot
 * exist in any in-memory double; only PostgreSQL enforces them.
 *
 * Sequential, so one test's rows never disturb another's.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/lib/reasoning-runs/__tests__/pg/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
