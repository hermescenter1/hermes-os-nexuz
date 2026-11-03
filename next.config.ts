import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",

  // Do not advertise the framework in an `X-Powered-By` response header.
  poweredByHeader: false,

  // Render <title>, canonical and hreflang inside <head> for EVERY user agent.
  // Next 15 streams metadata into <body> unless the UA matches its
  // "HTML-limited bots" list, and that list does not contain Googlebot itself
  // (only Google-InspectionTool, AdsBot-Google, ...). Googlebot therefore read
  // a canonical outside <head>, which Google ignores: Search Console reported
  // the /fa pages as "Duplicate without user-selected canonical" while URL
  // Inspection — served blocking metadata — looked correct. AI crawlers such
  // as OAI-SearchBot, which do not run JavaScript, got the same body markup.
  // Matching every UA turns metadata streaming off.
  htmlLimitedBots: /.*/,

  // Trailing slash: Next.js default is false (no trailing slash).
  // Explicit declaration ensures consistent canonical URL generation.
  trailingSlash: false,

  // URL normalization redirects (Phase 62; extended by DISCOVERY-2A).
  // Handles canonical redirect for bare domain root → default locale.
  async redirects() {
    return [
      // Redirect bare root to the default Persian locale
      {
        source:      "/",
        destination: "/fa",
        permanent:   true,
      },

      /* ── DISCOVERY-2A — legacy Video Hub URLs ────────────────────────────────
         The public media contract moved the organization selector out of the
         query string and into the path, because `MediaAsset` is unique on
         `(organizationId, slug)` and a canonical URL must not depend on a query
         parameter. `?org=` was the only shape that ever resolved, so every link
         shared or bookmarked before this phase uses it; both forms are kept
         alive with a permanent redirect rather than being allowed to rot.

         The named capture in `has.value` is what makes `:org` available in the
         destination. Each destination carries one more path segment than its
         source, so neither rule can match its own output — no redirect loop. */
      {
        source: "/:locale(fa|en|de)/videos/:slug",
        has: [
          { type: "query", key: "org", value: "(?<org>[a-z0-9]+(?:-[a-z0-9]+)*)" },
        ],
        destination: "/:locale/videos/:org/:slug",
        permanent: true,
      },
      {
        source: "/:locale(fa|en|de)/videos",
        has: [
          { type: "query", key: "org", value: "(?<org>[a-z0-9]+(?:-[a-z0-9]+)*)" },
        ],
        destination: "/:locale/videos/:org",
        permanent: true,
      },
    ];
  },

  // Static security headers applied to all routes (Phase 45).
  // CSP is handled per-request in middleware (nonce-based) and is NOT set here.
  // HSTS is set exclusively by Nginx (deploy/nginx/default.conf HTTPS block)
  // to avoid sending it over HTTP during ACME challenges.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key:   "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key:   "X-Frame-Options",
            value: "DENY",
          },
          {
            key:   "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key:   "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
              "serial=()",
              "bluetooth=()",
            ].join(", "),
          },
          {
            key:   "X-DNS-Prefetch-Control",
            value: "off",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
