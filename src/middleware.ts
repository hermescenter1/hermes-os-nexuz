import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import type { ActiveLocale } from "./i18n/locales";
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
const GA_CONNECT_DOMAINS = HAS_ANALYTICS ? " https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com" : "";
const GA_IMG_DOMAINS     = HAS_ANALYTICS ? " https://www.google-analytics.com https://www.googletagmanager.com" : "";

/**
 * eNAMAD trust seal (public footer). The badge is served from the registrar's
 * own endpoint and must be requested directly, so it needs an explicit img-src
 * entry — `img-src 'self' data:` alone blocks it.
 *
 * Deliberately narrow: exact host, https only, no wildcard, and img-src ONLY.
 * The seal needs no script, frame, style or connect access, so no other
 * directive is relaxed. Unconditional (not env-gated) because the seal is
 * always rendered in the public footer.
 */
const ENAMAD_IMG_DOMAIN  = " https://trustseal.enamad.ir";
/**
 * SaaSHub "Approved" trust badge (public footer). The badge image is served
 * from SaaSHub's own CDN, so it needs an explicit img-src entry — the badge
 * requires no script, frame, style or connect access, so no other directive is
 * relaxed. Deliberately narrow: exact host, https only, no wildcard.
 */
const SAASHUB_IMG_DOMAIN = " https://cdn-b.saashub.com";
/**
 * PHASE 103 — Hermes Live Voice Intelligence (Industrial Copilot voice panel).
 *
 * The transcription leg is a WebRTC connection the BROWSER opens directly to the
 * provider using a short-lived, transcription-only credential the server mints.
 * `connect-src 'self'` blocks both the SDP exchange and the media connection, so
 * the panel cannot work without this entry.
 *
 * GATED ON THE SAME KILL SWITCH AS THE FEATURE ITSELF. With
 * HERMES_EXTERNAL_AI_ENABLED unset — the default, and the state this phase ships
 * in — the production Content-Security-Policy is byte-for-byte what it was
 * before Phase 103. Turning the feature on is one deliberate decision that moves
 * the API surface and the CSP together; there is no window in which the policy
 * is relaxed for a capability that is switched off.
 *
 * Deliberately narrow: exact host, https only, no wildcard, and connect-src
 * ONLY. The provider needs no script, frame, style or image access here.
 */
const VOICE_AI_ENABLED =
  ["1", "true", "on", "yes"].includes((process.env.HERMES_EXTERNAL_AI_ENABLED ?? "").trim().toLowerCase());
const VOICE_CONNECT_DOMAINS = VOICE_AI_ENABLED ? " https://api.openai.com" : "";

const PROVENEXPERT_SCRIPT_DOMAIN = " https://s.provenexpert.net";
const PROVENEXPERT_CONNECT_DOMAINS = " https://s.provenexpert.net https://www.provenexpert.com https://d.provenexpert.net";
const PROVENEXPERT_IMG_DOMAINS = " https://s.provenexpert.net https://www.provenexpert.com";
const PROVENEXPERT_FRAME_DOMAINS = " https://s.provenexpert.net https://www.provenexpert.com";

function buildCSP(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${GA_SCRIPT_DOMAINS}${PROVENEXPERT_SCRIPT_DOMAIN}${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${GA_IMG_DOMAINS}${ENAMAD_IMG_DOMAIN}${SAASHUB_IMG_DOMAIN}${PROVENEXPERT_IMG_DOMAINS}`,
    // data: is required because the official ProvenExpert widget embeds its
    // WOFF2 fonts as data: URLs inside its stylesheet.
    "font-src 'self' data:",
    // ws: is needed for webpack HMR WebSocket in development
    `connect-src 'self'${GA_CONNECT_DOMAINS}${PROVENEXPERT_CONNECT_DOMAINS}${VOICE_CONNECT_DOMAINS}${dev ? " ws://localhost:3000 ws://localhost:*" : ""}`,
    `frame-src 'self'${PROVENEXPERT_FRAME_DOMAINS}`,
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
      const locale   = routing.locales.includes(segments[0] as ActiveLocale)
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
  // headers() and so Next.js can inject it into RSC streaming script tags.
  // Next.js only auto-applies the nonce to framework/RSC inline scripts when
  // it can parse it from a content-security-policy REQUEST header, so the
  // full CSP is set on the request headers as well as on the response below.
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);

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
