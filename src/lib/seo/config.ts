/** Central SEO configuration — Phase 62 */

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://hermesnovin.com";

export const SITE_NAME    = "Hermes OS";
export const ORG_NAME     = "Hermes Novin";
export const DEFAULT_LOCALE = "fa" as const;
export const LOCALES        = ["fa", "en"] as const;
export type  SeoLocale      = (typeof LOCALES)[number];

export const OG_IMAGE_URL   = `${BASE_URL}/brand/og-default.jpg`;
export const ORG_LOGO_URL   = `${BASE_URL}/favicon.svg`;
export const TWITTER_HANDLE = "@hermesos";
export const CONTACT_EMAIL  = "info@hermesnovin.com";

/** OG locale string per locale code */
export const OG_LOCALE: Record<SeoLocale, string> = {
  fa: "fa_IR",
  en: "en_US",
};
