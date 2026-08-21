// PHASE 101-R — the client/server boundary of the Phase 101 reference bridge.
//
// WHAT THIS REPLACES, AND WHY
// The canonical Next.js marker for "this module must never reach the browser"
// is a bare `import "server-only";`. That package is NOT installed in this
// repository — absent from `node_modules`, absent from `package-lock.json`, and
// not a dependency of Next 15.5.23 (`client-only` is present; `server-only` is
// not). Importing it would fail the production build, and installing it would
// mean editing `package.json` and `package-lock.json`, which this increment is
// not permitted to touch.
//
// So the guarantee is reproduced without a dependency, in two halves:
//
//   RUNTIME — `assertServerOnly` throws at module scope in a browser realm.
//             That is what the `server-only` browser export does.
//   GRAPH   — a transitive walk over every `"use client"` module under `src/`,
//             failing on any path that reaches the bridge, the exposure map,
//             the query parser or the raw corpus.
//
// THE WALKER IS NOT DUPLICATED HERE
// The graph logic lives in `scripts/ci/lib/phase101r-client-graph.mjs` and is
// imported below. The same module backs `scripts/ci/phase101r-client-leakage-
// scan.mjs`, so the fast local signal and the post-build CI gate are the same
// implementation — not two implementations that agree today and drift later.
// This file supplies the fixtures and the assertions; it owns no traversal.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

import {
  findForbiddenChain,
  isClientModule,
  listClientEntries,
  scanClientGraph,
  serverOnlyModules,
  specifiersOf,
} from "../../../../../scripts/ci/lib/phase101r-client-graph.mjs";

const REPO = resolve(process.cwd());
const SRC = join(REPO, "src");
const FIXTURES = join(SRC, "lib", "industrial-knowledge", "runtime", "__tests__", "fixtures");
const FORBIDDEN = new Set(serverOnlyModules(REPO));
const rel = (p: string) => relative(REPO, p).split("\\").join("/");

/* ── 1. The gate itself ───────────────────────────────────────────────────── */

describe("the Phase 101 corpus never enters a client graph", () => {
  const result = scanClientGraph(REPO);

  it("finds the client entries and the server-only modules it is checking", () => {
    // A walker that silently found nothing would pass forever.
    expect(result.entries).toBeGreaterThan(20);
    expect(result.forbidden.length).toBe(5);
    for (const file of serverOnlyModules(REPO)) {
      expect(existsSync(file), `${rel(file)} is missing`).toBe(true);
    }
  });

  it('no "use client" module can reach the bridge, exposure map or corpus', () => {
    expect(result.violations).toEqual([]);
  });

  it("the panel that DOES import the bridge is a Server Component", () => {
    const panel = join(SRC, "components", "industrial-brain", "ReferenceDiagnosticPanel.tsx");
    expect(existsSync(panel)).toBe(true);
    expect(isClientModule(panel), "the reference panel became a Client Component").toBe(false);
    expect(readFileSync(panel, "utf8")).toContain("@/lib/industrial-knowledge/runtime/bridge");
  });
});

/* ── 2. Positive controls — the walker really can see each import shape ───── */

