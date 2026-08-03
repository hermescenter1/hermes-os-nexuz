// PHASE 96 — money + currency safety.
//
// No JavaScript floating-point money arithmetic. Amounts are handled as decimal
// STRINGS (matching the existing Prisma Decimal(20,4) columns) or as integer
// minor units. Currency is required and immutable after an invoice is issued.
// No implicit currency conversion between GBP/EUR/USD.

import {
  ACTIVE_CURRENCIES,
  SUPPORTED_CURRENCIES,
  isActiveCurrency,
  isSupportedCurrency,
  type ActiveCurrency,
  type SupportedCurrency,
} from "./types";

export { ACTIVE_CURRENCIES, SUPPORTED_CURRENCIES, isActiveCurrency, isSupportedCurrency };
export type { ActiveCurrency, SupportedCurrency };

const DECIMAL_STRING = /^-?\d{1,16}(\.\d{1,4})?$/;

/** Validate a decimal money string (up to 4 dp, matching Decimal(20,4)). */
export function isValidMoneyString(value: unknown): value is string {
  return typeof value === "string" && DECIMAL_STRING.test(value.trim());
}

/** Convert a validated decimal string to integer minor units (×10^4) WITHOUT
 *  floating point. Throws on malformed input (fail closed). */
export function toMinorUnits(decimal: string): bigint {
  const trimmed = decimal.trim();
  if (!DECIMAL_STRING.test(trimmed)) throw new Error("INVALID_MONEY_STRING");
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPartRaw = ""] = unsigned.split(".");
  const fracPart = (fracPartRaw + "0000").slice(0, 4);
  const combined = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  const magnitude = BigInt(combined === "" ? "0" : combined);
  return negative ? -magnitude : magnitude;
}

/** Render integer minor units back to a decimal string (4 dp). */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < BigInt(0);
  const abs = negative ? -minor : minor;
  const s = abs.toString().padStart(5, "0");
  const intPart = s.slice(0, -4);
  const fracPart = s.slice(-4);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/** Compare two money strings without float. -1 | 0 | 1. */
export function compareMoney(a: string, b: string): number {
  const am = toMinorUnits(a);
  const bm = toMinorUnits(b);
  return am < bm ? -1 : am > bm ? 1 : 0;
}

/** Whether a refund is within bounds: 0 < refund <= (paid - alreadyRefunded).
 *  All operands are decimal strings; arithmetic is in integer minor units. */
export function refundWithinBounds(params: {
  refund: string;
  amountPaid: string;
  alreadyRefunded: string;
}): boolean {
  if (!isValidMoneyString(params.refund) || !isValidMoneyString(params.amountPaid) || !isValidMoneyString(params.alreadyRefunded)) {
    return false; // fail closed on malformed input
  }
  const refund = toMinorUnits(params.refund);
  const paid = toMinorUnits(params.amountPaid);
  const refunded = toMinorUnits(params.alreadyRefunded);
  if (refund <= BigInt(0)) return false;
  const remaining = paid - refunded;
  return refund <= remaining;
}

/** Assert an invoice currency is supported and (for a NEW charge) active. Never
 *  performs conversion. */
export function assertChargeableCurrency(currency: unknown): asserts currency is ActiveCurrency {
  if (!isActiveCurrency(currency)) {
    throw new Error("CURRENCY_NOT_ACTIVE");
  }
}

/** Guard: an already-issued invoice's currency may not change. */
export function currencyIsImmutable(existing: string, incoming: string): boolean {
  return existing === incoming;
}
