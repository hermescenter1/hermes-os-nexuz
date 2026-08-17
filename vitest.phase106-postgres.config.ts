import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 106 — dedicated config for the Journal import PostgreSQL rehearsal.
 *
 * Runs ONLY the Phase 106 Journal `*.pg.test.ts` files, which require a live
 * PostgreSQL database (DATABASE_URL) and the real Prisma client with the
 * `@prisma/adapter-pg` driver adapter. They are excluded from the ordinary
 * `npm run test` run (vitest.config.ts excludes `*.pg.test.ts`) and invoked
 * only via `npm run test:phase106:postgres`.
 *
 * WHY A REAL DATABASE IS THE ONLY PLACE THESE CAN RUN
 * The property under test is transactional atomicity: when a translation group
 * fails part-way, no edition of it may survive. Every in-memory harness in this
 * repository — including this phase's own `fake-prisma.mjs` — runs a
 * `$transaction` callback directly with no rollback, so a partial write is
 * literally unrepresentable there and a suite that "covered" it would be
 * covering its own double. Only PostgreSQL can actually abort the transaction
 * and discard the rows already written inside it.
 *
 * The same rehearsal also caught a defect no double could: the importer built a
 * bare `new PrismaClient()`, which cannot connect under this repository's
 * `driverAdapters` schema (its datasource carries no `url`).
 *
 * Sequential, so one test's transaction state is never disturbed by another
 * file writing the same rows.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["scripts/journal/__tests__/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
