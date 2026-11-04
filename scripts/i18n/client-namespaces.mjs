/**
 * Client message scoping — which catalog namespaces each route section's
 * CLIENT components can read.
 *
 * WHY
 * ---
 * The locale layout passed the whole catalog (450–500 KB of JSON per locale)
 * to `NextIntlClientProvider`, so every public page shipped every namespace in
 * its RSC payload — dashboards, ATS, OT edge — to render a few client strings.
 * Server components read messages on the server and never need them shipped.
 *
 * WHAT THIS COMPUTES
 * ------------------
 * For the shell (locale layout, error, not-found) and for each top-level route
 * section under `src/app/[locale]/`, the import graph is walked from every
 * source file of the section. A file is client code when it carries
 * `"use client"` or is imported, directly or transitively, by client code; only
 * client code contributes namespaces:
 *
 *   useTranslations("a.b")        → "a"
 *   useTranslations(`a.b.${x}`)   → "a"   (static head names the namespace)
 *   useMessages() as { a?: …; }   → "a"   (top-level keys of the asserted type)
 *
 * Anything this cannot resolve — `useTranslations()` with no namespace, a
 * variable namespace, an untyped `useMessages()` — makes the section FULL
 * ("*"): it gets the whole catalog, exactly as before. Fail-safe, never a
 * missing string. A file may resolve its own dynamic calls by declaring the
 * namespaces it reads in a `// client-namespaces: a b` comment.
 *
 * The result is committed as `src/i18n/client-namespaces.json`; a test
 * regenerates it and fails on drift, so a new client component that reads a
 * new namespace cannot ship without its section receiving that namespace.
 *
 * Pure Node stdlib, deterministic, no network.
 *
 *   node scripts/i18n/client-namespaces.mjs           write the manifest
 *   node scripts/i18n/client-namespaces.mjs --check   exit 1 on drift
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MANIFEST_PATH = join("src", "i18n", "client-namespaces.json");

const EXT = [".tsx", ".ts", ".jsx", ".js"];
const LOCALE_DIR = join("src", "app", "[locale]");
/** Section directories that are not route sections. */
const NOT_SECTIONS = new Set(["__tests__", "[...unmatched]"]);
/** Files at the locale root rendered inside the layout provider for every route. */
const SHELL_FILES = ["layout.tsx", "error.tsx", "not-found.tsx"];
const SHELL_DIRS = ["[...unmatched]"];
/** The home page is the section with the empty name. */
const HOME_FILES = ["page.tsx"];

