/**
 * PHASE 102 — the STATIC invariant that keeps the hardened primitive on the
 * only road to a stored byte.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every other test in this directory proves that the routes as they stand TODAY
 * go through `openSecureFile`. None of them can prevent tomorrow's route from
 * reaching for `fs.createReadStream(path.join(root, key))` because it was
 * "simpler for this one case" — and that route would pass every behavioural
 * test in the suite while quietly reintroducing symlink-following, prefix-test
 * containment and the TOCTOU window all at once.
 *
 * So this file states the rule structurally: inside the media API surface there
 * is NO filesystem access at all. Not a guarded one, not a careful one — none.
 * A media route that needs bytes calls `src/lib/media/storage.ts`, which is the
 * only module allowed to know that a filesystem exists, and which itself reads
 * exclusively through `src/lib/media/secure-read.ts`.
 *
 * NO ALLOW-LIST. The tree is WALKED, so a file added next week is covered the
 * moment it lands, without anyone remembering to register it. The single named
 * exception below — `secure-read.ts` — is not a convenience carve-out: it is the
 * one module whose entire purpose is to perform the syscalls safely, and naming
 * it here is what makes "everything else is forbidden" checkable.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MEDIA_API_ROOT = path.join("src", "app", "api", "media");
const MEDIA_LIB_ROOT = path.join("src", "lib", "media");

/**
 * The ONE module permitted to touch the filesystem directly. Its whole job is
 * `openat`-style containment: canonicalise, open once with `O_NOFOLLOW`, re-prove
 * the descriptor, and serve bytes from nothing else.
 */
const FILESYSTEM_OWNER = path.join("src", "lib", "media", "secure-read.ts");

