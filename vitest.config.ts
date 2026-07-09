import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    // Never run tests out of the Next build output — `.next/standalone`
    // contains stale duplicate copies of these route tests (Phase 82C.1).
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
