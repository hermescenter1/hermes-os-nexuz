/**
 * PHASE 109-B0.1 — FINDING-109B0-001: the route inventory must be COMPLETE.
 *
 * The Phase 99 inventory is the repository's attack-surface record. Before this
 * suite it enumerated `src/app/api/**` only, so two publicly reachable route
 * handlers served from the App Router root — `/llms.txt` and
 * `/indexnow-key.txt` — never appeared in it. The omission looked like a
 * dot-directory bug because both segment names contain a dot (the segment name
 * IS the public URL), but there is no dot predicate in the walk and there never
 * was: the cause was the enumeration ROOT.
 *
 * These tests pin the distinction that matters. A directory is skipped because
 * of WHAT IT IS, never because of how its name is punctuated — so `.git`,
 * `.next` and `node_modules` stay out while `llms.txt` comes in.
 *
 * Every fixture is a real directory tree in a temporary directory. Nothing here
 * asserts against a mocked filesystem, because the defect being prevented was a
 * filesystem-traversal defect.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  collectRouteFiles,
  toApiPath,
  toPosixRelative,
  buildRouteInventory,
  summarizeInventory,
  NON_SOURCE_DIRECTORIES,
  ROUTE_MODULE_NAMES,
  APP_ROOT,
  REPO_ROOT,
} from "../security/phase99/route-inventory.mjs";

/** Build a fixture App Router tree and return its root. */
function fixture(files: readonly string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "hermes-route-inv-"));
  for (const rel of files) {
    const abs = path.join(root, ...rel.split("/"));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "export function GET() { return new Response('x'); }\n");
  }
  return root;
}

