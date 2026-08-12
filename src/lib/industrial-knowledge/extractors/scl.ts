// PHASE 101 (addendum) — IEC 61131-3 Structured Text / Siemens SCL extractor.
//
// WHAT IT DOES
// Recovers, deterministically, the routines a source file declares and the
// symbolic tags each one reads, writes and calls. That turns "this block reads
// the hydraulic pressure" from a hand-authored graph edge into a fact the
// source itself states — and lets a test assert the two agree.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It does not evaluate anything. There is no expression interpreter, no
// constant folding and no control-flow simulation: reading engineering source
// must never be able to *do* anything. It is a lexical recogniser over a
// comment-stripped, literal-stripped view of the text.
//
// SYMBOL SCOPE
// Only Siemens *symbolic* references — `"Name"` and `"Name".Member.Path` — are
// reported. In SCL those are exactly the global/symbolic address space: PLC
// tags, data blocks and callable blocks. Block-local variables are written
// `#name` and are intentionally ignored, because a local temporary is not a
// plant object and would only add noise to the corpus mapping.

import {
  type ExtractedRelation,
  type ExtractedUnit,
  type ExtractionResult,
  normaliseSource,
  summariseUnits,
} from "../source-artifacts";

/* ── Lexical pre-pass ─────────────────────────────────────────────────────── */

/**
 * Blank out comments and string literals, preserving every character position
 * and newline.
 *
 * Position preservation is what keeps reported line numbers truthful: an
 * extractor that reported a relation on the wrong line would make a provenance
 * citation point at the wrong piece of engineering, which is worse than
 * reporting nothing.
 */
export function stripNonCode(source: string): string {
  const text = normaliseSource(source);
  const out = text.split("");
  let i = 0;

  const blankUntil = (end: number) => {
    for (let k = i; k < end && k < out.length; k += 1) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < text.length) {
    const two = text.slice(i, i + 2);

    if (two === "//") {
      let end = text.indexOf("\n", i);
      if (end === -1) end = text.length;
      blankUntil(end);
      i = end;
      continue;
    }
    if (two === "(*" || two === "/*") {
      const closer = two === "(*" ? "*)" : "*/";
      let end = text.indexOf(closer, i + 2);
      end = end === -1 ? text.length : end + 2;
      blankUntil(end);
      i = end;
      continue;
    }
    if (text[i] === "'") {
      // SCL string literal. '' is an escaped quote inside a literal.
      let k = i + 1;
      while (k < text.length) {
        if (text[k] === "'" && text[k + 1] === "'") { k += 2; continue; }
        if (text[k] === "'") { k += 1; break; }
        k += 1;
      }
      blankUntil(k);
      i = k;
      continue;
    }
    i += 1;
  }

  return out.join("");
}

/**
 * Blank out `VAR … END_VAR` declaration sections.
 *
 * Declarations name types, not plant relationships. Leaving them in would make
 * every declared interface member look like a read, which would quietly turn
 * the extractor's output into "everything is related to everything".
 */
export function stripDeclarations(code: string): string {
  const pattern = /\bVAR(?:_INPUT|_OUTPUT|_IN_OUT|_TEMP|_STAT|_CONSTANT|_GLOBAL)?\b[\s\S]*?\bEND_VAR\b/gi;
  return code.replace(pattern, (match) => match.replace(/[^\n]/g, " "));
}

/* ── Unit headers ─────────────────────────────────────────────────────────── */

interface UnitRange {
  name: string;
  kind: string;
  start: number;
  end: number;
}

const HEADER_PATTERN =
  /\b(FUNCTION_BLOCK|ORGANIZATION_BLOCK|DATA_BLOCK|FUNCTION|TYPE)\b\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;

const TERMINATORS: Record<string, RegExp> = {
  FUNCTION_BLOCK: /\bEND_FUNCTION_BLOCK\b/i,
  ORGANIZATION_BLOCK: /\bEND_ORGANIZATION_BLOCK\b/i,
  DATA_BLOCK: /\bEND_DATA_BLOCK\b/i,
  FUNCTION: /\bEND_FUNCTION\b/i,
  TYPE: /\bEND_TYPE\b/i,
};

function findUnits(code: string): UnitRange[] {
  const units: UnitRange[] = [];
  HEADER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = HEADER_PATTERN.exec(code)) !== null) {
    const kind = match[1].toUpperCase();
    // `FUNCTION_BLOCK` also matches the `FUNCTION` alternative on a later pass;
    // anchoring on the longest keyword first in the alternation prevents that,
    // but a `FUNCTION` inside `END_FUNCTION_BLOCK` would still be seen — skip
    // any header whose keyword is immediately preceded by "END_".
    const preceding = code.slice(Math.max(0, match.index - 4), match.index).toUpperCase();
    if (preceding.endsWith("END_")) continue;

    const headerEnd = match.index + match[0].length;
    const terminator = TERMINATORS[kind];
    const rest = code.slice(headerEnd);
    const endMatch = terminator.exec(rest);
    const end = endMatch ? headerEnd + endMatch.index : code.length;

    // Statements begin at BEGIN. Everything before it is declaration territory:
    // block attribute pragmas (`{ S7_Optimized_Access := 'TRUE' }`), a VERSION
    // line, and constant initialisers. Those contain `:=` without being
    // assignments, and treating them as statements made the first real
    // statement of every block parse as the tail of a pragma.
    const beginMatch = /\bBEGIN\b/i.exec(code.slice(headerEnd, end));
    const start = beginMatch ? headerEnd + beginMatch.index + beginMatch[0].length : headerEnd;

    units.push({ name: match[2], kind, start, end });
  }

  return units;
}

