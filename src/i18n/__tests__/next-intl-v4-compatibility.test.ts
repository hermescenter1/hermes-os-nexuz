/**
 * Phase 86C4B2B1D-SECURITY-3 — next-intl 3.26.3 -> 4.13.2 behavior guard.
 *
 * The migration must be invisible to users: same locales, same URLs, same
 * catalogs, same fallbacks, same cookie lifetime. This suite pins the
 * behavioral contract that the v4 upgrade is required to preserve:
 *
 *   - Locale model: ACTIVE_LOCALES ["fa","en"], SUPPORTED_LOCALES
 *     ["fa","en","de"], DEFAULT_LOCALE "fa", fa=rtl / en=ltr / de=ltr.
 *     German stays modeled but publicly INACTIVE.
 *   - Routing: locales derive from ACTIVE_LOCALES, defaultLocale "fa",
 *     localePrefix "always" (v4's default is the same, but the explicit
 *     value is part of the public URL contract).
 *   - Locale cookie: v4 removed the one-year `maxAge` from the library
 *     defaults (session cookie). Production behavior established under v3
 *     (verified in the 3.26.3 sources: name NEXT_LOCALE, maxAge 31536000,
 *     sameSite lax) is preserved via the explicit `localeCookie.maxAge` in
 *     `src/i18n/routing.ts`. Name and sameSite stay on library defaults.
 *   - Request config: awaits `requestLocale`, returns an EXPLICIT locale
 *     (mandatory in v4), loads the catalog matching that locale, and falls
 *     back to "fa" for invalid, missing, or inactive (German) requests.
 *   - Middleware: auth gating runs before intl handling and the matcher
 *     keeps excluding api/_next/_vercel/static files.
 *   - Client boundary: the locale layout keeps passing `messages`
 *     EXPLICITLY to NextIntlClientProvider (several clients read raw
 *     namespaces via useMessages(), so the full-catalog boundary is
 *     load-bearing and must not silently rely on v4 provider inheritance).
 *
 * `next-intl/server` resolves to its react-client stub under Vitest (calling
 * getRequestConfig's result there throws by design), so the module is mocked
 * as an identity wrapper — the suite thereby exercises the app's REAL request
 * callback. Fully offline and date-independent.
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import faMessages from "../../../messages/fa.json";
import enMessages from "../../../messages/en.json";
import {
  ACTIVE_LOCALES,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_DIRECTION,
  isActiveLocale,
} from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import requestConfig from "@/i18n/request";

vi.mock("next-intl/server", () => ({
  // Identity wrapper: getRequestConfig(fn) === fn, matching the real
  // react-server implementation, so the app's callback runs unwrapped.
  getRequestConfig: (factory: unknown) => factory,
}));

const ROOT = process.cwd();

function readSource(...segments: string[]): string {
  return fs.readFileSync(path.join(ROOT, ...segments), "utf8");
}

async function resolveConfig(requested: string | undefined) {
  const result = await requestConfig({
    requestLocale: Promise.resolve(requested),
  });
  return result as { locale: string; messages: Record<string, unknown> };
}

describe("next-intl v4 compatibility — locale model", () => {
  it("keeps the active/supported locale sets unchanged", () => {
    expect([...ACTIVE_LOCALES]).toEqual(["fa", "en", "de"]);
    expect([...SUPPORTED_LOCALES]).toEqual(["fa", "en", "de"]);
    expect(DEFAULT_LOCALE).toBe("fa");
  });

  it("keeps locale directions unchanged", () => {
    expect(LOCALE_DIRECTION.fa).toBe("rtl");
    expect(LOCALE_DIRECTION.en).toBe("ltr");
    expect(LOCALE_DIRECTION.de).toBe("ltr");
  });

  it("keeps German inactive", () => {
    expect(isActiveLocale("de")).toBe(true) // 87L.6: German ACTIVATED;
    expect([...routing.locales]).toContain("de") // 87L.6: German ACTIVATED;
  });
});

describe("next-intl v4 compatibility — routing configuration", () => {
  it("derives routing locales from ACTIVE_LOCALES with the same default", () => {
    expect([...routing.locales]).toEqual([...ACTIVE_LOCALES]);
    expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
  });

  it("preserves the localePrefix URL contract", () => {
    expect(routing.localePrefix).toBe("always");
  });

  it("preserves the v3 one-year locale-cookie lifetime explicitly", () => {
    // v3.26.x default: {name: NEXT_LOCALE, maxAge: 31536000, sameSite: lax}.
    // v4 dropped maxAge (session cookie); the app restores the lifetime and
    // leaves name/sameSite on the library defaults.
    expect(routing.localeCookie).toEqual({ maxAge: 31536000 });
  });
});

describe("next-intl v4 compatibility — request configuration", () => {
  it("returns an explicit active locale for every request shape", async () => {
    for (const requested of ["fa", "en", "de", "xx", undefined]) {
      const { locale } = await resolveConfig(requested);
      expect(
        isActiveLocale(locale),
        `requestLocale=${String(requested)} must resolve to an active locale`,
      ).toBe(true);
    }
  });

  it("honors active locales and loads their matching catalog", async () => {
    const fa = await resolveConfig("fa");
    expect(fa.locale).toBe("fa");
    expect(Object.keys(fa.messages)).toEqual(Object.keys(faMessages));

    const en = await resolveConfig("en");
    expect(en.locale).toBe("en");
    expect(Object.keys(en.messages)).toEqual(Object.keys(enMessages));
  });

  it("falls back to the default locale for invalid or missing locales", async () => {
    for (const requested of ["xx", "fr", undefined]) {
      const { locale, messages } = await resolveConfig(requested);
      expect(locale).toBe(DEFAULT_LOCALE);
      expect(Object.keys(messages)).toEqual(Object.keys(faMessages));
    }
  });

  it("serves German through the public request config (87L.6 activation)", async () => {
    const { locale } = await resolveConfig("de");
    expect(locale).toBe("de");
  });
});

describe("next-intl v4 compatibility — middleware contract", () => {
  const middlewareSource = readSource("src", "middleware.ts");

  it("keeps intl middleware built from the shared routing config", () => {
    expect(middlewareSource).toContain('from "next-intl/middleware"');
    expect(middlewareSource).toContain("createMiddleware(routing)");
  });

  it("keeps the matcher exclusions unchanged", () => {
    expect(middlewareSource).toContain(
      'matcher: ["/((?!api|_next|_vercel|.*\\\\..*).*)"]',
    );
  });

  it("keeps auth gating ahead of intl handling", () => {
    const authIndex = middlewareSource.indexOf("isProtectedPath(pathname)");
    const intlIndex = middlewareSource.indexOf("intlMiddleware(request)");
    expect(authIndex).toBeGreaterThan(-1);
    expect(intlIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeLessThan(intlIndex);
  });
});

describe("next-intl v4 compatibility — client provider boundary", () => {
  const layoutSource = readSource("src", "app", "[locale]", "layout.tsx");

  it("keeps passing messages explicitly instead of relying on v4 inheritance", () => {
    expect(layoutSource).toContain("const messages = await getMessages()");
    expect(layoutSource).toContain("<NextIntlClientProvider messages={messages}>");
  });

  it("keeps locale validation and request-locale pinning in the locale layout", () => {
    expect(layoutSource).toContain("notFound()");
    expect(layoutSource).toContain("setRequestLocale(locale)");
  });
});
