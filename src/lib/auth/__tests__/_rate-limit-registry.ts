/**
 * PHASE 102 / RELEASE BLOCKER 2 — static audit of the auth rate-limit registry.
 *
 * WHY THIS EXISTS
 * `checkRateLimit(action, id)` used to answer `true` — allowed — for any bucket
 * absent from `LIMITS`. A route could therefore *look* rate limited, pass every
 * route test that mocks the limiter, and run with no brake at all in
 * production. `media-authoring-write` and `media-editorial-transition` did
 * exactly that: three media write routes named buckets nobody had declared.
 *
 * The primary defence is now structural — `RateLimitAction` is derived from
 * `LIMITS`, so an undeclared bucket is a COMPILE error. This audit is the
 * second line: it reads the real sources off disk and proves, independently of
 * the type-checker, that every bucket a route actually names is declared. It is
 * what the mutation suite drives, because deleting a key from `LIMITS` must
 * turn something RED in a plain `vitest run` too.
 *
 * NO SILENT SKIPS
 * A call whose bucket cannot be resolved to a string literal is reported as
 * `dynamic`, never dropped. The suite asserts the dynamic set exactly, so a new
 * indirection cannot slip in unnoticed.
 *
 * `repoRoot` is injected and defaults to the real repository, so the mutation
 * suite can point the same implementation at a throwaway copy.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "../../../..");

/** Module every shared-limiter caller must import from. */
const LIMITER_MODULE = "@/lib/auth/rate-limiter";

/** Directories the audit walks. Everything else is irrelevant to the limiter. */
const SCAN_ROOTS = ["src"] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

export interface BucketUse {
  /** The declared bucket name, or `null` when the argument was not a literal. */
  action: string | null;
  /** Repository-relative path of the file naming it. */
  file: string;
  /** The raw first argument, kept so a dynamic use is reportable. */
  raw: string;
  /** How the bucket reached the limiter. */
  via: "checkRateLimit" | "routeKitBucket";
}

export interface RegistryAudit {
  /** Bucket names declared in `LIMITS`, in source order. */
  declared: string[];
  /** Every resolved or unresolved bucket use found on disk. */
  uses: BucketUse[];
  /** Uses naming a bucket that `LIMITS` does not declare. */
  undeclared: BucketUse[];
  /** Uses whose bucket could not be resolved to a literal. */
  dynamic: BucketUse[];
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      out.push(full);
    }
  }
}

/**
 * Parse the bucket names out of the `LIMITS` object literal.
 *
 * Deliberately textual rather than an import: the mutation suite mutates a COPY
 * of the file on disk, and a dynamic `import()` would be served from the module
 * cache or resolve `@/` against the real tree.
 */
export function parseDeclaredBuckets(limiterSource: string): string[] {
  const start = limiterSource.indexOf("const LIMITS");
  if (start === -1) return [];
  // The object literal ends at the first line that closes it at column 0.
  const closing = limiterSource.indexOf("\n}", start);
  const body = limiterSource.slice(start, closing === -1 ? undefined : closing);
  const names: string[] = [];
  // Matches both `"quoted-key":` and the bare `login:` / `register:` keys.
  const keyPattern = /(?:^|\n)\s{2}(?:"([a-z0-9-]+)"|([a-z][a-zA-Z0-9]*))\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(body)) !== null) {
    names.push(match[1] ?? match[2]);
  }
  return names;
}

/**
 * Resolve `const NAME = "literal";` bindings so a call written against a named
 * constant — which every media route is — still yields its bucket.
 */
function stringConstants(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const pattern = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*"([^"]*)"\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) map.set(match[1], match[2]);
  return map;
}

function resolveArgument(raw: string, constants: Map<string, string>): string | null {
  const trimmed = raw.trim();
  const literal = /^"([^"]*)"$/.exec(trimmed) ?? /^'([^']*)'$/.exec(trimmed);
  if (literal) return literal[1];
  return constants.get(trimmed) ?? null;
}

/** Collect the first argument of every `checkRateLimit(` call in a source file. */
function checkRateLimitArguments(source: string): string[] {
  const args: string[] = [];
  const pattern = /checkRateLimit\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    // Read forward to the first top-level comma or closing paren.
    let depth = 0;
    let arg = "";
    for (let i = match.index + match[0].length; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" && depth === 0) break;
      else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
      else if (ch === "," && depth === 0) break;
      arg += ch;
    }
    args.push(arg);
  }
  return args;
}

/**
 * Audit the repository's rate-limit registry against its real call sites.
 *
 * @param options.repoRoot Repository root to read. Defaults to the real one.
 */
export function auditRateLimitRegistry(options: { repoRoot?: string } = {}): RegistryAudit {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const limiterPath = path.join(repoRoot, "src/lib/auth/rate-limiter.ts");
  const declared = parseDeclaredBuckets(readFileSync(limiterPath, "utf8"));
  const declaredSet = new Set(declared);

  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(path.join(repoRoot, root), files);

  const uses: BucketUse[] = [];
  for (const file of files) {
    const relative = path.relative(repoRoot, file).split(path.sep).join("/");
    if (relative === "src/lib/auth/rate-limiter.ts") continue;
    // Test files may legitimately exercise refusal paths with fake buckets.
    if (relative.includes("__tests__/")) continue;

    const source = readFileSync(file, "utf8");
    const constants = stringConstants(source);

    // Only files that import the shared limiter can reach it. This excludes
    // unrelated local helpers that happen to be named `checkRateLimit`.
    if (source.includes(LIMITER_MODULE)) {
      for (const raw of checkRateLimitArguments(source)) {
        uses.push({ action: resolveArgument(raw, constants), file: relative, raw: raw.trim(), via: "checkRateLimit" });
      }
    }

    // `withOtRoute({ bucket })` forwards its option straight to the limiter, so
    // the literal at the call site is the bucket that is actually enforced.
    const bucketPattern = /\bbucket\s*:\s*"([a-z0-9-]+)"/g;
    let bucketMatch: RegExpExecArray | null;
    while ((bucketMatch = bucketPattern.exec(source)) !== null) {
      uses.push({ action: bucketMatch[1], file: relative, raw: `"${bucketMatch[1]}"`, via: "routeKitBucket" });
    }
  }

  return {
    declared,
    uses,
    undeclared: uses.filter((u) => u.action !== null && !declaredSet.has(u.action)),
    dynamic: uses.filter((u) => u.action === null),
  };
}
