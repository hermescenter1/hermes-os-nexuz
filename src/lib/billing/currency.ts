/**
 * Currency formatting and FX stub (Phase 31).
 *
 * Zero-decimal currencies (IRR): formatted without minor units.
 * Two-decimal currencies (GBP, USD, EUR): standard formatting.
 *
 * FX conversion: stub returning 1:1.
 * TODO Phase 32: wire to a live FX provider (e.g. exchangerate.host).
 */

import type { Currency } from "./types";

/** Currencies that have no minor units. */
const ZERO_DECIMAL: Currency[] = ["IRR"];

/** Standard Intl locale codes per currency. */
const CURRENCY_LOCALE: Record<Currency, string> = {
  IRR: "fa-IR",
  GBP: "en-GB",
  USD: "en-US",
  EUR: "de-DE",
};

/**
 * Format a numeric amount in the given currency.
 * Accepts string (from Prisma Decimal) or number.
 */
export function formatCurrency(amount: string | number, currency: Currency): string {
  const num    = typeof amount === "string" ? parseFloat(amount) : amount;
  const locale = CURRENCY_LOCALE[currency];
  const fractionDigits = ZERO_DECIMAL.includes(currency) ? 0 : 2;

  return new Intl.NumberFormat(locale, {
    style:                 "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
}

/**
 * Stub FX rate: returns 1:1 for all pairs.
 * TODO Phase 32: replace with live provider.
 */
export function getExchangeRate(_from: Currency, _to: Currency): number {
  return 1;
}

/** Convert an amount between currencies using the stub FX rate. */
export function convertCurrency(
  amount:   number,
  from:     Currency,
  to:       Currency,
): number {
  return amount * getExchangeRate(from, to);
}
