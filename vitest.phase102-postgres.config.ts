import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 102 — dedicated config for the Media & Video Hub PostgreSQL rehearsal.
 *
 * Runs ONLY the Phase 102 media `*.pg.test.ts` files, which require a live
 * PostgreSQL database (HERMES_STORAGE_MODE=database + DATABASE_URL) and the real
 * Prisma client. They are excluded from the ordinary `npm run test` run
 * (vitest.config.ts excludes `*.pg.test.ts`) and invoked only by the CI
 * PostgreSQL job via `npm run test:phase102:postgres`.
 *
 * WHY A REAL DATABASE IS THE ONLY PLACE THESE CAN RUN
 * The property under test is a compare-and-swap under concurrency. Every unit
 * harness in this repository stubs `$transaction` as a pass-through, so there is
 * no isolation, no row lock and no second connection — a lost-update race is
 * literally unrepresentable there, and a suite that "covered" it would be
 * covering its own double. Only PostgreSQL can block the second writer on the
 * row lock and make it re-evaluate its predicate against the committed row.
 *
 * Sequential, so a held-lock barrier is not disturbed by a parallel file.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/lib/media/**/*.pg.test.ts", "src/app/api/media/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
