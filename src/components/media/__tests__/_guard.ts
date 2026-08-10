import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the `mediaHub` key contract, derived from the
 * TypeScript AST of the media surfaces and checked against the shipped catalogs.
 *
 * WHY THIS IS A MODULE AND NOT A TEST
 * Two callers need exactly this audit against two different roots:
 *
 *   1. `src/i18n/__tests__/mediahub-contract.test.ts` runs it against the REPO,
 *      which is the gate that must stay green;
 *   2. `mediahub-guard-mutation.test.ts` runs it against out-of-repo CLONES of
 *      the repo in which a single fact has been broken on purpose, and asserts
 *      the audit turns RED. A guard nobody has ever seen fail is a guard nobody
 *      has evidence for, and the only way to see this one fail without breaking
 *      the working tree is to point it at a different root.
 *
 * So every path below is resolved from the `root` argument. Nothing here reads
 * `__dirname`, and nothing here imports the catalogs as modules — a mutated
 * clone must be read from disk, not from Vite's module graph.
 *
 * WHY THE COMPILER API AND NOT A REGULAR EXPRESSION
 * The previous implementation matched `/\bt(\.rich|\.has)?\(\s*"([^"]+)"/`. That
 * is wrong in both directions and both directions were reproduced:
 *
 *   - `const tr = useTranslations("mediaHub"); tr("someKey")` — MISSED. The
 *     binding is not literally named `t`, so a real MISSING_MESSAGE shipped
 *     while the guard stayed green.
 *   - `t('singleQuoted')` — MISSED, because the pattern only accepts `"`.
 *   - a key mentioned inside a `//` comment — FALSE POSITIVE. Text that the
 *     compiler discards was treated as a call the application makes.
 *
 * `ts.createSourceFile` + `forEachChild` fixes all three by construction:
 * comments are not nodes, quote style is not represented in `.text`, and the
 * translator is identified by its BINDING rather than by its spelling.
 */

export const NAMESPACE = "mediaHub";
export const LOCALES = ["fa", "en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

/** Directories whose sources may resolve the namespace. */
const SOURCE_DIRS = ["src/components/media", "src/app/[locale]/videos"] as const;

/** The factories that hand back a namespace-bound translator. */
const TRANSLATOR_FACTORIES = new Set([
  "useTranslations",
  "getTranslations",
  "createTranslator",
]);

/**
 * Member calls that resolve a key exactly like the translator itself.
 * `t.raw` is included: it reads the same path and throws the same
 * MISSING_MESSAGE, it merely skips ICU formatting.
 */
const TRANSLATOR_MEMBERS = new Set(["rich", "has", "markup", "raw"]);

type Tree = Record<string, unknown>;

/* ═══════════════════════════ file discovery ═══════════════════════════ */

function sourceFilesIn(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Test fixtures are not a source of truth about what the app renders.
      if (entry !== "__tests__") sourceFilesIn(full, out);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/* ═══════════════════════════ closed vocabularies ═══════════════════════════ */

/** `export const NAME = ["A", "B"] as const` → ["A", "B"], read from the AST. */
function constArray(sf: ts.SourceFile, name: string): readonly string[] | undefined {
  let found: readonly string[] | undefined;
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== name) return;
    let init = node.initializer;
    while (init !== undefined && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) {
      init = init.expression;
    }
    if (init === undefined || !ts.isArrayLiteralExpression(init)) return;
    found = init.elements.flatMap((element) =>
      ts.isStringLiteral(element) ? [element.text] : [],
    );
  });
  return found;
}

/** `export type Name = "A" | "B";` → ["A", "B"], read from the AST. */
function unionType(sf: ts.SourceFile, name: string): readonly string[] | undefined {
  let found: readonly string[] | undefined;
  walk(sf, (node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== name) return;
    const members = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
    found = members.flatMap((member) =>
      ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)
        ? [member.literal.text]
        : [],
    );
  });
  return found;
}

/* ═══════════════════════════ the audit ═══════════════════════════ */

export interface KeyOrigin {
  key: string;
  /** Repo-relative source files that reach this key. */
  sources: readonly string[];
}

