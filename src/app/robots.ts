import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/seo/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      /* ── Search engines ────────────────────────────────────────────────── */
      {
        userAgent: "Googlebot",
        allow: ["/fa/", "/en/"],
        disallow: [
          "/fa/dashboard/",
          "/en/dashboard/",
          "/fa/admin/",
          "/en/admin/",
          "/fa/auth/",
          "/en/auth/",
          "/fa/candidate/",
          "/en/candidate/",
          "/api/",
          "/_next/",
        ],
        crawlDelay: 1,
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/brand/", "/fa/", "/en/"],
      },
      {
        userAgent: "Bingbot",
        allow: ["/fa/", "/en/"],
        disallow: [
          "/fa/dashboard/",
          "/en/dashboard/",
          "/fa/admin/",
          "/en/admin/",
          "/fa/auth/",
          "/en/auth/",
          "/api/",
        ],
        crawlDelay: 2,
      },
      /* ── AI / LLM crawlers ─────────────────────────────────────────────── */
      {
        userAgent: "GPTBot",
        allow: ["/fa/library/", "/en/library/", "/fa/services/", "/en/services/", "/fa/academy/", "/en/academy/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/fa/library/", "/en/library/", "/fa/services/", "/en/services/", "/fa/academy/", "/en/academy/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/fa/", "/en/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "Applebot",
        allow: ["/fa/", "/en/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "CCBot",
        allow: ["/fa/library/", "/en/library/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "DuckDuckBot",
        allow: ["/fa/", "/en/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
      },
      {
        userAgent: "YandexBot",
        allow: ["/fa/", "/en/"],
        disallow: ["/fa/dashboard/", "/en/dashboard/", "/fa/admin/", "/en/admin/", "/api/"],
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
