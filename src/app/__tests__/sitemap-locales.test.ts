import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { ACTIVE_LOCALES } from "@/i18n/locales";

describe("sitemap.ts — active locales only", () => {
  it("emits every URL under an active locale and none under /de", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const localePrefix = /^https?:\/\/[^/]+\/([a-z]{2})(\/|$)/;
    for (const entry of entries) {
      const match = entry.url.match(localePrefix);
      expect(match, `no locale segment in ${entry.url}`).not.toBeNull();
      const loc = match![1];
      expect(ACTIVE_LOCALES).toContain(loc as (typeof ACTIVE_LOCALES)[number]);
      expect(loc).not.toBe("de");
    }
  });

  it("hreflang alternates within the sitemap use active locales only", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      const langs = entry.alternates?.languages ?? {};
      for (const key of Object.keys(langs)) {
        expect(ACTIVE_LOCALES).toContain(key as (typeof ACTIVE_LOCALES)[number]);
      }
      expect(Object.keys(langs)).not.toContain("de");
    }
  });

  it("produces one entry per active locale for each static path", async () => {
    const entries = await sitemap();
    // The homepage ("") appears once per active locale.
    const homeEntries = entries.filter((e) => /\/[a-z]{2}$/.test(e.url));
    expect(homeEntries.length).toBe(ACTIVE_LOCALES.length);
  });
});