export interface GuardReport {
  /** Repo-relative paths of the sources that bind the namespace. */
  files: readonly string[];
  /** Every static key, expanded dynamic keys included, sorted. */
  keys: readonly string[];
  /** Keys written as literals, before dynamic expansion. */
  staticKeys: readonly string[];
  /** Raw template texts, e.g. `lifecycle.${status}`. */
  families: readonly string[];
  /** Families whose vocabulary this audit could not resolve. */
  unmappedFamilies: readonly string[];
  /** A translator name bound to `mediaHub` AND to something else in one file. */
  ambiguousBindings: readonly string[];
  /** `t(someVariable)` — a key path no static analysis can check. */
  unresolvableCalls: readonly string[];
  /** Per locale: derived keys that do not resolve to a string. */
  missing: Record<Locale, readonly string[]>;
  /** Per locale: derived keys resolving to `""`. */
  blank: Record<Locale, readonly string[]>;
  /** Per locale: derived keys resolving to an object (next-intl INSUFFICIENT_PATH). */
  notLeaf: Record<Locale, readonly string[]>;
  /** fa/de leaves whose ICU arguments disagree with en. */
  placeholderDrift: readonly string[];
  /** `mediaHub` leaves in `en` that no `t()` call reaches. */
  orphans: readonly string[];
  /** Every `mediaHub` leaf path in `en`. */
  catalogLeaves: readonly string[];
  /** The resolved vocabulary behind each dynamic family. */
  vocabularies: Readonly<Record<string, readonly string[]>>;
  origins: readonly KeyOrigin[];
}

function resolveKey(catalog: Tree, key: string): unknown {
  let node: unknown = catalog[NAMESPACE];
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Tree)[segment];
  }
  return node;
}

function leafPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return prefix === "" ? [] : [prefix];
  return Object.entries(node as Tree).flatMap(([key, value]) =>
    leafPaths(value, prefix === "" ? key : `${prefix}.${key}`),
  );
}

const icuArgs = (value: string): string =>
  [...value.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");

/** Strip `await`, parentheses and `as` from a variable initialiser. */
function unwrap(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node;
  while (
    current !== undefined &&
    (ts.isAwaitExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** The namespace a translator factory call is bound to, or undefined. */
function namespaceOfFactoryCall(call: ts.CallExpression): string | undefined {
  const first = call.arguments[0];
  if (first === undefined) return undefined;
  if (ts.isStringLiteral(first)) return first.text;
  if (ts.isObjectLiteralExpression(first)) {
    for (const property of first.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      const propertyName = ts.isIdentifier(name)
        ? name.text
        : ts.isStringLiteral(name)
          ? name.text
          : undefined;
      if (propertyName !== "namespace") continue;
      if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
      return undefined;
    }
  }
  return undefined;
}

/** The callee name of a call, whether plain or imported under a namespace. */
function calleeName(call: ts.CallExpression): string | undefined {
  const target = call.expression;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  return undefined;
}

interface Bindings {
  bound: Set<string>;
  ambiguous: Set<string>;
}

/**
 * Which local names in this file are `mediaHub` translators.
 *
 * A name bound to `mediaHub` in one place and to another namespace (or to the
 * root namespace, i.e. `useTranslations()` with no argument) elsewhere in the
 * same file is reported as AMBIGUOUS rather than guessed at: attributing its
 * calls to `mediaHub` would invent keys, and skipping them would hide keys.
 */
function bindingsIn(sf: ts.SourceFile): Bindings {
  const bound = new Set<string>();
  const foreign = new Set<string>();

  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) return;
    const init = unwrap(node.initializer);
    if (init === undefined || !ts.isCallExpression(init)) return;
    const callee = calleeName(init);
    if (callee === undefined || !TRANSLATOR_FACTORIES.has(callee)) return;
    const namespace = namespaceOfFactoryCall(init);
    (namespace === NAMESPACE ? bound : foreign).add(node.name.text);
  });

  const ambiguous = new Set([...bound].filter((name) => foreign.has(name)));
  for (const name of ambiguous) bound.delete(name);
  return { bound, ambiguous };
}

/** The literal key, the template family, or null when neither. */
function keyArgument(
  call: ts.CallExpression,
  sf: ts.SourceFile,
): { kind: "static" | "family"; text: string } | null {
  const first = call.arguments[0];
  if (first === undefined) return null;
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
    return { kind: "static", text: first.text };
  }
  if (ts.isTemplateExpression(first)) {
    let text = first.head.text;
    for (const span of first.templateSpans) {
      text += `\${${span.expression.getText(sf)}}${span.literal.text}`;
    }
    return { kind: "family", text };
  }
  return null;
}

