// PHASE 95 — safe normalisation of untrusted content before it is placed in a
// prompt envelope as DATA. Goal: neutralise structural/encoding tricks WITHOUT
// destroying legitimate engineering evidence. We do not "delete suspicious
// words"; we bound size/nesting, strip control bytes, and flag anomalies so the
// caller can decide (the instruction/data separation is enforced by the
// envelope, not by scrubbing).
//
// Implementation note: control/zero-width characters are filtered by CODEPOINT
// (not by a control-char regex literal), so this source file contains no raw
// control bytes and trips no `no-control-regex` lint rule.

export interface NormalisationResult {
  text: string;
  truncated: boolean;
  flags: string[];
}

const DEFAULT_MAX_LEN = 8_000;
const MAX_CONSECUTIVE_NEWLINES = 4;

const NUL = 0x00;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
// Zero-width / BOM codepoints used to hide instructions. Persian ZWNJ (0x200C)
// is deliberately NOT included — it is legitimate Persian orthography.
const ZERO_WIDTH = new Set([0x200b, 0x200d, 0x2060, 0xfeff]);

function isStrippableControl(cp: number): boolean {
  if (cp === TAB || cp === LF || cp === CR) return false;
  if (cp <= 0x1f) return true; // C0 controls
  if (cp >= 0x7f && cp <= 0x9f) return true; // DEL + C1 controls
  return false;
}

export function normaliseUntrusted(input: unknown, maxLen = DEFAULT_MAX_LEN): NormalisationResult {
  const flags: string[] = [];
  if (typeof input !== "string") {
    return { text: "", truncated: false, flags: ["non_string"] };
  }

  let text = input;
  try {
    text = text.normalize("NFKC");
  } catch {
    flags.push("normalize_failed");
  }

  let hadNul = false;
  let hadControl = false;
  let hadZeroWidth = false;
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === NUL) {
      hadNul = true;
      continue;
    }
    if (ZERO_WIDTH.has(cp)) {
      hadZeroWidth = true;
      continue;
    }
    if (isStrippableControl(cp)) {
      hadControl = true;
      continue;
    }
    out += ch;
  }
  if (hadNul) flags.push("nul_byte");
  if (hadControl) flags.push("control_chars");
  if (hadZeroWidth) flags.push("zero_width");
  text = out;

  // Bound runaway newlines (structure-confusion / DoS).
  const collapsed = text.replace(/\n{5,}/g, "\n".repeat(MAX_CONSECUTIVE_NEWLINES));
  if (collapsed.length !== text.length) flags.push("excess_newlines");
  text = collapsed;

  let truncated = false;
  if (text.length > maxLen) {
    text = text.slice(0, maxLen);
    truncated = true;
    flags.push("truncated");
  }

  return { text, truncated, flags };
}
