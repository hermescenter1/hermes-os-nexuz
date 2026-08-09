import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // The app tsconfig sets `jsx: "preserve"` (Next.js compiles JSX itself). Vitest 4
  // transforms with oxc, which would otherwise honour that and leave JSX unparsed —
  // so any test that imports a `.tsx` component fails. Override the transform to the
  // automatic JSX runtime for tests ONLY. This does not affect `next build`, adds no
  // dependency, and leaves the many JSX-free node tests unchanged. (PHASE 87B amendment)
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // Default environment stays `node` for the whole existing suite; the runtime
    // interaction tests opt into jsdom per-file via `// @vitest-environment jsdom`.
    environment: "node",
    // Never run tests out of the Next build output — `.next/standalone`
    // contains stale duplicate copies of these route tests (Phase 82C.1).
    //
    // Phase 99.7: also never run tests out of an agent worktree. Claude Code
    // creates task worktrees under `.claude/worktrees/<name>/`, which is a FULL
    // second checkout inside this directory. Without this exclusion the suite
    // collected every test twice (331 real files -> 656 collected) and reported
    // failures from the other branch's code as if they were this branch's. CI
    // never sees it — a CI checkout has no worktrees — which is exactly what
    // makes it dangerous locally: it makes a clean branch look broken, and
    // could equally make a broken one look fine.
    //
    // Phase 91: `*.pg.test.ts` require a live PostgreSQL database and run only
    // under vitest.phase91-postgres.config.ts in CI — never in the unit run.
    exclude: [
      ...configDefaults.exclude,
      ".next/**",
      "**/.next/**",
      ".claude/**",
      "**/.claude/**",
      "**/*.pg.test.ts",
    ],
  },
});
