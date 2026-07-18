/**
 * Central locale source of truth (Phase 86B).
 *
 * This is the ONE place that enumerates the platform's locales. Both
 * `i18n/routing.ts` (next-intl routing) and `lib/seo/config.ts` (SEO/sitemap)
 * derive their locale lists from here so the two can never drift apart.
 *
 * ACTIVE  vs  SUPPORTED
 * ─────────────────────
 *  - ACTIVE_LOCALES     — locales exposed to the public: routing, sitemap,
 *                         hreflang, language switchers. Only these are ever
 *                         rendered or crawlable.
 *  - SUPPORTED_LOCALES  — every locale the platform *models*, including ones
 *                         not yet publicly exposed. German is fully prepared in
 *                         data/model form but stays out of ACTIVE_LOCALES until
 *                         `messages/de.json` is structurally complete.
 *
 * This module has ZERO project imports so the derived modules cannot create a
 * circular dependency back through here.
 */

/** Publicly exposed locales — routing, sitemap, hreflang, switchers.
 *  PHASE 87L.6 FINAL AMENDMENT: German activated after every public-route
 *  namespace reached genuinely German values (de-catalog TRANSLATED_NS). */
export const ACTIVE_LOCALES = ["fa", "en", "de"] as const;

/** Every modeled locale, including not-yet-public ones (German). */
export const SUPPORTED_LOCALES = ["fa", "en", "de"] as const;

/** A locale currently exposed to the public. */
export type ActiveLocale = (typeof ACTIVE_LOCALES)[number];

/** Any locale the platform models, whether or not it is publicly exposed. */
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Default locale (Persian). Must be a member of ACTIVE_LOCALES. */
export const DEFAULT_LOCALE = "fa" satisfies ActiveLocale;

export type Direction = "rtl" | "ltr";

/**
 * Text direction per locale. Persian is RTL; English and German are LTR.
 * Keyed by SupportedLocale so German's direction is modeled before it is public.
 */
export const LOCALE_DIRECTION: Record<SupportedLocale, Direction> = {
  fa: "rtl",
  en: "ltr",
  de: "ltr",
};

/** BCP-47 language tag per locale (used for the `<html lang>` attribute). */
export const LOCALE_LANG_TAG: Record<SupportedLocale, string> = {
  fa: "fa-IR",
  en: "en-GB",
  de: "de-DE",
};

/** Open Graph locale string per locale (`og:locale`). */
export const OG_LOCALE: Record<SupportedLocale, string> = {
  fa: "fa_IR",
  en: "en_GB",
  de: "de_DE",
};

/** Endonym (native name) per locale — used by the language switchers. */
export const LOCALE_NATIVE_NAME: Record<SupportedLocale, string> = {
  fa: "فارسی",
  en: "English",
  de: "Deutsch",
};

/**
 * Human-readable English exonym per locale — used for accessible names
 * (aria-label) on the language switchers, e.g. "Switch language to Persian".
 */
export const LOCALE_ACCESSIBLE_NAME: Record<SupportedLocale, string> = {
  fa: "Persian",
  en: "English",
  de: "German",
};

/** Type guard: is `value` a publicly exposed (active) locale? */
export function isActiveLocale(value: string): value is ActiveLocale {
  return (ACTIVE_LOCALES as readonly string[]).includes(value);
}

/** Type guard: is `value` any modeled (supported) locale? */
export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * The next active locale after `current`, cycling through ACTIVE_LOCALES.
 * With two active locales this is a simple fa↔en toggle; it extends
 * automatically when a third locale becomes active.
 */
export function nextActiveLocale(current: string): ActiveLocale {
  const idx = ACTIVE_LOCALES.indexOf(current as ActiveLocale);
  // Unknown current locale falls back to the first active locale's successor.
  const from = idx === -1 ? 0 : idx;
  return ACTIVE_LOCALES[(from + 1) % ACTIVE_LOCALES.length];
}

export interface ActiveLocaleOption {
  code: ActiveLocale;
  nativeName: string;
  /** English exonym for accessible names, e.g. "Persian". */
  accessibleName: string;
  dir: Direction;
}

/**
 * The list the language switchers render — one entry per ACTIVE locale.
 * Because it is sourced from ACTIVE_LOCALES, inactive locales (German) can
 * never appear until they are activated.
 */
export function activeLocaleOptions(): ActiveLocaleOption[] {
  return ACTIVE_LOCALES.map((code) => ({
    code,
    nativeName: LOCALE_NATIVE_NAME[code],
    accessibleName: LOCALE_ACCESSIBLE_NAME[code],
    dir: LOCALE_DIRECTION[code],
  }));
}
