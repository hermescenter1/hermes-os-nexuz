#!/usr/bin/env node
/**
 * S0-B-05 — deterministic inventory of every `getPrisma()` call site and its
 * behaviour when Prisma is unavailable.
 *
 * WHY THIS EXISTS
 * An earlier pass classified these call sites with a throwaway heuristic: a
 * regex over a seven-line window, run once, from a scratch directory, with no
 * fixtures and no determinism guarantee. It produced 377 call sites of which 105
 * were UNCLASSIFIED and 110 returned `null` with unknown consequences — numbers
 * that could not be re-derived by anyone else and were therefore worthless as
 * security evidence. This tool replaces that heuristic with something a third
 * party can run and get the same bytes.
 *
 * WHAT IT IS NOT
 * It is not a TypeScript compiler. No parser is available without installing a
 * dependency, which this phase forbids, so the analyser is a bounded tokenizer:
 * it removes comments and string literals, matches braces, and reads a small
 * number of shapes it can recognise exactly. Everything it cannot read exactly
 * is reported as UNRESOLVED_REQUIRES_MANUAL_REVIEW. It never guesses toward a
 * safe answer — see `classify`.
 *
 * DETERMINISM CONTRACT
 * The generated JSON contains no timestamp, no absolute path, no username, no
 * drive letter and no random value. Paths are POSIX-relative to the repository
 * root. Records are sorted lexicographically by id. Running `generate` twice on
 * the same tree produces byte-identical output; `check` proves it.
 *
 * USAGE
 *   node scripts/security/s0/getprisma-callsite-inventory.mjs generate
 *   node scripts/security/s0/getprisma-callsite-inventory.mjs check
 *   node scripts/security/s0/getprisma-callsite-inventory.mjs summary
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");

export const OUT_PATH = join(REPO_ROOT, "docs", "security", "s0-getprisma-callsite-inventory.json");
export const OVERRIDES_PATH = join(HERE, "getprisma-manual-adjudications.json");
export const EDGE_TRACES_PATH = join(HERE, "getprisma-consumer-edge-traces.json");
export const RESIDUAL_SCREENING_PATH = join(HERE, "getprisma-residual-reachability.json");

/**
 * The scan-scope exclusion added in `EXCLUDED_PATH_PREFIXES` deliberately does
 * NOT move this version: it changes which FILES are offered to the scanner, not
 * the rule table, the tokenizer or the record shape, and it provably produces
 * byte-identical output to the run before the tool was committed. Leaving the
 * version alone is what lets that identity be checked by hash.
 *
 * RULESET VERSION — bump on ANY change to the rule table, the tokenizer or the
 * record shape. The generated inventory carries it, so a stale inventory is
 * detectable even when the call sites themselves have not moved.
 */
export const RULESET_VERSION = "s0-b05.7";

/**
 * LINE-ENDING NORMALISATION — the single entry point for every source file the
 * analyser reads.
 *
 * Every budget in this tool is a CHARACTER budget (the 2,600-character window, the
 * brace walk, the catch search, line and column arithmetic). A carriage return is a
 * character, so the same file checked out with CRLF has fewer lines inside the same
 * window than the same file checked out with LF, and a `catch` that sat inside the
 * window under LF fell outside it under CRLF. Windows with core.autocrlf and a Linux
 * runner therefore produced different inventories from byte-identical commits.
 *
 * Both CR+LF and a lone CR become LF BEFORE the text reaches the tokenizer, the
 * window, the catch detector, the fingerprint or the line/column maths. The file
 * LIST (git ls-files or the filesystem walk) is not affected; only reads are, and
 * every read goes through `readSourceText`.
 */
export function normalizeSourceText(text) {
  return text.replace(/\r\n?/g, "\n");
}

export function readSourceText(absPath) {
  return normalizeSourceText(readFileSync(absPath, "utf8"));
}

/** Directories scanned, POSIX-relative to the repository root. */
export const SCAN_ROOTS = ["src", "scripts"];

/** Extensions considered source. */
const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".mjs", ".js"]);

/** Never scanned: build output, worktrees, dependencies, and this tool's own fixtures. */
const SKIP_DIR = new Set(["node_modules", ".next", ".claude", ".git", "fixtures"]);

/**
 * Paths removed from the file list ENTIRELY, before any file is read, tokenized
 * or classified.
 *
 * WHY THIS EXISTS. The tool lives under `scripts/`, which is one of its own scan
 * roots. While its files were untracked, `git ls-files` did not list them and
 * they were never scanned. Committing them made them TRACKED, and the very next
 * run scanned the scanner's own selftest: 392 call sites became 394 and the
 * textual-occurrence count went from 835 to 877, so `check` reported drift
 * against an inventory that had not actually changed. **A scanner that lives
 * under its own scan root changes its own output the moment it is committed.**
 *
 * Worse, the two extra "call sites" were at selftest lines 243 and 365 — one
 * inside a `//` comment and one inside a string literal, both of which should
 * have been blanked. That is limitation 1 (regex literals are not tokenized)
 * biting on a real file: the selftest is dense with regex literals and escaped
 * backticks, and the tokenizer desynchronises there. So the self-scan produced
 * FALSE POSITIVES, not merely extra rows.
 *
 * This is a PATH prefix, not a directory NAME in `SKIP_DIR`. A bare name `"s0"`
 * would silently delete any future directory that happens to share it, anywhere
 * in the tree — a scanner must never drop files it was not asked to drop.
 * `scripts/security/` outside this one subtree stays fully scannable: 140 source
 * files under `scripts/` remain in scope, among them
 * `scripts/security/check-env-example.mjs` and `scripts/security/phase100/*`.
 *
 * POSTREV-F1. The same holds for the S1 assurance tools: `scripts/security/s1/`
 * (the register checker, the relock checker, the mutation campaign and their
 * selftests) is untracked while it is being reviewed and TRACKED the moment it is
 * committed, at which point the scanner used to read it (860 → 906 textual
 * occurrences, `check` and the relock check failing). Both subtrees are excluded by
 * their exact repository-relative prefix, before any file is read, on the
 * `git ls-files` path and on the filesystem-walk path alike. Look-alikes such as
 * `scripts/security/s1extra/`, `scripts/s1/` and `src/lib/s1/` stay in scope.
 */
export const EXCLUDED_PATH_PREFIXES = Object.freeze(["scripts/security/s0/", "scripts/security/s1/"]);

/** Is this repository-relative path inside an excluded subtree? */
export function isExcludedPath(rel) {
  const p = String(rel).split(sep).join("/").replace(/^\.\//, "");
  return EXCLUDED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix) || p === prefix.replace(/\/$/, ""));
}

// ───────────────────────────── primary classifications ─────────────────────────

export const CLASSIFICATIONS = Object.freeze([
  "DB_REQUIRED_FAIL_CLOSED",
  "DB_UNAVAILABLE_RETURNS_503",
  "AUTH_OR_SESSION_FAIL_CLOSED",
  "EMPTY_SUCCESS_FALLBACK",
  "IN_MEMORY_READ_FALLBACK",
  "IN_MEMORY_WRITE_FALLBACK",
  "SILENT_EXCEPTION_FALLBACK",
  "EXPLICIT_DEGRADED_MODE",
  "HEALTH_OR_DIAGNOSTIC_ONLY",
  "INITIALIZATION_OR_MAINTENANCE",
  "TEST_ONLY",
  "WRAPPER_OR_FACTORY",
  "UNRESOLVED_REQUIRES_MANUAL_REVIEW",
]);

export const CONFIDENCE = Object.freeze(["EXACT", "HIGH", "MANUAL"]);

// ───────────────────────────────── tokenizer ───────────────────────────────────

/**
 * Replace every comment and string/template literal with spaces, preserving
 * length and newlines so that line and column numbers stay exact.
 *
 * Handles: // line, /* block, '…', "…", `…` with ${} nesting, and escapes.
 * Does NOT handle regex literals containing quotes or slashes — a known
 * limitation, recorded in the report. A regex literal cannot contain a
 * `getPrisma(` call, so the worst case is a mis-blanked span near one, which
 * surfaces as UNRESOLVED rather than as a wrong classification.
 */
export function blankCommentsAndStrings(src) {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      let j = i + 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
      blank(i, Math.min(j + 2, n));
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c || src[j] === "\n") break;
        j += 1;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") { depth += 1; j += 2; continue; }
        if (src[j] === "}" && depth > 0) { depth -= 1; j += 1; continue; }
        if (src[j] === "`" && depth === 0) break;
        j += 1;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/** Index of the matching close for the opener at `openIdx`. -1 when unbalanced. */
export function matchBrace(text, openIdx, open = "{", close = "}") {
  if (text[openIdx] !== open) return -1;
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 1-based line and column for a character offset. */
export function lineColOf(src, offset) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < src.length; i += 1) {
    if (src[i] === "\n") { line += 1; last = i; }
  }
  return { line, column: offset - last };
}

// ──────────────────────────── call-site discovery ──────────────────────────────

/**
 * Textual occurrences of the identifier, including those inside comments and
 * strings. Reported for transparency: the gap between this and the real call
 * count is exactly what a naive grep would have over-counted.
 */
export function countTextualOccurrences(src) {
  return (src.match(/\bgetPrisma\b/g) ?? []).length;
}

/**
 * Real `getPrisma(` call expressions, with comments and strings already blanked.
 * Excludes the declaration itself (`export async function getPrisma(`) and any
 * import binding.
 */
