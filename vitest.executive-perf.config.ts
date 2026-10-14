import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * Executive Management Center — dedicated config for the performance baseline
 * (requirement row 11).
 *
 * Runs ONLY `src/lib/executive/__tests__/pg/**\/*.pg.test.ts`. The baseline
 * needs a live, DISPOSABLE PostgreSQL with every repository migration applied,
 * named by `EXECUTIVE_PERF_DB`; without that variable the suite skips itself,
 * and it refuses any URL that is not plainly a test database, because it
 * WRITES thousands of rows to reach a representative volume.
 *
 * Excluded from the ordinary `vitest run` by vitest.config.ts
 * (`**\/*.pg.test.ts`), so a measurement never slows the normal suite or CI.
 *
 * Sequential and with a long timeout: seeding and 21 repeats are the point.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/lib/executive/__tests__/pg/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
