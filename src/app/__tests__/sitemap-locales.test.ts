import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { ACTIVE_LOCALES } from "@/i18n/locales";

describe("sitemap.ts — active locales only", () => {
  it("emits every URL under an active locale — including /de after 87L.6 activation", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const localePrefix = /^https?:\/\/[^/]+\/([a-z]{2})(\/|$)/;
    const seen = new Set<string>();
    for (const entry of entries) {
      const match = entry.url.match(localePrefix);
      expect(match, `no locale segment in ${entry.url}`).not.toBeNull();
      const loc = match![1];
      expect(ACTIVE_LOCALES).toContain(loc as (typeof ACTIVE_LOCALES)[number]);
      seen.add(loc);
    }
    expect([...seen].sort()).toEqual(["de", "en", "fa"]);
  });

  it("hreflang alternates within the sitemap use active locales only", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      const langs = entry.alternates?.languages ?? {};
      for (const key of Object.keys(langs)) {
        expect(ACTIVE_LOCALES).toContain(key as (typeof ACTIVE_LOCALES)[number]);
      }
    }
  });

  /**
   * DISCOVERY-2A — CONTRACT CHANGE, recorded deliberately.
   *
   * The assertion removed from the test above was `expect(Object.keys(langs))
   * .toContain("de")` applied to EVERY entry — i.e. every URL in the sitemap had
   * to claim a German alternate. That is a claim about the platform's locale
   * list, not about the document, and for the engineering-case corpus it is
   * false: `EngineeringCase` carries an `en` and an `fa` body and no German one,
   * so `/de/library/cases/{id}` renders the ENGLISH text under German chrome.
   *
   * It is replaced by the two invariants that are actually true, which together
   * are stricter than the original: genuinely trilingual families must still
   * carry all three, and en+fa families must carry exactly those two.
   */
  it("fully translated families still carry all three alternates", async () => {
    const entries = await sitemap();
    // Static marketing pages and the knowledge library are translated with full
    // key parity in messages/{fa,en,de}.json.
    for (const probe of ["/en/platform", "/en/library/vendor/siemens"]) {
      const entry = entries.find((e) => e.url.endsWith(probe));
      expect(entry, `${probe} must be in the sitemap`).toBeDefined();
      expect(Object.keys(entry!.alternates?.languages ?? {}).sort()).toEqual(["de", "en", "fa"]);
    }
  });

  it("en+fa families carry exactly en and fa — never a fabricated German alternate", async () => {
    const entries = await sitemap();
    const cases = entries.filter((e) => e.url.includes("/library/cases/"));
    expect(cases.length).toBeGreaterThan(0);
    for (const entry of cases) {
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual(["en", "fa"]);
      expect(entry.url).not.toContain("/de/");
    }
  });

  it("produces one entry per active locale for each static path", async () => {
    const entries = await sitemap();
    // The homepage ("") appears once per active locale.
    const homeEntries = entries.filter((e) => /\/[a-z]{2}$/.test(e.url));
    expect(homeEntries.length).toBe(ACTIVE_LOCALES.length);
  });
});
