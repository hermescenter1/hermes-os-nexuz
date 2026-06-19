/**
 * Bilingual text normalization for deterministic FA/EN knowledge search — Phase 40.
 *
 * Applied to BOTH stored content (titleNorm/nameNorm columns, written on create/update)
 * AND incoming search queries, so matching is symmetric for Persian and English.
 *
 * Pipeline (applied in order):
 *  1. Unicode NFC normalization
 *  2. Arabic→Persian character mapping:
 *       ي  (U+064A) → ی  (U+06CC)  Arabic Ya → Persian Ye
 *       ك  (U+0643) → ک  (U+06A9)  Arabic Kaf → Persian Kaf
 *       ة  (U+0629) → ه  (U+0647)  Ta Marbuta → Persian He
 *       ى  (U+0649) → ی  (U+06CC)  Alef Maqsura → Persian Ye
 *  3. Tatweel removal (U+0640)
 *  4. Arabic diacritic/harakat stripping (U+064B–U+065F, U+0610–U+061A)
 *  5. ZWNJ removal (U+200C)
 *  6. Latin case-fold (toLowerCase — Arabic is case-invariant)
 *  7. Whitespace collapse + trim
 *
 * No external packages required.
 */

const ARABIC_TO_PERSIAN_RE = /[يكةى]/g;

const ARABIC_TO_PERSIAN_MAP: Record<string, string> = {
  "ي": "ی", // ي → ی
  "ك": "ک", // ك → ک
  "ة": "ه", // ة → ه
  "ى": "ی", // ى → ی
};

const TATWEEL_RE       = /ـ/g;
const DIACRITICS_RE    = /[ً-ٟؐ-ؚ]/g;
const ZWNJ_RE          = /‌/g;
const MULTI_SPACE_RE   = /\s+/g;

export function normalizeText(text: string): string {
  let s = text.normalize("NFC");
  s = s.replace(ARABIC_TO_PERSIAN_RE, (c) => ARABIC_TO_PERSIAN_MAP[c] ?? c);
  s = s.replace(TATWEEL_RE, "");
  s = s.replace(DIACRITICS_RE, "");
  s = s.replace(ZWNJ_RE, "");
  s = s.toLowerCase();
  return s.replace(MULTI_SPACE_RE, " ").trim();
}

/** Split normalized text into search tokens (length > 1, deduplicated). */
export function tokenize(normalized: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of normalized.split(/\s+/)) {
    if (t.length > 1 && !seen.has(t)) {
      seen.add(t);
      tokens.push(t);
    }
  }
  return tokens;
}

/** Returns true if haystack (already normalized) contains needle (already normalized). */
export function normContains(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}
