import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { ACTIVE_LOCALES } from "@/i18n/locales";
import { BASE_URL } from "@/lib/seo/config";

/**
 * PHASE 105 — Hermes Brain and Hermes Industrial Brain are TWO DISTINCT public
 * capabilities of Hermes OS.
 *
 *   /brain            → "Hermes Brain", the Industrial Knowledge Engine
 *   /industrial-brain → "Hermes Industrial Brain", alarm intelligence, signal
 *                       matrix and deterministic industrial fault analysis
 *
 * Both are deliberately public, both are self-canonical, and NEITHER redirects
 * or canonicalises to the other. An intermediate revision of this phase dropped
 * `/industrial-brain` from the sitemap on the mistaken basis that it was a
 * private workspace; it is in fact the Industrial Brain entry point linked from
 * the homepage and the public navigation. These assertions stop either page
 * from being removed, deduplicated or collapsed into the other again.
 */

describe("both Brain capabilities are advertised to crawlers", () => {
  it("lists /brain and /industrial-brain for every active locale", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const locale of ACTIVE_LOCALES) {
      expect(urls, locale).toContain(`${BASE_URL}/${locale}/brain`);
      expect(urls, locale).toContain(`${BASE_URL}/${locale}/industrial-brain`);
    }
  });

  it("treats them as separate URLs, never one canonicalised onto the other", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    const brain = urls.filter((u) => /\/(fa|en|de)\/brain$/.test(u));
    const industrial = urls.filter((u) => /\/(fa|en|de)\/industrial-brain$/.test(u));
    expect(brain).toHaveLength(ACTIVE_LOCALES.length);
    expect(industrial).toHaveLength(ACTIVE_LOCALES.length);
    for (const u of brain) expect(industrial).not.toContain(u);
  });

  it("emits no duplicate URLs anywhere in the sitemap", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("still advertises no private, admin, auth or API surface", async () => {
    for (const url of (await sitemap()).map((e) => e.url)) {
      expect(url).not.toMatch(/\/admin|\/dashboard|\/auth\/|\/api\/|\/crm|\/erp/);
      // `/engineering` is explicitly noindex and `/automation` is a protected
      // route — neither may be advertised.
      expect(url).not.toMatch(/\/(fa|en|de)\/(engineering|automation)(\/|$)/);
    }
  });
});
