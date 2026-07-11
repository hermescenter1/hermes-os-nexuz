import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/seo/config";
import { ACTIVE_LOCALES } from "@/i18n/locales";

// Locale-scoped path helpers — generated from ACTIVE_LOCALES so crawl rules
// cover exactly the public locales (never inactive ones such as German) and
// automatically extend when a locale is activated. Ordering is per-suffix then
// per-locale, matching the previously hand-written fa/en rules.

/** Root path of every active locale, e.g. ["/fa/", "/en/"]. */
const localeRoots = ACTIVE_LOCALES.map((l) => `/${l}/`);

/** Each suffix expanded across every active locale, in suffix→locale order. */
function localized(...suffixes: string[]): string[] {
  return suffixes.flatMap((s) => ACTIVE_LOCALES.map((l) => `/${l}${s}`));
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      /* ── Search engines ────────────────────────────────────────────────── */
      {
        userAgent: "Googlebot",
        allow: localeRoots,
        disallow: [
          ...localized("/dashboard/", "/admin/", "/auth/", "/candidate/"),
          "/api/",
          "/_next/",
        ],
        crawlDelay: 1,
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/brand/", ...localeRoots],
      },
      {
        userAgent: "Bingbot",
        allow: localeRoots,
        disallow: [
          ...localized("/dashboard/", "/admin/", "/auth/"),
          "/api/",
        ],
        crawlDelay: 2,
      },
      /* ── AI / LLM crawlers ─────────────────────────────────────────────── */
      {
        userAgent: "GPTBot",
        allow: localized("/library/", "/services/", "/academy/"),
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: localized("/library/", "/services/", "/academy/"),
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "Applebot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "CCBot",
        allow: localized("/library/"),
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "DuckDuckBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "YandexBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      /* ── Aggressive / privacy-invasive bots — block all ───────────────── */
      {
        userAgent: "AhrefsBot",
        disallow: ["/"],
      },
      {
        userAgent: "SemrushBot",
        disallow: ["/"],
      },
      {
        userAgent: "MJ12bot",
        disallow: ["/"],
      },
      {
        userAgent: "DotBot",
        disallow: ["/"],
      },
      {
        userAgent: "BLEXBot",
        disallow: ["/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