describe("the walker catches every import shape that ships a module", () => {
  const fixture = (name: string) => join(FIXTURES, name);

  it.each([
    ["static import", "client-static-import.tsx", 2],
    ["barrel re-export", "client-via-barrel.tsx", 3],
    ["dynamic import with a literal", "client-dynamic-import.tsx", 2],
  ])("catches a %s", (_label, file, expectedHops) => {
    const entry = fixture(file);
    expect(existsSync(entry), `${file} is missing`).toBe(true);
    expect(isClientModule(entry), `${file} lost its "use client" directive`).toBe(true);

    const chain = findForbiddenChain(entry, FORBIDDEN, SRC);
    expect(chain, `${file}: the walker found no path to the bridge`).not.toBeNull();
    expect(chain!.length).toBe(expectedHops);
    expect(rel(chain![chain!.length - 1])).toBe(
      "src/lib/industrial-knowledge/runtime/bridge.ts",
    );
  });

  it("does NOT flag a type-only import, which is erased before bundling", () => {
    // `verbatimModuleSyntax` is off in this project, so `import type` requests
    // no module at runtime. Reporting it would be a false positive, and a gate
    // that cries wolf on the safe case is a gate people learn to override.
    const entry = fixture("client-type-only-import.tsx");
    expect(existsSync(entry)).toBe(true);
    expect(isClientModule(entry)).toBe(true);
    expect(readFileSync(entry, "utf8")).toMatch(/import type \{[^}]*\} from/);
    expect(findForbiddenChain(entry, FORBIDDEN, SRC)).toBeNull();
  });

  it("classifies specifiers exactly as the runtime does", () => {
    const seen = specifiersOf(
      [
        'import a from "./value";',
        'import type { T } from "./erased";',
        'export type { U } from "./erased-too";',
        'export * from "./barrel";',
        'export { z } from "./named";',
        'import "./side-effect";',
        'const m = await import("./dynamic");',
        '// import ignored from "./commented";',
        '/* import blocked from "./block-commented"; */',
        'import { type Only, andValue } from "./inline-mixed";',
      ].join("\n"),
    );
    expect(seen.sort()).toEqual(
      [
        "./barrel",
        "./dynamic",
        "./inline-mixed",
        "./named",
        "./side-effect",
        "./value",
      ].sort(),
    );
  });

  it("the fixtures live where the real scan cannot mistake them for product code", () => {
    // They are under `__tests__`, which `listClientEntries` skips — so these
    // deliberate violations never appear in the repository scan above.
    const entries = listClientEntries(SRC).map(rel);
    for (const name of [
      "client-static-import.tsx",
      "client-via-barrel.tsx",
      "client-dynamic-import.tsx",
      "client-type-only-import.tsx",
    ]) {
      expect(entries.some((e) => e.endsWith(name)), `${name} leaked into the real scan`).toBe(
        false,
      );
    }
  });
});

/* ── 3. The runtime half of the boundary ──────────────────────────────────── */

describe("the server-only runtime guard", () => {
  it("is asserted at module scope by every corpus-carrying entry point", () => {
    for (const file of [
      join(SRC, "lib", "industrial-knowledge", "runtime", "bridge.ts"),
      join(SRC, "lib", "industrial-knowledge", "runtime", "exposure.ts"),
    ]) {
      const code = readFileSync(file, "utf8");
      expect(code, `${rel(file)} does not import the guard`).toMatch(
        /import\s*\{\s*assertServerOnly\s*\}\s*from\s*"\.\/server-boundary"/,
      );
      // At module scope — not inside a function, where it would only fire once
      // something called it, long after the module had already been shipped.
      expect(code, `${rel(file)} does not call the guard at module scope`).toMatch(
        /^assertServerOnly\("/m,
      );
    }
  });

  it("throws when the module realm looks like a browser", async () => {
    const { assertServerOnly } = await import("../server-boundary");
    expect(() => assertServerOnly("probe")).not.toThrow();

    const globals = globalThis as Record<string, unknown>;
    const hadWindow = "window" in globals;
    const hadDocument = "document" in globals;
    try {
      globals.window = {};
      globals.document = {};
      expect(() => assertServerOnly("probe")).toThrow(/server-only/);
    } finally {
      if (!hadWindow) delete globals.window;
      if (!hadDocument) delete globals.document;
    }
  });
});

/* ── 4. One implementation, two callers ───────────────────────────────────── */

describe("the leakage scanner and this test share one walker", () => {
  const scanner = readFileSync(join(REPO, "scripts/ci/phase101r-client-leakage-scan.mjs"), "utf8");

  it("the CI scanner imports the same module this test does", () => {
    expect(scanner).toMatch(
      /import\s*\{[^}]*scanClientGraph[^}]*\}\s*from\s*"\.\/lib\/phase101r-client-graph\.mjs"/,
    );
  });

  it("neither the scanner nor this test reimplements the traversal", () => {
    const test = readFileSync(
      join(REPO, "src/lib/industrial-knowledge/runtime/__tests__/phase101r-client-boundary.test.ts"),
      "utf8",
    );
    // The walker's own vocabulary must appear ONLY in the shared module. A copy
    // here or in the scanner is the drift this test exists to prevent.
    for (const [label, source] of Object.entries({ scanner, test })) {
      expect(source, `${label} re-declares the traversal`).not.toMatch(
        /function\s+(findForbiddenChain|specifiersOf|resolveLocal|listClientEntries)\s*\(/,
      );
    }
  });
});