export function auditMediaHub(root: string): GuardReport {
  const readSource = (relative: string): ts.SourceFile | undefined => {
    const full = path.join(root, relative);
    try {
      return parse(full, readFileSync(full, "utf8"));
    } catch {
      return undefined;
    }
  };

  /* ── 1. the closed vocabularies that expand the dynamic families ── */

  const types = readSource("src/lib/media/types.ts");
  const logic = readSource("src/components/media/logic.ts");
  const emptyState = readSource("src/components/media/MediaEmptyState.tsx");
  const errorState = readSource("src/components/media/MediaErrorState.tsx");

  const vocabulary = (
    sf: ts.SourceFile | undefined,
    name: string,
    kind: "const" | "type",
  ): readonly string[] | undefined =>
    sf === undefined
      ? undefined
      : kind === "const"
        ? constArray(sf, name)
        : unionType(sf, name);

  const families: Record<string, readonly string[] | undefined> = {
    "lifecycle.${status}": vocabulary(types, "MEDIA_LIFECYCLE_STATUSES", "const"),
    "processing.${state}": vocabulary(types, "MEDIA_PROCESSING_STATES", "const"),
    "skillLevel.${level}": vocabulary(types, "MEDIA_SKILL_LEVELS", "const"),
    "sort.${option}": vocabulary(logic, "MEDIA_SORT_OPTIONS", "const"),
    "duration.${bucket}": vocabulary(logic, "MEDIA_DURATION_BUCKETS", "const"),
    "empty.${reason}.title": vocabulary(emptyState, "MediaEmptyReason", "type"),
    "empty.${reason}.body": vocabulary(emptyState, "MediaEmptyReason", "type"),
    "failure.${failure}.title": vocabulary(errorState, "MediaFailureCode", "type"),
    "failure.${failure}.body": vocabulary(errorState, "MediaFailureCode", "type"),
    "player.blocked.${block}.title": vocabulary(logic, "PlayerBlockReason", "type"),
    "player.blocked.${block}.body": vocabulary(logic, "PlayerBlockReason", "type"),
    "player.error.${errorKind}.title": vocabulary(logic, "MediaErrorKind", "type"),
    "player.error.${errorKind}.body": vocabulary(logic, "MediaErrorKind", "type"),
  };

  /* ── 2. derive the key set by walking the AST of every media source ── */

  const origin = new Map<string, Set<string>>();
  const note = (key: string, file: string): void => {
    const seen = origin.get(key) ?? new Set<string>();
    seen.add(file);
    origin.set(key, seen);
  };

  const files: string[] = [];
  const staticKeys = new Set<string>();
  const seenFamilies = new Set<string>();
  const ambiguousBindings: string[] = [];
  const unresolvableCalls: string[] = [];

  for (const dir of SOURCE_DIRS) {
    for (const full of sourceFilesIn(path.join(root, dir))) {
      const label = path.relative(root, full).replace(/\\/g, "/");
      const sf = parse(full, readFileSync(full, "utf8"));
      const { bound, ambiguous } = bindingsIn(sf);
      for (const name of ambiguous) ambiguousBindings.push(`${label}: ${name}`);
      if (bound.size === 0) continue;
      files.push(label);

      walk(sf, (node) => {
        if (!ts.isCallExpression(node)) return;
        const target = node.expression;
        let binding: string | undefined;
        if (ts.isIdentifier(target)) {
          binding = target.text;
        } else if (
          ts.isPropertyAccessExpression(target) &&
          ts.isIdentifier(target.expression) &&
          TRANSLATOR_MEMBERS.has(target.name.text)
        ) {
          binding = target.expression.text;
        }
        if (binding === undefined || !bound.has(binding)) return;

        const argument = keyArgument(node, sf);
        if (argument === null) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          unresolvableCalls.push(`${label}:${line + 1} ${node.getText(sf).slice(0, 60)}`);
          return;
        }
        if (argument.kind === "static") {
          staticKeys.add(argument.text);
          note(argument.text, label);
          return;
        }
        seenFamilies.add(argument.text);
        const members = families[argument.text];
        if (members === undefined) return; // reported as unmappedFamilies
        for (const member of members) {
          note(argument.text.replace(/\$\{[^}]+\}/, member), label);
        }
      });
    }
  }

  const unmappedFamilies = [...seenFamilies]
    .filter((template) => families[template] === undefined)
    .sort();

  const keys = [...origin.keys()].sort();

  /* ── 3. resolve against the catalogs read FROM DISK, not from imports ── */

  const catalogs = {} as Record<Locale, Tree>;
  for (const locale of LOCALES) {
    catalogs[locale] = JSON.parse(
      readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"),
    ) as Tree;
  }

  const missing = {} as Record<Locale, readonly string[]>;
  const blank = {} as Record<Locale, readonly string[]>;
  const notLeaf = {} as Record<Locale, readonly string[]>;

  const sourcesOf = (key: string): string => [...(origin.get(key) ?? [])].join(", ");

  for (const locale of LOCALES) {
    const catalog = catalogs[locale];
    missing[locale] = keys
      .filter((key) => typeof resolveKey(catalog, key) !== "string")
      .map((key) => `${key}   [${sourcesOf(key)}]`);
    blank[locale] = keys.filter((key) => {
      const value = resolveKey(catalog, key);
      return typeof value === "string" && value.trim() === "";
    });
    notLeaf[locale] = keys.filter((key) => {
      const value = resolveKey(catalog, key);
      return value !== undefined && typeof value !== "string";
    });
  }

  const placeholderDrift: string[] = [];
  for (const key of keys) {
    const source = resolveKey(catalogs.en, key);
    if (typeof source !== "string") continue;
    for (const locale of ["fa", "de"] as const) {
      const value = resolveKey(catalogs[locale], key);
      if (typeof value !== "string") continue;
      if (icuArgs(value) !== icuArgs(source)) {
        placeholderDrift.push(
          `${locale}:${key} — "${icuArgs(value)}" vs en "${icuArgs(source)}"`,
        );
      }
    }
  }

  const catalogLeaves = leafPaths(catalogs.en[NAMESPACE]).sort();
  const reached = new Set(keys);
  const orphans = catalogLeaves.filter((leaf) => !reached.has(leaf));

  const vocabularies: Record<string, readonly string[]> = {};
  for (const [template, members] of Object.entries(families)) {
    if (members !== undefined) vocabularies[template] = members;
  }

  return {
    files: files.sort(),
    keys,
    staticKeys: [...staticKeys].sort(),
    families: [...seenFamilies].sort(),
    unmappedFamilies,
    ambiguousBindings: ambiguousBindings.sort(),
    unresolvableCalls: unresolvableCalls.sort(),
    missing,
    blank,
    notLeaf,
    placeholderDrift,
    orphans,
    catalogLeaves,
    vocabularies,
    origins: keys.map((key) => ({ key, sources: [...(origin.get(key) ?? [])] })),
  };
}

