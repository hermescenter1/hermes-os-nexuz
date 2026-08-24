/**
 * PHASE 106 — the single mapping between a UI locale and an article's language.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 * ─────────────────────────────────
 * The Journal now stores three language editions of one article under ONE slug,
 * distinguished by `Article.language`. Every surface that has to pick "which
 * edition does this request want" — the detail route, the feed, category and
 * tag listings, the importer, the validator — must agree on the answer, or the
 * same URL serves different content depending on which helper resolved it.
 *
 * `@/i18n/locales` is deliberately import-free and knows nothing about the
 * Journal; `ArtLanguage` is a Prisma enum that knows nothing about routing.
 * This module is the one place the two meet, so the mapping is stated once and
 * cannot drift.
 *
 * FAIL-OPEN, NOT FAIL-CLOSED — ON PURPOSE
 * ───────────────────────────────────────
 * An unrecognised locale resolves to `null` ("no language preference") rather
 * than to a guessed default. A caller that receives `null` must fall back to
 * locale-agnostic behaviour — i.e. exactly what the Journal did before this
 * phase — instead of hiding content behind a wrong guess.
 */

import { LOCALE_LANG_TAG, type SupportedLocale } from "@/i18n/locales";
import type { ArtLanguage } from "./types";

/**
 * Locale -> article language. Keyed by SupportedLocale so adding a fourth
 * platform locale is a type error here until its article language is decided,
 * rather than a silent `null` at runtime.
 */
const LOCALE_TO_ART_LANGUAGE: Record<SupportedLocale, ArtLanguage> = {
  fa: "FA",
  en: "EN",
  de: "DE",
};

/** Every article language, in the platform's own locale order. */
export const ART_LANGUAGES: readonly ArtLanguage[] = ["FA", "EN", "DE"] as const;

/**
 * The article language a request for `locale` should be served, or `null` when
 * the locale is not one the platform models.
 *
 * `null` means "no preference" — never "no results". Callers translate it into
 * a locale-agnostic query.
 */
export function articleLanguageForLocale(locale: string): ArtLanguage | null {
  return LOCALE_TO_ART_LANGUAGE[locale as SupportedLocale] ?? null;
}

/** The locale that serves a given article language, or `null` if unmodelled. */
export function localeForArticleLanguage(language: string): SupportedLocale | null {
  for (const [locale, lang] of Object.entries(LOCALE_TO_ART_LANGUAGE)) {
    if (lang === language) return locale as SupportedLocale;
  }
  return null;
}

/**
 * BCP-47 tag for an article language — used for JSON-LD `inLanguage` and any
 * `lang` attribute on rendered article content. Falls back to the lowercased
 * enum name so an unmapped value degrades to a plausible tag instead of `null`
 * leaking into structured data.
 */
export function langTagForArticleLanguage(language: string): string {
  const locale = localeForArticleLanguage(language);
  return locale ? LOCALE_LANG_TAG[locale] : language.toLowerCase();
}

/** Text direction of an article's own content (Persian is RTL). */
export function directionForArticleLanguage(language: string): "rtl" | "ltr" {
  return language === "FA" ? "rtl" : "ltr";
}

/**
 * The localized display name of a category for a locale, with an explicit
 * fallback chain. German is nullable in the schema, so a category that has no
 * German label shows its English name rather than an empty heading.
 */
export function categoryNameForLocale(
  category: { name: string; nameFa?: string | null; nameDe?: string | null },
  locale: string,
): string {
  if (locale === "fa") return category.nameFa || category.name;
  if (locale === "de") return category.nameDe || category.name;
  return category.name;
}
