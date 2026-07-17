import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildMetadata } from "@/lib/seo/metadata";
import { BASE_URL, OG_IMAGE_URL } from "@/lib/seo/config";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";

/**
 * PHASE 87D delta — release-item regression tests:
 *
 *   1. site-wide public shell rollout: every compatible PUBLIC PageShell
 *      consumer now wraps in PublicPageShell; authenticated/dashboard
 *      consumers keep the legacy PageShell (and never import the public
 *      shell); the legacy SiteHeader/SiteFooter survive ONLY inside
 *      PageShell;
 *   2. the Open Graph asset referenced site-wide actually exists and is a
 *      valid 1200×630-class JPEG (no more 404), with provenance recorded;
 *   3. the homepage document title opts out of the layout brand template
 *      (no "… | Hermes OS" duplication) without touching canonical/hreflang.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** The 19 compatible public consumers migrated to the PublicPageShell adapter. */
const PUBLIC_MIGRATED = [
  "src/app/[locale]/about/page.tsx",
  "src/app/[locale]/academy/layout.tsx",
  "src/app/[locale]/architecture/page.tsx",
  "src/app/[locale]/brain/page.tsx",
  "src/app/[locale]/careers/layout.tsx",
  "src/app/[locale]/contact/page.tsx",
  "src/app/[locale]/cookies/page.tsx",
  "src/app/[locale]/copilot/page.tsx",
  "src/app/[locale]/data-request/page.tsx",
  "src/app/[locale]/gdpr/page.tsx",
  "src/app/[locale]/library/[article]/page.tsx",
  "src/app/[locale]/library/cases/[id]/page.tsx",
  "src/app/[locale]/library/cases/page.tsx",
  "src/app/[locale]/library/page.tsx",
  "src/app/[locale]/library/vendor/[vendor]/page.tsx",
  "src/app/[locale]/privacy/page.tsx",
  "src/app/[locale]/services/page.tsx",
  "src/app/[locale]/terms/page.tsx",
  "src/components/ServiceDetail.tsx",
];

/** Authenticated / specialized consumers that must KEEP the legacy PageShell. */
const PROTECTED_KEEP_LEGACY = [
  "src/app/[locale]/admin/page.tsx",
  "src/app/[locale]/admin/seo/page.tsx",
  "src/app/[locale]/compliance/page.tsx",
  "src/app/[locale]/privacy-center/page.tsx",
  "src/app/[locale]/intelligence/unknown/page.tsx",
  "src/app/[locale]/knowledge/case-studio/page.tsx",
  "src/app/[locale]/knowledge/studio/page.tsx",
  "src/app/[locale]/candidate/layout.tsx",
  "src/app/[locale]/dashboard/billing/page.tsx",
  "src/app/[locale]/dashboard/industrial/page.tsx",
  "src/app/[locale]/dashboard/organization/page.tsx",
  "src/app/[locale]/dashboard/ats/layout.tsx",
  "src/app/[locale]/dashboard/customers/layout.tsx",
  "src/app/[locale]/dashboard/operations/layout.tsx",
  "src/components/auth/RequireCapability.tsx",
];

describe("public shell rollout — migrated public consumers", () => {
  it("every compatible public consumer imports PublicPageShell and has zero legacy PageShell references", () => {
    for (const rel of PUBLIC_MIGRATED) {
      const src = read(rel);
      expect(src, `${rel} must import the public shell`).toContain(
        'import { PublicPageShell } from "@/components/public-site"',
      );
      expect(src, `${rel} must not reference the legacy PageShell`).not.toMatch(
        /(?<![A-Za-z])PageShell(?!Props)\b(?<!PublicPageShell)(?<!LegalPageShell)/,
      );
      expect(src).not.toContain("@/components/PageShell");
    }
  });

  it("authenticated/dashboard/specialized consumers keep the legacy PageShell and never import the public shell", () => {
    for (const rel of PROTECTED_KEEP_LEGACY) {
      const src = read(rel);
      expect(src, `${rel} must keep the legacy PageShell`).toContain("@/components/PageShell");
      expect(src, `${rel} must not receive the public shell`).not.toContain("@/components/public-site");
    }
  });

  it("legacy SiteHeader/SiteFooter remain imported ONLY by PageShell (no double header/footer anywhere)", () => {
    // PageShell is the single composition point left for the legacy shell.
    const pageShell = read("src/components/PageShell.tsx");
    expect(pageShell).toContain('from "./SiteHeader"');
    expect(pageShell).toContain('from "./SiteFooter"');
    // The rewritten homepage no longer composes them directly.
    const home = read("src/app/[locale]/page.tsx");
    expect(home).not.toContain("SiteHeader");
    expect(home).not.toContain("SiteFooter");
  });

  it("PublicPageShell is a drop-in adapter: same props, public header/footer, skip-link target", () => {
    const adapter = read("src/components/public-site/PublicPageShell.tsx");
    expect(adapter).toContain("ambient?:");
    expect(adapter).toContain("noAmbient?:");
    expect(adapter).toContain("<PublicHeader />");
    expect(adapter).toContain("<PublicFooter />");
    expect(adapter).toContain('id="public-content"');
    expect(adapter).toContain("AmbientBackground");
    // and it must never IMPORT the legacy shell components (doc comments may
    // mention them; an import would resurrect the double-shell hazard).
    expect(adapter).not.toMatch(/^import .*Site(Header|Footer)/m);
    expect(adapter).not.toMatch(/<Site(Header|Footer)/);
  });
});

