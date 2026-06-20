/**
 * Currency formatting and FX stub (Phase 31).
 *
 * Zero-decimal currencies (IRR): formatted without minor units.
 * Two-decimal currencies (GBP, USD, EUR): standard formatting.
 *
 * FX conversion: stub returning 1:1 for ALL pairs.
 * ⚠ WARNING: Non-USD conversions are NOT accurate — all rates are 1:1 placeholders.
 * TODO: Wire a live FX provider (e.g. Frankfurter, Open Exchange Rates, or exchangerate.host)
 * before enabling multi-currency billing in production. Until then, only USD billing is safe.
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
 * True when the FX provider is a stub. Callers should surface a warning to
 * admins when this is true and from !== to.
 */
export const FX_STUB_ACTIVE = true;

/** Human-readable warning for non-same-currency conversions under the stub. */
export const FX_STUB_WARNING =
  "FX rates are a 1:1 placeholder. Non-USD conversions are NOT accurate — " +
  "wire a live FX provider before enabling multi-currency billing in production.";

/**
 * Stub FX rate: returns 1:1 for all pairs.
 * TODO: Replace with a live FX provider before production multi-currency billing.
 * All callers that convert between different currencies should check FX_STUB_ACTIVE.
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

/**
 * Convert with explicit stub metadata. Use this in billing UIs to show a
 * warning banner when non-USD conversion is in effect.
 */
export function convertCurrencyWithMeta(
  amount: number,
  from:   Currency,
  to:     Currency,
): { amount: number; isStub: boolean; warning?: string } {
  return {
    amount:  convertCurrency(amount, from, to),
    isStub:  FX_STUB_ACTIVE,
    warning: FX_STUB_ACTIVE && from !== to ? FX_STUB_WARNING : undefined,
  };
}
