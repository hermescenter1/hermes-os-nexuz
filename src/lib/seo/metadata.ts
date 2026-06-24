import type { Metadata } from "next";
import {
  BASE_URL,
  SITE_NAME,
  OG_IMAGE_URL,
  OG_LOCALE,
  TWITTER_HANDLE,
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
  } = opts;

  const canonicalUrl  = `${BASE_URL}/${locale}${path}`;
  const keywordString = Array.isArray(keywords) ? keywords.join(", ") : keywords;

  const alternateLanguages: Record<string, string> = {};
  for (const loc of LOCALES) {
    alternateLanguages[loc] = `${BASE_URL}/${loc}${path}`;
  }
  alternateLanguages["x-default"] = `${BASE_URL}/${DEFAULT_LOCALE}${path}`;

  const altLocale = locale === "fa" ? "en_US" : "fa_IR";

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
      languages: alternateLanguages,
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale as SeoLocale] ?? "en_US",
      alternateLocale: [altLocale],
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      ...openGraphExtra,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
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
