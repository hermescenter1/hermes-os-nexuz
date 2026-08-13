// PHASE 101 (addendum) — SCADA scripting extractor (WinCC-Unified-class JS).
//
// WHY JAVASCRIPT
// Supervisory scripting on a modern SCADA platform is JavaScript, not a PLC
// language and certainly not C++. Modelling it as anything else would make the
// corpus a fiction. The scripts here are authored in the idiom those platforms
// actually use — `Tags("Name").Read()`, `Tags("Name").Write(value)`, screen and
// alarm event handlers — so the relationships the extractor recovers are the
// relationships a real supervisory engineer would recognise.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It does not execute, transpile or evaluate the script. There is no JS engine
// here: this is a lexical recogniser over a comment- and literal-stripped view
// of the text, exactly like the SCL extractor. Reading engineering source must
// never be able to *do* anything, and a `Write` recovered from a script is a
// DECLARED relationship, never an operation this system can perform.

import {
  type ExtractedRelation,
  type ExtractedUnit,
  type ExtractionResult,
  normaliseSource,
  summariseUnits,
} from "../source-artifacts";

/* ── Lexical pre-pass ─────────────────────────────────────────────────────── */

/**
 * Quoted arguments that must survive the literal-stripping pass.
 *
 * Every engineering identifier a SCADA script names — a tag, a screen — is
 * written as a string literal. Blanking all literals indiscriminately would
 * erase exactly the information this extractor exists to recover, so the
 * arguments of the accessor and navigation calls are protected and everything
 * else (trace messages, operator text) is blanked.
 */
const PROTECTED_ARGUMENTS: readonly RegExp[] = [
  /\bTags\s*\(\s*(['"])([A-Za-z_][A-Za-z0-9_.]*)\1\s*\)/g,
  /\b(?:Navigate|OpenScreen|ChangeScreen)\s*\(\s*(['"])([A-Za-z_][A-Za-z0-9_.]*)\1\s*\)/g,
];

/**
 * Blank comments and string literals while preserving every position.
 *
 * Position preservation keeps reported line numbers truthful; protecting the
 * argument spans keeps the identifiers readable. Everything else is blanked so
 * it can contribute neither a spurious symbol nor an unbalanced brace.
 */
export function stripScadaNonCode(source: string): string {
  const text = normaliseSource(source);

  const protectedSpans: Array<[number, number]> = [];
  for (const pattern of PROTECTED_ARGUMENTS) {
    pattern.lastIndex = 0;
    let hit: RegExpExecArray | null;
    while ((hit = pattern.exec(text)) !== null) {
      const quoteStart = hit.index + hit[0].indexOf(hit[1]);
      protectedSpans.push([quoteStart, quoteStart + hit[2].length + 2]);
    }
  }
  const isProtected = (index: number): boolean =>
    protectedSpans.some(([from, to]) => index >= from && index < to);

  const out = text.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== "\n" && !isProtected(k)) out[k] = " ";
    }
  };

  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);

    if (two === "//") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = text.length;
      blank(i, end);
      i = end;
      continue;
    }
    if (two === "/*") {
      let end = text.indexOf("*/", i + 2);
      end = end === -1 ? text.length : end + 2;
      blank(i, end);
      i = end;
      continue;
    }

    const ch = text[i];
    if ((ch === '"' || ch === "'" || ch === "`") && !isProtected(i)) {
      let k = i + 1;
      while (k < text.length) {
        if (text[k] === "\\") { k += 2; continue; }
        if (text[k] === ch) { k += 1; break; }
        k += 1;
      }
      blank(i, k);
      i = k;
      continue;
    }
    i += 1;
  }

  return out.join("");
}

/* ── Units ────────────────────────────────────────────────────────────────── */

interface UnitRange {
  name: string;
  kind: string;
  start: number;
  end: number;
}

const FUNCTION_PATTERN =
  /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g;

/**
 * Find the end of a `{ … }` block by matching braces.
 *
 * Safe because comments and string literals have already been blanked: a brace
 * inside a trace message can no longer end a function early, which would have
 * silently truncated the relationships recovered from it.
 */
function matchBrace(code: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return code.length;
}

function findUnits(code: string): UnitRange[] {
  const units: UnitRange[] = [];
  FUNCTION_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FUNCTION_PATTERN.exec(code)) !== null) {
    const openIndex = match.index + match[0].length - 1;
    const end = matchBrace(code, openIndex);
    units.push({ name: match[1], kind: "FUNCTION", start: openIndex + 1, end });
    // Continue past this function so a nested declaration is attributed to its
    // parent handler rather than becoming a second top-level unit.
    FUNCTION_PATTERN.lastIndex = end;
  }

  return units;
}

/* ── Relations ────────────────────────────────────────────────────────────── */

/**
 * `Tags("Name")` optionally followed by an access method.
 *
 * A bare `Tags("X")` with no method is treated as a READ: on these platforms it
 * is an accessor whose value is then used, and calling it a write would invent
 * a capability the script never exercised.
 */
const TAG_ACCESS =
  /\bTags\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_.]*)['"]\s*\)\s*(?:\.\s*(Read|Write|SetValue|GetValue)\b)?/g;

const WRITE_METHODS = new Set(["Write", "SetValue"]);

/** `Navigate("Name")` / `OpenScreen("Name")` / `ChangeScreen("Name")`. */
const SCREEN_NAV =
  /\b(?:Navigate|OpenScreen|ChangeScreen)\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_.]*)['"]\s*\)/g;

export function extractScadaJs(source: string): ExtractionResult {
  const code = stripScadaNonCode(source);

  const lineStarts: number[] = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") lineStarts.push(i + 1);
  }
  const lineAt = (index: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const units: ExtractedUnit[] = findUnits(code).map((range) => {
    const body = code.slice(range.start, range.end);
    const relations: ExtractedRelation[] = [];

    TAG_ACCESS.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_ACCESS.exec(body)) !== null) {
      const method = match[2];
      relations.push({
        symbol: match[1],
        relation: method && WRITE_METHODS.has(method) ? "WRITES" : "READS",
        line: lineAt(range.start + match.index),
      });
    }

    SCREEN_NAV.lastIndex = 0;
    while ((match = SCREEN_NAV.exec(body)) !== null) {
      relations.push({
        symbol: match[1],
        relation: "CALLS",
        line: lineAt(range.start + match.index),
      });
    }

    return { name: range.name, kind: range.kind, relations };
  });

  return summariseUnits(units);
}
