import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sitemapPath } from "../sitemap-path";

/**
 * Three live findings from the 2026-11 technical SEO audit of hermesnovin.com:
 *
 * 1. No response carried Strict-Transport-Security — next.config.ts said Nginx
 *    sets it, but deploys ship only the hermes-web image behind Cloudflare.
 * 2. Sitemap <loc> carried raw Persian slugs while the page's canonical carried
 *    the percent-encoded form: two strings for one document.
 * 3. Auth and dashboard tab titles that already name the brand still got the
 *    "%s | Hermes OS" template suffix ("Sign in to Hermes OS | Hermes OS").
 */

const REPO = join(__dirname, "..", "..", "..", "..");

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function configHeaders(nodeEnv: string): Promise<HeaderRule[]> {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  const { default: nextConfig } = await import("../../../../next.config");
  return (await nextConfig.headers!()) as HeaderRule[];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Strict-Transport-Security", () => {
  it("is sent on every route in production, for this host only", async () => {
    const rules = await configHeaders("production");
    const all = rules.find((r) => r.source === "/(.*)");
    const hsts = all?.headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toBe("max-age=31536000");
    // Other hostnames in the zone (mail.hermesnovin.com, …) must not be pinned,
    // and the domain is not submitted to browser preload lists.
    expect(hsts?.value).not.toMatch(/includeSubDomains/i);
    expect(hsts?.value).not.toMatch(/preload/i);
  });

  it("is not sent by a development server", async () => {
    const rules = await configHeaders("development");
    const keys = rules.flatMap((r) => r.headers.map((h) => h.key));
    expect(keys).not.toContain("Strict-Transport-Security");
    // The rest of the static security headers are unaffected.
    expect(keys).toContain("X-Content-Type-Options");
  });
});

describe("sitemapPath", () => {
  it("percent-encodes a Persian slug exactly as the page canonical does", () => {
    const path = "/articles/راهنمای-جامع-plc؛-هر-آنچه-مهندسان-برق-۲۰۲۶-mr2k5nx5k026";
    const encoded = sitemapPath(path);
    // A WHATWG URL serialises the path the same way <link rel="canonical"> does.
    expect(encoded).toBe(new URL(`https://hermesnovin.com${path}`).pathname);
    expect(encoded).toMatch(/^[\x21-\x7E]+$/);
    expect(decodeURIComponent(encoded)).toBe(path);
  });

  it("leaves ASCII paths byte-for-byte unchanged", () => {
    for (const p of ["", "/services/ot-edge", "/articles/scada-architecture-mrwbmr9cujre", "/videos/acme/intro"]) {
      expect(sitemapPath(p)).toBe(p);
    }
  });

  it("never double-encodes an already escaped sequence", () => {
    expect(sitemapPath("/articles/%D8%A7-x")).toBe("/articles/%D8%A7-x");
  });

  it("sitemap.ts builds its entry URLs only through sitemapPath", () => {
    const src = readFileSync(join(REPO, "src", "app", "sitemap.ts"), "utf8");
    expect(src).toContain("const path = sitemapPath(rawPath);");
    expect(src.match(/url:\s*`/g)).toHaveLength(1);
  });

  /*
   * The first version of this fix only covered src/app/sitemap.ts. Journal
   * articles and videos build their sitemap entries in their own modules, so
   * production still served 8 raw Persian <loc> values after it shipped. These
   * tests drive the real builders.
   */
  const PERSIAN = "/articles/راهنمای-جامع-plc؛-۲۰۲۶-mr2k5nx5k026";
  const isEscaped = (u: string) => /^[\x21-\x7E]+$/.test(u);

  it("article sitemap entries escape <loc> and every hreflang alternate", async () => {
    const { articleSitemapEntries } = await import("@/lib/articles/seo");
    const slug = PERSIAN.slice("/articles/".length);
    const one = articleSitemapEntries([{ slug, lastModified: null, languages: ["fa"] }]);
    expect(one).toHaveLength(1);
    expect(one[0].url).toBe(`https://hermesnovin.com/fa${new URL(`https://x${PERSIAN}`).pathname}`);
    const group = articleSitemapEntries([{ slug, lastModified: null, languages: ["fa", "en"] }]);
    for (const entry of group) {
      expect(isEscaped(entry.url)).toBe(true);
      for (const alt of Object.values(entry.alternates?.languages ?? {})) {
        expect(isEscaped(String(alt))).toBe(true);
      }
    }
  });

  it("media sitemap entries escape <loc> and every hreflang alternate", async () => {
    const { mediaSitemapEntries } = await import("@/lib/media/seo");
    const entries = mediaSitemapEntries([
      { path: "/videos/acme/راه-اندازی-plc", lastModified: null, contentLocales: ["fa", "en"] },
    ] as Parameters<typeof mediaSitemapEntries>[0]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(isEscaped(entry.url)).toBe(true);
      expect(decodeURIComponent(entry.url)).toContain("/videos/acme/راه-اندازی-plc");
      for (const alt of Object.values(entry.alternates?.languages ?? {})) {
        expect(isEscaped(String(alt))).toBe(true);
      }
    }
  });
});

describe("brand-carrying auth and dashboard titles skip the template suffix", () => {
  const FILES = [
    "auth/accept-invite/page.tsx",
    "auth/forgot-password/page.tsx",
    "auth/login/page.tsx",
    "auth/register/page.tsx",
    "auth/reset-password/page.tsx",
    "auth/verify-email/page.tsx",
    "dashboard/ats/layout.tsx",
    "dashboard/customers/layout.tsx",
  ];

  it.each(FILES)("%s passes its title through documentTitle()", (rel) => {
    const src = readFileSync(join(REPO, "src", "app", "[locale]", ...rel.split("/")), "utf8");
    expect(src).toMatch(/title:\s*documentTitle\(t\("\w+"\)\)/);
    expect(src).toContain('import { documentTitle } from "@/lib/seo/metadata";');
  });

  it("the login title renders the brand once", async () => {
    vi.resetModules();
    vi.doMock("next-intl/server", () => ({
      getTranslations: async () => (key: string) => (key === "loginTitle" ? "Sign in to Hermes OS" : key),
      setRequestLocale: () => {},
    }));
    vi.doMock("@/components/auth-experience", () => ({ AuthExperienceShell: () => null }));
    vi.doMock("@/components/auth/NewLoginClient", () => ({ NewLoginClient: () => null }));
    vi.doMock("@/i18n/navigation", () => ({ Link: () => null }));
    const { generateMetadata } = await import("@/app/[locale]/auth/login/page");
    const meta = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(meta.title).toEqual({ absolute: "Sign in to Hermes OS" });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
