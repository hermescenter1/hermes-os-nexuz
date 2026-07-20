import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveIntlLocale,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatCurrency,
  INTL_LOCALE_TAG,
  FORMAT_TIME_ZONE,
  INVALID_DISPLAY,
} from "../format";
import { ACTIVE_LOCALES, DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * PHASE 89B.2 — shared locale-aware formatters.
 *
 * All assertions are exact-output where the rendering is stable (ICU), and
 * structural elsewhere. 23:30 UTC on Dec 31 is used as the shift-sensitive
 * instant: any implicit non-UTC timezone east of Greenwich would flip it to
 * Jan 1, so exact-date assertions double as timezone-determinism proofs.
 */

const SHIFT_SENSITIVE_TS = Date.UTC(2026, 11, 31, 23, 30);

describe("89B.2 — locale resolution", () => {
  it.each([
    ["fa", "fa-IR"],
    ["en", "en-US"],
    ["de", "de-DE"],
  ])("%s → %s", (loc, tag) => {
    expect(resolveIntlLocale(loc)).toBe(tag);
  });

  it("unknown locales use the DEFAULT_LOCALE policy", () => {
    for (const bad of ["xx", "", "EN", "fa-IR", "constructor", "__proto__"]) {
      expect(resolveIntlLocale(bad)).toBe(INTL_LOCALE_TAG[DEFAULT_LOCALE]);
    }
  });

  it("every ACTIVE locale has a mapping and the timezone default is UTC", () => {
    for (const loc of ACTIVE_LOCALES) expect(INTL_LOCALE_TAG[loc]).toBeTruthy();
    expect(FORMAT_TIME_ZONE).toBe("UTC");
  });
});

describe("89B.2 — dates are deterministic and locale-correct", () => {
  it("explicit UTC prevents date shifting for a 23:30 UTC instant", () => {
    // Any implicit host timezone east of UTC (e.g. Tehran +03:30) would render Jan 1, 2027.
    expect(formatDate(SHIFT_SENSITIVE_TS, "en")).toBe("Dec 31, 2026");
    expect(formatDate(new Date(SHIFT_SENSITIVE_TS), "de")).toBe("31.12.2026");
  });

  it("Persian dates use Persian locale behavior (Jalali calendar, Persian digits)", () => {
    const out = formatDate(SHIFT_SENSITIVE_TS, "fa");
    expect(out).toBe("۱۰ دی ۱۴۰۵");
  });

  it("German long dates carry the German month name", () => {
    expect(formatDate(SHIFT_SENSITIVE_TS, "de", { dateStyle: "long" })).toContain("Dezember");
  });

  it("English stays en-US month-first formatting", () => {
    expect(formatDate(SHIFT_SENSITIVE_TS, "en")).toMatch(/^Dec 31, 2026$/);
  });

  it("accepts Date, epoch number and ISO string identically", () => {
    const iso = new Date(SHIFT_SENSITIVE_TS).toISOString();
    const a = formatDateTime(SHIFT_SENSITIVE_TS, "de");
    expect(formatDateTime(new Date(SHIFT_SENSITIVE_TS), "de")).toBe(a);
    expect(formatDateTime(iso, "de")).toBe(a);
    expect(a).toBe("31.12.2026, 23:30");
  });

  it("repeated calls are byte-identical (pure — server/client parity)", () => {
    for (const loc of ACTIVE_LOCALES) {
      expect(formatDateTime(SHIFT_SENSITIVE_TS, loc)).toBe(formatDateTime(SHIFT_SENSITIVE_TS, loc));
    }
  });

  it("caller options are preserved, including an explicit non-UTC timezone", () => {
    const tehran = formatDate(SHIFT_SENSITIVE_TS, "en", {
      dateStyle: "medium",
      timeZone: "Asia/Tehran",
    });
    expect(tehran).toBe("Jan 1, 2027");
    const granular = formatDate(SHIFT_SENSITIVE_TS, "en", { year: "numeric", month: "long" });
    expect(granular).toBe("December 2026");
  });

  it("invalid dates follow the repository safe-display convention", () => {
    for (const bad of ["not-a-date", NaN, new Date("garbage")] as const) {
      expect(formatDate(bad as Date | number | string, "en")).toBe(INVALID_DISPLAY);
      expect(formatDateTime(bad as Date | number | string, "fa")).toBe(INVALID_DISPLAY);
    }
  });
});

describe("89B.2 — numbers, percentages, currency", () => {
  it("number grouping/decimal separators differ correctly between en and de", () => {
    expect(formatNumber(1234567.89, "en")).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, "de")).toBe("1.234.567,89");
    expect(formatNumber(1234567.89, "fa")).toBe("۱٬۲۳۴٬۵۶۷٫۸۹");
  });

  it("percentages render in all three locales from a fraction", () => {
    expect(formatPercent(0.425, "en")).toBe("43%");
    expect(formatPercent(0.425, "de")).toMatch(/^43\s?%$/);
    expect(formatPercent(0.425, "fa")).toContain("٪");
  });

  it("currency renders in all three locales with an ISO code", () => {
    expect(formatCurrency(99.5, "en", "EUR")).toBe("€99.50");
    expect(formatCurrency(99.5, "de", "EUR")).toMatch(/^99,50\s?€$/);
    expect(formatCurrency(99.5, "fa", "EUR")).toContain("۹۹");
  });

  it("currency requires an ISO-4217 alphabetic code", () => {
    for (const bad of ["", "E", "EURO", "12$", "€"]) {
      expect(formatCurrency(10, "en", bad)).toBe(INVALID_DISPLAY);
    }
    // lowercase is normalized, not rejected
    expect(formatCurrency(10, "en", "usd")).toBe("$10.00");
  });

  it("caller number options are preserved", () => {
    expect(formatNumber(0.5, "en", { minimumFractionDigits: 3 })).toBe("0.500");
    expect(formatPercent(0.4256, "en", { maximumFractionDigits: 1 })).toBe("42.6%");
    expect(formatCurrency(5, "en", "USD", { currencyDisplay: "code" })).toContain("USD");
  });

  it("non-finite input never leaks NaN/Infinity text", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(formatNumber(bad, "en")).toBe(INVALID_DISPLAY);
      expect(formatPercent(bad, "de")).toBe(INVALID_DISPLAY);
      expect(formatCurrency(bad, "fa", "EUR")).toBe(INVALID_DISPLAY);
    }
  });

  it("no output ever contains accidental undefined/NaN text", () => {
    const outputs = ACTIVE_LOCALES.flatMap((loc) => [
      formatDate(SHIFT_SENSITIVE_TS, loc),
      formatDateTime(SHIFT_SENSITIVE_TS, loc),
      formatNumber(42.5, loc),
      formatPercent(0.1, loc),
      formatCurrency(9.99, loc, "USD"),
    ]);
    for (const out of outputs) {
      expect(out).not.toMatch(/undefined|NaN|Infinity|null/);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});

describe("89B.2 — module hygiene", () => {
  const code = readFileSync(resolve(process.cwd(), "src/lib/i18n/format.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("no implicit toLocale* calls and no browser globals", () => {
    expect(code).not.toMatch(/toLocaleString|toLocaleDateString|toLocaleTimeString/);
    expect(code).not.toMatch(/\b(?:window|document|navigator|localStorage)\s*\./);
    expect(code).not.toMatch(/console\./);
  });

  it("no mutable module state (no top-level let/var, no exported mutation)", () => {
    expect(code).not.toMatch(/^\s*(?:export\s+)?(?:let|var)\s/m);
  });

  it("locale policy is imported from the central source, not re-declared", () => {
    expect(code).toMatch(/isActiveLocale/);
    expect(code).toMatch(/DEFAULT_LOCALE/);
    expect(code).toMatch(/@\/i18n\/locales/);
  });
});
