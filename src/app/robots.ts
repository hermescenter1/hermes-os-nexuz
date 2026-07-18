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
      /* ── AI SEARCH / RETRIEVAL crawlers (PHASE 87L.6) ──────────────────────
         These index public content so the product can be FOUND and CITED in
         ChatGPT search, Claude search and Perplexity answers. They are a
         different concern from the model-TRAINING crawlers below and get the
         same growth-first policy as classic search engines: full public
         access, private/API always denied. Names follow the vendors' current
         official crawler documentation. */
      {
        userAgent: "OAI-SearchBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/", "/auth/"), "/api/"],
      },
      {
        userAgent: "Claude-SearchBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/", "/auth/"), "/api/"],
      },
      {
        // user-directed fetches from Claude on a user's explicit request
        userAgent: "Claude-User",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/", "/auth/"), "/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: localeRoots,
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      /* ── Model-TRAINING crawlers — explicit owner policy ───────────────────
         Training access is NOT required for search visibility. The standing
         owner decision (Phase 62) grants training bots the open knowledge
         surfaces only (library/services/academy); proprietary product and
         engineering content stays protected. Google-Extended and
         Applebot-Extended are robots TOKENS controlling training use of
         normally-crawled pages — same scoped policy. */
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
        userAgent: "Google-Extended",
        allow: localized("/library/", "/services/", "/academy/"),
        disallow: [...localized("/dashboard/", "/admin/"), "/api/"],
      },
      {
        userAgent: "Applebot-Extended",
        allow: localized("/library/", "/services/", "/academy/"),
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
