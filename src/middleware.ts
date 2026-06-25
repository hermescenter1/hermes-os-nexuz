import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  isProtectedPath,
  isAuthorizedForPath,
  getRoleFromRequestSync,
} from "./lib/auth/rbac";

const intlMiddleware = createMiddleware(routing);

// CSP policy applied to every HTML page response (Phase 45).
// script-src uses per-request nonce so Next.js RSC inline scripts are allowed
// without 'unsafe-inline'. style-src 'unsafe-inline' is required because
// inline styles cannot be hashed (Framer Motion and CSS-in-JS patterns inject
// them at runtime).
// In development, webpack uses eval-based source maps which require
// 'unsafe-eval'. Production builds use non-eval source maps so this is
// omitted there for maximum CSP strictness.
// Phase 63: When analytics env vars are set, Google domains are added to the
// allowlist so GA4/GTM scripts can load. If no analytics vars are configured
// the CSP remains maximally strict.
// GA_MEASUREMENT_ID (no NEXT_PUBLIC_ prefix) is read at module-init time from
// the runtime process.env — webpack does NOT inline non-NEXT_PUBLIC_ vars,
// so this correctly reflects the value injected via docker-compose env_file.
const GA_ID  = process.env.GA_MEASUREMENT_ID  ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GTM_ID = process.env.GTM_ID             ?? process.env.NEXT_PUBLIC_GTM_ID;
const HAS_ANALYTICS = Boolean(GA_ID || GTM_ID);

const GA_SCRIPT_DOMAINS  = HAS_ANALYTICS ? " https://www.googletagmanager.com https://www.google-analytics.com" : "";
const GA_CONNECT_DOMAINS = HAS_ANALYTICS ? " https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com" : "";
const GA_IMG_DOMAINS     = HAS_ANALYTICS ? " https://www.google-analytics.com https://www.googletagmanager.com" : "";

function buildCSP(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${GA_SCRIPT_DOMAINS}${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${GA_IMG_DOMAINS}`,
    "font-src 'self'",
    // ws: is needed for webpack HMR WebSocket in development
    `connect-src 'self'${GA_CONNECT_DOMAINS}${dev ? " ws://localhost:3000 ws://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Auth protection — sync JWT decode (edge-safe, no DB round-trip)
  if (isProtectedPath(pathname)) {
    const role = getRoleFromRequestSync(request);
    if (!role || !isAuthorizedForPath(role, pathname)) {
      const segments = pathname.split("/").filter(Boolean);
      const locale   = routing.locales.includes(segments[0] as "fa" | "en")
        ? segments[0]
        : routing.defaultLocale;
      const loginUrl = new URL(`/${locale}/auth/login`, request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl) as NextResponse;
    }
  }

  // Run intl middleware for locale detection, redirects, and locale cookies
  const intlResponse = intlMiddleware(request) as NextResponse;

  // Locale redirects do not need CSP — return them as-is
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // Generate per-request nonce (edge-safe: crypto.randomUUID() is part of the
  // Web Crypto API available in all Next.js runtimes)
  const nonce = btoa(crypto.randomUUID());
  const csp   = buildCSP(nonce);

  // Propagate nonce in request headers so Server Components can read it via
  // headers() and so Next.js can inject it into RSC streaming script tags
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);

  // NextResponse.next with modified request headers ensures the nonce reaches
  // the rendering context for RSC inline script nonce injection
  const response = NextResponse.next({ request: { headers: reqHeaders } });

  // Copy locale-related headers/cookies from intl middleware
  intlResponse.headers.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk !== "content-security-policy") {
      response.headers.append(key, value);
    }
  });

  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
