import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  isProtectedPath,
  isAuthorizedForPath,
  getRoleFromRequestSync,
} from "./lib/auth/rbac";

const intlMiddleware = createMiddleware(routing);

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Auth protection — sync decode JWT (edge-safe, no DB round-trip)
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

  return intlMiddleware(request) as NextResponse;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
