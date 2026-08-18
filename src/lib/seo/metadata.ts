import type { Metadata } from "next";
import {
  BASE_URL,
  SITE_NAME,
  OG_IMAGE_URL,
  OG_LOCALE,
  DEFAULT_LOCALE,
  LOCALES,
  type SeoLocale,
} from "./config";

export interface BuildMetadataOptions {
  locale: string;
  /** Path relative to the locale prefix, e.g. "" | "/academy" | "/careers/job-001" */
  path: string;
  title: string;
  description: string;
  keywords?: string | string[];
  /** Disallow indexing — use for auth/dashboard/admin routes */
  noIndex?: boolean;
  ogImage?: string;
  ogType?: "website" | "article";
  /** ISO 8601 date string for Article pages */
  publishedTime?: string;
  modifiedTime?: string;
  /**
   * DISCOVERY-2A — the locales this page's CONTENT actually exists in, most
   * preferred first. See {@link resolveContentLocales} for the full contract.
   *
   * OMIT for a page whose copy comes from `messages/{fa,en,de}.json`: those are
   * genuinely trilingual and keep the historical all-locale behaviour.
   *
   * PASS for database- or file-backed records that exist in fewer languages
   * than the platform models — a Journal article (`Article.language` is EN or
   * FA and never DE), an engineering case (`cases.json` carries `en` and `fa`
   * only), a media asset (its real `MediaAssetTranslation` rows).
   */
  contentLocales?: readonly string[];
}

/**
 * The real language representations of one page, and which of them is primary.
 *
 * WHY THIS EXISTS
 * ---------------
 * `hreflang` is a factual claim: it says "an alternate representation of this
 * document exists at that URL, in that language". Deriving it from
 * `ACTIVE_LOCALES` turns it into a claim about the PLATFORM instead of about the
 * DOCUMENT, and for single-language records that claim is false — a Persian-only
 * article was advertising an English and a German version, both of which serve
 * the same Persian text under different chrome. `@/lib/seo/indexnow-lifecycle`
 * already refuses to fabricate those URLs ("German URLs are never fabricated for
 * content that has no German version"); this closes the same gap for hreflang,
 * canonical and the sitemap.
 *
 * THE RULES
 * ---------
 *  - No `contentLocales` → the page is fully translated: every active locale is
 *    a real alternate, `x-default` points at the default locale. Unchanged.
 *  - `contentLocales` given → keep only entries that are active locales, in the
 *    caller's declared preference order, de-duplicated. The FIRST survivor is
 *    the primary representation: it is the canonical target for any locale that
 *    has no representation of its own, and it is `x-default`.
 *  - Exactly one survivor → the document has no alternates at all, so NO
 *    `languages` map and NO `x-default` is emitted. A lone self-referencing
 *    hreflang entry adds no information, and a lone `x-default` claims a
 *    fallback relationship that has no second member.
 *  - Zero survivors (a record in a locale the platform does not expose) → treated
 *    as "unknown", falling back to the fully-translated behaviour rather than
 *    emitting a canonical that points nowhere.
 */
function resolveContentLocales(
  locale: string,
  contentLocales: readonly string[] | undefined,
): { canonicalLocale: string; alternates: readonly string[] | null } {
  if (contentLocales === undefined) {
    return { canonicalLocale: locale, alternates: LOCALES };
  }

  const real = contentLocales
    .map((l) => String(l).toLowerCase())
    .filter((l): l is SeoLocale => (LOCALES as readonly string[]).includes(l))
    .filter((l, i, all) => all.indexOf(l) === i);

  if (real.length === 0) {
    return { canonicalLocale: locale, alternates: LOCALES };
  }

  // A locale that genuinely has this content is its own canonical. A locale that
  // does not — /de for an English-only case — canonicalises to the primary
  // representation instead of claiming to be one.
  const canonicalLocale = real.includes(locale as SeoLocale) ? locale : real[0];

  return { canonicalLocale, alternates: real.length > 1 ? real : null };
}

/**
 * Build a complete Next.js Metadata object for any route.
 * Handles: canonical, hreflang, OG, Twitter, robots, keywords.
 */
export function buildMetadata(opts: BuildMetadataOptions): Metadata {
  const {
    locale,
    path,
    title,
    description,
    keywords,
    noIndex = false,
    ogImage = OG_IMAGE_URL,
    ogType = "website",
    publishedTime,
    modifiedTime,
    contentLocales,
  } = opts;

  const { canonicalLocale, alternates } = resolveContentLocales(locale, contentLocales);

  const canonicalUrl  = `${BASE_URL}/${canonicalLocale}${path}`;
  const keywordString = Array.isArray(keywords) ? keywords.join(", ") : keywords;

  // `null` means "this document has exactly one representation" — no languages
  // map is emitted at all, rather than a single self-referencing entry.
  let alternateLanguages: Record<string, string> | undefined;
  if (alternates !== null) {
    alternateLanguages = {};
    for (const loc of alternates) {
      alternateLanguages[loc] = `${BASE_URL}/${loc}${path}`;
    }
    // x-default names the representation to serve when no declared language
    // matches: the site default for a fully translated page, and the record's
    // own primary language otherwise.
    const xDefault = contentLocales === undefined ? DEFAULT_LOCALE : alternates[0];
    alternateLanguages["x-default"] = `${BASE_URL}/${xDefault}${path}`;
  }

  // OG locale for this page + the OG locales of all OTHER real representations.
  const ogLocale        = OG_LOCALE[locale as SeoLocale] ?? OG_LOCALE[DEFAULT_LOCALE];
  const alternateLocales = (alternates ?? [])
    .filter((loc) => loc !== locale)
    .map((loc) => OG_LOCALE[loc as SeoLocale]);

  const openGraphExtra =
    ogType === "article" && (publishedTime || modifiedTime)
      ? {
          type: "article" as const,
          publishedTime,
          modifiedTime,
        }
      : { type: ogType as "website" };

  return {
    title,
    description,
    ...(keywordString ? { keywords: keywordString } : {}),
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
      // Spread, not `languages: undefined` — the key must be ABSENT for a
      // single-representation document, not present-and-empty.
      ...(alternateLanguages ? { languages: alternateLanguages } : {}),
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: alternateLocales,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      ...openGraphExtra,
    },
    // `site`/`creator` are intentionally omitted: no X/Twitter account has been
    // verified as belonging to this organisation, and publishing an unowned
    // handle would attribute the brand to a third party. The large-image card
    // renders correctly without them.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** Minimal noindex metadata for internal/protected pages */
export function noIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}