const roots: string[] = [];
function tempRoot(files: readonly string[]): string {
  const r = fixture(files);
  roots.push(r);
  return r;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Collected files as POSIX paths relative to the fixture root. */
function collected(root: string): string[] {
  return collectRouteFiles(root).map((f) => toPosixRelative(f, root)).sort();
}

describe("FINDING-109B0-001 · a dot in a directory name is not an exclusion reason", () => {
  it("1. includes a route module under a dot-containing segment", () => {
    const root = tempRoot(["llms.txt/route.ts", "api/health/route.ts"]);
    expect(collected(root)).toEqual(["api/health/route.ts", "llms.txt/route.ts"]);
  });

  it("5. includes a NESTED route module under a dot-containing segment", () => {
    const root = tempRoot([
      "well-known/security.txt/route.ts",
      "a.b/c.d/e.f/route.ts",
      "api/x/route.ts",
    ]);
    expect(collected(root)).toEqual([
      "a.b/c.d/e.f/route.ts",
      "api/x/route.ts",
      "well-known/security.txt/route.ts",
    ]);
  });

  it("includes both real root-level route modules of this repository", () => {
    const files = collectRouteFiles().map((f) => toPosixRelative(f, APP_ROOT));
    expect(files).toContain("llms.txt/route.ts");
    expect(files).toContain("indexnow-key.txt/route.ts");
  });
});

describe("FINDING-109B0-001 · non-source directories are excluded by identity", () => {
  it("2. excludes .git", () => {
    const root = tempRoot([".git/hooks/route.ts", "api/ok/route.ts"]);
    expect(collected(root)).toEqual(["api/ok/route.ts"]);
  });

  it("3. excludes .next", () => {
    const root = tempRoot([".next/server/app/api/x/route.ts", "api/ok/route.ts"]);
    expect(collected(root)).toEqual(["api/ok/route.ts"]);
  });

  it("4. excludes node_modules", () => {
    const root = tempRoot(["node_modules/pkg/route.ts", "api/ok/route.ts"]);
    expect(collected(root)).toEqual(["api/ok/route.ts"]);
  });

  it("excludes __tests__ so fixtures inside the tree never become routes", () => {
    const root = tempRoot(["api/x/__tests__/route.ts", "api/x/route.ts"]);
    expect(collected(root)).toEqual(["api/x/route.ts"]);
  });

  it("excludes every declared non-source directory, and only those", () => {
    const root = tempRoot([
      ...NON_SOURCE_DIRECTORIES.map((d) => `${d}/route.ts`),
      "kept/route.ts",
      "also.kept/route.ts",
    ]);
    expect(collected(root)).toEqual(["also.kept/route.ts", "kept/route.ts"]);
  });

  it("never follows a symlinked directory", () => {
    const root = tempRoot(["api/real/route.ts"]);
    const outside = tempRoot(["smuggled/route.ts"]);
    let linked = false;
    try {
      symlinkSync(outside, path.join(root, "linked"), "junction");
      linked = true;
    } catch {
      // Creating links can require privileges; the assertion below is skipped
      // loudly rather than silently passing on a host that cannot make one.
    }
    expect(
      linked || process.platform === "win32",
      "no symlink or junction could be created on this host",
    ).toBe(true);
    if (linked) expect(collected(root)).toEqual(["api/real/route.ts"]);
  });
});

describe("FINDING-109B0-001 · path handling is platform-deterministic", () => {
  it("6+7. toPosixRelative yields the same POSIX path from either separator", () => {
    const root = path.join(path.sep, "repo", "src", "app");
    const nested = path.join(root, "a.b", "c", "route.ts");
    expect(toPosixRelative(nested, root)).toBe("a.b/c/route.ts");
    // The literal POSIX form must round-trip identically on Windows too.
    expect(toPosixRelative(path.join(root, ...["x", "y", "route.ts"]), root)).toBe("x/y/route.ts");
  });

  it("6+7. toApiPath emits POSIX URLs for both /api and root-level routes", () => {
    const repo = path.join(path.sep, "repo");
    expect(toApiPath(path.join(repo, "src", "app", "api", "foo", "[id]", "route.ts"), repo)).toBe(
      "/api/foo/[id]",
    );
    expect(toApiPath(path.join(repo, "src", "app", "llms.txt", "route.ts"), repo)).toBe("/llms.txt");
  });

  it("collection order is stable and independent of the native separator", () => {
    const root = tempRoot(["a-b/route.ts", "a/c/route.ts", "a.b/route.ts"]);
    // Sorted by POSIX relative path, so the result cannot depend on whether the
    // platform separator sorts before or after '-' and '.'.
    expect(collected(root)).toEqual(["a-b/route.ts", "a.b/route.ts", "a/c/route.ts"]);
    expect(collectRouteFiles(root).map((f) => toPosixRelative(f, root))).toEqual([
      "a-b/route.ts",
      "a.b/route.ts",
      "a/c/route.ts",
    ]);
  });

  it("recognises exactly the Next.js route module filenames", () => {
    const root = tempRoot([
      "a/route.ts",
      "b/route.tsx",
      "c/route.js",
      "d/route.test.ts",
      "e/page.tsx",
      "f/routes.ts",
    ]);
    expect(ROUTE_MODULE_NAMES).toEqual(["route.ts", "route.tsx"]);
    expect(collected(root)).toEqual(["a/route.ts", "b/route.tsx"]);
  });
});

describe("FINDING-109B0-001 · the committed inventory is an exact set", () => {
  const inventoryPath = path.join(REPO_ROOT, "docs/security/phase99-route-security-inventory.json");
  let inv: {
    summary: { routeFiles: number; handlers: number; unknown: number };
    routes: { apiPath: string; method: string; file: string; classification: string }[];
  };
  let onDisk: string[];

  beforeAll(async () => {
    const { readFileSync } = await import("node:fs");
    inv = JSON.parse(readFileSync(inventoryPath, "utf8"));
    onDisk = collectRouteFiles().map((f) => toPosixRelative(f, REPO_ROOT)).sort();
  });

  it("8. the inventory's file set equals the filesystem's route-module set exactly", () => {
    const listed = [...new Set(inv.routes.map((r) => r.file))].sort();
    const missing = onDisk.filter((f) => !listed.includes(f));
    const unexpected = listed.filter((f) => !onDisk.includes(f));
    expect({ missing, unexpected }).toEqual({ missing: [], unexpected: [] });
    expect(listed.length).toBe(onDisk.length);
    expect(inv.summary.routeFiles).toBe(onDisk.length);
  });

  it("8. every listed route file exists on disk", () => {
    const absent = [...new Set(inv.routes.map((r) => r.file))].filter(
      (f) => !existsSync(path.join(REPO_ROOT, f)),
    );
    expect(absent).toEqual([]);
  });

  it("9. no duplicate route module, and no duplicate (path, method)", () => {
    const files = collectRouteFiles().map((f) => toPosixRelative(f, REPO_ROOT));
    expect(new Set(files).size, "the walk returned a file twice").toBe(files.length);

    const pairs = inv.routes.map((r) => `${r.method} ${r.apiPath}`);
    const dupes = pairs.filter((p, i) => pairs.indexOf(p) !== i);
    expect(dupes, "duplicate (path, method) in the inventory").toEqual([]);

    // Two different files must never claim the same URL path.
    const byPath = new Map<string, Set<string>>();
    for (const r of inv.routes) {
      if (!byPath.has(r.apiPath)) byPath.set(r.apiPath, new Set());
      byPath.get(r.apiPath)!.add(r.file);
    }
    const collisions = [...byPath.entries()].filter(([, files_]) => files_.size > 1);
    expect(collisions.map(([p]) => p)).toEqual([]);
  });

  it("the two root-level protocol files are inventoried as declared PUBLIC_READ", () => {
    for (const p of ["/llms.txt", "/indexnow-key.txt"]) {
      const rows = inv.routes.filter((r) => r.apiPath === p);
      expect(rows.length, `${p} missing from the inventory`).toBe(1);
      expect(rows[0].method).toBe("GET");
      expect(rows[0].classification).toBe("PUBLIC_READ");
    }
    expect(inv.summary.unknown, "the classifier must stay fail-closed").toBe(0);
  });

  it("regenerating from source reproduces the committed artifact exactly", () => {
    // buildRouteInventory returns the ROW ARRAY; the summary is derived from it.
    const rebuilt = buildRouteInventory({ repoRoot: REPO_ROOT });
    const summary = summarizeInventory(rebuilt);
    expect(summary.routeFiles).toBe(inv.summary.routeFiles);
    expect(summary.handlers).toBe(inv.summary.handlers);
    expect(summary.unknown).toBe(0);
    expect(rebuilt.map((r) => `${r.method} ${r.apiPath}`).sort()).toEqual(
      inv.routes.map((r) => `${r.method} ${r.apiPath}`).sort(),
    );
  });
});

describe("FINDING-109B0-001 · the completeness gate is not vacuous", () => {
  it("10. negative control — the pre-fix `/api`-only root fails the exact-set gate", () => {
    // Reproduce the ORIGINAL enumeration: rooted at the /api subtree. If the
    // gate above can pass against this, it proves nothing.
    const apiOnly = collectRouteFiles(path.join(REPO_ROOT, "src", "app", "api"))
      .map((f) => toPosixRelative(f, REPO_ROOT))
      .sort();
    const full = collectRouteFiles().map((f) => toPosixRelative(f, REPO_ROOT)).sort();

    const dropped = full.filter((f) => !apiOnly.includes(f));
    expect(dropped, "the old root must demonstrably drop route modules").toEqual([
      "src/app/indexnow-key.txt/route.ts",
      "src/app/llms.txt/route.ts",
    ]);
    expect(apiOnly.length).toBe(full.length - 2);
    expect(apiOnly).not.toEqual(full);
  });

  it("10. negative control — a dot-name predicate would drop a valid route", () => {
    // The predicate this finding was WRONGLY attributed to. Prove what it would
    // actually have done, so the fix is not credited to the wrong mechanism.
    const root = tempRoot(["llms.txt/route.ts", "api/ok/route.ts"]);
    const withDotPredicate = collectRouteFiles(root)
      .map((f) => toPosixRelative(f, root))
      .filter((f) => !f.split("/").slice(0, -1).some((seg) => seg.includes(".")));
    expect(withDotPredicate).toEqual(["api/ok/route.ts"]);
    expect(collected(root)).toEqual(["api/ok/route.ts", "llms.txt/route.ts"]);
  });

  it("10. negative control — walking into .next would ADD phantom routes", () => {
    const root = tempRoot([".next/server/app/api/ghost/route.ts", "api/ok/route.ts"]);
    const permissive = collectRouteFiles(root).map((f) => toPosixRelative(f, root));
    expect(permissive).toEqual(["api/ok/route.ts"]);
    // and the excluded directory really does contain a route-shaped file
    expect(existsSync(path.join(root, ".next/server/app/api/ghost/route.ts"))).toBe(true);
  });
});
