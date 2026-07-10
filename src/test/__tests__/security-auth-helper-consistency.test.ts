import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * Phase 82D.4 — security harness closeout check.
 *
 * The Phase 82C/82D security suites must all mock the session through the one
 * shared helper (`@/test/mock-auth`). That helper is the only place that gets
 * the `vi.doUnmock` → `vi.doMock` ordering right; a suite that hand-rolls its
 * own `vi.doMock("@/lib/auth/session", ...)` can silently fail to apply a role
 * override and turn a 401/403 assertion green for the wrong reason
 * (the Phase 82C.1 finding).
 *
 * This check is deliberately narrow: it inspects an explicit, hand-maintained
 * list of known security suites — it does NOT glob or scan the tree. Adding a
 * new security suite means adding it here on purpose.
 *
 * `/api/documents/**` is intentionally excluded: it predates the helper, is
 * admin-gated rather than authoring-gated, and was never part of the 82D
 * normalisation scope.
 */

/** Repo-relative paths of every Phase 82C/82D security + collateral suite. */
const SECURITY_SUITES = [
  // Memory (82C.1, normalised in 82D.4)
  "src/app/api/memory/__tests__/route.test.ts",
  "src/app/api/memory/search/__tests__/route.test.ts",
  // Projects (82D.1)
  "src/app/api/projects/__tests__/route.test.ts",
  "src/app/api/projects/analytics/__tests__/route.test.ts",
  "src/app/api/projects/benchmark/__tests__/route.test.ts",
  "src/app/api/projects/[id]/risk-history/__tests__/route.test.ts",
  "src/app/api/projects/[id]/timeline/__tests__/route.test.ts",
  // Collateral suites that invoke gated project routes (82D.1 / 82D.1A)
  "src/app/api/knowledge-graph/__tests__/route.test.ts",
  "src/app/api/knowledge-graph/analytics/__tests__/route.test.ts",
  "src/app/api/dashboard/__tests__/route.test.ts",
  // Cases + Knowledge (82D.2)
  "src/app/api/cases/__tests__/route.test.ts",
  "src/app/api/knowledge/__tests__/route.test.ts",
  // Unknown + Analysis (82D.3)
  "src/app/api/unknown/__tests__/route.test.ts",
  "src/app/api/analysis/__tests__/route.test.ts",
] as const;

const HELPER_IMPORT = /from\s+["']@\/test\/mock-auth["']/;
/** A real `vi.doMock("@/lib/auth/session", …)` call — not a prose mention. */
const DIRECT_SESSION_MOCK = /vi\s*\.\s*doMock\(\s*["']@\/lib\/auth\/session["']/;

function read(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  return readFileSync(abs, "utf8");
}

describe("Phase 82D security suites use the shared auth helper", () => {
  it.each(SECURITY_SUITES)("%s exists", (relPath) => {
    expect(existsSync(path.resolve(process.cwd(), relPath))).toBe(true);
  });

  it.each(SECURITY_SUITES)("%s imports @/test/mock-auth", (relPath) => {
    expect(HELPER_IMPORT.test(read(relPath))).toBe(true);
  });

  it.each(SECURITY_SUITES)("%s does not hand-roll a session mock", (relPath) => {
    expect(DIRECT_SESSION_MOCK.test(read(relPath))).toBe(false);
  });
});
