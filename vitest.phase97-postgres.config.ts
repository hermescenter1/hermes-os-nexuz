import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 97 — dedicated config for the compliance PostgreSQL rehearsal.
 *
 * Runs ONLY the Phase 97 compliance `*.pg.test.ts` files (lineage, concurrency,
 * snapshot + evidence-pack integrity) which require a live PostgreSQL database
 * (HERMES_STORAGE_MODE=database + DATABASE_URL) and the real Prisma client.
 * Excluded from the ordinary `npm run test` run (vitest.config.ts excludes
 * `*.pg.test.ts`). Invoked only by the CI PostgreSQL rehearsal job via
 * `npm run test:phase97:postgres`.
 *
 * Sequential so shared-table state stays deterministic across held-lock barriers.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/app/api/compliance/**/*.pg.test.ts", "src/lib/compliance/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
