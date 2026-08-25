/**
 * PHASE 104-B1.2 §7 — localized formatting for public job facts.
 *
 * Rules:
 *   - a salary renders ONLY with a complete band (both bounds + currency);
 *     the number and the currency come from Intl.NumberFormat for the PAGE
 *     locale, and the per-year phrasing comes from the catalog — no
 *     hard-coded "/ year" in any language;
 *   - the raw locationType enum (onsite/remote/hybrid) never reaches the
 *     screen: only its owner-approved localized label does, and a value
 *     without a mapping renders NOTHING (never a guess).
 */

const KNOWN_LOCATION_TYPES = new Set(["onsite", "remote", "hybrid"]);

export function localizedLocationType(
  raw: string | null | undefined,
  label: (key: "onsite" | "remote" | "hybrid") => string,
): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!KNOWN_LOCATION_TYPES.has(key)) return null;
  return label(key as "onsite" | "remote" | "hybrid");
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
  perYear: (amount: string) => string,
): string {
  if (!min || !max || !currency) return "";
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    // an unknown currency code is not a fact we can present — render nothing
    return "";
  }
  const range = `${fmt.format(min)} – ${fmt.format(max)}`;
  return perYear(range);
}
