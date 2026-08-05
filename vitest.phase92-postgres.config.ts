import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 92 — dedicated config for the observability PostgreSQL rehearsal.
 *
 * Runs ONLY the Phase 92 `*.pg.test.ts` files (migration index verification +
 * audit-retention sweep) which require a live PostgreSQL database
 * (HERMES_STORAGE_MODE=database + DATABASE_URL) and the real Prisma client.
 * Excluded from the ordinary `npm run test` run (vitest.config.ts excludes
 * `*.pg.test.ts`). Invoked only by the CI PostgreSQL rehearsal job via
 * `npm run test:phase92:postgres`.
 *
 * Sequential, like the Phase 91 config, so shared-table state stays deterministic.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/lib/observability/__tests__/pg/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
