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

  it("is the only way sitemap.ts builds a URL", () => {
    const src = readFileSync(join(REPO, "src", "app", "sitemap.ts"), "utf8");
    expect(src).toContain("const path = sitemapPath(rawPath);");
    // Exactly one place assembles an entry URL, and it uses the encoded path.
    expect(src.match(/url:\s*`/g)).toHaveLength(1);
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
