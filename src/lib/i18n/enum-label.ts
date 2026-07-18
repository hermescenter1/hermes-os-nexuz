// PHASE 87L.5 — shared presentation formatter for closed domain enums.
//
// The catalogs already carry fully localized (fa/en) label sub-trees for the
// platform's closed enums — asset status, criticality, maintenance status and
// priority, document status, approval status, CRM stage, and so on. Several
// legacy module clients nonetheless rendered the raw persisted value through
// `value.replace(/_/g, " ")`, which produces SCREAMING ENGLISH ("OUT OF
// SERVICE") inside the Persian UI and loses the curated wording in English.
//
// `enumLabel` routes a raw value through the catalog and keeps a safe fallback
// for values a future migration may add before the catalog catches up.
//
// Presentation only: the persisted value and every API payload are untouched —
// callers pass the raw value in and receive a display string back.

/** Minimal surface of a next-intl translator, so this stays JSX/React-free. */
export interface EnumTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * Enum keys are SCREAMING_SNAKE identifiers. Anything else is refused before a
 * lookup is attempted, so a translation key can never be assembled from
 * arbitrary or attacker-influenced text.
 */
const ENUM_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Sentence-case a raw enum value for display when the catalog has no entry yet.
 * `OUT_OF_SERVICE` → `Out of service`. Sentence case matches how the curated
 * catalog labels are written, so a fallback never looks like a different
 * typographic system than its neighbours.
 */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return value;
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

/**
 * Localized label for a closed-enum value.
 *
 * @param t        Translator already scoped to the namespace that owns the labels.
 * @param path     Dot path of the label sub-tree inside that namespace, e.g. "enums.status".
 * @param value    Raw persisted value, e.g. "IN_SERVICE". Null/empty yields `emptyLabel`.
 * @param options  `emptyLabel` for absent values; `fallback` overrides the humanized default.
 */
export function enumLabel(
  t: EnumTranslator,
  path: string,
  value: string | null | undefined,
  options: { emptyLabel?: string; fallback?: string } = {},
): string {
  if (value === null || value === undefined || value === "") {
    return options.emptyLabel ?? "—";
  }
  if (!ENUM_KEY.test(value)) {
    // Not an enum identifier — never build a lookup key from it.
    return options.fallback ?? value;
  }
  const key = path ? `${path}.${value}` : value;
  try {
    if (t.has(key)) return t(key);
  } catch {
    /* a translator without `has`, or a malformed namespace — fall through */
  }
  return options.fallback ?? humanizeEnum(value);
}
