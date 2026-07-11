/** Central SEO configuration — Phase 62 (locale lists centralised in Phase 86B) */

import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE as CENTRAL_DEFAULT_LOCALE,
  OG_LOCALE as CENTRAL_OG_LOCALE,
  type ActiveLocale,
} from "@/i18n/locales";

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://hermesnovin.com";

export const SITE_NAME    = "Hermes OS";
export const ORG_NAME     = "Hermes Novin";

// Locale lists derive from the single source of truth so SEO and routing
// cannot drift. SEO exposes ACTIVE locales only.
export const DEFAULT_LOCALE = CENTRAL_DEFAULT_LOCALE;
export const LOCALES        = ACTIVE_LOCALES;
export type  SeoLocale      = ActiveLocale;

export const OG_IMAGE_URL   = `${BASE_URL}/brand/og-default.jpg`;
export const ORG_LOGO_URL   = `${BASE_URL}/favicon.svg`;
export const TWITTER_HANDLE = "@hermesos";
export const CONTACT_EMAIL  = "info@hermesnovin.com";

/**
 * OG locale string per locale code. Re-exported from the central source, which
 * also models inactive locales (German → de_DE) for when they go public.
 */
export const OG_LOCALE = CENTRAL_OG_LOCALE;
