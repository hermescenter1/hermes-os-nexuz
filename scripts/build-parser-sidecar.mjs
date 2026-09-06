#!/usr/bin/env node
/**
 * PHASE 109-C2.1 — build the parser sidecar artifact.
 *
 * WHY THIS EXISTS RATHER THAN RELYING ON `output: "standalone"`. Next traces
 * only what the application graph imports. The sidecar is a separate program
 * that the web process deliberately never imports, so standalone output does
 * not contain it — and the runner stage copies an explicit allowlist of
 * `node_modules` entries that does not include `yauzl` either. Without this
 * step the parser would simply not exist in any image.
 *
 * WHAT IT GUARANTEES, and verifies rather than assumes:
 *   - CommonJS output, because `package.json` declares no `type` and yauzl is CJS;
 *   - no TypeScript, no source maps at runtime;
 *   - no dynamic import, `eval` or `new Function` anywhere in the artifact;
 *   - every `require` is either a Node built-in or one of the two declared
 *     runtime dependencies;
 *   - two clean builds produce byte-identical output.
 *
 * Run: node scripts/build-parser-sidecar.mjs [--verify]
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT_DIR = join(REPO_ROOT, "dist", "parser");
const TSCONFIG = "tsconfig.parser.json";

/** Modules the compiled artifact is permitted to require at runtime. */
const ALLOWED_RUNTIME_REQUIRES = new Set([
  "node:crypto",
  "node:fs",
  "node:zlib",
  "node:http",
  "node:child_process",
  "node:path",
  "node:string_decoder",
  "yauzl",
  "zod",
]);

const BANNED = [
  { pattern: /\bimport\s*\(/, label: "dynamic import()" },
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /new\s+Function\s*\(/, label: "new Function()" },
  { pattern: /sourceMappingURL/, label: "source map reference" },
];

function fail(message) {
  process.stderr.write(`[build-parser-sidecar] FAIL: ${message}\n`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function compile() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", TSCONFIG],
    { cwd: REPO_ROOT, encoding: "utf8", shell: false },
  );
  if (result.status !== 0) {
    fail(`tsc exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
}

function hashTree() {
  const files = walk(OUT_DIR).sort();
  const entries = files.map((file) => {
    const rel = relative(OUT_DIR, file).split(sep).join("/");
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    return { rel, digest };
  });
  const combined = createHash("sha256")
    .update(entries.map((e) => `${e.digest}  ${e.rel}`).join("\n"))
    .digest("hex");
  return { entries, combined };
}

function auditArtifact() {
  const problems = [];
  const requires = new Set();
  for (const file of walk(OUT_DIR)) {
    const rel = relative(OUT_DIR, file).split(sep).join("/");
    if (/\.(ts|tsx|map)$/.test(rel)) problems.push(`${rel}: TypeScript or source map in the artifact`);
    if (!rel.endsWith(".js")) continue;
    const code = readFileSync(file, "utf8");
    for (const { pattern, label } of BANNED) {
      if (pattern.test(code)) problems.push(`${rel}: contains ${label}`);
    }
    for (const match of code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) continue;
      requires.add(specifier);
    }
  }
  for (const specifier of requires) {
    if (!ALLOWED_RUNTIME_REQUIRES.has(specifier)) {
      problems.push(`undeclared runtime dependency: ${specifier}`);
    }
  }
  const childEntry = join(OUT_DIR, "tia-archive-ingest", "sidecar", "child-entry.js");
  const supervisorEntry = join(OUT_DIR, "tia-archive-ingest", "sidecar", "supervisor-entry.js");
  if (!existsSync(childEntry)) problems.push("child-entry.js was not emitted");
  if (!existsSync(supervisorEntry)) problems.push("supervisor-entry.js was not emitted");
  return { problems, requires: [...requires].sort() };
}

compile();
const first = hashTree();
const audit = auditArtifact();

if (audit.problems.length > 0) {
  fail(`artifact audit found ${audit.problems.length} problem(s):\n  ${audit.problems.join("\n  ")}`);
}

let reproducible = "not checked (pass --verify)";
if (process.argv.includes("--verify")) {
  compile();
  const second = hashTree();
  reproducible = first.combined === second.combined ? "YES" : "NO";
  if (reproducible === "NO") fail("two clean builds produced different artifacts");
}

process.stdout.write(
  [
    "[build-parser-sidecar] OK",
    `  files          : ${first.entries.length}`,
    `  tree sha256    : ${first.combined}`,
    `  reproducible   : ${reproducible}`,
    `  runtime requires: ${audit.requires.join(", ") || "(none)"}`,
    "",
    ...first.entries
      .filter((e) => e.rel.includes("sidecar/"))
      .map((e) => `  ${e.digest}  ${e.rel}`),
    "",
  ].join("\n"),
);
