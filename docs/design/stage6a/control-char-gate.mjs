/**
 * Phase 107 Stage 6-A.2 — reject invisible control characters in changed files.
 *
 * WHY THIS EXISTS. A test in this stage contained two REAL U+0008 bytes where a
 * literal backslash-b was meant:
 *
 *     expect(control!.className).not.toMatch(/<BS>h-8<BS>/);
 *
 * The regex therefore looked for a backspace character next to "h-8", which no
 * className can ever contain. The assertion passed unconditionally and proved
 * nothing — the worst kind of green, because it was written specifically to
 * catch the 44px control shrinking back to 32px.
 *
 * The characters are invisible in every editor and in `git diff`, so nothing
 * short of a byte-level check finds them. This is that check.
 *
 * WHAT IS REJECTED
 *   U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+007F   — C0 controls
 *   U+202A–U+202E  LRE/RLE/PDF/LRO/RLO                     — bidi OVERRIDES
 *   U+2066–U+2069  isolates                                — bidi OVERRIDES
 *
 * WHAT IS ALLOWED, deliberately
 *   U+0009 tab, U+000A LF, U+000D CR   — ordinary whitespace
 *   U+200C ZWNJ                        — REQUIRED by Persian orthography; this
 *                                        repository's i18n rules mandate it, so
 *                                        rejecting it would break the catalogues
 *   U+200D ZWJ                         — used in emoji sequences
 *   U+200E LRM, U+200F RLM             — see below; REPORTED, never rejected
 *
 * MARKS ARE NOT OVERRIDES, and conflating them was this gate's first mistake.
 * A first draft rejected LRM/RLM too and immediately flagged six PRE-EXISTING,
 * entirely correct uses in `messages/fa.json`:
 *
 *     "phoneIran": "<RLM>+98 913 411 6492"
 *     "noBackupHint": "... هیچ فایل <LRM>.dump<LRM> در BACKUP_DIR ..."
 *
 * Without those marks a leading `+` or a Latin file extension renders on the
 * wrong side of RTL Persian text. They carry no override semantics and cannot
 * reorder source the way RLO/LRO can, so they are counted and printed but never
 * fail the gate. The Trojan-Source vector is the override and isolate range,
 * and that is what is rejected — correct RTL here comes from `dir="rtl"` and
 * from the characters' own direction, never from an embedded override.
 *
 * Usage: node docs/design/stage6a/control-char-gate.mjs [--all]
 *        default: every added or modified file in the worktree.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const sh = (c) => execSync(c, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const FORBIDDEN = [
  { name: "C0 control", test: (c) => (c <= 0x08) || c === 0x0b || c === 0x0c || (c >= 0x0e && c <= 0x1f) || c === 0x7f },
  { name: "bidi override", test: (c) => (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) },
];
/* Counted and shown, never fatal — see the header. */
const REPORTED = { name: "bidi mark", test: (c) => c === 0x200e || c === 0x200f };

/* Binary and generated files are not source and are skipped by extension. */
const SKIP = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|mp4|webm|lock)$/i;

const files = sh("git status --porcelain --untracked-files=all")
  .split(/\r?\n/).filter(Boolean)
  .map((l) => l.slice(3).trim())
  .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
  .filter((p) => !SKIP.test(p));

const hits = [];
const marks = [];
for (const file of files) {
  const buf = fs.readFileSync(file);
  let text;
  try { text = buf.toString("utf8"); } catch { continue; }
  // Reading codepoints, not bytes, so a bidi control is seen as one character.
  let line = 1, col = 1;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (ch === "\n") { line++; col = 1; continue; }
    const at = () => ({ file, line, col, code: "U+" + c.toString(16).toUpperCase().padStart(4, "0") });
    for (const rule of FORBIDDEN) if (rule.test(c)) hits.push({ ...at(), kind: rule.name });
    if (REPORTED.test(c)) marks.push({ ...at(), kind: REPORTED.name });
    col++;
  }
}

console.log(`files scanned: ${files.length}`);
for (const h of hits) console.log(`  REJECT  ${h.file}:${h.line}:${h.col}  ${h.code}  ${h.kind}`);
for (const m of marks) console.log(`  allow   ${m.file}:${m.line}:${m.col}  ${m.code}  ${m.kind}`);
console.log(`BIDI_MARKS_ALLOWED=${marks.length}`);
console.log(`CONTROL_CHARACTERS=${hits.length}`);
process.exit(hits.length ? 1 : 0);
