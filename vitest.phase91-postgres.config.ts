import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 91 — dedicated config for the REAL PostgreSQL integration suite.
 *
 * Runs ONLY the `*.pg.test.ts` files, which require a live PostgreSQL database
 * (HERMES_STORAGE_MODE=database + DATABASE_URL) and the real Prisma client. These
 * are excluded from the ordinary `npm run test` run (see vitest.config.ts) so the
 * unit suite never needs a database. Invoked only by the CI PostgreSQL rehearsal
 * job via `npm run test:phase91:postgres`.
 *
 * Files run sequentially against shared tables, so parallelism is disabled to
 * keep database state deterministic.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