/**
 * The audit reduced to a single verdict.
 *
 * Empty means GREEN. The mutation suite asserts on this rather than on the
 * individual arrays, so a mutation that breaks the contract in ANY of the ways
 * this guard is supposed to catch counts as caught.
 *
 * The floor checks are part of the verdict on purpose: an audit that found no
 * files, or a handful of keys, has stopped checking anything, and "found
 * nothing wrong" is then indistinguishable from "found nothing".
 */
export function guardViolations(report: GuardReport): string[] {
  const problems: string[] = [];
  if (report.files.length < 20) {
    problems.push(`only ${report.files.length} media sources bind the namespace`);
  }
  if (report.keys.length < 150) {
    problems.push(`only ${report.keys.length} keys derived`);
  }
  for (const family of report.unmappedFamilies) problems.push(`unmapped family: ${family}`);
  for (const binding of report.ambiguousBindings) problems.push(`ambiguous binding: ${binding}`);
  for (const call of report.unresolvableCalls) problems.push(`unresolvable key: ${call}`);
  for (const locale of LOCALES) {
    for (const key of report.missing[locale]) problems.push(`${locale} missing: ${key}`);
    for (const key of report.blank[locale]) problems.push(`${locale} blank: ${key}`);
    for (const key of report.notLeaf[locale]) problems.push(`${locale} not a leaf: ${key}`);
  }
  for (const drift of report.placeholderDrift) problems.push(`placeholder drift: ${drift}`);
  return problems;
}