export function findCallSites(relPath, src) {
  const code = blankCommentsAndStrings(src);
  const sites = [];
  const re = /\bgetPrisma\s*\(/g;
  let m;
  let ordinal = 0;
  while ((m = re.exec(code))) {
    const at = m.index;
    const before = code.slice(Math.max(0, at - 80), at);
    // the definition, not a call
    if (/(?:function|const|let|var)\s*$/.test(before.replace(/\s+$/, " ").replace(/\basync\s*$/, ""))) continue;
    if (/\bfunction\s+$/.test(before)) continue;
    const { line, column } = lineColOf(src, at);
    ordinal += 1;
    sites.push({ relPath, offset: at, line, column, ordinal, code });
  }
  return sites;
}

/** Is this file part of the test corpus rather than a production artifact? */
export function isTestPath(relPath) {
  return /(^|\/)__tests__\//.test(relPath)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(relPath)
    || /(^|\/)testing\//.test(relPath);
}

// ───────────────────────────────── rule table ──────────────────────────────────

/**
 * Rules are ordered; the FIRST match wins and its id is recorded. Each rule
 * states the confidence it is allowed to assert. No rule may assert EXACT on a
 * shape it has not matched in full.
 */
export const RULES = Object.freeze([
  // ── identity and shape rules, evaluated before any guard search ──
  { id: "R01-definition-wrapper", classification: "WRAPPER_OR_FACTORY", confidence: "EXACT" },
  { id: "R02-test-path", classification: "TEST_ONLY", confidence: "EXACT" },
  { id: "R15-accessor-return", classification: "WRAPPER_OR_FACTORY", confidence: "EXACT" },
  { id: "R12-model-accessor", classification: "WRAPPER_OR_FACTORY", confidence: "EXACT" },
  { id: "R13-presence-test-degraded", classification: "EXPLICIT_DEGRADED_MODE", confidence: "HIGH" },
  { id: "R14-presence-test", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
  // ── null-path content rules, applied to a span found by guard discovery ──
  { id: "R04-guard-503", classification: "DB_UNAVAILABLE_RETURNS_503", confidence: "EXACT" },
  { id: "R03-guard-throw", classification: "DB_REQUIRED_FAIL_CLOSED", confidence: "EXACT" },
  { id: "R05-guard-auth-deny", classification: "AUTH_OR_SESSION_FAIL_CLOSED", confidence: "EXACT" },
  { id: "R20-in-memory-write", classification: "IN_MEMORY_WRITE_FALLBACK", confidence: "EXACT" },
  { id: "R06-guard-session-fallback", classification: "IN_MEMORY_READ_FALLBACK", confidence: "HIGH" },
  { id: "R07-guard-empty-array", classification: "EMPTY_SUCCESS_FALLBACK", confidence: "EXACT" },
  { id: "R08-guard-null-undefined", classification: "EMPTY_SUCCESS_FALLBACK", confidence: "HIGH" },
  { id: "R09-guard-false-zero", classification: "EMPTY_SUCCESS_FALLBACK", confidence: "HIGH" },
  // ── exception-path rule ──
  { id: "R21-silent-exception", classification: "SILENT_EXCEPTION_FALLBACK", confidence: "EXACT" },
  // ── accessor attribution: the classification is DERIVED, so it is not fixed here ──
  { id: "R22-local-accessor-consumers", classification: null, confidence: "HIGH" },
  // ── rules that NARROW an unresolved verdict without deciding it ──
  { id: "R18-result-object-refusal", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
  { id: "R19-named-or-shaped-return", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
  { id: "R16-positive-guard-no-else", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
  { id: "R10-no-guard", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
  { id: "R11-ambiguous", classification: "UNRESOLVED_REQUIRES_MANUAL_REVIEW", confidence: "MANUAL" },
]);

const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));

/**
 * The statement window: from the call expression to the end of the enclosing
 * block, bounded to 2000 characters. Deterministic and independent of
 * formatting.
 */
function windowAfter(code, offset) {
  return code.slice(offset, windowEnd(code, offset, 2000));
}

/** The binding name in `const db = await getPrisma()`, or null. */
export function bindingNameBefore(code, offset) {
  const back = code.slice(Math.max(0, offset - 160), offset);
  // `const db = await getPrisma()`  and  `const db = (await getPrisma()) as T`
  // `const db = await getPrisma()`, `const db = (await getPrisma()) as T`, and
  // `const client = opts.client ?? (await getPrisma())` — the nullish-coalesced
  // form is the repository's injection idiom and v2 could not bind it at all.
  const m = back.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:[^;=]*?\?\?\s*)?\(?\s*(?:await\s+)?$/);
  return m ? m[1] : null;
}

/**
 * `(await getPrisma()) === null` / `!== null` — a PRESENCE test, not a use of
 * the client. Returns the assigned identifier when there is one, `""` for a bare
 * comparison, or null when the shape does not match.
 */
export function presenceTestTarget(code, offset) {
  // Step past the call's own argument list first: `offset` points at the
  // identifier, so the window begins `getPrisma()) === null`.
  const openParen = code.indexOf("(", offset);
  if (openParen === -1) return null;
  const closeParen = matchBrace(code, openParen, "(", ")");
  if (closeParen === -1) return null;
  const win = code.slice(closeParen + 1, Math.min(closeParen + 160, code.length));
  if (!/^\s*\)?\s*(?:as\s+[^;=]*?)?\s*(?:===|!==)\s*null/.test(win)) return null;
  const back = code.slice(Math.max(0, offset - 160), offset);
  const m = back.match(/(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*\(?\s*(?:await\s+)?$/);
  return m ? m[1] : "";
}

/**
 * `const db = await getPrisma(); return db ? <expr> : null;` — a model-accessor
 * factory. The call site itself decides nothing; its consumers carry the
 * behaviour, so it is WRAPPER_OR_FACTORY rather than a fallback.
 */
export function isModelAccessor(code, offset, binding) {
  if (!binding) return false;
  const b = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const win = windowAfter(code, offset).slice(0, 400);
  return new RegExp(`;\\s*return\\s+${b}\\s*\\?[^;]*:\\s*null\\s*;`).test(win);
}

/**
 * ─────────────────────────── v3 GUARD ENGINE (s0-b05.3) ───────────────────────
 *
 * v2 recognised exactly one guard shape, `if (!binding)`. That was the single
 * largest source of UNRESOLVED verdicts (finding TOOL-01): a positive guard, a
 * guard on a delegate rather than on the client, and a guard on a value derived
 * from the client were all invisible, and six of the nine v2 manual
 * adjudications existed only to compensate for it.
 *
 * v3 widens GUARD DISCOVERY — which shapes count as a guard — while leaving
 * NULL-PATH CLASSIFICATION (what the guard then does) exactly as conservative as
 * before. Widening discovery cannot invent a verdict: it can only hand a span of
 * real source to the same content rules that already had to recognise it
 * exactly. Everything still unreadable lands on an UNRESOLVED rule whose id now
 * names the reason, so the manual review that follows is targeted rather than
 * open-ended.
 *
 * PRECEDENCE, in order, first match wins:
 *   1. module identity          R01  the accessor module itself
 *   2. test corpus              R02  path-based
 *   3. accessor return          R15  `return (await getPrisma()) as X | null`
 *   4. presence test            R13/R14  `(await getPrisma()) === null`
 *   5. model accessor           R12  `return b ? <delegate> : null`
 *   6. no binding               R11  the result is not bound to an identifier
 *   7. guard discovery          direct → delegate → derived (one hop)
 *   8. null-path classification R03…R09, R18, R19, R20 on the discovered span
 *   9. swallowing catch         R21  no guard decided, an exception is swallowed
 *  10. positive guard, no else  R16  the null path is a fall-through
 *  11. no guard at all          R10
 *
 * STRUCTURE vs CONTENT is preserved throughout: every brace, paren and `else`
 * is resolved against the BLANKED code, and every classification reads the
 * ORIGINAL source over the resulting span. A comment or string can therefore
 * never be read as control flow, and a refusal code expressed as a string
 * literal is never erased before it is classified.
 */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Condition shapes that mean "the client is absent". */
const NEGATIVE_CLIENT = (b) => [
  new RegExp(`^!\\s*${b}$`),
  new RegExp(`^${b}\\s*===?\\s*null$`),
  new RegExp(`^${b}\\s*===?\\s*undefined$`),
];

/** Condition shapes that mean "the client is present". */
const POSITIVE_CLIENT = (b) => [
  new RegExp(`^${b}$`),
  new RegExp(`^${b}\\s*!==?\\s*null$`),
  new RegExp(`^${b}\\s*!==?\\s*undefined$`),
];

/** `!b?.model` / `!b.model`, including as the first clause of a compound test. */
const NEGATIVE_DELEGATE = (b) => new RegExp(`^!\\s*${b}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`);
/** `b?.model` / `b.model` as a bare truthiness test. */
const POSITIVE_DELEGATE = (b) => new RegExp(`^${b}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*$`);

/**
 * End offset of the innermost FUNCTION BODY enclosing `offset`, or the end of the
 * file when the call is at module scope.
 *
 * WHY THIS IS LOAD-BEARING. Every window in this analyser used to be a flat
 * character count forward from the call. In a file where two adjacent functions
 * both bind `db`, that window reaches past the closing brace of the first and
 * finds the SECOND function's guard — so a call site with no guard of its own was
 * classified by its neighbour's. The selftest caught it on the fixture (a
 * guardless call picked up the next function's `if (!repo) throw`), and the same
 * shape occurs throughout `src/lib`, where modules are long lists of small
 * functions that all name their client `db` or `prisma`. Bounding every window to
 * the enclosing body makes a verdict a statement about one function.
 */
// Memoised per source string. The walk is a pure function of (code, offset),
// so caching cannot change a result; without it the edge model called it a few
// thousand times per file and turned a four second build into eighty seconds.
let BODY_END_CODE = null;
let BODY_END_CACHE = null;

export function enclosingBodyEnd(code, offset) {
  if (BODY_END_CODE !== code) { BODY_END_CODE = code; BODY_END_CACHE = new Map(); }
  const hit = BODY_END_CACHE.get(offset);
  if (hit !== undefined) return hit;
  const out = computeEnclosingBodyEnd(code, offset);
  BODY_END_CACHE.set(offset, out);
  return out;
}

/**
 * Is the `{` at `braceIdx` the start of a FUNCTION BODY?
 *
 * TOOL-05. v3.0 tested only whether the text before the brace ended in `)` or
 * `=>`. Two consequences, both wrong and both found by reconciling the edge
 * model against DB-F1:
 *
 *  - A TypeScript return-type annotation ends the header with the TYPE, not the
 *    parameter list: `function createDatabaseMemoryRepo(owner: X): Repository<A,
 *    B> {` ends in `>`. Almost every function in this repository is annotated,
 *    so the walk fell through to module scope — which is why consumer
 *    discovery was still file-wide after the scoping "fix", and why the two
 *    accessors in `memory-repository.ts` were each handed all 14 consumers.
 *  - `if (…) {`, `for (…) {`, `while (…) {`, `catch (e) {` and
 *    `switch (x) {` all end in `)`, so a control block was accepted as a
 *    function body and truncated the window at its own closing brace.
 */
export function isFunctionBodyBrace(code, braceIdx) {
  const before = code.slice(Math.max(0, braceIdx - 300), braceIdx).replace(/\s+$/, "");
  if (/\b(?:if|for|while|switch|catch|with)\s*\([^()]*\)$/.test(before)) return false;
  if (/(?:\)|=>)$/.test(before)) return true;
  // `) : ReturnType` — a parameter list followed by a return-type annotation.
  return /\)\s*:\s*[A-Za-z0-9_$.<>,\[\]|&\s]*$/.test(before);
}

function computeEnclosingBodyEnd(code, offset) {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i -= 1) {
    const c = code[i];
    if (c === "}") { depth += 1; continue; }
    if (c !== "{") continue;
    if (depth > 0) { depth -= 1; continue; }
    // An unmatched `{` scanning backwards: an enclosing block. A function body is
    // one preceded by a parameter list or an arrow.
    if (isFunctionBodyBrace(code, i)) {
      const end = matchBrace(code, i);
      if (end !== -1) return end;
    }
    // Not a function body (an object literal, a bare block, a class body): keep
    // walking outwards.
  }
  return code.length;
}

/** The forward window for a call site: `limit` characters, never past the body. */
export function windowEnd(code, offset, limit) {
  return Math.min(offset + limit, enclosingBodyEnd(code, offset), code.length);
}

/**
 * Every `if (…)` in the window as { condIdx, cond, consequent, elseSpan }, with
 * all offsets ABSOLUTE in the file. Resolved against the blanked code, so a
 * brace or an `else` inside a string or comment is invisible.
 */
export function enumerateIfs(code, offset, limit = 2600) {
  const end = windowEnd(code, offset, limit);
  const out = [];
  const re = /\bif\s*\(/g;
  re.lastIndex = offset;
  let m;
  while ((m = re.exec(code)) && m.index < end) {
    const open = code.indexOf("(", m.index);
    const close = matchBrace(code, open, "(", ")");
    if (close === -1) break;
    const cond = code.slice(open + 1, close).replace(/\s+/g, " ").trim();
    const after = code.slice(close + 1);
    const firstNonSpace = after.search(/\S/);
    if (firstNonSpace === -1) break;
    const base = close + 1 + firstNonSpace;
    let consequent = null;
    if (code[base] === "{") {
      const e = matchBrace(code, base);
      if (e !== -1) consequent = { from: base, to: e + 1 };
    } else {
      const semi = code.indexOf(";", base);
      if (semi !== -1) consequent = { from: base, to: semi + 1 };
    }
    if (!consequent) break;
    let elseSpan = null;
    const tail = code.slice(consequent.to, Math.min(consequent.to + 24, code.length));
    const em = tail.match(/^\s*else\b/);
    if (em) {
      const eStart = consequent.to + em[0].length;
      const fns = code.slice(eStart).search(/\S/);
      if (fns !== -1) {
        const eBase = eStart + fns;
        if (code[eBase] === "{") {
          const e = matchBrace(code, eBase);
          if (e !== -1) elseSpan = { from: eBase, to: e + 1 };
        } else {
          const semi = code.indexOf(";", eBase);
          if (semi !== -1) elseSpan = { from: eBase, to: semi + 1 };
        }
      }
    }
    out.push({ condIdx: m.index, cond, consequent, elseSpan });
    re.lastIndex = close + 1;
  }
  return out;
}

/**
 * Find the guard on `binding` and return the span of its NULL PATH — the branch
 * that executes when the client is absent — together with the shape recognised.
 * `null` when no guard shape matches.
 *
 * A positive guard with no `else` has no null-path SPAN: the absent case falls
 * through. That is reported as `POSITIVE_NO_ELSE` with a null span, because the
 * behaviour then depends on the remainder of the enclosing function and cannot
 * be read from a span.
 */
export function findGuard(code, offset, binding) {
  if (!binding) return null;
  const b = esc(binding);
  const neg = NEGATIVE_CLIENT(b);
  const pos = POSITIVE_CLIENT(b);
  const negDel = NEGATIVE_DELEGATE(b);
  const posDel = POSITIVE_DELEGATE(b);

  for (const node of enumerateIfs(code, offset)) {
    // A compound condition is reduced to its first clause, the only one whose
    // position is deterministic. `!a || !b.x` guards on `a` being absent.
    const first = node.cond.split(/\s*(?:\|\||&&)\s*/)[0].trim();

    if (neg.some((r) => r.test(first))) {
      return { shape: "NEGATIVE_CLIENT", nullPath: node.consequent, cond: node.cond, delegate: null };
    }
    const nd = first.match(negDel);
    if (nd) {
      return { shape: "NEGATIVE_DELEGATE", nullPath: node.consequent, cond: node.cond, delegate: nd[1] };
    }
    if (pos.some((r) => r.test(first))) {
      return node.elseSpan
        ? { shape: "POSITIVE_CLIENT_WITH_ELSE", nullPath: node.elseSpan, cond: node.cond, delegate: null }
        : { shape: "POSITIVE_NO_ELSE", nullPath: null, cond: node.cond, delegate: null };
    }
    const pd = first.match(posDel);
    if (pd) {
      return node.elseSpan
        ? { shape: "POSITIVE_DELEGATE_WITH_ELSE", nullPath: node.elseSpan, cond: node.cond, delegate: pd[1] }
        : { shape: "POSITIVE_NO_ELSE", nullPath: null, cond: node.cond, delegate: pd[1] };
    }
  }
  return null;
}

/**
 * One derivation hop: `const repo = b?.delegate`, `const ok = Boolean(b)`,
 * `const client = b ?? other`, `const ok = !!b`. Returns the derived name.
 *
 * Exactly ONE hop is followed, deliberately. A second hop would make the search
 * unbounded and the verdict dependent on how far the tool happened to look;
 * anything deeper stays UNRESOLVED and is read by hand.
 */
export function derivedBindingFrom(code, offset, binding) {
  if (!binding) return null;
  const b = esc(binding);
  const win = code.slice(offset, windowEnd(code, offset, 2600));
  const pats = [
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*${b}\\s*\\??\\.`),
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*Boolean\\s*\\(\\s*${b}\\s*\\)`),
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*${b}\\s*\\?\\?`),
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*!\\s*!?\\s*${b}\\b`),
    // `const m = db ? (db as X).model : undefined` — the repository's delegate
    // narrowing idiom, which v2 could not follow at all.
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*${b}\\s*\\?[^;]*:\\s*(?:null|undefined)`),
  ];
  for (const p of pats) {
    const m = win.match(p);
    if (m) return m[1];
  }
  return null;
}

/** `catch` blocks after the call, as absolute spans. */
export function catchBlocks(code, offset, limit = 2600) {
  const end = windowEnd(code, offset, limit);
  const out = [];
  const re = /\bcatch\s*(?:\(\s*[^)]*\)\s*)?\{/g;
  re.lastIndex = offset;
  let m;
  while ((m = re.exec(code)) && m.index < end) {
    const brace = code.indexOf("{", m.index);
    const e = matchBrace(code, brace);
    if (e === -1) break;
    out.push({ from: brace, to: e + 1, bare: !m[0].includes("(") });
    re.lastIndex = e + 1;
  }
  return out;
}

const LOG_SIGNAL = /\b(logger|console|logInfraFailure|logAuthFailure|logAuthzDenial|recordAuditEvent|captureException|Sentry|metrics|trackEvent|reportError)\b/;
const MUTATION_ON_STORE = /\b(?:fallback|sessionStore|memoryStore|memStore|store|drafts|cache)\b\s*(?:\??\.[A-Za-z_$][\w$]*)*?\s*\??\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany|save|insert|push|set|add|remove|unshift|splice)\s*!?\s*\(/;
const GLOBAL_WRITE = /globalThis\s*(?:\??\.[A-Za-z_$][\w$]*)+\s*(?:\??\.\s*(?:push|set|add|splice|unshift)\s*\(|(?:\[[^\]]*\])?\s*=[^=])/;
const RESULT_REFUSAL = /return\s*\{[^{}]*\b(?:ok|success|applied|consumed|accepted|persisted)\s*:\s*false\b/;
const RESULT_ZERO = /return\s*\{[^{}]*\b(?:affected|count|written|processed)\s*:\s*0\b/;

/**
 * Does this text perform a mutation against a non-durable in-process store?
 * Deliberately narrow: a named store object with a mutating method, or a write
 * into `globalThis`. A read from the same store is not a mutation.
 */
export function mutatesInProcessStore(text) {
  return MUTATION_ON_STORE.test(text) || GLOBAL_WRITE.test(text);
}

/**
 * A catch that swallows the exception outright: no log, metric or audit signal,
 * and no `return`/`throw` of its own, so execution continues past it. This is
 * the exact shape of SILENT_EXCEPTION_FALLBACK as defined for this phase — a
 * catch that RETURNS a fallback is classified by that fallback instead, with
 * SILENT kept as a secondary tag, so the two are never double-counted.
 */
export function isSwallowingCatch(src, span) {
  const body = src.slice(span.from, span.to);
  if (LOG_SIGNAL.test(body)) return false;
  if (/\breturn\b|\bthrow\b/.test(body)) return false;
  return true;
}

/** Does the enclosing region contain an unlogged `catch` with a fallback inside? */
export function hasSilentCatchFallback(code, offset) {
  for (const span of catchBlocks(code, offset)) {
    const body = code.slice(span.from, span.to);
    if (LOG_SIGNAL.test(body)) continue;
    if (/\breturn\s+fallback\b|\bsessionStore\b|\breturn\s*\[\s*\]|\bglobalThis\b/.test(body)) return true;
  }
  return false;
}

/**
 * `return (await getPrisma()) as X | null;` or `return getPrisma();` — the call
 * result is handed straight back, so this site decides nothing. Resolved on the
 * blanked code so a cast containing a string literal cannot break the match.
 */
export function accessorReturnShape(code, offset) {
  const back = code.slice(Math.max(0, offset - 40), offset);
  if (!/\breturn\s*\(?\s*(?:await\s+)?$/.test(back)) return null;
  const open = code.indexOf("(", offset);
  if (open === -1) return null;
  const close = matchBrace(code, open, "(", ")");
  if (close === -1) return null;
  const tail = code.slice(close + 1, Math.min(close + 160, code.length));
  const m = tail.match(/^\s*\)?\s*(as\s+[^;]*)?;/);
  if (!m) return null;
  return `return (await getPrisma())${m[1] ? ` ${m[1].replace(/\s+/g, " ").trim()}` : ""};`;
}

/**
 * ──────────────── R22: attribution through a LOCAL accessor ────────────────
 *
 * WHY THIS RULE EXISTS — and why v2's `IN_MEMORY_WRITE_FALLBACK: 0` was a
 * measurement artefact rather than a fact.
 *
 * The six storage repositories hold exactly ONE `getPrisma()` call each, inside
 * a local `async function model()` that returns the delegate or null. The 69
 * DB-F1 fallback points are not `getPrisma()` call sites at all: they are the
 * `if (!m) return fallback.create(input)` statements in the methods that CALL
 * that accessor. v2 classified the accessor as WRAPPER_OR_FACTORY — correct in
 * itself — and then excluded wrappers from the production counts, so the single
 * largest finding in the inventory scored zero in the classification table.
 *
 * R22 closes that gap WITHOUT changing the unit of counting. The accessor is a
 * local, non-exported function declaration, so every consumer is in the same
 * file and the search is bounded and deterministic. When `getPrisma()` returns
 * null inside that file, the behaviour that actually reaches the caller is the
 * union of those consumers' null paths — so the call site is classified by the
 * HIGHEST-RISK behaviour among them, with the full distribution recorded on the
 * record. An accessor whose consumers cannot be found keeps its WRAPPER verdict.
 *
 * RISK ORDER, documented because it decides the primary classification when the
 * consumers disagree: an acknowledged non-durable write is worse than a stale
 * read, which is worse than a silently swallowed failure, which is worse than an
 * empty success, which is worse than any controlled refusal.
 */
const RISK_ORDER = Object.freeze([
  "IN_MEMORY_WRITE_FALLBACK",
  "IN_MEMORY_READ_FALLBACK",
  "SILENT_EXCEPTION_FALLBACK",
  "EMPTY_SUCCESS_FALLBACK",
  "EXPLICIT_DEGRADED_MODE",
  "AUTH_OR_SESSION_FAIL_CLOSED",
  "DB_UNAVAILABLE_RETURNS_503",
  "DB_REQUIRED_FAIL_CLOSED",
]);

/**
 * The name of the innermost `function NAME(` enclosing `offset`, and whether it
 * is exported. Resolved on the blanked code; `null` when the call is not inside
 * a named function declaration.
 */
export function enclosingFunction(code, offset) {
  const before = code.slice(0, offset);
  const m = [...before.matchAll(/(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].pop();
  if (!m) return null;
  return { name: m[2], exported: Boolean(m[1]), at: m.index };
}

/**
 * Consumers of a local accessor: every `const X = await NAME()` in the file,
 * with the classification of the null path guarded on `X` and of any returning
 * `catch` that follows it.
 */
export function accessorConsumerBehaviours(code, src, fnName) {
  const out = [];
  const re = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*await\\s+${fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*\\)`, "g");
  let m;
  while ((m = re.exec(code))) {
    const name = m[1];
    const at = m.index;
    const guard = findGuard(code, at, name);
    if (guard && guard.nullPath) {
      const v = classifyNullPath(guard.nullPath ? src.slice(guard.nullPath.from, guard.nullPath.to) : "");
      const rule = RULE_BY_ID.get(v.ruleId);
      out.push({
        path: "NULL_GUARD", binding: name, ruleId: v.ruleId,
        classification: rule?.classification ?? null, controlFlow: v.controlFlow,
      });
    }
    for (const span of catchBlocks(code, at, 1400)) {
      const body = src.slice(span.from, span.to);
      if (!/\breturn\b/.test(body)) continue;
      const v = classifyNullPath(body);
      const rule = RULE_BY_ID.get(v.ruleId);
      out.push({
        path: LOG_SIGNAL.test(body) ? "EXCEPTION_LOGGED" : "EXCEPTION_SILENT",
        binding: name, ruleId: v.ruleId,
        classification: rule?.classification ?? null, controlFlow: v.controlFlow,
      });
    }
  }
  return out;
}

/** The highest-risk classification in a consumer set, by RISK_ORDER. */
export function dominantBehaviour(behaviours) {
  for (const c of RISK_ORDER) if (behaviours.some((b) => b.classification === c)) return c;
  return null;
}

/**
 * Classify a NULL-PATH span, read from the ORIGINAL source. This is the only
 * place automation may produce a non-UNRESOLVED verdict, and every branch
 * requires a shape matched in full.
 */
export function classifyNullPath(text) {
  const flow = text.replace(/\s+/g, " ").slice(0, 220);
  const r = (ruleId, why) => ({ ruleId, reason: why, controlFlow: flow });

  // R04 BEFORE R03, deliberately. `throw new ErpError(503, "SERVICE_UNAVAILABLE")`
  // is both a throw and a controlled 503, and the 503 is the more specific and
  // more useful statement: it names what the client receives. v3.0 had these the
  // other way round and classified the ERP tenant resolver as a bare fail-closed
  // throw, which a manual adjudication had to supersede — that disagreement is
  // what surfaced the ordering defect.
  if (/\b503\b|SERVICE_UNAVAILABLE|serviceUnavailable|sessionPersistenceUnavailable|OWNER_CONTEXT_UNAVAILABLE|_UNAVAILABLE\b/.test(text)) {
    return r("R04-guard-503", "the null path answers a controlled unavailable response");
  }
  if (/\bthrow\b/.test(text)) return r("R03-guard-throw", "the null path throws without naming a status");
  if (/\b(401|403)\b|AUTHENTICATION_REQUIRED|FORBIDDEN|unauthorized|Unauthenticated/i.test(text)) {
    return r("R05-guard-auth-deny", "the null path denies the actor");
  }
  // A write into a non-durable store outranks a read from it: the terminal
  // behaviour is an acknowledged mutation that cannot survive a restart.
  if (mutatesInProcessStore(text)) {
    return r("R20-in-memory-write", "the null path mutates a non-durable in-process store");
  }
  if (/\bsessionStore\b|\bfallback\b|createSession[A-Za-z]*Repo|globalThis/.test(text)) {
    return r("R06-guard-session-fallback", "the null path reads from an in-process store");
  }
  if (/return\s*(?:NextResponse\.json\(\s*)?\[\s*\]/.test(text)
      || /return\s*\{\s*[A-Za-z_$][\w$]*\s*:\s*\[\s*\]/.test(text)
      || (/return\s*NextResponse\.json\(\s*\{/.test(text) && /:\s*\[\s*\]/.test(text) && !/status\s*:/.test(text))) {
    return r("R07-guard-empty-array", "the null path returns an empty collection as a success");
  }
  // A result object whose own field says the operation did not happen. Whether
  // that is fail-closed depends ENTIRELY on what the caller does with it, so it
  // is deliberately NOT classified here — see R18 in the rule table.
  if (RESULT_REFUSAL.test(text) || RESULT_ZERO.test(text)) {
    return r("R18-result-object-refusal",
      "the null path returns a result object stating the operation did not happen; the terminal behaviour depends on the caller's mapping and must be traced by hand");
  }
  if (/return\s+(?:null|undefined)\s*;|return\s*;/.test(text)) {
    return r("R08-guard-null-undefined", "the null path returns null/undefined and the caller decides what that means");
  }
  if (/return\s+(?:false|0)\s*;/.test(text)) return r("R09-guard-false-zero", "the null path returns false/0");
  if (/return\s+[A-Za-z_$][\w$]*\s*(?:\([^)]*\))?\s*;/.test(text) || /return\s*\{[\s\S]*\}/.test(text)) {
    return r("R19-named-or-shaped-return",
      "the null path returns a named binding or a shaped object whose emptiness is not readable from the span");
  }
  return r("R11-ambiguous", "a guard exists but its null path matches no exactly-recognised shape");
}

/**
 * ──────────── CONSUMER EDGES: the wrapper model, v3.1 ────────────────────────
 *
 * WHY THIS REPLACES THE RISK-MAX COLLAPSE.
 *
 * v3.0 attributed a local accessor to the single highest-risk behaviour among
 * its consumers and published that as the call site's classification. That was
 * better than v2's silent zero, but it was still lossy in a way that matters:
 * `src/lib/storage/case-repository.ts` has consumers that read from the session
 * store, consumers that WRITE to it, and (in the sibling analysis repository)
 * consumers that delegate to it unconditionally. Collapsing those to one word
 * hid two of the three, and the audit question — "what happens to each
 * operation when the database is gone?" — is per operation, not per accessor.
 *
 * v3.1 keeps the call site itself as WRAPPER_OR_FACTORY and publishes every
 * consumer behaviour as its own addressable, fingerprinted EDGE. The accessor
 * record carries `highestConsumerRisk` as a convenience, never as a substitute.
 *
 * TWO DEFECTS IN v3.0's EDGE DISCOVERY, both fixed here and both found by
 * reconciling the edge count against DB-F1:
 *
 * 1. CONSUMER DISCOVERY WAS FILE-WIDE. `memory-repository.ts` declares TWO
 *    local accessors both named `model()` — one inside the memory factory, one
 *    inside the feedback factory — so a file-wide search for `await model()`
 *    gave BOTH accessors all 14 consumers. `document-repository.ts` has the
 *    same shape. Consumer discovery is now scoped to the body of the function
 *    that lexically CONTAINS the accessor declaration.
 *
 * 2. UNCONDITIONAL DELEGATIONS WERE COUNTED AS FALLBACKS. In
 *    `analysis-repository.ts` the database repository's `update` and `delete`
 *    are `return fallback.update(id, patch)` with NO guard and NO try: they
 *    never touch Prisma at all. Those are two of DB-F1's 69 `return fallback.`
 *    statements, and they are not outage behaviour — they are permanent
 *    delegation. They are now a distinct edge path, so DB-F1 reproduces from
 *    edges with its composition visible instead of as one number.
 */

/** Body span of the function lexically enclosing `offset`, or null at module scope. */
export function enclosingBodyRange(code, offset) {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i -= 1) {
    const c = code[i];
    if (c === "}") { depth += 1; continue; }
    if (c !== "{") continue;
    if (depth > 0) { depth -= 1; continue; }
    if (isFunctionBodyBrace(code, i)) {
      const end = matchBrace(code, i);
      if (end !== -1) return { from: i, to: end };
    }
  }
  return null;
}

/**
 * The scope in which an accessor's consumers may be found: the body of the
 * function that CONTAINS the accessor declaration. Falls back to the whole file
 * for a module-scope accessor.
 */
export function accessorConsumerScope(code, accessorDeclAt) {
  const outer = enclosingBodyRange(code, accessorDeclAt);
  return outer ?? { from: 0, to: code.length };
}

/** Nearest enclosing member/function name before `offset` (`async list() {`, `function foo(`). */
export function enclosingMemberName(code, offset) {
  // Scan BACKWARDS for the nearest `name(` that opens a body, line by line.
  // A single regex over a multi-kilobyte slice with an optional return-type
  // group backtracks catastrophically on this repository's long object
  // literals, which is how the first version of this helper turned a four
  // second build into a two minute one.
  const from = Math.max(0, offset - 3000);
  const back = code.slice(from, offset);
  const lines = back.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    // The member name must START the line — object-literal methods and function
    // declarations are written that way throughout this repository. Matching
    // anywhere on the line picked up `Boolean(`, `Date(` and even `getPrisma(`
    // from inside an expression and put them in the edge id.
    const m = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
    if (m && !/^(?:if|for|while|switch|catch|return|await|new|typeof)$/.test(m[1])) return m[1];
  }
  return "(anonymous)";
}

/** READ / WRITE / DELETE from a fallback or delegate call in the edge text. */
export function edgeOperation(text, memberName) {
  const probe = `${memberName} ${text}`;
  // PREFIX match on a word start, not a whole word. `create` does not match
  // inside `createApiKey`, and almost every exported name in this repository is
  // a compound — which is why 181 of 269 edges first came back UNKNOWN.
  if (/\b(?:delete|remove|purge)/i.test(probe)) return "DELETE";
  if (/\b(?:create|update|upsert|insert|save|set|append|claim|mark|record|ingest|revoke|grant|transfer|accept|reject|resend|invite|add|change|publish|reconcile|anonymi[sz]e|increment|touch|finish|acquire|renew|release)/i.test(probe)) return "WRITE";
  if (/\b(?:list|get|find|count|search|read|page|stats|history|summary|resolve|verify|load|snapshot)/i.test(probe)) return "READ";
  return "UNKNOWN";
}

/**
 * Every consumer edge of one local accessor, as addressable records.
 *
 * Four edge paths, each a different question about the same operation:
 *   NULL_GUARD              — `if (!m) return <fallback>` : the outage path
 *   EXCEPTION_SILENT        — `catch { return <fallback> }` with no log signal
 *   EXCEPTION_LOGGED        — the same with a log, metric or audit signal
 *   UNCONDITIONAL_DELEGATION— `return <fallback>` reached with no CLIENT guard
 *                             and no try. Two real shapes land here: a method
 *                             the database repository never implements at all
 *                             (analysis-repository update/delete), and a
 *                             delegation conditioned on something other than
 *                             the client (document-repository:461 falls back on
 *                             a zero-row match). Neither is outage behaviour,
 *                             which is why they are kept out of the outage count
 */
export function consumerEdges(code, src, relPath, callsiteId, accessorName, accessorDeclAt, siteOffset) {
  const scope = accessorConsumerScope(code, accessorDeclAt);
  const scoped = (i) => i >= scope.from && i <= scope.to;
  const esc = accessorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edges = [];
  const claimed = [];
  // The ACCESSOR's own null guard, claimed up front. Without it, an
  // `if (!db) return fallback.x(id)` written inside the accessor itself was
  // swept up as an UNCONDITIONAL_DELEGATION — two of document-repository's
  // edges were the call site's own guard reported as permanent delegation.
  // Claim the null path of EVERY getPrisma guard inside the scope, not just the
  // accessor's. A factory method may hold its own `getPrisma()` call and its own
  // `if (!db) return fallback.x(id)`; from the accessor's point of view that
  // statement looks unguarded, and v3.1 reported two of document-repository's
  // edges as PERMANENT delegation when they are ordinary outage guards.
  for (const g of code.matchAll(/\bgetPrisma\s*\(/g)) {
    if (!scoped(g.index)) continue;
    const own = findGuard(code, g.index, bindingNameBefore(code, g.index));
    if (own?.nullPath) claimed.push(own.nullPath);
  }

  const re = new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*await\\s+${esc}\\s*\\(\\s*\\)`, "g");
  let m;
  while ((m = re.exec(code))) {
    if (!scoped(m.index)) continue;
    const binding = m[1];
    const member = enclosingMemberName(code, m.index);
    const guard = findGuard(code, m.index, binding);
    if (guard && guard.nullPath) {
      edges.push(mkEdge("NULL_GUARD", guard.nullPath, member));
      claimed.push(guard.nullPath);
    }
    for (const span of catchBlocks(code, m.index, 1400)) {
      const body = src.slice(span.from, span.to);
      if (!/\breturn\b/.test(body)) continue;
      edges.push(mkEdge(LOG_SIGNAL.test(body) ? "EXCEPTION_LOGGED" : "EXCEPTION_SILENT", span, member));
      claimed.push(span);
    }
  }

  // Unconditional delegations: a `return <store>.<method>(` inside the accessor's
  // scope that no edge span above already covers.
  const del = /return\s+(fallback|sessionStore|memoryStore|store)\s*\.\s*[A-Za-z_$][\w$]*\s*!?\s*\(/g;
  let d;
  while ((d = del.exec(code))) {
    if (!scoped(d.index)) continue;
    if (claimed.some((s) => d.index >= s.from && d.index <= s.to)) continue;
    const semi = code.indexOf(";", d.index);
    const span = { from: d.index, to: semi === -1 ? d.index + 80 : semi + 1 };
    edges.push(mkEdge("UNCONDITIONAL_DELEGATION", span, enclosingMemberName(code, d.index)));
  }

  edges.sort((a, b) => (a.consumerEdgeId < b.consumerEdgeId ? -1 : a.consumerEdgeId > b.consumerEdgeId ? 1 : 0));
  return edges;

  function mkEdge(path, span, member) {
    const text = src.slice(span.from, span.to);
    const { line } = lineColOf(src, span.from);
    const v = classifyNullPath(text);
    const rule = RULE_BY_ID.get(v.ruleId);
    const cls = rule?.classification ?? "UNRESOLVED_REQUIRES_MANUAL_REVIEW";
    const op = edgeOperation(text, member);
    const tags = new Set([op === "UNKNOWN" ? "READ" : op]);
    if (path === "EXCEPTION_SILENT") tags.add("SILENT_CATCH");
    if (path === "EXCEPTION_LOGGED") tags.add("LOGGED");
    if (path === "UNCONDITIONAL_DELEGATION") tags.add("NOT_AN_OUTAGE_PATH");
    if (/organizationId/.test(text)) tags.add("TENANT_SCOPED");
    return {
      consumerEdgeId: `${callsiteId}::${member}@L${line}:${path}`,
      consumerPath: relPath,
      consumerFunction: member,
      edgePath: path,
      operation: op,
      line,
      ruleId: v.ruleId,
      classification: cls,
      secondaryTags: [...tags].sort(),
      evidence: `${relPath}:${line} — ${text.replace(/\s+/g, " ").trim().slice(0, 160)}`,
      sourceFingerprint: fingerprint(src, span.from),
      terminalBoundary: null,
      manuallyTraced: false,
    };
  }
}

/**
 * Attribute a local accessor's call site to the behaviour its consumers exhibit.
 * Returns a finished record, or null when the accessor is exported, unnamed, or
 * has no locatable consumer — in which case the caller keeps its WRAPPER verdict.
 */
export function attributeThroughLocalAccessor(code, src, relPath, callsiteId, offset) {
  const fn = enclosingFunction(code, offset);
  if (!fn || fn.exported) return null;
  const edges = consumerEdges(code, src, relPath, callsiteId, fn.name, fn.at, offset);
  if (edges.length === 0) return null;

  const counts = {};
  for (const e of edges) counts[e.classification] = (counts[e.classification] ?? 0) + 1;
  const outage = edges.filter((e) => e.edgePath !== "UNCONDITIONAL_DELEGATION");
  const risk = dominantBehaviour(outage.filter((e) => e.classification !== "UNRESOLVED_REQUIRES_MANUAL_REVIEW"));

  // The call site itself decides nothing: it hands a client or a null to its
  // consumers. Its classification stays WRAPPER_OR_FACTORY and every consumer
  // behaviour is published as its own edge — `highestConsumerRisk` is a
  // convenience for ranking, never a substitute for the edge inventory.
  return {
    ruleId: "R22-local-accessor-consumers",
    classification: "WRAPPER_OR_FACTORY",
    confidence: "EXACT",
    reason: `Local accessor \`${fn.name}()\`, not exported, so every consumer is inside the function that declares it. `
      + `${edges.length} consumer edge(s): ${Object.entries(counts).sort().map(([k, v]) => `${k} ×${v}`).join(", ")}`
      + `${edges.length - outage.length > 0 ? `, of which ${edges.length - outage.length} are unconditional delegations and NOT outage paths` : ""}. `
      + `The call site hands a client or a null to those consumers and decides nothing itself; each consumer behaviour is a separate edge record.`,
    evidence: `function ${fn.name}() with ${edges.length} consumer edge(s) in its declaring scope`,
    controlFlow: edges.map((e) => `${e.consumerFunction}:${e.edgePath}:${e.classification}`).join(" | ").slice(0, 220),
    guardShape: "LOCAL_ACCESSOR_WITH_CONSUMER_EDGES",
    accessorConsumers: {
      total: edges.length,
      outagePaths: outage.length,
      unconditionalDelegations: edges.length - outage.length,
      silentExceptionPaths: edges.filter((e) => e.edgePath === "EXCEPTION_SILENT").length,
      loggedExceptionPaths: edges.filter((e) => e.edgePath === "EXCEPTION_LOGGED").length,
      byClassification: counts,
      highestConsumerRisk: risk,
    },
    consumerEdges: edges,
  };
}

/** The canonical call-site id, so classify() and buildInventory() cannot drift. */
export function callsiteIdOf(relPath, src, offset) {
  const { line, column } = lineColOf(src, offset);
  return `${relPath}#L${line}C${column}`;
}

/**
 * Classify one call site. Returns { ruleId, classification, confidence, reason,
 * evidence, controlFlow, guardShape }.
 *
 * Every branch that cannot be read exactly lands on an UNRESOLVED rule. There is
 * deliberately no "probably fine" path.
 */
export function classify(site, src) {
  const { relPath, offset, code } = site;

  if (relPath === "src/lib/db/prisma.ts") {
    return mk("R01-definition-wrapper", null,
      "The central accessor module itself. Its consumers are the subject of this inventory.",
      "src/lib/db/prisma.ts", "n/a — factory");
  }
  if (isTestPath(relPath)) {
    return mk("R02-test-path", null,
      "Call site lives in the test corpus and does not reach a production artifact.",
      relPath, "n/a — test");
  }

  const accessorReturn = accessorReturnShape(code, offset);
  if (accessorReturn) {
    const attributed = attributeThroughLocalAccessor(code, src, relPath, callsiteIdOf(relPath, src, offset), offset);
    if (attributed) return attributed;
    return mk("R15-accessor-return", "ACCESSOR_RETURN",
      "The call result is returned directly to the caller without a decision, so this site carries no failure behaviour of its own; its consumers are inventoried separately.",
      snippet(src, offset), accessorReturn);
  }

  const presence = presenceTestTarget(code, offset);
  if (presence !== null) {
    if (/demo|available|degraded|enabled|mode|present/i.test(presence)) {
      return mk("R13-presence-test-degraded", "PRESENCE_TEST",
        `Presence test assigned to \`${presence}\`, whose name states it drives a declared degraded or demo mode.`,
        snippet(src, offset), `${presence} = (await getPrisma()) === null`);
    }
    return mk("R14-presence-test", "PRESENCE_TEST",
      "Presence test whose consumer is not identifiable from the call site.",
      snippet(src, offset), "presence comparison against null");
  }

  const binding = bindingNameBefore(code, offset);

  if (isModelAccessor(code, offset, binding)) {
    const attributed = attributeThroughLocalAccessor(code, src, relPath, callsiteIdOf(relPath, src, offset), offset);
    if (attributed) return attributed;
    return mk("R12-model-accessor", "MODEL_ACCESSOR",
      `\`return ${binding} ? … : null\` — a model-accessor factory. Its consumers carry the failure behaviour and are inventoried separately.`,
      snippet(src, offset), `return ${binding} ? <delegate> : null`);
  }

  if (!binding) {
    return mk("R11-ambiguous", null,
      "The call result is not bound to a simple identifier, so no guard can be located deterministically.",
      snippet(src, offset), "unbound call expression");
  }

  // ── guard discovery: direct, then exactly one derivation hop ──
  let guard = findGuard(code, offset, binding);
  let shape = guard ? guard.shape : null;
  let viaDerived = null;
  if (!guard || !guard.nullPath) {
    const derived = derivedBindingFrom(code, offset, binding);
    if (derived) {
      const g2 = findGuard(code, offset, derived);
      if (g2 && g2.nullPath) {
        guard = g2;
        shape = `DERIVED_ONE_HOP:${g2.shape}`;
        viaDerived = derived;
      }
    }
  }

  if (guard && guard.nullPath) {
    const text = src.slice(guard.nullPath.from, guard.nullPath.to);
    const v = classifyNullPath(text);
    const via = viaDerived ? ` via the derived binding \`${viaDerived}\`` : "";
    const del = guard.delegate ? ` on delegate \`${guard.delegate}\`` : "";
    return mk(v.ruleId, shape,
      `Guard \`if (${guard.cond})\`${del}${via} — ${v.reason}.`,
      v.controlFlow, v.controlFlow);
  }

  // A swallowing catch is the terminal behaviour only when no null-path guard
  // decided the outcome first.
  const swallow = catchBlocks(code, offset).find((s) => isSwallowingCatch(src, s));
  if (swallow) {
    return mk("R21-silent-exception", "SWALLOWING_CATCH",
      "A database exception is caught with no log, metric or audit signal and no return of its own, so execution continues past the failure with the operation silently skipped.",
      src.slice(swallow.from, swallow.to).replace(/\s+/g, " ").slice(0, 220),
      "catch { } — swallowed, execution continues");
  }

  if (shape === "POSITIVE_NO_ELSE") {
    return mk("R16-positive-guard-no-else", shape,
      `Positive guard \`if (${guard.cond})\` with no \`else\`: the absent-client path is a fall-through whose behaviour depends on the remainder of the enclosing function and cannot be read from a span.`,
      snippet(src, offset), `if (${guard.cond}) { … }  // no else`);
  }

  return mk("R10-no-guard", null,
    `No guard on \`${binding}\` in any recognised shape within the bounded window after the call.`,
    snippet(src, offset), hasSilentCatchFallback(code, offset) ? "silent catch present, no null guard" : "no null guard");

  function mk(ruleId, guardShape, reason, evidence, controlFlow, derived) {
    const r = RULE_BY_ID.get(ruleId);
    const classification = derived?.classification ?? r.classification;
    if (!classification) throw new Error(`rule ${ruleId} produced no classification`);
    return {
      ruleId, classification, confidence: r.confidence, reason, evidence, controlFlow, guardShape,
      accessorConsumers: derived?.consumers ?? null,
    };
  }
}

/** Secondary tags, each independently derivable. */
export function secondaryTags(site, src, primary) {
  const tags = new Set();
  const { relPath, code, offset } = site;
  const win = windowAfter(code, offset);

  if (/\.(create|update|updateMany|upsert|delete|deleteMany|createMany)\s*\(/.test(win)) tags.add("WRITE");
  if (/\.(findUnique|findFirst|findMany|count|aggregate|groupBy)\s*\(/.test(win)) tags.add("READ");
  if (/\.(delete|deleteMany)\s*\(/.test(win)) tags.add("DELETE");
  if (/\$transaction/.test(win)) tags.add("TRANSACTIONAL");
  if (/organizationId/.test(win)) tags.add("TENANT_SCOPED");
  if (/\bsiteId\b/.test(win)) tags.add("SITE_SCOPED");
  if (/recordAuditEvent|AuditLog|auditLog/.test(win)) tags.add("AUDIT");
  if (/\b(logger|console|logInfraFailure|logAuthFailure|logAuthzDenial)\b/.test(win)) tags.add("LOGGED");
  if (relPath.startsWith("src/app/api/")) tags.add("USER_VISIBLE");
  if (/^scripts\//.test(relPath)) tags.add("BACKGROUND_JOB");
  if (primary === "SILENT_EXCEPTION_FALLBACK" || (!tags.has("LOGGED") && primary.endsWith("FALLBACK"))) tags.add("SILENT");
  // An unlogged `catch` in the window, whether or not it decided the primary
  // classification. Tracked separately from SILENT so the exception path can be
  // counted without double-counting it as a primary behaviour.
  for (const span of catchBlocks(code, offset)) {
    if (!LOG_SIGNAL.test(code.slice(span.from, span.to))) { tags.add("SILENT_CATCH"); break; }
  }

  return [...tags].sort();
}

function snippet(src, offset) {
  const from = src.lastIndexOf("\n", offset) + 1;
  let to = src.indexOf("\n", offset);
  if (to === -1) to = src.length;
  return src.slice(from, to).trim().slice(0, 200);
}

/** Stable fingerprint of the normalised 5-line window around the call. */
export function fingerprint(src, offset) {
  const lines = src.split(/\r?\n/);
  const { line } = lineColOf(src, offset);
  const from = Math.max(0, line - 3);
  const to = Math.min(lines.length, line + 2);
  const norm = lines.slice(from, to).map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
  return createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 16);
}

/**
 * ─────────────────── DB-F1 / DB-F2 reconciliation, GENERATED ──────────────────
 *
 * These two counts were previously asserted in prose, and one of them was wrong
 * (DB-F2 was reported as 12 and is 19). They are therefore DERIVED here from the
 * source tree, so the document quotes a number the tool produced rather than a
 * number a human remembered.
 *
 * SCOPE NOTE, which matters more than the numbers: a DB-F1 "fallback point" is
 * not a `getPrisma()` call site. The six storage repositories hold ONE
 * `getPrisma()` call each, inside a local accessor; the fallback points are the
 * statements in the methods that call that accessor. The two measurements
 * therefore count different things on purpose, and R22 is what connects them.
 */
export function reconcile(root = REPO_ROOT) {
  const dbf1Files = [
    "src/lib/storage/case-repository.ts",
    "src/lib/storage/knowledge-repository.ts",
    "src/lib/storage/memory-repository.ts",
    "src/lib/storage/project-repository.ts",
    "src/lib/storage/unknown-repository.ts",
    "src/lib/storage/analysis-repository.ts",
  ];
  const f1 = { perFile: {}, fallbackPoints: 0, bareCatches: 0, independent: {} };
  for (const rel of dbf1Files) {
    const src = readSourceText(join(root, rel));
    const code = blankCommentsAndStrings(src);
    const points = (code.match(/return\s+fallback\s*\./g) ?? []).length;
    const bare = (code.match(/catch\s*\{/g) ?? []).length;
    f1.perFile[rel] = { fallbackPoints: points, bareCatches: bare };
    f1.fallbackPoints += points;
    f1.bareCatches += bare;
  }
  // The independent path: `storage-cleanup.ts` returns the session store twice,
  // but only ONE of those is a database-mode fallback — the other is the storage
  // mode switch, which is a configuration branch and not a failure path.
  {
    const rel = "src/lib/documents/storage-cleanup.ts";
    const src = readSourceText(join(root, rel));
    const code = blankCommentsAndStrings(src);
    const all = [...code.matchAll(/return\s+sessionStore\b/g)];
    const modeSwitch = [...code.matchAll(/getStorageMode\s*\(\s*\)\s*!==?\s*$/g)].length;
    const failurePath = all.filter((m) => {
      const back = code.slice(Math.max(0, m.index - 120), m.index);
      return /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\s*\)\s*$/.test(back);
    }).length;
    f1.independent[rel] = { returnSessionStore: all.length, databaseModeFailurePath: failurePath, modeSwitchHints: modeSwitch };
    f1.fallbackPoints += failurePath;
  }

  // DB-F2: an industrial / twin / analytics read that answers an outage with an
  // empty collection. Enumerated over the MODULE SET, not a remembered file list
  // — the under-count of 12 came from the latter.
  const f2Dirs = ["src/lib/industrial", "src/lib/digital-twin", "src/lib/predictive",
    "src/lib/time-series", "src/lib/multi-site", "src/lib/knowledge"];
  const f2 = { perFile: {}, total: 0 };
  for (const rel of sourceFiles(root)) {
    if (!f2Dirs.some((d) => rel.startsWith(`${d}/`))) continue;
    const src = readSourceText(join(root, rel));
    if (!src.includes("getPrisma")) continue;
    const code = blankCommentsAndStrings(src);
    const n = (code.match(/if\s*\(\s*!\s*(?:db|prisma|client)\s*\)\s*return\s*\[\s*\]/g) ?? []).length;
    if (n > 0) { f2.perFile[rel] = n; f2.total += n; }
  }
  // DB-F2 SEMANTIC: the same question without the single-line shape constraint —
  // every guard in the same module set whose null path returns a NORMAL answer
  // rather than refusing. The legacy number stays comparable with 12 -> 19 -> 26;
  // this one states the real extent of empty-success in those modules.
  const f2sem = { perFile: {}, total: 0, legacyTotal: f2.total, additional: {} };
  for (const rel of sourceFiles(root)) {
    if (!f2Dirs.some((d) => rel.startsWith(`${d}/`))) continue;
    const src = readSourceText(join(root, rel));
    if (!src.includes("getPrisma")) continue;
    const code = blankCommentsAndStrings(src);
    let n = 0;
    for (const m of code.matchAll(/\bgetPrisma\s*\(/g)) {
      const binding = bindingNameBefore(code, m.index);
      const guard = findGuard(code, m.index, binding);
      if (!guard || !guard.nullPath) continue;
      const v = classifyNullPath(src.slice(guard.nullPath.from, guard.nullPath.to));
      const rule = RULE_BY_ID.get(v.ruleId);
      if (rule && rule.classification === "EMPTY_SUCCESS_FALLBACK") n += 1;
      if (v.ruleId === "R19-named-or-shaped-return") n += 1;
    }
    if (n > 0) { f2sem.perFile[rel] = n; f2sem.total += n; }
  }
  for (const [k, v] of Object.entries(f2sem.perFile)) {
    const legacy = f2.perFile[k] ?? 0;
    if (v > legacy) f2sem.additional[k] = v - legacy;
  }
  return { dbF1: f1, dbF2: f2, dbF2Semantic: f2sem };
}

// ──────────────────────────────── file walking ─────────────────────────────────

function walk(absDir, acc, root) {
  let entries;
  try { entries = readdirSync(absDir); } catch { return acc; }
  for (const name of entries.sort()) {
    if (SKIP_DIR.has(name)) continue;
    const abs = join(absDir, name);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) { walk(abs, acc, root); continue; }
    const dot = name.lastIndexOf(".");
    if (dot === -1 || !SOURCE_EXT.has(name.slice(dot))) continue;
    const rel = relative(root, abs).split(sep).join("/");
    // The filesystem fallback must drop exactly what the git path drops.
    if (isExcludedPath(rel)) continue;
    acc.push(rel);
  }
  return acc;
}

/** True when the path is a source file inside a scan root and not skipped. */
function inScope(rel) {
  if (isExcludedPath(rel)) return false;
  if (!SCAN_ROOTS.some((r) => rel === r || rel.startsWith(`${r}/`))) return false;
  if (rel.split("/").some((seg) => SKIP_DIR.has(seg))) return false;
  const dot = rel.lastIndexOf(".");
  return dot !== -1 && SOURCE_EXT.has(rel.slice(dot));
}

/**
 * The file list.
 *
 * PRIMARY: `git ls-files`, for three reasons that matter to a determinism
 * contract — it is already sorted, it already emits POSIX paths, and it lists
 * exactly the tracked tree, so an untracked build artifact or a stray editor
 * backup can never enter the inventory and change the hash.
 *
 * FALLBACK: a filesystem walk, for an exported tree with no `.git`. The walk
 * sorts and normalises identically, so both paths produce the same list for the
 * same tracked content. The fallback is also materially slower on some
 * filesystems, which is the practical reason git is preferred.
 */
export function sourceFiles(root = REPO_ROOT) {
  try {
    const out = execFileSync("git", ["-C", root, "ls-files", "-z", "--", ...SCAN_ROOTS], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const rels = out.split("\0").filter(Boolean).filter(inScope);
    if (rels.length > 0) return rels.sort();
  } catch {
    // fall through to the walk
  }
  const files = [];
  for (const r of SCAN_ROOTS) {
    const abs = join(root, r);
    if (existsSync(abs)) walk(abs, files, root);
  }
  return files.sort();
}

// ───────────────────────────────── inventory ───────────────────────────────────

function loadResidualScreening() {
  if (!existsSync(RESIDUAL_SCREENING_PATH)) return { screenings: [] };
  return JSON.parse(readFileSync(RESIDUAL_SCREENING_PATH, "utf8"));
}

function loadEdgeTraces() {
  if (!existsSync(EDGE_TRACES_PATH)) return { traces: [] };
  return JSON.parse(readFileSync(EDGE_TRACES_PATH, "utf8"));
}

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return { rulesetVersion: RULESET_VERSION, adjudications: [] };
  return JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
}

/**
 * The files worth reading: those that contain the identifier at all.
 *
 * This is a PERFORMANCE filter only, and it cannot change the result. The
 * inventory loop already skips any file whose text lacks `getPrisma`, so
 * narrowing the candidate list to exactly those files produces an identical
 * record set — it only avoids ~2,200 pointless reads, which on this filesystem
 * is the difference between 143 seconds and about fifteen.
 *
 * When `git grep` is unavailable the full source list is returned and the
 * in-loop text guard does the same job more slowly.
 */
export function candidateFiles(root = REPO_ROOT) {
  const all = sourceFiles(root);
  try {
    const out = execFileSync("git", ["-C", root, "grep", "-l", "-z", "getPrisma", "--", ...SCAN_ROOTS], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const hits = new Set(out.split("\0").filter(Boolean));
    const narrowed = all.filter((f) => hits.has(f));
    if (narrowed.length > 0) return narrowed;
  } catch {
    // `git grep` exits non-zero when there is no match; fall back to the full list.
  }
  return all;
}

/**
 * Whether a manual adjudication still describes the code it was written against.
 * Pure, so the selftest exercises the real decision rather than a copy of it.
 */
export function overrideStatus(override, actualFingerprint) {
  return override.sourceFingerprint === actualFingerprint ? "APPLY" : "STALE";
}

export function buildInventory(root = REPO_ROOT) {
  const files = candidateFiles(root);
  const overrides = loadOverrides();
  const byId = new Map(
    (overrides.adjudications ?? []).map((a) => [a.callsiteId, a]),
  );

  const screening = loadResidualScreening();
  const byScreenId = new Map((screening.screenings ?? []).map((t) => [t.callsiteId, t]));
  const seenScreen = new Set();
  const staleScreenings = [];

  const edgeTraces = loadEdgeTraces();
  const byEdgeId = new Map((edgeTraces.traces ?? []).map((t) => [t.consumerEdgeId, t]));
  const seenEdges = new Set();
  const staleEdges = [];

  let textual = 0;
  const records = [];
  const staleOverrides = [];
  const seenOverrides = new Set();

  for (const relPath of files) {
    const src = readSourceText(join(root, relPath));
    if (!src.includes("getPrisma")) continue;
    textual += countTextualOccurrences(src);
    for (const site of findCallSites(relPath, src)) {
      const id = `${relPath}#L${site.line}C${site.column}`;
      const fp = fingerprint(src, site.offset);
      const auto = classify(site, src);
      const rec = {
        id,
        file: relPath,
        line: site.line,
        column: site.column,
        ordinalInFile: site.ordinal,
        fingerprint: fp,
        testOnly: isTestPath(relPath),
        ruleId: auto.ruleId,
        classification: auto.classification,
        confidence: auto.confidence,
        // The rule's own confidence, kept even after a manual trace supersedes
        // it. `confidence` becomes MANUAL once a trace applies, so without this
        // the gate counter "high-impact sites classified only by a HIGH rule"
        // would read zero the moment the work was done, which makes it useless
        // as a measure of how much of the inventory rests on a shape match.
        autoConfidence: auto.confidence,
        guardShape: auto.guardShape ?? null,
        reason: auto.reason,
        evidence: auto.evidence,
        controlFlow: auto.controlFlow,
        accessorConsumers: auto.accessorConsumers ?? null,
        secondaryTags: secondaryTags(site, src, auto.classification),
        consumerEdges: auto.consumerEdges ?? null,
        reachability: null,
        adjudication: null,
      };
      // Apply the per-edge manual traces. An edge is TRACED only when a pinned
      // entry exists AND its fingerprint still matches the code it describes.
      for (const e of rec.consumerEdges ?? []) {
        const t = byEdgeId.get(e.consumerEdgeId);
        if (!t) continue;
        seenEdges.add(e.consumerEdgeId);
        if (overrideStatus(t, e.sourceFingerprint) === "STALE") {
          staleEdges.push({ id: e.consumerEdgeId, expected: t.sourceFingerprint, actual: e.sourceFingerprint });
          continue;
        }
        e.manuallyTraced = true;
        e.terminalBoundary = t.terminalBoundary;
        e.terminalResponse = t.terminalResponse ?? null;
        e.retryBehavior = t.retryBehavior ?? null;
        if (t.retryTrace !== undefined) e.retryTrace = t.retryTrace;
        e.durability = t.durability ?? null;
        e.auditOutcome = t.auditOutcome ?? null;
        e.callerPath = t.callerPath ?? null;
        e.traceReason = t.reason ?? null;
        e.traceEvidence = t.evidence ?? null;
        e.reviewer = t.reviewer ?? "S0 manual adjudication";
        if (t.classification) e.classification = t.classification;
        if (t.secondaryTags) e.secondaryTags = [...new Set([...e.secondaryTags, ...t.secondaryTags])].sort();
      }
      const sc = byScreenId.get(id);
      if (sc) {
        seenScreen.add(id);
        if (overrideStatus(sc, fp) === "STALE") {
          staleScreenings.push({ id, expected: sc.sourceFingerprint, actual: fp });
        } else {
          rec.reachability = {
            verdict: sc.verdict,
            caller: sc.caller,
            terminalSurface: sc.terminalSurface,
            reason: sc.reason,
            evidence: sc.evidence,
            fullTrace: Boolean(sc.fullTrace),
            screenedBy: sc.screenedBy ?? "S0 residual reachability screening",
          };
        }
      }

      const ov = byId.get(id);
      if (ov) {
        seenOverrides.add(id);
        if (overrideStatus(ov, fp) === "STALE") {
          staleOverrides.push({ id, expected: ov.sourceFingerprint, actual: fp });
        } else {
          rec.classification = ov.classification;
          rec.confidence = "MANUAL";
          rec.secondaryTags = [...new Set([...(ov.secondaryTags ?? []), ...rec.secondaryTags])].sort();
          rec.adjudication = {
            reviewer: ov.reviewer ?? "S0 manual adjudication",
            reason: ov.reason,
            evidence: ov.evidence,
            callerPath: ov.callerPath ?? null,
            terminalBehavior: ov.terminalBehavior ?? null,
            outcomeFlags: ov.outcomeFlags ?? [],
            ...(ov.retryTrace === undefined ? {} : { retryTrace: ov.retryTrace }),
            fingerprintMatched: true,
            supersededRuleId: ov.supersededRuleId ?? auto.ruleId,
            // null when the rule set did not reach a verdict at all: there is
            // nothing to agree or disagree with, and counting those as
            // "disagreement" would make the statistic meaningless.
            agreesWithRule: auto.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW"
              ? null
              : auto.classification === ov.classification,
          };
        }
      }
      records.push(rec);
    }
  }

  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // An ORPHAN adjudication names a call site that no longer exists at all —
  // distinct from a STALE one, whose site exists but has moved underneath it.
  // Both invalidate the inventory: a verdict with no subject is evidence of a
  // review that was never re-run.
  const orphanOverrides = [...byId.keys()].filter((id) => !seenOverrides.has(id)).sort();
  const orphanEdges = [...byEdgeId.keys()].filter((id) => !seenEdges.has(id)).sort();
  const orphanScreenings = [...byScreenId.keys()].filter((id) => !seenScreen.has(id)).sort();
  const retrySubjectList = retrySubjects(overrides.adjudications ?? [], edgeTraces.traces ?? []);
  const retryTraceProblems = [
    ...retryTraceViolations(retrySubjectList, { root }),
    ...retryTraceIdentityViolations(retrySubjectList, { lineCountOf: (p) => lineCountAt(root, p) }),
  ].sort();
  return {
    records, textual, staleOverrides, orphanOverrides, staleEdges, orphanEdges,
    staleScreenings, orphanScreenings, retryTraceProblems, fileCount: files.length,
  };
}

/**
 * RETRY_SUPPRESSION — ONE rule, one structured model, for every call site and every consumer edge.
 *
 * The outcome class means: after the failure, the SAME operation will not be attempted again.
 * It is derived from a `retryTrace` and from nothing else. A flag typed by hand, or the
 * prose of `retryBehavior` / `terminalBehavior` / `reason`, decides nothing: a record whose
 * outcome or text concerns a retry must carry a complete trace, and a flag or a prose
 * verdict that disagrees with the trace is a failure (exit 10).
 *
 *   operationIdentity        names the operation that failed
 *   failureObservedByCaller  the caller receives a signal that identifies a transient failure it can act
 *                            on by retrying (a 5xx, a thrown error, "unavailable", a 409 that asks for a
 *                            refresh). A 2xx, an empty answer, a "not found" or a 422 is NOT such a signal.
 *   sameOperationRetried     a later execution re-attempts THIS operation, not another one
 *   retryTrigger             NONE                  nobody will run it again;
 *                            REQUESTER             only the party that made the request can run it again;
 *                            INDEPENDENT_SCHEDULE  a poll, schedule or later pass runs it again on its own
 *   retryTiming              NEVER | ON_REQUESTER_RETRY | NEXT_POLL | NEXT_PASS — and it must agree with
 *                            the trigger
 *   blockingState            null, or the durable claim / flag / row that stops a later run
 *   terminal                 what the caller finally receives
 *   justification            why the previous facts hold
 *   sourceReferences         repository paths (optionally :line or :from-to) that show it
 *
 * RETRY_SUPPRESSION holds when a blocking state exists, or no later run exists, or the later run is
 * another operation, or only the requester can retry and it was not given a signal it can act on.
 * A poll or a pass that runs the same operation again is not suppression.
 */
export const RETRY_TRIGGERS = Object.freeze(["NONE", "REQUESTER", "INDEPENDENT_SCHEDULE"]);
export const RETRY_TIMINGS = Object.freeze(["NEVER", "ON_REQUESTER_RETRY", "NEXT_POLL", "NEXT_PASS"]);
const TIMINGS_OF = Object.freeze({
  NONE: ["NEVER"],
  REQUESTER: ["ON_REQUESTER_RETRY"],
  INDEPENDENT_SCHEDULE: ["NEXT_POLL", "NEXT_PASS"],
});
export const RETRY_TRACE_KEYS = Object.freeze([
  "operationIdentity",
  "failureObservedByCaller",
  "sameOperationRetried",
  "retryTrigger",
  "retryTiming",
  "blockingState",
  "terminal",
  "justification",
  "sourceReferences",
]);

export function deriveRetrySuppression(trace) {
  if (trace.blockingState !== null && trace.blockingState !== undefined) return true;
  if (trace.retryTrigger === "NONE") return true;
  if (trace.sameOperationRetried !== true) return true;
  if (trace.retryTrigger === "REQUESTER") return trace.failureObservedByCaller !== true;
  return false;
}

/** A record that talks about a retry must carry the trace that proves what it says. */
export const RETRY_STATEMENT = /\bretr(?:y|ied|ies|ying)\b|\bre-announce/i;

const SOURCE_REFERENCE = /^[A-Za-z0-9_@()[\].\/-]+\.(?:ts|tsx|mjs|js)(?::\d+(?:-\d+)?)?$/;

/** The structural check of one trace; returns a list of problems (empty when sound). */
export function retryTraceShapeProblems(trace, exists = () => true) {
  const out = [];
  if (trace === null || typeof trace !== "object" || Array.isArray(trace)) return ["retryTrace is not an object"];
  for (const k of Object.keys(trace)) if (!RETRY_TRACE_KEYS.includes(k)) out.push(`retryTrace has the unknown key ${k}`);
  for (const k of RETRY_TRACE_KEYS) if (!(k in trace)) out.push(`retryTrace lacks ${k}`);
  if (out.length) return out;
  for (const k of ["operationIdentity", "terminal"]) if (typeof trace[k] !== "string" || trace[k].trim().length < 5) out.push(`retryTrace.${k} names nothing`);
  if (typeof trace.justification !== "string" || trace.justification.trim().length < 30) out.push("retryTrace.justification is missing or too short");
  for (const k of ["failureObservedByCaller", "sameOperationRetried"]) if (typeof trace[k] !== "boolean") out.push(`retryTrace.${k} is not a boolean`);
  if (!RETRY_TRIGGERS.includes(trace.retryTrigger)) out.push(`retryTrace.retryTrigger is not one of ${RETRY_TRIGGERS.join("|")}`);
  if (!RETRY_TIMINGS.includes(trace.retryTiming)) out.push(`retryTrace.retryTiming is not one of ${RETRY_TIMINGS.join("|")}`);
  if (trace.blockingState !== null && (typeof trace.blockingState !== "string" || trace.blockingState.trim().length < 10)) out.push("retryTrace.blockingState is neither null nor a described state");
  if (RETRY_TRIGGERS.includes(trace.retryTrigger) && RETRY_TIMINGS.includes(trace.retryTiming) && !TIMINGS_OF[trace.retryTrigger].includes(trace.retryTiming)) {
    out.push(`retryTrace.retryTiming ${trace.retryTiming} does not agree with the trigger ${trace.retryTrigger}`);
  }
  if (trace.retryTrigger === "NONE" && trace.sameOperationRetried !== false) out.push("retryTrace: no trigger means the same operation is not retried");
  if (!Array.isArray(trace.sourceReferences) || trace.sourceReferences.length === 0) out.push("retryTrace.sourceReferences is empty");
  else {
    for (const r of trace.sourceReferences) {
      if (typeof r !== "string" || !SOURCE_REFERENCE.test(r)) out.push(`retryTrace.sourceReferences holds a malformed reference: ${String(r).slice(0, 60)}`);
      else if (!exists(r.replace(/:\d+(?:-\d+)?$/, ""))) out.push(`retryTrace.sourceReferences names a path that does not exist: ${r.split(":")[0]}`);
    }
  }
  return out;
}

/**
 * The subjects the completeness gate reads: every adjudicated call site and every traced edge.
 * `declared` is the verdict the record states today (a flag, or the NO of `retryBehavior`);
 * `prose` is the text that may talk about a retry.
 */
export function retrySubjects(adjudications, edgeTraces) {
  const subjects = [];
  for (const a of adjudications) {
    subjects.push({
      id: a.callsiteId,
      kind: "callsite",
      trace: a.retryTrace,
      declared: (a.outcomeFlags ?? []).includes("RETRY_SUPPRESSION"),
      talksAboutRetry: RETRY_STATEMENT.test(`${a.reason ?? ""} ${a.terminalBehavior ?? ""}`),
    });
  }
  for (const t of edgeTraces) {
    const rb = String(t.retryBehavior ?? "");
    subjects.push({
      id: t.consumerEdgeId,
      kind: "edge",
      trace: t.retryTrace,
      declared: /^NO\b/.test(rb),
      talksAboutRetry: rb !== "n/a" || RETRY_STATEMENT.test(`${t.reason ?? ""} ${t.terminalResponse ?? ""}`),
    });
  }
  return subjects;
}

export function retryTraceViolations(subjects, options = {}) {
  const { root = null, exists = root ? (p) => existsSync(join(root, p)) : () => true } = options;
  const out = [];
  for (const s of subjects) {
    const needs = s.declared || s.talksAboutRetry;
    if (s.trace === undefined) {
      if (needs) out.push(`${s.id}: the ${s.kind} ${s.declared ? "declares RETRY_SUPPRESSION" : "talks about a retry"} and carries no retryTrace`);
      continue;
    }
    const problems = retryTraceShapeProblems(s.trace, exists);
    if (problems.length) {
      for (const p of problems) out.push(`${s.id}: ${p}`);
      continue;
    }
    const derived = deriveRetrySuppression(s.trace);
    if (derived !== s.declared) out.push(`${s.id}: the trace derives RETRY_SUPPRESSION=${derived} but the ${s.kind} declares ${s.declared}`);
  }
  return out.sort();
}

/**
 * A trace belongs to ONE subject at ONE position. A call site that moved keeps its verdict only when the trace was
 * moved with it, and the trace says so in three places that a re-key can leave behind:
 *
 *   operationIdentity   is derived from the subject's CURRENT identifier: `the operation behind <callsite id>` for
 *                       a call site, `the consumer <function>@L<line>:<path>` for an edge;
 *   sourceReferences    every `path:from-to` lies inside its file, and when the trace cites the subject's OWN file
 *                       with a line, at least one such citation lies within the window of the subject's CURRENT
 *                       position (a call site: from two lines before to eight after; an edge: it includes the
 *                       consumer line named by the identifier).
 *
 * A trace that still names the old position of a moved call site fails all three, whatever its prose says.
 */
export const RETRY_IDENTITY_OF = Object.freeze({
  callsite: (id) => `the operation behind ${id}`,
  edge: (id) => `the consumer ${String(id).split("::")[1] ?? ""}`,
});
export const RETRY_WINDOW_BEFORE = 2;
export const RETRY_WINDOW_AFTER = 8;
const CALLSITE_ID_PARTS = /^(.+)#L(\d+)C(\d+)$/;
const EDGE_ID_PARTS = /^(.+)#L(\d+)C(\d+)::(.+)@L(\d+):([A-Z_]+)$/;

export function parseSourceReference(ref) {
  const m = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(String(ref));
  return { path: m[1], from: m[2] === undefined ? null : Number(m[2]), to: m[2] === undefined ? null : Number(m[3] ?? m[2]) };
}

export function lineCountAt(root, relPath) {
  if (!root) return null;
  try {
    return readSourceText(join(root, relPath)).split("\n").length;
  } catch {
    return null;
  }
}

export function retryTraceIdentityViolations(subjects, { lineCountOf = () => null } = {}) {
  const out = [];
  for (const s of subjects) {
    if (s.trace === undefined || s.trace === null || typeof s.trace !== "object") continue;
    const expected = RETRY_IDENTITY_OF[s.kind]?.(s.id);
    if (expected === undefined) continue;
    if (s.trace.operationIdentity !== expected) {
      out.push(`${s.id}: retryTrace.operationIdentity "${String(s.trace.operationIdentity).slice(0, 90)}" is not "${expected.slice(0, 90)}"`);
    }
    const refs = Array.isArray(s.trace.sourceReferences) ? s.trace.sourceReferences.filter((r) => typeof r === "string").map(parseSourceReference) : [];
    for (const r of refs) {
      if (r.from === null) continue;
      const n = lineCountOf(r.path);
      if (r.to < r.from || r.from < 1 || (n !== null && r.to > n)) out.push(`${s.id}: retryTrace.sourceReferences ${r.path}:${r.from}-${r.to} lies outside its file`);
    }
    const parts = (s.kind === "edge" ? EDGE_ID_PARTS : CALLSITE_ID_PARTS).exec(String(s.id));
    if (!parts) continue;
    const own = refs.filter((r) => r.path === parts[1] && r.from !== null);
    if (own.length === 0) continue;
    if (s.kind === "edge") {
      const line = Number(parts[5]);
      if (!own.some((r) => r.from <= line && r.to >= line)) out.push(`${s.id}: no sourceReference in its own file includes the consumer line ${line}`);
    } else {
      const line = Number(parts[2]);
      if (!own.some((r) => r.to >= line - RETRY_WINDOW_BEFORE && r.from <= line + RETRY_WINDOW_AFTER)) {
        out.push(`${s.id}: no sourceReference in its own file lies within ${RETRY_WINDOW_BEFORE} lines before to ${RETRY_WINDOW_AFTER} after the call site's current line ${line}`);
      }
    }
  }
  return out.sort();
}

/**
 * The tags that make a call site or an edge HIGH IMPACT. A high-impact site is
 * closed only when its TERMINAL behaviour has been traced, never on the strength
 * of a syntactic match — see `gateCounters`.
 */
export const IMPACT_TAGS = Object.freeze(["WRITE", "DELETE", "AUDIT", "TRANSACTIONAL", "USER_VISIBLE", "PUBLIC_PATH"]);

export const isHighImpact = (tags) => IMPACT_TAGS.some((t) => tags.includes(t));

export function allEdges(records) {
  return records.flatMap((r) => r.consumerEdges ?? []);
}

/**
 * The closure counters the coverage gate enforces.
 *
 * SYNTACTICALLY_CLASSIFIED is not SEMANTICALLY_TRACED. A rule marked HIGH has
 * matched a shape in full — `return null`, `return false`, `return 0` — but what
 * that value MEANS is decided by the caller. On a write, delete, audit,
 * transactional, user-visible or public path that distinction is the whole
 * question, so those sites count as open until a pinned manual trace records the
 * terminal boundary. EXACT rules are excluded because they read the terminal
 * behaviour itself (a thrown error, a 503, an empty collection returned as a
 * success) rather than a value whose meaning is deferred.
 */
export function gateCounters(records) {
  const edges = allEdges(records);
  const highImpact = records.filter((r) => isHighImpact(r.secondaryTags));
  const highImpactHigh = highImpact.filter((r) => (r.autoConfidence ?? r.confidence) === "HIGH");
  return {
    highTotal: records.filter((r) => (r.autoConfidence ?? r.confidence) === "HIGH").length,
    highImpactTotal: highImpact.length,
    highImpactHighTotal: highImpactHigh.length,
    highImpactHighTraced: highImpactHigh.filter((r) => r.adjudication !== null).length,
    highImpactHighUntraced: highImpactHigh.filter((r) => r.adjudication === null).length,
    highImpactUnresolved: highImpact.filter((r) => r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW").length,
    consumerEdgesTotal: edges.length,
    consumerEdgesTraced: edges.filter((e) => e.manuallyTraced).length,
    consumerEdgesUntraced: edges.filter((e) => !e.manuallyTraced).length,
    consumerEdgesUnresolved: edges.filter((e) => e.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW").length,
  };
}

export function summarize({ records, textual }) {
  const prod = records.filter((r) => !r.testOnly && r.classification !== "WRAPPER_OR_FACTORY");
  const byClass = {};
  for (const c of CLASSIFICATIONS) byClass[c] = 0;
  for (const r of records) byClass[r.classification] += 1;
  const tag = (t) => records.filter((r) => r.secondaryTags.includes(t)).length;
  return {
    rulesetVersion: RULESET_VERSION,
    textualOccurrences: textual,
    realCallExpressions: records.length,
    productionCallSites: prod.length,
    testOnlyCallSites: records.filter((r) => r.testOnly).length,
    wrapperCallSites: records.filter((r) => r.classification === "WRAPPER_OR_FACTORY").length,
    autoClassifiedExact: records.filter((r) => r.confidence === "EXACT").length,
    autoClassifiedHigh: records.filter((r) => r.confidence === "HIGH").length,
    manuallyAdjudicated: records.filter((r) => r.adjudication !== null).length,
    // Of the manual verdicts, how many the v3 rule set reached independently.
    // Agreement is evidence that widening guard DISCOVERY did not change what a
    // classification MEANS; disagreement is where the rule set is still blind.
    manualOnUnresolvedRule: records.filter((r) => r.adjudication && r.adjudication.agreesWithRule === null).length,
    manualAgreeingWithRule: records.filter((r) => r.adjudication?.agreesWithRule === true).length,
    manualSupersedingRule: records.filter((r) => r.adjudication?.agreesWithRule === false).length,
    unresolved: records.filter((r) => r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW").length,
    ...gateCounters(records),
    primaryPartition: primaryPartition(records),
    outcomes: outcomeSets(records),
    residual: residualScreening(records),
    byClassification: byClass,
    byTag: {
      READ: tag("READ"), WRITE: tag("WRITE"), DELETE: tag("DELETE"),
      SILENT: tag("SILENT"), LOGGED: tag("LOGGED"),
      TENANT_SCOPED: tag("TENANT_SCOPED"), SITE_SCOPED: tag("SITE_SCOPED"),
      AUDIT: tag("AUDIT"), USER_VISIBLE: tag("USER_VISIBLE"),
      TRANSACTIONAL: tag("TRANSACTIONAL"), BACKGROUND_JOB: tag("BACKGROUND_JOB"),
      PUBLIC_PATH: tag("PUBLIC_PATH"), SILENT_CATCH: tag("SILENT_CATCH"),
    },
    byRule: Object.fromEntries(
      [...records.reduce((m, r) => m.set(r.ruleId, (m.get(r.ruleId) ?? 0) + 1), new Map())].sort(),
    ),
    unresolvedByRule: Object.fromEntries(
      [...records.filter((r) => r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW")
        .reduce((m, r) => m.set(r.ruleId, (m.get(r.ruleId) ?? 0) + 1), new Map())].sort(),
    ),
  };
}

/**
 * ───────────────── ACCOUNTING INVARIANTS (s0-b05.5) ──────────────────────────
 *
 * Three questions the final review asked, each now answered by a computation
 * rather than by prose:
 *
 *  1. PRIMARY PARTITION — do the per-classification counts sum to the call-site
 *     total, with nothing missing and nothing counted twice? The review arrived
 *     at 391 against a total of 392. The partition was never broken; the 391 came
 *     from mixing a stale `HEALTH_OR_DIAGNOSTIC_ONLY = 3` (the s0-b05.3 figure,
 *     before the readiness probe was adjudicated into that class) into the
 *     s0-b05.4 set. An arithmetic claim about this inventory should never again
 *     depend on a number being transcribed correctly, so the sum, the delta and
 *     the missing/duplicate id lists are now generated and gated.
 *
 *  2. OUTCOME DEDUPLICATION — the outcome classes were reported as "72 edges +
 *     DB-08/DB-19/DB-22", which is not a total: it does not say whether a named
 *     finding is already one of the counted members. Each outcome is now a SET of
 *     structured ids (`callsite:<id>` / `edge:<id>`), so the total is the set's
 *     cardinality and overlap is impossible by construction.
 *
 *     THE DEDUPLICATION RULE, and why it is the one that matters: a WRAPPER call
 *     site is never a member. Its behaviour lives on its consumer edges, so
 *     counting both would count the same behaviour twice. A direct call site is a
 *     member in its own right. A named finding is therefore one of three things,
 *     and the report says which: an independent member, a LABEL on a member that
 *     is already counted, or a label on a set of edges.
 *
 *  3. RESIDUAL REACHABILITY — see `residualScreening`.
 */

/** Every call site must have exactly one classification from the closed set. */
export function primaryPartition(records) {
  const counts = {};
  for (const c of CLASSIFICATIONS) counts[c] = 0;
  const missing = [];
  const outside = [];
  const seen = new Map();
  const duplicate = [];
  for (const r of records) {
    if (seen.has(r.id)) duplicate.push(r.id);
    else seen.set(r.id, true);
    if (!r.classification) { missing.push(r.id); continue; }
    if (!CLASSIFICATIONS.includes(r.classification)) { outside.push(`${r.id} -> ${r.classification}`); continue; }
    counts[r.classification] += 1;
  }
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    counts,
    sum,
    total: records.length,
    delta: records.length - sum,
    missingPrimaryIds: missing.sort(),
    duplicatePrimaryIds: [...new Set(duplicate)].sort(),
    classificationsOutsideClosedSet: outside.sort(),
  };
}

export const OUTCOME_CLASSES = Object.freeze([
  "SUCCESS_WITHOUT_PERSISTENCE",
  "ACK_WITHOUT_DURABILITY",
  "AUDIT_LOSS",
  "RETRY_SUPPRESSION",
]);

/**
 * Outcome membership for an EDGE, derived from the structured fields its trace
 * records — never from a function name and never parsed out of prose.
 */
export function edgeOutcomeFlags(e) {
  const flags = [];
  const success = /HTTP_200|HTTP_201|SUCCESS|EMPTY_OR|EMPTY_LIST|PAGE_RENDERS|ZEROED|IN_MEMORY_READ|NOOP/.test(e.terminalBoundary ?? "");
  const nonDurable = /IN_MEMORY_ONLY|NONE/.test(e.durability ?? "");
  const isWrite = e.operation === "WRITE" || e.operation === "DELETE";
  if (success && nonDurable) flags.push("SUCCESS_WITHOUT_PERSISTENCE");
  if (/WEBHOOK_200|ACK/.test(e.terminalBoundary ?? "")) flags.push("ACK_WITHOUT_DURABILITY");
  if (isWrite && /^(?:none|NONE)/.test(e.auditOutcome ?? "")) flags.push("AUDIT_LOSS");
  if (e.retryTrace && deriveRetrySuppression(e.retryTrace)) flags.push("RETRY_SUPPRESSION");
  return flags;
}

/**
 * The four outcome sets, as unique structured id sets, with the three integrity
 * lists the gate enforces.
 *
 *   duplicate — the same id appears twice inside one outcome set
 *   orphan    — an id in an outcome set names a call site or edge that does not exist
 *   stale     — an outcome flag sits on an adjudication whose fingerprint has moved
 *
 * An id may legitimately belong to SEVERAL outcome sets; the prohibition is only
 * on a repeat inside one set.
 */
export function outcomeSets(records) {
  const siteById = new Map(records.map((r) => [r.id, r]));
  const edges = allEdges(records);
  const edgeById = new Map(edges.map((e) => [e.consumerEdgeId, e]));

  const sets = {};
  for (const c of OUTCOME_CLASSES) sets[c] = [];
  const duplicates = [];
  const orphans = [];
  const stale = [];

  const push = (cls, id) => {
    if (!OUTCOME_CLASSES.includes(cls)) { orphans.push(`${id} -> unknown outcome ${cls}`); return; }
    if (sets[cls].includes(id)) duplicates.push(`${cls}:${id}`);
    else sets[cls].push(id);
  };

  // Edges: derived from their traced fields. A wrapper's behaviour lives here.
  for (const e of edges) {
    if (!e.manuallyTraced) continue;
    for (const c of edgeOutcomeFlags(e)) push(c, `edge:${e.consumerEdgeId}`);
  }

  // Call sites: ONLY from an explicit `outcomeFlags` on the adjudication, so a
  // call site can never enter an outcome set by a prose match.
  for (const r of records) {
    // RETRY_SUPPRESSION is derived from the trace, never read from the typed flag
    const typed = (r.adjudication?.outcomeFlags ?? []).filter((f) => f !== "RETRY_SUPPRESSION");
    const flags = r.adjudication?.retryTrace && deriveRetrySuppression(r.adjudication.retryTrace) ? [...typed, "RETRY_SUPPRESSION"] : typed;
    if (flags.length === 0) continue;
    if (r.classification === "WRAPPER_OR_FACTORY") {
      // The dedup rule: a wrapper's outcome is carried by its edges.
      duplicates.push(`WRAPPER_WOULD_DOUBLE_COUNT:${r.id}`);
      continue;
    }
    for (const c of flags) push(c, `callsite:${r.id}`);
  }

  for (const c of OUTCOME_CLASSES) sets[c].sort();

  // Integrity: every member must exist, and a flagged adjudication must be live.
  for (const c of OUTCOME_CLASSES) {
    for (const id of sets[c]) {
      const [kind, ...rest] = id.split(":");
      const key = rest.join(":");
      if (kind === "callsite" && !siteById.has(key)) orphans.push(`${c}:${id}`);
      if (kind === "edge" && !edgeById.has(key)) orphans.push(`${c}:${id}`);
    }
  }
  for (const r of records) {
    if (!r.adjudication?.outcomeFlags) continue;
    if (r.adjudication.fingerprintMatched === false) stale.push(`callsite:${r.id}`);
  }

  return {
    sets,
    totals: Object.fromEntries(OUTCOME_CLASSES.map((c) => [c, sets[c].length])),
    duplicateIds: [...new Set(duplicates)].sort(),
    orphanIds: [...new Set(orphans)].sort(),
    staleIds: [...new Set(stale)].sort(),
  };
}

export const REACHABILITY_VERDICTS = Object.freeze([
  "INTERNAL_ONLY_PURE_READ",
  "BACKGROUND_ONLY",
  "AUTHENTICATED_USER_VISIBLE",
  "PUBLICLY_REACHABLE",
  "SECURITY_CONTROL_DEPENDENCY",
  "UNKNOWN_REACHABILITY",
]);

/** Verdicts that are only acceptable once the site has a full terminal trace. */
const REQUIRES_FULL_TRACE = Object.freeze([
  "AUTHENTICATED_USER_VISIBLE",
  "PUBLICLY_REACHABLE",
  "SECURITY_CONTROL_DEPENDENCY",
]);

/**
 * The residual set: call sites the rule set classified at HIGH confidence that
 * are NOT on an impact path, and so were never required to carry a trace.
 *
 * `PUBLIC_PATH` is a floor — it is applied only by manual adjudication — so the
 * absence of impact tags cannot by itself make a site low-impact. Every member
 * is therefore screened for REACHABILITY, and three verdicts then demand a full
 * trace. `UNKNOWN_REACHABILITY` keeps B-05 open.
 */
export function residualScreening(records) {
  const residual = records.filter((r) =>
    (r.autoConfidence ?? r.confidence) === "HIGH" && !isHighImpact(r.secondaryTags));
  const byVerdict = {};
  for (const v of REACHABILITY_VERDICTS) byVerdict[v] = 0;
  const unscreened = [];
  const needTrace = [];
  const traced = [];
  for (const r of residual) {
    const v = r.reachability?.verdict;
    if (!v || !REACHABILITY_VERDICTS.includes(v)) { unscreened.push(r.id); byVerdict.UNKNOWN_REACHABILITY += 1; continue; }
    byVerdict[v] += 1;
    if (REQUIRES_FULL_TRACE.includes(v)) {
      needTrace.push(r.id);
      if (r.adjudication || r.reachability?.fullTrace) traced.push(r.id);
    }
  }
  return {
    total: residual.length,
    byVerdict,
    unscreenedIds: unscreened.sort(),
    requiredFullTrace: needTrace.length,
    fullyTraced: traced.length,
    requiredFullTraceMinusCompleted: needTrace.length - traced.length,
    missingFullTraceIds: needTrace.filter((id) => !traced.includes(id)).sort(),
  };
}

/** Edge-level aggregation, reported BESIDE the call-site table, never instead of it. */
export function summarizeEdges(records) {
  const edges = allEdges(records);
  const tally = (f) => {
    const o = {};
    for (const e of edges) { const k = f(e); o[k] = (o[k] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(o).sort());
  };
  return {
    total: edges.length,
    traced: edges.filter((e) => e.manuallyTraced).length,
    untraced: edges.filter((e) => !e.manuallyTraced).length,
    byEdgePath: tally((e) => e.edgePath),
    byClassification: tally((e) => e.classification),
    byOperation: tally((e) => e.operation),
    byTerminalBoundary: tally((e) => e.terminalBoundary ?? "UNTRACED"),
    outagePaths: edges.filter((e) => e.edgePath !== "UNCONDITIONAL_DELEGATION").length,
    unconditionalDelegations: edges.filter((e) => e.edgePath === "UNCONDITIONAL_DELEGATION").length,
    outcomes: edgeOutcomes(edges),
  };
}

/**
 * The four outcome classes the review asked for, counted over TRACED edges from
 * the structured fields their traces record — never inferred from a function
 * name or parsed out of prose.
 *
 *   successWithoutPersistence  the terminal is a 2xx (or a caller-visible
 *                              success) AND durability is in-memory or none
 *   ackWithoutDurability       the terminal is an acknowledgement to an external
 *                              party (a provider webhook, a gateway) that will
 *                              therefore not redeliver
 *   auditLoss                  the operation is a write and no audit row is
 *                              written for what actually happened
 *   retrySuppression           the caller or provider is not told to try again
 *
 * Named CALL SITES that belong to these classes are listed in the report rather
 * than counted here, because a call site's trace records a terminal behaviour in
 * prose and this function refuses to parse prose into a number.
 */
export function edgeOutcomes(edges) {
  const traced = edges.filter((e) => e.manuallyTraced);
  const isSuccess = (e) => /HTTP_200|HTTP_201|SUCCESS|EMPTY_OR|EMPTY_LIST|PAGE_RENDERS|ZEROED|IN_MEMORY_READ|NOOP/.test(e.terminalBoundary ?? "");
  const nonDurable = (e) => /IN_MEMORY_ONLY|NONE/.test(e.durability ?? "");
  const isWrite = (e) => e.operation === "WRITE" || e.operation === "DELETE";
  return {
    tracedEdges: traced.length,
    successWithoutPersistence: traced.filter((e) => isSuccess(e) && nonDurable(e)).length,
    ackWithoutDurability: traced.filter((e) => /WEBHOOK_200|ACK/.test(e.terminalBoundary ?? "")).length,
    auditLoss: traced.filter((e) => isWrite(e) && /^(?:none|NONE)/.test(e.auditOutcome ?? "")).length,
    retrySuppression: traced.filter((e) => e.retryTrace && deriveRetrySuppression(e.retryTrace)).length,
    deadSurface: traced.filter((e) => e.terminalBoundary === "NO_PRODUCT_CALLER").length,
    permanentDelegation: traced.filter((e) => e.terminalBoundary === "PERMANENT_DELEGATION_NOT_AN_OUTAGE_PATH").length,
  };
}

export function render(inv) {
  return `${JSON.stringify({
    schemaVersion: 1,
    phase: "S0-B-05",
    rulesetVersion: RULESET_VERSION,
    note: "Deterministic inventory of getPrisma() call sites and their behaviour when Prisma is unavailable. Generated by scripts/security/s0/getprisma-callsite-inventory.mjs. Contains no secret, no request data, no timestamp and no absolute path.",
    scanRoots: SCAN_ROOTS,
    classifications: CLASSIFICATIONS,
    summary: summarize(inv),
    edgeSummary: summarizeEdges(inv.records),
    callSites: inv.records,
  }, null, 2)}\n`;
}

// ──────────────────────────────────── CLI ──────────────────────────────────────

function main() {
  const mode = process.argv[2] ?? "summary";
  const inv = buildInventory();

  if (inv.staleOverrides.length > 0) {
    console.error("[s0-getprisma] STALE manual adjudications — the source moved under them:");
    for (const s of inv.staleOverrides) console.error(`  ${s.id}  expected ${s.expected}  actual ${s.actual}`);
    process.exit(3);
  }
  if (inv.orphanOverrides.length > 0) {
    console.error("[s0-getprisma] ORPHAN manual adjudications — no such call site exists:");
    for (const id of inv.orphanOverrides) console.error(`  ${id}`);
    process.exit(4);
  }
  if (inv.staleEdges.length > 0) {
    console.error("[s0-getprisma] STALE consumer-edge traces — the source moved under them:");
    for (const e of inv.staleEdges) console.error(`  ${e.id}  expected ${e.expected}  actual ${e.actual}`);
    process.exit(6);
  }
  if (inv.orphanEdges.length > 0) {
    console.error("[s0-getprisma] ORPHAN consumer-edge traces — no such edge exists:");
    for (const id of inv.orphanEdges) console.error(`  ${id}`);
    process.exit(7);
  }
  if (inv.staleScreenings.length > 0) {
    console.error("[s0-getprisma] STALE residual screenings — the source moved under them:");
    for (const e of inv.staleScreenings) console.error(`  ${e.id}  expected ${e.expected}  actual ${e.actual}`);
    process.exit(8);
  }
  if (inv.orphanScreenings.length > 0) {
    console.error("[s0-getprisma] ORPHAN residual screenings — the site is no longer in the residual set:");
    for (const id of inv.orphanScreenings) console.error(`  ${id}`);
    process.exit(9);
  }

  if (inv.retryTraceProblems.length > 0) {
    console.error("[s0-getprisma] RETRY_SUPPRESSION trace problems — a flag disagrees with the one rule, or a retry statement has no trace:");
    for (const p of inv.retryTraceProblems) console.error(`  ${p}`);
    process.exit(10);
  }

  const rendered = render(inv);

  if (mode === "generate") {
    writeFileSync(OUT_PATH, rendered);
    console.log(`[s0-getprisma] wrote ${relative(REPO_ROOT, OUT_PATH).split(sep).join("/")} (${inv.records.length} call sites)`);
    return;
  }
  if (mode === "check") {
    if (!existsSync(OUT_PATH)) {
      console.error("[s0-getprisma] inventory missing — run `generate`");
      process.exit(1);
    }
    const onDisk = readFileSync(OUT_PATH, "utf8");
    if (onDisk !== rendered) {
      console.error("[s0-getprisma] inventory DOES NOT match the source tree — re-run `generate` and review the diff");
      process.exit(2);
    }
    console.log("[s0-getprisma] inventory matches the source tree");
    return;
  }
  if (mode === "summary") {
    console.log(JSON.stringify(summarize(inv), null, 2));
    return;
  }
  if (mode === "coverage") {
    // Seven counters, all of which must be zero. `unresolved = 0` alone is not
    // closure: a HIGH-confidence verdict on a write, delete, audit,
    // transactional, user-visible or public path is a SHAPE match whose meaning
    // the caller decides, so it stays open until a pinned trace records the
    // terminal boundary.
    const g = gateCounters(inv.records);
    const pp = primaryPartition(inv.records);
    const oc = outcomeSets(inv.records);
    const rs = residualScreening(inv.records);
    const gates = {
      UNRESOLVED: inv.records.filter((r) => r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW").length,
      PRIMARY_PARTITION_DELTA: pp.delta,
      MISSING_PRIMARY_IDS: pp.missingPrimaryIds.length,
      DUPLICATE_PRIMARY_IDS: pp.duplicatePrimaryIds.length,
      CLASSIFICATIONS_OUTSIDE_CLOSED_SET: pp.classificationsOutsideClosedSet.length,
      OUTCOME_DUPLICATE_IDS: oc.duplicateIds.length,
      OUTCOME_ORPHAN_IDS: oc.orphanIds.length,
      OUTCOME_STALE_IDS: oc.staleIds.length,
      RESIDUAL_UNKNOWN_REACHABILITY: rs.byVerdict.UNKNOWN_REACHABILITY,
      RESIDUAL_REQUIRED_FULL_TRACE_MINUS_COMPLETED: rs.requiredFullTraceMinusCompleted,
      HIGH_IMPACT_HIGH_UNTRACED: g.highImpactHighUntraced,
      HIGH_IMPACT_UNRESOLVED: g.highImpactUnresolved,
      WRAPPER_CONSUMER_UNTRACED: g.consumerEdgesUntraced,
      STALE_OVERRIDES: inv.staleOverrides.length,
      ORPHAN_OVERRIDES: inv.orphanOverrides.length,
      STALE_CONSUMER_EDGES: inv.staleEdges.length,
      ORPHAN_CONSUMER_EDGES: inv.orphanEdges.length,
      STALE_RESIDUAL_SCREENINGS: inv.staleScreenings.length,
      ORPHAN_RESIDUAL_SCREENINGS: inv.orphanScreenings.length,
    };
    console.log(`[s0-getprisma] call sites ${inv.records.length}, consumer edges ${g.consumerEdgesTotal}`);
    for (const [k, v] of Object.entries(gates)) console.log(`  ${v === 0 ? "PASS" : "OPEN"}  ${k} = ${v}`);
    const failed = Object.entries(gates).filter(([, v]) => v !== 0);
    if (failed.length > 0) {
      console.error(`[s0-getprisma] COVERAGE INCOMPLETE — ${failed.map(([k]) => k).join(", ")}`);
      const openSites = inv.records.filter((r) => isHighImpact(r.secondaryTags)
        && ((r.autoConfidence ?? r.confidence) === "HIGH" && r.adjudication === null
            || r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW"));
      for (const r of openSites.slice(0, 400)) console.error(`  OPEN SITE ${r.id}  ${r.ruleId}  [${r.secondaryTags.join(",")}]`);
      for (const e of allEdges(inv.records).filter((x) => !x.manuallyTraced).slice(0, 400)) console.error(`  OPEN EDGE ${e.consumerEdgeId}`);
      for (const id of rs.unscreenedIds.slice(0, 400)) console.error(`  UNSCREENED RESIDUAL ${id}`);
      for (const id of rs.missingFullTraceIds.slice(0, 400)) console.error(`  RESIDUAL NEEDS FULL TRACE ${id}`);
      for (const id of pp.missingPrimaryIds) console.error(`  NO PRIMARY CLASSIFICATION ${id}`);
      for (const id of pp.duplicatePrimaryIds) console.error(`  DUPLICATE PRIMARY ${id}`);
      for (const id of oc.duplicateIds) console.error(`  OUTCOME DUPLICATE ${id}`);
      process.exit(5);
    }
    console.log("[s0-getprisma] COVERAGE COMPLETE — every call site and every consumer edge is traced");
    return;
  }
  if (mode === "edges") {
    console.log(JSON.stringify(summarizeEdges(inv.records), null, 2));
    return;
  }
  if (mode === "reconcile") {
    console.log(JSON.stringify(reconcile(), null, 2));
    return;
  }
  console.error(`[s0-getprisma] unknown mode: ${mode}. Use generate | check | summary | coverage | reconcile | edges.`);
  process.exit(64);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