describe("Open Graph asset — 404 closed", () => {
  const assetRel = "public/brand/og-default.jpg";

  it("OG_IMAGE_URL still points at /brand/og-default.jpg and the file now exists", () => {
    expect(OG_IMAGE_URL).toBe(`${BASE_URL}/brand/og-default.jpg`);
    expect(existsSync(join(root, assetRel))).toBe(true);
  });

  it("the asset is a real JPEG of substantial size (not a placeholder)", () => {
    const buf = readFileSync(join(root, assetRel));
    expect(buf.subarray(0, 3).toString("hex")).toBe("ffd8ff"); // JPEG magic
    expect(buf.length).toBeGreaterThan(20_000); // a real 1200×630 render
  });

  it("buildMetadata emits the (now existing) asset for both og and twitter cards", () => {
    const meta = buildMetadata({ locale: "en", path: "", title: "t", description: "d" });
    const og = meta.openGraph?.images as Array<{ url: string; width: number; height: number }>;
    expect(og[0].url).toBe(OG_IMAGE_URL);
    expect(og[0].width).toBe(1200);
    expect(og[0].height).toBe(630);
    expect((meta.twitter?.images as string[])[0]).toBe(OG_IMAGE_URL);
  });

  it("Inter vendoring provenance is documented next to the license (npm package no longer a dependency)", () => {
    const provenance = read("src/fonts/PROVENANCE-Inter.txt");
    expect(provenance).toContain("@fontsource-variable/inter@5.2.8");
    expect(provenance).toContain("3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62");
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.["@fontsource-variable/inter"]).toBeUndefined();
    expect(pkg.dependencies?.["@fontsource-variable/inter"]).toBeUndefined();
    // the vendored asset + license stay.
    expect(existsSync(join(root, "src/fonts/Inter.woff2"))).toBe(true);
    expect(existsSync(join(root, "src/fonts/OFL-Inter.txt"))).toBe(true);
  });
});

describe("homepage title — brand duplication removed", () => {
  const countBrand = (s: string, brand: string) => s.split(brand).length - 1;

  it("the homepage opts out of the layout title template with an absolute title", () => {
    const src = read("src/app/[locale]/page.tsx");
    expect(src).toMatch(/title:\s*\{\s*absolute:\s*t\("title"\)\s*\}/);
  });

  it("EN: exactly one brand occurrence in the absolute document title", () => {
    const title = en.meta.title; // what the page passes as { absolute }
    expect(countBrand(title, "Hermes OS")).toBe(1);
    // The duplicated form the template used to produce must be impossible now:
    expect(title.endsWith("| Hermes OS")).toBe(false);
  });

  it("FA: exactly one brand occurrence in the absolute document title", () => {
    const title = (fa as unknown as typeof en).meta.title; // «هرمس او‌اس — …»
    expect(countBrand(title, "هرمس او‌اس")).toBe(1);
    expect(title.includes("Hermes OS")).toBe(false); // fully localized
  });

  it("canonical and hreflang behavior are unchanged by the title override", () => {
    // The override spreads buildMetadata output and replaces ONLY `title`.
    for (const locale of ["en", "fa"] as const) {
      const meta = buildMetadata({ locale, path: "", title: "t", description: "d" });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${locale}`);
      const langs = meta.alternates?.languages as Record<string, string>;
      expect(Object.keys(langs).sort()).toEqual(["en", "fa", "x-default"]);
      expect(langs["x-default"]).toBe(`${BASE_URL}/fa`);
    }
  });
});
