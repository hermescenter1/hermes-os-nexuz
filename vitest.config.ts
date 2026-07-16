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
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
