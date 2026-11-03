import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Two canonical signals Googlebot was not receiving (Search Console, 2026-11:
 * 68 /fa pages "Duplicate without user-selected canonical", 42 unprefixed
 * URLs still indexed).
 *
 * 1. Next 15 streams metadata into <body> for any user agent outside its
 *    "HTML-limited bots" list, and plain Googlebot is not on it — so the
 *    canonical and hreflang links Googlebot fetched sat outside <head>.
 * 2. next-intl redirects an unprefixed path with a TEMPORARY 307, which keeps
 *    the source URL canonical in Google's eyes.
 */

const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const OAI_SEARCHBOT =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

describe("metadata is rendered in <head> for every user agent", () => {
  it("htmlLimitedBots matches Googlebot, AI search crawlers and browsers", async () => {
    const { default: nextConfig } = await import("../../../../next.config");
    const re = nextConfig.htmlLimitedBots;
    expect(re).toBeInstanceOf(RegExp);
    for (const ua of [GOOGLEBOT, OAI_SEARCHBOT, BROWSER]) {
      expect(re!.test(ua), ua).toBe(true);
    }
  });

  it("Next's own streaming decision turns streaming off for Googlebot under this config", async () => {
    const { default: nextConfig } = await import("../../../../next.config");
    const { shouldServeStreamingMetadata } = await import("next/dist/server/lib/streaming-metadata");
    // Next serialises the RegExp to its source before calling this.
    const configured = nextConfig.htmlLimitedBots!.source;
    expect(shouldServeStreamingMetadata(GOOGLEBOT, configured)).toBe(false);
    // The defect being fixed: the framework default streams for Googlebot.
    expect(shouldServeStreamingMetadata(GOOGLEBOT, undefined)).toBe(true);
  });
});

// Stand-in for next-intl: a 307 to the default locale for any unprefixed path,
// pass-through otherwise — the shape the real middleware returns.
vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) => {
    const { pathname } = request.nextUrl;
    if (!/^\/(fa|en|de)(\/|$)/.test(pathname)) {
      const response = NextResponse.redirect(new URL(`/fa${pathname}`, request.url), 307);
      response.cookies.set("NEXT_LOCALE", "fa");
      return response;
    }
    if (pathname === "/fa/legacy-temporary") {
      return NextResponse.redirect(new URL("/fa/elsewhere", request.url), 307);
    }
    return NextResponse.next();
  },
}));

const { middleware } = await import("@/middleware");

const req = (path: string) => new NextRequest(new URL(path, "https://hermesnovin.com"));

describe("unprefixed locale redirects are permanent", () => {
  it.each(["/services/plc", "/platform", "/EN/platform", "/library/cases/case-siemens-1200-bf"])(
    "%s → 308 to the locale-prefixed URL",
    async (path) => {
      const res = await middleware(req(path));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe(`https://hermesnovin.com/fa${path}`);
    },
  );

  it("keeps the locale cookie next-intl set on the redirect", async () => {
    const res = await middleware(req("/services/plc"));
    expect(res.headers.get("set-cookie")).toContain("NEXT_LOCALE=fa");
  });

  it("leaves a redirect that starts from a locale-prefixed path untouched", async () => {
    const res = await middleware(req("/fa/legacy-temporary"));
    expect(res.status).toBe(307);
  });

  it("does not turn the anonymous login redirect permanent", async () => {
    const res = await middleware(req("/fa/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/fa/auth/login");
  });
});
