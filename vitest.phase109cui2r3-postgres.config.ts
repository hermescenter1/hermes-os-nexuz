import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

/**
 * PHASE 109-C-UI.2-R4 — dedicated config for the automation-run PostgreSQL
 * rehearsal.
 *
 * Runs ONLY this phase's `*.pg.test.ts`, which needs a live PostgreSQL
 * (DATABASE_URL) and the real Prisma client with the `@prisma/adapter-pg`
 * driver adapter. Excluded from `npm run test` by the repository-wide
 * `*.pg.test.ts` rule and invoked only via `npm run test:phase109cui2r3:postgres`.
 *
 * WHY A REAL DATABASE IS THE ONLY PLACE THESE CAN RUN
 * The properties under test are a PARTIAL unique index and a transactional
 * unique violation. The R3 fake enforces the same two rules, but it is my own
 * re-implementation of the rule I wrote: it cannot prove PostgreSQL created the
 * partial index with the right predicate, nor that it raises 23505 where the
 * store expects it. Only PostgreSQL can.
 *
 * Sequential, because every test in the file competes for the same run scope —
 * which is precisely the thing being tested.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/app/api/industrial/__tests__/pg/**/*.pg.test.ts"],
    exclude: [...configDefaults.exclude, "**/.next/**"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