/** Walks a tree, skipping test directories — tests legitimately touch the disk. */
function sourceFilesUnder(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Comments are prose; a rule that fired on them would be unusable. */
function liveCode(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Every way a module can pull in a filesystem or path-building capability. */
const FILESYSTEM_IMPORTS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfrom\s+["'](?:node:)?fs["']/, label: 'import ... from "fs"' },
  { pattern: /\bfrom\s+["'](?:node:)?fs\/promises["']/, label: 'import ... from "fs/promises"' },
  { pattern: /\bfrom\s+["'](?:node:)?path["']/, label: 'import ... from "path"' },
  { pattern: /\bimport\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']\s*\)/, label: 'await import("fs")' },
  { pattern: /\bimport\s*\(\s*["'](?:node:)?path["']\s*\)/, label: 'await import("path")' },
  { pattern: /\brequire\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']\s*\)/, label: 'require("fs")' },
  { pattern: /\brequire\s*\(\s*["'](?:node:)?path["']\s*\)/, label: 'require("path")' },
];

/**
 * Direct filesystem OPERATIONS, caught even if the capability arrived by some
 * route the import rules above did not anticipate.
 *
 * `createReadStream` and `read` are matched ONLY in their bare form. The routes
 * legitimately call `open.createReadStream(...)` and `open.read(...)` on the
 * `SecureFile` handle the primitive returns — that IS the sanctioned path, and
 * banning it would ban the fix rather than the defect.
 */
const FILESYSTEM_CALLS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /(?<![.\w$])readFile(?:Sync)?\s*\(/, label: "readFile()" },
  { pattern: /(?<![.\w$])createReadStream\s*\(/, label: "createReadStream()" },
  { pattern: /(?<![.\w$])openSync\s*\(/, label: "openSync()" },
  { pattern: /(?<![.\w$])realpath(?:Sync)?\s*\(/, label: "realpath()" },
  { pattern: /\bfs\s*\.\s*[a-zA-Z]/, label: "fs.*" },
  { pattern: /\bfsPromises\s*\.\s*[a-zA-Z]/, label: "fsPromises.*" },
  { pattern: /\bpath\s*\.\s*(?:join|resolve|normalize)\s*\(/, label: "path.join/resolve/normalize()" },
  { pattern: /\bprocess\s*\.\s*cwd\s*\(/, label: "process.cwd()" },
];

// ── The media API surface ────────────────────────────────────────────────────

describe("no media API route touches the filesystem", () => {
  const files = sourceFilesUnder(MEDIA_API_ROOT);

  it("the walk actually found the route tree", () => {
    // Without this, a broken path would turn every assertion below into a
    // vacuous pass over an empty list.
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.some((f) => f.endsWith(path.join("stream", "route.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("poster", "route.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("[trackId]", "route.ts")))).toBe(true);
  });

  it.each(sourceFilesUnder(MEDIA_API_ROOT))("%s imports no filesystem capability", (file) => {
    const code = liveCode(file);
    for (const rule of FILESYSTEM_IMPORTS) {
      expect(
        rule.pattern.test(code),
        `${file} must not use ${rule.label} — read through @/lib/media/storage instead`,
      ).toBe(false);
    }
  });

  it.each(sourceFilesUnder(MEDIA_API_ROOT))("%s performs no direct filesystem call", (file) => {
    const code = liveCode(file);
    for (const rule of FILESYSTEM_CALLS) {
      expect(
        rule.pattern.test(code),
        `${file} must not call ${rule.label} — the descriptor from openMediaObject is the only source of bytes`,
      ).toBe(false);
    }
  });

  it("any route that streams bytes got its handle from the secure accessor", () => {
    for (const file of sourceFilesUnder(MEDIA_API_ROOT)) {
      const code = liveCode(file);
      if (!/\.createReadStream\s*\(/.test(code)) continue;
      // A `createReadStream` in a media route is only ever legitimate on the
      // `SecureFile` that `openMediaObject` returned.
      expect(code, `${file} streams bytes without openMediaObject`).toContain("openMediaObject");
      expect(code, `${file} must import the accessor from the storage module`).toMatch(
        /from\s+["']@\/lib\/media\/storage["']/,
      );
    }
  });

  it("no route re-derives a storage path or re-opens by pathname", () => {
    for (const file of sourceFilesUnder(MEDIA_API_ROOT)) {
      const code = liveCode(file);
      // These are the exact ingredients of the pattern the primitive replaced:
      // resolve a pathname, prefix-test it, then open that pathname again.
      for (const forbidden of [
        "getLocalDocumentStorageDir",
        "resolvePath(",
        "startsWith(root",
        "statMediaObject(",
        "openMediaByteRange(",
      ]) {
        expect(code, `${file} :: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

// ── The media library ────────────────────────────────────────────────────────

describe("inside src/lib/media, only the hardened primitive touches the filesystem", () => {
  const files = sourceFilesUnder(MEDIA_LIB_ROOT);

  it("the walk found the library and the primitive itself", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files).toContain(FILESYSTEM_OWNER);
  });

  it("no module other than secure-read.ts imports fs", () => {
    const offenders = files.filter((file) => {
      if (file === FILESYSTEM_OWNER) return false;
      const code = liveCode(file);
      return (
        /\bfrom\s+["'](?:node:)?fs["']/.test(code) ||
        /\bfrom\s+["'](?:node:)?fs\/promises["']/.test(code) ||
        /\brequire\s*\(\s*["'](?:node:)?fs(?:\/promises)?["']\s*\)/.test(code)
      );
    });
    expect(
      offenders,
      "only secure-read.ts may perform filesystem syscalls in the media library",
    ).toEqual([]);
  });

  it("storage.ts reads exclusively through the primitive", () => {
    const storage = liveCode(path.join(MEDIA_LIB_ROOT, "storage.ts"));
    // It must not have its own filesystem capability...
    for (const rule of FILESYSTEM_IMPORTS.filter((r) => r.label.includes("fs"))) {
      expect(rule.pattern.test(storage), `storage.ts must not use ${rule.label}`).toBe(false);
    }
    // ...and every read it offers must come from the primitive.
    expect(storage).toMatch(/from\s+["']\.\/secure-read["']/);
    expect(storage).toContain("openSecureFile(");
  });

  it("the primitive opens with O_NOFOLLOW and re-proves the open descriptor", () => {
    const primitive = liveCode(FILESYSTEM_OWNER);
    // Each entry is a construct that must appear in EXECUTABLE code — comments
    // are stripped above, so documentation alone cannot satisfy any of them.
    // A regression that dropped one would silently restore exactly the class of
    // bug this release blocker exists to close.
    const required: ReadonlyArray<[string, string]> = [
      ["O_NOFOLLOW", "atomic refusal of a symlinked final component"],
      ["fs.realpath(", "canonicalisation of the root and the candidate"],
      ["fs.lstat(", "pre-open link check"],
      ["handle.stat(", "fstat on the OPEN descriptor — the only trustworthy size"],
      ["/proc/self/fd/", "post-open re-verification of what was actually opened"],
    ];
    for (const [construct, why] of required) {
      expect(primitive, `secure-read.ts must still use ${construct} — ${why}`).toContain(construct);
    }
  });
});
