/**
 * PHASE 102 — the client/server boundary of the Video Hub, enforced.
 *
 * WHY THIS EXISTS
 * `VideoLibraryFilters.tsx` is a `"use client"` island. It imported two URL
 * parameter names from `./data`, which imports `@/lib/db/prisma`. Next follows
 * the whole module graph when it builds the CLIENT bundle, so that one import
 * dragged in:
 *
 *     VideoLibraryFilters.tsx -> data.ts -> @/lib/db/prisma
 *       -> @prisma/adapter-pg -> pg -> node:tls
 *
 * and `next build` failed with "Module not found: Can't resolve 'tls'".
 *
 * Nothing else caught it. `tsc --noEmit` was clean, ESLint was clean and the
 * full 7,000-test suite was green, because none of them resolves a bundle. Only
 * a real build does — and a build is the slowest, latest signal available. This
 * test moves the failure to the fastest one.
 *
 * It walks the import graph TRANSITIVELY. A direct-import check would not have
 * caught the original bug either, since `pg` was four hops away.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const REPO = resolve(process.cwd());
const SRC = join(REPO, "src");

/** Roots whose `"use client"` files must never reach server-only code. */
const CLIENT_ROOTS = [join(SRC, "app", "[locale]", "videos"), join(SRC, "components", "media")];

/**
 * Modules that must never appear in a client graph. `node:`-prefixed builtins
 * and the bare aliases are both listed because either spelling resolves.
 */
const FORBIDDEN_SPECIFIERS = [
  "@/lib/db/prisma",
  "@prisma/client",
  "@prisma/adapter-pg",
  "pg",
  "node:fs",
  "node:tls",
  "node:net",
  "node:path",
  "node:crypto",
  "node:child_process",
  "fs",
  "tls",
  "net",
  "child_process",
];

/** Files that are server-only by construction and must stay out of the graph. */
const FORBIDDEN_FILES = [join(SRC, "app", "[locale]", "videos", "data.ts")];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/** Every `import ... from "x"` / `export ... from "x"` specifier in a file. */
function specifiersOf(code: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) out.push(m[1]);
  // Bare side-effect imports: import "server-only";
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(code)) !== null) out.push(m[1]);
  return out;
}

/** Resolve a project-local specifier to a real file, or null if external. */
function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
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

interface Violation {
  entry: string;
  chain: string[];
  offender: string;
}

/** Walk a client entry's transitive graph, reporting the first bad path found. */
function findViolation(entry: string): Violation | null {
  const seen = new Set<string>();
  const queue: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [entry] }];

  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    if (FORBIDDEN_FILES.includes(file) && file !== entry) {
      return { entry, chain, offender: file };
    }

    const code = readFileSync(file, "utf8");
    for (const spec of specifiersOf(code)) {
      if (FORBIDDEN_SPECIFIERS.includes(spec)) {
        return { entry, chain: [...chain, spec], offender: spec };
      }
      const next = resolveLocal(spec, file);
      if (next !== null) queue.push({ file: next, chain: [...chain, next] });
    }
  }
  return null;
}

function rel(p: string): string {
  return p.startsWith(REPO) ? p.slice(REPO.length + 1).split("\\").join("/") : p;
}

describe("Video Hub — client components never reach server-only code", () => {
  const clientEntries = CLIENT_ROOTS.flatMap((root) => walk(root)).filter((f) =>
    /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
  );

  it("finds the client islands it is supposed to police", () => {
    // Guards the guard: if a refactor renames the directory or drops the
    // directive, this test must fail rather than pass over an empty set.
    expect(clientEntries.length).toBeGreaterThan(0);
    expect(clientEntries.map(rel)).toContain("src/app/[locale]/videos/VideoLibraryFilters.tsx");
  });

  it.each(CLIENT_ROOTS.flatMap((root) => walk(root)).filter((f) =>
    /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
  ))("%s reaches no Prisma, no node builtin and no server loader", (entry) => {
    const violation = findViolation(entry);
    const detail =
      violation === null
        ? ""
        : `\n  offender: ${violation.offender}\n  chain:\n    ${violation.chain.map(rel).join("\n    -> ")}`;
    expect(violation, `client bundle would include a server module${detail}`).toBeNull();
  });

  it("the shared params module is genuinely dependency-free", () => {
    const params = join(SRC, "lib", "media", "video-library-params.ts");
    expect(existsSync(params)).toBe(true);
    // It is imported by client code, so ANY import here ships to the browser.
    expect(specifiersOf(readFileSync(params, "utf8"))).toEqual([]);
  });

  it("data.ts does not re-export the params, so the trap cannot reopen", () => {
    const data = readFileSync(join(SRC, "app", "[locale]", "videos", "data.ts"), "utf8");
    expect(data).not.toMatch(/export\s*\{[^}]*VIDEO_HUB_[^}]*\}\s*from/);
    expect(data).not.toMatch(/export\s+const\s+VIDEO_HUB_/);
  });
});
