// PHASE 101-R — the client-graph walker. ONE implementation, two callers.
//
// The leakage scanner (`scripts/ci/phase101r-client-leakage-scan.mjs`) and the
// boundary test (`src/lib/industrial-knowledge/runtime/__tests__/
// phase101r-client-boundary.test.ts`) both need the same question answered:
// can any `"use client"` module reach the Phase 101 corpus? Answering it twice,
// in two files, is how the two answers drift — and the one that drifts is
// always the one nobody runs. So it is answered here, and both callers import
// this module.
//
// WHAT THIS REPLACES
// The canonical Next.js marker for "never ship this to the browser" is a bare
// `import "server-only";`. That package is not installed in this repository and
// adding it would mean editing package.json, so the guarantee is reproduced by
// a module-scope runtime throw (`runtime/server-boundary.ts`) plus this
// build-time graph walk. The walk follows the same module graph `next build`
// follows and reports the exact import chain, rather than surfacing as a
// bundler error several hops away from its cause.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";

/** Modules that carry, or can reach, the full 85-scenario corpus. */
export function serverOnlyModules(repo) {
  const src = join(repo, "src");
  return [
    join(src, "lib", "industrial-knowledge", "runtime", "bridge.ts"),
    join(src, "lib", "industrial-knowledge", "runtime", "exposure.ts"),
    join(src, "lib", "industrial-knowledge", "runtime", "case-query.ts"),
    join(src, "lib", "industrial-knowledge", "corpus.ts"),
    join(src, "lib", "industrial-knowledge", "reference", "index.ts"),
  ];
}

/** Every source file under `dir`, skipping tests and node_modules. */
export function walkSources(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkSources(p, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Module specifiers this file pulls into the RUNTIME graph.
 *
 * Four shapes are collected, because all four put a module in the bundle:
 *   `import x from "m"` / `export { x } from "m"`  — static value edges
 *   `export * from "m"`                            — a barrel re-export
 *   `import "m"`                                   — a bare side-effect import
 *   `import("m")`                                  — a dynamic import, when the
 *                                                    specifier is a literal
 *
 * `import type { … } from "m"` is deliberately EXCLUDED. This project compiles
 * without `verbatimModuleSyntax`, so a type-only import is erased and the module
 * never reaches the bundle — classifying it as an edge would report a defect
 * that the runtime does not have. An inline `import { type A, B }` still counts,
 * because `B` keeps the statement alive.
 */
export function specifiersOf(code) {
  const out = [];
  // Strip comments first: a commented-out import is not an edge, and a string
  // inside a comment must not be mistaken for one.
  const src = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const statement = /(?:^|[\s;])(import|export)\b([\s\S]*?)from\s*["']([^"']+)["']/g;
  let m;
  while ((m = statement.exec(src)) !== null) {
    const clause = m[2];
    // `import type { … } from` / `export type { … } from` — erased at compile.
    if (/^\s+type\s/.test(clause)) continue;
    out.push(m[3]);
  }

  const bare = /(?:^|[\s;])import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(src)) !== null) out.push(m[1]);

  const dynamic = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynamic.exec(src)) !== null) out.push(m[1]);

  return out;
}

/** Resolve a project-local specifier to a real file, or null if external. */
export function resolveLocal(specifier, fromFile, srcDir) {
  let base;
  if (specifier.startsWith("@/")) base = join(srcDir, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null; // a package — judged by name, not followed

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** TRUE when a file opens with a `"use client"` directive. */
export function isClientModule(file) {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
    readFileSync(file, "utf8"),
  );
}

/** Every `"use client"` entry under `srcDir`. */
export function listClientEntries(srcDir) {
  return walkSources(srcDir).filter(isClientModule);
}

/**
 * First path from `entry` to any module in `forbidden`, or null.
 *
 * Breadth-first over the transitive graph. A direct-import check would miss the
 * case this exists for: the Phase 102 incident that motivated this walker had
 * `pg` four hops away from the client island that dragged it in.
 */
export function findForbiddenChain(entry, forbidden, srcDir) {
  const target = forbidden instanceof Set ? forbidden : new Set(forbidden);
  const seen = new Set();
  const queue = [{ file: entry, chain: [entry] }];
  while (queue.length > 0) {
    const { file, chain } = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      const next = resolveLocal(specifier, file, srcDir);
      if (!next) continue;
      const extended = [...chain, next];
      if (target.has(next)) return extended;
      queue.push({ file: next, chain: extended });
    }
  }
  return null;
}

/**
 * Scan a whole repository: every `"use client"` entry against the server-only
 * set. Returns the violating chains, repo-relative, ready to print or assert on.
 */
export function scanClientGraph(repo) {
  const srcDir = join(repo, "src");
  const forbidden = new Set(serverOnlyModules(repo));
  const entries = listClientEntries(srcDir);
  const rel = (p) => relative(repo, p).split("\\").join("/");
  const violations = [];
  for (const entry of entries) {
    const chain = findForbiddenChain(entry, forbidden, srcDir);
    if (chain) violations.push(chain.map(rel).join(" -> "));
  }
  return { entries: entries.length, forbidden: [...forbidden].map(rel), violations };
}
