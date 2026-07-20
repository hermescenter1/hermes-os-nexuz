// PHASE 89B.2 — shared locale-aware formatting foundation.
//
// One deterministic, typed home for date / date-time / number / percent /
// currency display formatting across the trilingual platform. Pure functions
// of (value, locale, options): no browser globals, no mutable state, no
// implicit host timezone — so server and client render byte-identical output
// for the same inputs. Presentation only; persisted values and API payloads
// are never touched.
//
// Locale policy is NOT re-declared here: the page locale is validated through
// the central ACTIVE_LOCALES source and unknown values fall back to
// DEFAULT_LOCALE, mirroring every other locale consumer in the repository.
//
// NOTE: billing has its own `formatCurrency` (src/lib/billing/currency.ts)
// that derives the locale FROM the currency for invoice amounts. This module
// is the page-locale-driven counterpart for general UI display; the two are
// deliberately separate concerns.

import { DEFAULT_LOCALE, isActiveLocale, type ActiveLocale } from "@/i18n/locales";

/* ── Policy constants (exported for Phase 89B.3 migration) ──────────────── */

/**
 * BCP-47 Intl tag per active locale. `en` is en-US — the value already
 * established for formatting/JSON-LD output (html-lang uses en-GB; display
 * formatting keeps its own canonical tag, matching Phase 89B.1).
 */
export const INTL_LOCALE_TAG: Record<ActiveLocale, string> = {
  fa: "fa-IR",
  en: "en-US",
  de: "de-DE",
};

/**
 * Deterministic timezone for all date/date-time display formatting. The
 * repository has no central application timezone, so UTC is the documented
 * default; callers with a genuine zone requirement pass an explicit
 * `timeZone` option, which is preserved.
 */
export const FORMAT_TIME_ZONE = "UTC";

/** Repository-wide safe display for absent/invalid values (matches enumLabel). */
export const INVALID_DISPLAY = "—";

/** Accepted date inputs: Date instance, epoch milliseconds, or ISO-8601 string. */
export type DateInput = Date | number | string;

/* ── Locale resolution ──────────────────────────────────────────────────── */

/**
 * Resolve a page locale ("fa" | "en" | "de") to its Intl BCP-47 tag.
 * Unknown or malformed input follows the platform's safe default policy.
 */
export function resolveIntlLocale(locale: string): string {
  return INTL_LOCALE_TAG[isActiveLocale(locale) ? locale : DEFAULT_LOCALE];
}

/* ── Internal guards ────────────────────────────────────────────────────── */

/** Parse a DateInput; null when the result is not a real point in time. */
function toValidDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A number Intl can render without producing "NaN" / "∞" text. */
function isRenderableNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** ISO-4217 alphabetic currency code shape. */
const ISO_CURRENCY = /^[A-Za-z]{3}$/;

/* ── Formatters ─────────────────────────────────────────────────────────── */

/**
 * Locale-aware date. Defaults to `dateStyle: "medium"`; a caller-provided
 * options object replaces the default wholesale (so granular unit options
 * never collide with dateStyle) and is preserved verbatim — except that the
 * timezone is always explicit: caller's `timeZone` if given, else UTC.
 * Invalid input renders the repository-wide safe display.
 */
export function formatDate(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toValidDate(value);
  if (date === null) return INVALID_DISPLAY;
  const base: Intl.DateTimeFormatOptions = options ?? { dateStyle: "medium" };
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    ...base,
    timeZone: base.timeZone ?? FORMAT_TIME_ZONE,
  }).format(date);
}

/**
 * Locale-aware date + time. Defaults to `dateStyle: "medium", timeStyle:
 * "short"`; same option and timezone semantics as `formatDate`.
 */
export function formatDateTime(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toValidDate(value);
  if (date === null) return INVALID_DISPLAY;
  const base: Intl.DateTimeFormatOptions = options ?? { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    ...base,
    timeZone: base.timeZone ?? FORMAT_TIME_ZONE,
  }).format(date);
}

/**
 * Locale-aware number. Caller options pass straight through to
 * Intl.NumberFormat. Non-finite input renders the safe display.
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (!isRenderableNumber(value)) return INVALID_DISPLAY;
  return new Intl.NumberFormat(resolveIntlLocale(locale), options).format(value);
}

/**
 * Locale-aware percentage. `value` is a FRACTION (0.425 → "43%"). Caller
 * options are preserved; the percent style itself is fixed.
 */
export function formatPercent(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (!isRenderableNumber(value)) return INVALID_DISPLAY;
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    ...options,
    style: "percent",
  }).format(value);
}

/**
 * Locale-aware currency amount for general UI display. `currency` must be an
 * ISO-4217 alphabetic code (e.g. "EUR"); anything else — like a non-finite
 * amount — renders the safe display rather than throwing mid-page.
 */
export function formatCurrency(
  value: number,
  locale: string,
  currency: string,
  options?: Intl.NumberFormatOptions,
): string {
  if (!isRenderableNumber(value) || !ISO_CURRENCY.test(currency)) return INVALID_DISPLAY;
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    ...options,
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
}
