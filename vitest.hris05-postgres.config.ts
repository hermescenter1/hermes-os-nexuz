import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * HRIS-0.5 — dedicated config for the ERP tenant-boundary PostgreSQL rehearsal.
 *
 * Runs ONLY `src/lib/erp/__tests__/pg/**\/*.pg.test.ts`. They need a live,
 * DISPOSABLE PostgreSQL 16 database with every repository migration applied
 * (`HERMES_STORAGE_MODE=database`, `DATABASE_URL`). They are excluded from the
 * ordinary `vitest run` by vitest.config.ts (`**\/*.pg.test.ts`) and must never
 * be pointed at a production or shared database: the suite deletes its own
 * fixtures by the `hris05pg` tag on start and on exit.
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
    include: ["src/lib/erp/__tests__/pg/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
