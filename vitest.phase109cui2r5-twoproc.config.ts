import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 109-C-UI.2-R5 — config for ONE HALF of the two-process claim race.
 *
 * Deliberately narrow: it includes only the two-process probe, because the
 * harness (`r5-two-process.mjs`) launches this config twice as separate OS
 * processes with different idempotency keys and a shared start instant. Running
 * the whole PG suite twice in parallel would have the two halves fighting over
 * fixtures instead of over the one scope under test.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/app/api/industrial/__tests__/pg/phase109cui2r5-two-process-claim.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
