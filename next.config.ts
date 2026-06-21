import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",

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
