/**
 * Canonical corporate contact and legal identity — the ONE source of truth.
 *
 * Every public surface that prints or publishes a company e-mail address,
 * telephone number, postal address, registration identifier or external
 * profile reads it from here: the Contact page, the About page, the footer
 * attribution and the JSON-LD entity graph (`lib/seo`). Nothing else in the
 * repository may retype these values, so the three locales and the structured
 * data cannot drift apart again.
 *
 * Scope rules
 * -----------
 *  - Machine values (e-mail, E.164 numbers, URLs, identifiers, the Latin
 *    address) are locale-invariant and live ONLY here.
 *  - Human-readable, locale-specific rendering (Persian digits, localized
 *    address, localized labels) is derived here as plain data so a page never
 *    reformats a number or an address itself.
 *  - Translatable labels and prose stay in the `contact` / `about` message
 *    catalogues.
 *
 * Nothing in this file is inferred. A value that has not been supplied by the
 * owner is `null` and the UI omits it; it is never replaced by a guess.
 */

import type { ActiveLocale } from "@/i18n/locales";

/* ── E-mail ──────────────────────────────────────────────────────────────── */

export type CorporateChannel = "sales" | "support" | "general";

/** Destination mailbox per enquiry channel. */
export const CORPORATE_EMAIL: Readonly<Record<CorporateChannel, string>> = {
  sales: "sales@hermesnovin.com",
  support: "info@hermesnovin.com",
  general: "info@zharfavira.com",
};

/* ── Telephone ───────────────────────────────────────────────────────────── */

export interface CorporatePhone {
  /** Stable key; also the structured-data identity of the line. */
  readonly key: "line1" | "line2";
  /** E.164, the only form used in `tel:` links and JSON-LD. */
  readonly e164: string;
  /** Display form per locale (Persian digits for `fa`). */
  readonly display: Readonly<Record<ActiveLocale, string>>;
}

export const CORPORATE_PHONES: readonly CorporatePhone[] = [
  {
    key: "line1",
    e164: "+982191096003",
    display: { fa: "۰۲۱ ۹۱۰۹ ۶۰۰۳", en: "021 9109 6003", de: "021 9109 6003" },
  },
  {
    key: "line2",
    e164: "+982191096005",
    display: { fa: "۰۲۱ ۹۱۰۹ ۶۰۰۵", en: "021 9109 6005", de: "021 9109 6005" },
  },
];

/* ── Registered identity ─────────────────────────────────────────────────── */

/** Latin legal name, as registered. Used for every machine-readable surface. */
export const CORPORATE_LEGAL_NAME_EN = "Zharfa Vira Pouyesh Fanavari";

export const CORPORATE_LEGAL_NAME: Readonly<Record<ActiveLocale, string>> = {
  fa: "ژرفا ویرا پویش فناوری",
  en: CORPORATE_LEGAL_NAME_EN,
  de: CORPORATE_LEGAL_NAME_EN,
};

/** Name as printed on the postal-address block of each locale. */
export const CORPORATE_ADDRESS_NAME: Readonly<Record<ActiveLocale, string>> = {
  fa: "شرکت ژرفا ویرا پویش فناوری",
  en: `${CORPORATE_LEGAL_NAME_EN} Company`,
  de: CORPORATE_LEGAL_NAME_EN,
};

export const CORPORATE_IDENTIFIERS = {
  /** شناسه ملی */
  nationalId: "14004601684",
  /** شماره ثبت */
  registrationNumber: "53236",
  postalCode: "8179679495",
} as const;

/** Persian rendering of the identifiers (display only; machine value above). */
export const CORPORATE_IDENTIFIERS_FA = {
  nationalId: "۱۴۰۰۴۶۰۱۶۸۴",
  registrationNumber: "۵۳۲۳۶",
  postalCode: "۸۱۷۹۶۷۹۴۹۵",
} as const;

export function formatIdentifier(
  key: keyof typeof CORPORATE_IDENTIFIERS,
  locale: ActiveLocale,
): string {
  return locale === "fa" ? CORPORATE_IDENTIFIERS_FA[key] : CORPORATE_IDENTIFIERS[key];
}

/**
 * Machine-readable address: Latin, locale-invariant. `streetAddress` is the
 * Latin line as supplied by the owner and is never re-translated.
 */
export const CORPORATE_ADDRESS_MACHINE = {
  streetAddress:
    "No. 9, Alley 9, Marefat St., Ostad Mehryar, Vali-Asr, Janbazan St.",
  addressLocality: "Isfahan",
  postalCode: CORPORATE_IDENTIFIERS.postalCode,
  addressCountry: "IR",
} as const;

/** Human address lines per locale (the postal-code line is built by the UI). */
export const CORPORATE_ADDRESS_LINES: Readonly<Record<ActiveLocale, readonly string[]>> = {
  fa: [
    "اصفهان، خیابان جانبازان، ولی‌عصر، استاد مهریار، معرفت، کوچه ۹، پلاک ۹",
    "ایران",
  ],
  en: ["No. 9, Alley 9, Marefat St., Ostad Mehryar, Vali-Asr, Janbazan St., Isfahan, Iran"],
  de: ["Nr. 9, Gasse 9, Marefat St., Ostad Mehryar, Vali-Asr, Janbazan St., Isfahan, Iran"],
};

/** Place of registration, per locale. */
export const CORPORATE_REGISTRY_PLACE: Readonly<Record<ActiveLocale, string>> = {
  fa: "اصفهان، ایران",
  en: "Isfahan, Iran",
  de: "Isfahan, Iran",
};

/* ── Websites and profiles ───────────────────────────────────────────────── */

export const CORPORATE_WEBSITES = {
  hermes: { url: "https://hermesnovin.com", host: "hermesnovin.com" },
  zharfa: { url: "https://zharfavira.com", host: "zharfavira.com" },
} as const;

/**
 * External profiles. `null` means "not supplied by the owner": the UI does not
 * render the link and structured data does not publish it.
 *
 * The ZHARFA company LinkedIn URL was supplied by the owner (2026-10-11); it is
 * never derived from the company name. `null` remains the way to withhold a
 * profile again.
 */
export const CORPORATE_PROFILES = {
  founderLinkedIn: "https://www.linkedin.com/in/hamid-reza-forozandeh",
  zharfaLinkedIn: "https://www.linkedin.com/company/zharfa-vira/" as string | null,
  github: "https://github.com/hermescenter1",
} as const;

/** Profile URLs that are safe to publish as `sameAs`, nulls removed. */
export function publishedProfiles<K extends "founderLinkedIn" | "zharfaLinkedIn">(
  key: K,
): readonly string[] {
  const value = CORPORATE_PROFILES[key];
  return value ? [value] : [];
}
