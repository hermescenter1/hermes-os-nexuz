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
    // PHASE 99.7 — make the RESULT deterministic, not the runtime.
    //
    // Vitest's 5s default was never a property of this repository's contracts.
    // Many suites here do real work whose wall-clock scales with the machine:
    // repository-wide static gates read ~1850 source files, and several route
    // suites dynamically import heavy modules. Running 331 files in parallel on
    // a loaded machine, that work intermittently crossed 5s and was reported as
    // a TIMEOUT — a red result carrying no information about the assertion,
    // observed flipping between 0 and 21 failures across consecutive runs of an
    // unchanged tree. A test suite whose verdict depends on CPU contention is
    // not a gate; it teaches people to re-run until green.
    //
    // 60s is far above the slowest legitimate suite and far below anything that
    // could hide a genuine hang (CI job timeouts of 40-60 min still bound that).
    // No assertion is relaxed — a real failure fails exactly as before.
    //
    // The headroom lives HERE rather than in per-file `vi.setConfig` calls for a
    // specific reason: `src/lib/security/__tests__/phase99-static-invariants.test.ts`
    // is pinned as the retest evidence for four Phase 99 findings
    // (P99-INT-008/009/012/013) via a sha256 in docs/security/phase99-findings.json.
    // Editing it — even to add a timeout that changes no assertion — invalidates
    // that evidence and makes the readiness evaluator fail closed, exactly as it
    // should. Security evidence must not be re-pinned to accommodate a test-runner
    // budget, so the budget moved to the runner's own configuration.
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