/* ── Symbols ──────────────────────────────────────────────────────────────── */

const SYMBOL_PATTERN = /"([A-Za-z_][A-Za-z0-9_]*)"((?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;

interface SymbolHit {
  symbol: string;
  /** Offset of the reference within the fragment it was found in. */
  index: number;
}

/**
 * Every symbolic reference in a fragment, with its position.
 *
 * The position is carried so a relation can be attributed to the line the
 * SYMBOL sits on rather than the line the enclosing statement began on. A
 * multi-line condition would otherwise attribute all of its reads to its first
 * line, and a provenance citation would point an engineer at the wrong rung.
 */
function symbolHits(fragment: string): SymbolHit[] {
  const found: SymbolHit[] = [];
  SYMBOL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SYMBOL_PATTERN.exec(fragment)) !== null) {
    const members = match[2].replace(/\s+/g, "");
    found.push({ symbol: match[1] + members, index: match.index });
  }
  return found;
}

/** Every symbolic reference in a fragment, normalised to `Name.Member.Path`. */
export function symbolsIn(fragment: string): string[] {
  return symbolHits(fragment).map((h) => h.symbol);
}

/* ── Statement segmentation ───────────────────────────────────────────────── */

const SEGMENT_DELIMITER =
  /;|\bTHEN\b|\bDO\b|\bOF\b|\bELSE\b|\bELSIF\b|\bEND_IF\b|\bEND_CASE\b|\bEND_WHILE\b|\bEND_FOR\b|\bEND_REPEAT\b|\bREPEAT\b|\bUNTIL\b/gi;

interface Segment {
  text: string;
  /** Absolute offset of `text` within the comment-stripped source. */
  offset: number;
}

function segmentsOf(code: string, start: number, end: number): Segment[] {
  const body = code.slice(start, end);
  const segments: Segment[] = [];
  let cursor = 0;
  SEGMENT_DELIMITER.lastIndex = 0;
  let match: RegExpExecArray | null;

  const push = (from: number, to: number) => {
    const text = body.slice(from, to);
    if (text.trim().length > 0) segments.push({ text, offset: start + from });
  };

  while ((match = SEGMENT_DELIMITER.exec(body)) !== null) {
    push(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  push(cursor, body.length);

  return segments;
}

/* ── Classification ───────────────────────────────────────────────────────── */

function classify(segment: Segment, lineAt: (index: number) => number): ExtractedRelation[] {
  const relations: ExtractedRelation[] = [];
  const { text, offset } = segment;

  /** `base` is the fragment's offset within the segment. */
  const collect = (
    fragment: string,
    base: number,
    relation: ExtractedRelation["relation"],
  ) => {
    for (const hit of symbolHits(fragment)) {
      relations.push({ symbol: hit.symbol, relation, line: lineAt(offset + base + hit.index) });
    }
  };

  const parenIndex = text.indexOf("(");
  const assignIndex = text.indexOf(":=");
  const isPlainAssignment = assignIndex !== -1 && (parenIndex === -1 || assignIndex < parenIndex);

  if (isPlainAssignment) {
    collect(text.slice(0, assignIndex), 0, "WRITES");
    collect(text.slice(assignIndex + 2), assignIndex + 2, "READS");
    return relations;
  }

  if (parenIndex !== -1) {
    // A block invocation. The callee is the symbol immediately before `(`;
    // `param := value` binds an input (a READ of `value`) and `param => target`
    // binds an output (a WRITE of `target`).
    const head = text.slice(0, parenIndex);
    const headHits = symbolHits(head);
    const callee = headHits[headHits.length - 1];
    if (callee) {
      relations.push({
        symbol: callee.symbol,
        relation: "CALLS",
        line: lineAt(offset + callee.index),
      });
    }

    let cursor = parenIndex + 1;
    for (const binding of text.slice(parenIndex + 1).split(",")) {
      const outIndex = binding.indexOf("=>");
      if (outIndex !== -1) {
        collect(binding.slice(outIndex + 2), cursor + outIndex + 2, "WRITES");
      } else {
        const inIndex = binding.indexOf(":=");
        const from = inIndex === -1 ? 0 : inIndex + 2;
        collect(binding.slice(from), cursor + from, "READS");
      }
      // `+ 1` restores the comma the split consumed, so later bindings keep
      // their true offsets and therefore their true line numbers.
      cursor += binding.length + 1;
    }
    return relations;
  }

  // A bare expression — an IF/WHILE/CASE condition, or a CASE label. Every
  // symbol in it is read.
  collect(text, 0, "READS");
  return relations;
}

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Parse SCL / Structured Text and report the relationships it states.
 *
 * Deterministic: the same source always yields the same units, in declaration
 * order, each with relations in the order they appear in the text.
 */
export function extractScl(source: string): ExtractionResult {
  const normalised = normaliseSource(source);
  const code = stripDeclarations(stripNonCode(normalised));

  // Precompute a line index so every reported line number is a lookup rather
  // than a repeated scan of the prefix.
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
    const relations = segmentsOf(code, range.start, range.end).flatMap((segment) =>
      classify(segment, lineAt),
    );
    return { name: range.name, kind: range.kind, relations };
  });

  return summariseUnits(units);
}