const isTestFile = (name) => /\.(test|spec)\.[jt]sx?$/.test(name);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(p, out);
    } else if (EXT.includes(extname(entry.name)) && !isTestFile(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;
const USE_CLIENT_RE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;
const TRANSLATIONS_RE = /\buseTranslations\s*\(\s*([^)]*?)\s*\)/g;
const MESSAGES_RE = /\buseMessages\s*\(\s*\)/g;
const ANNOTATION_RE = /\/\/\s*client-namespaces:\s*([A-Za-z0-9_ ]+)/;

/** Top-level keys of the object type literal that follows `as` after `index`. */
function assertedTopLevelKeys(source, index) {
  const after = source.slice(index);
  const m = after.match(/^\s*useMessages\s*\(\s*\)\s*as\s*\{/);
  if (!m) return null;
  let depth = 0;
  let i = m[0].length - 1;
  const start = i + 1;
  for (; i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null;
  const body = after.slice(start, i);
  const keys = [];
  let d = 0;
  let token = "";
  for (const ch of body) {
    if (ch === "{" || ch === "<" || ch === "(" || ch === "[") d++;
    else if (ch === "}" || ch === ">" || ch === ")" || ch === "]") d--;
    if (d === 0 && (ch === ";" || ch === "," || ch === "\n")) {
      const key = token.match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/);
      if (key) keys.push(key[1]);
      token = "";
    } else if (d === 0 || token.length < 200) {
      token += ch;
    }
  }
  const last = token.match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/);
  if (last) keys.push(last[1]);
  return keys.length > 0 ? keys : null;
}

/**
 * Namespaces one client file reads. `unresolved` lists the calls this could
 * not resolve; the caller makes the section full for them.
 */
export function namespacesOfSource(source) {
  const names = new Set();
  const unresolved = [];
  const annotation = source.match(ANNOTATION_RE);
  const declared = annotation ? annotation[1].trim().split(/\s+/) : null;

  TRANSLATIONS_RE.lastIndex = 0;
  let m;
  while ((m = TRANSLATIONS_RE.exec(source))) {
    const arg = m[1];
    const literal = arg.match(/^["']([^"']+)["']$/) ?? arg.match(/^`([^`$]+)`$/);
    const template = arg.match(/^`([^`$]*?)\$\{/);
    if (literal) {
      names.add(literal[1].split(".")[0]);
    } else if (template && template[1].includes(".")) {
      names.add(template[1].split(".")[0]);
    } else if (declared) {
      declared.forEach((n) => names.add(n));
    } else {
      unresolved.push(`useTranslations(${arg})`);
    }
  }

  MESSAGES_RE.lastIndex = 0;
  while ((m = MESSAGES_RE.exec(source))) {
    const keys = assertedTopLevelKeys(source, m.index);
    if (keys) keys.forEach((k) => names.add(k));
    else if (declared) declared.forEach((n) => names.add(n));
    else unresolved.push("useMessages()");
  }

  return { names, unresolved };
}

function createGraph(repoRoot) {
  const srcRoot = join(repoRoot, "src");
  const text = new Map();
  for (const f of walk(srcRoot)) text.set(f, readFileSync(f, "utf8"));

  function resolveSpecifier(from, spec) {
    let base;
    if (spec.startsWith("@/")) base = join(srcRoot, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    const candidates = [base, ...EXT.map((x) => base + x), ...EXT.map((x) => join(base, "index" + x))];
    return candidates.find((c) => text.has(c)) ?? null;
  }

  const depsCache = new Map();
  function deps(file) {
    if (depsCache.has(file)) return depsCache.get(file);
    const source = text.get(file);
    const out = [];
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(source))) {
      if (m[2]) continue; // `import type` is erased
      const r = resolveSpecifier(file, m[3]);
      if (r) out.push(r);
    }
    DYNAMIC_IMPORT_RE.lastIndex = 0;
    while ((m = DYNAMIC_IMPORT_RE.exec(source))) {
      const r = resolveSpecifier(file, m[1]);
      if (r) out.push(r);
    }
    depsCache.set(file, out);
    return out;
  }

  const fileNamespaces = new Map();
  function namespacesOf(file) {
    if (!fileNamespaces.has(file)) fileNamespaces.set(file, namespacesOfSource(text.get(file)));
    return fileNamespaces.get(file);
  }

  /** Walk from `entries`; collect namespaces from files reached as client code. */
  function collect(entries) {
    const names = new Set();
    const unresolved = [];
    const seen = new Set();
    const stack = entries.filter((f) => text.has(f)).map((f) => [f, false]);
    while (stack.length) {
      const [file, parentIsClient] = stack.pop();
      const isClient = parentIsClient || USE_CLIENT_RE.test(text.get(file));
      const key = `${isClient ? "c" : "s"}:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isClient) {
        const found = namespacesOf(file);
        found.names.forEach((n) => names.add(n));
        for (const u of found.unresolved) {
          unresolved.push(`${relative(repoRoot, file).split(sep).join("/")}: ${u}`);
        }
      }
      for (const d of deps(file)) stack.push([d, isClient]);
    }
    return { names, unresolved };
  }

  return { collect };
}

/** Compute the manifest for the repository at `repoRoot`. */
export function computeClientNamespaces(repoRoot = REPO_ROOT) {
  const localeDir = join(repoRoot, LOCALE_DIR);
  const { collect } = createGraph(repoRoot);

  const shellEntries = [
    ...SHELL_FILES.map((f) => join(localeDir, f)),
    ...SHELL_DIRS.flatMap((d) => walk(join(localeDir, d))),
  ];
  const shell = collect(shellEntries);
  if (shell.unresolved.length > 0) {
    throw new Error(`The shell must resolve statically:\n${shell.unresolved.join("\n")}`);
  }

  const sectionDirs = readdirSync(localeDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NOT_SECTIONS.has(e.name))
    .map((e) => e.name)
    .sort();

  const sections = {};
  const full = {};
  const record = (name, result) => {
    if (result.unresolved.length > 0) {
      sections[name] = "*";
      full[name] = [...new Set(result.unresolved)].sort();
    } else {
      sections[name] = [...result.names].filter((n) => !shell.names.has(n)).sort();
    }
  };

  record("", collect(HOME_FILES.map((f) => join(localeDir, f))));
  for (const dir of sectionDirs) record(dir, collect(walk(join(localeDir, dir))));

  return {
    $comment:
      "GENERATED by scripts/i18n/client-namespaces.mjs — do not edit. Catalog namespaces shipped to client components: the shell on every route, plus each top-level section's own list (\"*\" = the whole catalog). Regenerate after adding client translations.",
    shell: [...shell.names].sort(),
    sections,
    full,
  };
}

export function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2) + "\n";
}

function main() {
  const check = process.argv.includes("--check");
  const target = join(REPO_ROOT, MANIFEST_PATH);
  const next = serializeManifest(computeClientNamespaces(REPO_ROOT));
  if (check) {
    const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== next) {
      console.error(`${MANIFEST_PATH} is stale — run: node scripts/i18n/client-namespaces.mjs`);
      process.exit(1);
    }
    console.log(`${MANIFEST_PATH} is current`);
    return;
  }
  writeFileSync(target, next);
  console.log(`wrote ${MANIFEST_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
