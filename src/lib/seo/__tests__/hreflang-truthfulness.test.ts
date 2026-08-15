import { describe, expect, it } from "vitest";
import { buildMetadata } from "../metadata";
import { BASE_URL, DEFAULT_LOCALE, LOCALES } from "../config";
import { articleSitemapEntries } from "@/lib/articles/seo";
import { mediaSitemapEntries } from "@/lib/media/seo";
import { CASE_CONTENT_LOCALES } from "@/lib/industrial/cases";

/**
 * DISCOVERY-2A — CASE D.
 *
 * `hreflang` is a factual claim: "an alternate representation of this document
 * exists at that URL, in that language". Deriving it from `ACTIVE_LOCALES` made
 * it a claim about the PLATFORM instead of about the DOCUMENT — and for
 * single-language records that claim was simply false. A Persian-only Journal
 * article advertised an English and a German version; both URLs served the same
 * Persian text under different chrome, and `ArtLanguage` has no DE member, so
 * one of them could never exist at all.
 *
 * These tests state the contract in both directions: genuinely translated pages
 * keep all three alternates, and single-language records get none.
 */

function languages(meta: ReturnType<typeof buildMetadata>): Record<string, string> | undefined {
  return meta.alternates?.languages as Record<string, string> | undefined;
}

describe("D1 — fully translated pages are unchanged", () => {
  it.each(LOCALES)("a static page under /%s keeps every active alternate plus x-default", (locale) => {
    const meta = buildMetadata({
      locale,
      path: "/platform",
      title: "t",
      description: "d",
    });

    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/${locale}/platform`);
    const langs = languages(meta)!;
    for (const l of LOCALES) {
      expect(langs[l]).toBe(`${BASE_URL}/${l}/platform`);
    }
    expect(langs["x-default"]).toBe(`${BASE_URL}/${DEFAULT_LOCALE}/platform`);
    expect(Object.keys(langs)).toHaveLength(LOCALES.length + 1);
  });
});

describe("D2 — single-language content cannot fabricate alternates", () => {
  it("an FA-only article emits no EN or DE alternate", () => {
    for (const requested of LOCALES) {
      const meta = buildMetadata({
        locale: requested,
        path: "/articles/plc-alarm-flood",
        title: "t",
        description: "d",
        contentLocales: ["fa"],
      });
      // Every locale prefix collapses onto the one real representation.
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/fa/articles/plc-alarm-flood`);
      expect(languages(meta)).toBeUndefined();
      expect(JSON.stringify(meta)).not.toContain("/en/articles/plc-alarm-flood");
      expect(JSON.stringify(meta)).not.toContain("/de/articles/plc-alarm-flood");
    }
  });

  it("an EN-only article emits no FA or DE alternate", () => {
    for (const requested of LOCALES) {
      const meta = buildMetadata({
        locale: requested,
        path: "/articles/opc-ua-primer",
        title: "t",
        description: "d",
        contentLocales: ["en"],
      });
      expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/articles/opc-ua-primer`);
      expect(languages(meta)).toBeUndefined();
      expect(JSON.stringify(meta)).not.toContain("/fa/articles/opc-ua-primer");
      expect(JSON.stringify(meta)).not.toContain("/de/articles/opc-ua-primer");
    }
  });

  it("a single-representation document gets no x-default either", () => {
    // x-default names the fallback among SEVERAL declared languages. With one
    // representation there is nothing to fall back from.
    const meta = buildMetadata({
      locale: "de",
      path: "/articles/x",
      title: "t",
      description: "d",
      contentLocales: ["en"],
    });
    expect(JSON.stringify(meta)).not.toContain("x-default");
  });

  it("OpenGraph alternateLocale follows the same truth", () => {
    const meta = buildMetadata({
      locale: "fa",
      path: "/articles/x",
      title: "t",
      description: "d",
      contentLocales: ["fa"],
    });
    expect(meta.openGraph?.alternateLocale).toEqual([]);
  });
});

describe("D3 — partially translated content declares exactly what exists", () => {
  it("an en+fa record declares two alternates and x-default on the primary", () => {
    const meta = buildMetadata({
      locale: "fa",
      path: "/library/cases/case-abb-acs580-oc",
      title: "t",
      description: "d",
      contentLocales: CASE_CONTENT_LOCALES,
    });
    const langs = languages(meta)!;
    expect(Object.keys(langs).sort()).toEqual(["en", "fa", "x-default"]);
    // `CASE_CONTENT_LOCALES` leads with "en", so en is the fallback.
    expect(langs["x-default"]).toBe(`${BASE_URL}/en/library/cases/case-abb-acs580-oc`);
    // fa genuinely exists, so /fa is its own canonical.
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/fa/library/cases/case-abb-acs580-oc`);
  });

  it("a locale with NO representation canonicalises to the primary one", () => {
    // /de serves the ENGLISH case body under German chrome, so it is not a
    // German representation and must not claim to be one.
    const meta = buildMetadata({
      locale: "de",
      path: "/library/cases/case-abb-acs580-oc",
      title: "t",
      description: "d",
      contentLocales: CASE_CONTENT_LOCALES,
    });
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/library/cases/case-abb-acs580-oc`);
    expect(languages(meta)!.de).toBeUndefined();
  });
});

describe("D4 — defensive behaviour", () => {
  it("an unknown or inactive content locale falls back rather than minting a dead canonical", () => {
    const meta = buildMetadata({
      locale: "en",
      path: "/x",
      title: "t",
      description: "d",
      contentLocales: ["pt"],
    });
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/x`);
    expect(Object.keys(languages(meta)!)).toHaveLength(LOCALES.length + 1);
  });

  it("duplicate entries are collapsed", () => {
    const meta = buildMetadata({
      locale: "fa",
      path: "/x",
      title: "t",
      description: "d",
      contentLocales: ["fa", "fa"],
    });
    expect(languages(meta)).toBeUndefined();
  });
});

describe("D5 — the sitemap tells the same story as the page", () => {
  it("one article produces exactly one sitemap URL, under its own language", () => {
    const entries = articleSitemapEntries([
      { slug: "plc-alarm-flood", language: "fa", lastModified: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe(`${BASE_URL}/fa/articles/plc-alarm-flood`);
    expect(entries[0].alternates).toBeUndefined();
  });

  it("two articles in different languages produce one URL each, never cross-linked", () => {
    const entries = articleSitemapEntries([
      { slug: "a", language: "fa", lastModified: null },
      { slug: "b", language: "en", lastModified: null },
    ]);
    expect(entries.map((e) => e.url)).toEqual([
      `${BASE_URL}/fa/articles/a`,
      `${BASE_URL}/en/articles/b`,
    ]);
  });

  it("a media asset is listed only in the locales it has copy in", () => {
    const oneLocale = mediaSitemapEntries([
      { path: "/videos/acme/a", lastModified: null, contentLocales: ["en"] },
    ]);
    expect(oneLocale).toHaveLength(1);
    expect(oneLocale[0].alternates).toBeUndefined();

    const twoLocales = mediaSitemapEntries([
      { path: "/videos/acme/b", lastModified: null, contentLocales: ["en", "fa"] },
    ]);
    expect(twoLocales).toHaveLength(2);
    expect(
      Object.keys((twoLocales[0].alternates as { languages: Record<string, string> }).languages).sort(),
    ).toEqual(["en", "fa"]);
  });

  it("an asset whose language cannot be established produces no URL at all", () => {
    expect(
      mediaSitemapEntries([{ path: "/videos/acme/c", lastModified: null, contentLocales: [] }]),
    ).toEqual([]);
  });
});
